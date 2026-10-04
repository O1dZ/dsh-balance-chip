import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { TYPERT } from '../lib/typert.js'
import { createReader } from '../lib/adapters.js'
if (!process.env.DSH_DESKTOP_ASAR) throw new Error('Set DSH_DESKTOP_ASAR to your local Harness resources/app.asar before running integration tests.')
const archive = readFileSync(process.env.DSH_DESKTOP_ASAR)
const header = JSON.parse(archive.toString('utf8', 16, 16 + archive.readUInt32LE(12)))
const start = 8 + archive.readUInt32LE(4)
function bundled(path) {
  let entry = header
  for (const part of path.split('/')) entry = entry.files[part]
  return archive.toString('utf8', start + Number(entry.offset), start + Number(entry.offset) + entry.size)
}
const dir = mkdtempSync(join(tmpdir(), 'dsh-balance-typert-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const official = name => bundled('dsh/node_modules/@deepseek-ai/' + name + '/lib/index.js')
const save = (name, text) => writeFileSync(join(dir, name + '.mjs'), text)
save('cosmokit', official('cosmokit'))
save('cordis', official('cordis').replace('"@deepseek-ai/cosmokit"', '"./cosmokit.mjs"'))
save('protocol', official('dsh-typert-protocol').replaceAll('"@deepseek-ai/cordis"', '"./cordis.mjs"'))
// Registry's JSON-Schema export is unused here. Invocation validation is the real shipped code.
save('registry', official('dsh-typert-registry').replaceAll('"@deepseek-ai/cordis"', '"./cordis.mjs"').replace('import { z } from "zod";', 'const z = {}'))
save('deque', official('dsh-deque'))
// Only transport/configuration dependencies are stubbed: no HTTP server or sockets are opened.
save('gateway', official('dsh-api-gateway')
  .replaceAll('"@deepseek-ai/cordis"', '"./cordis.mjs"')
  .replaceAll('"@deepseek-ai/dsh-typert-protocol"', '"./protocol.mjs"')
  .replaceAll('"@deepseek-ai/dsh-deque"', '"./deque.mjs"')
  .replace('import { OperatorPeer } from "@deepseek-ai/dsh-client-connection";', 'class OperatorPeer {}')
  .replace('import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";', 'const MAX_TIMER_DELAY_MS = 2147483647')
  .replace('import z from "@deepseek-ai/schemastery";', 'const z = new Proxy(function() { return z }, { get() { return z } })')
  .replace('import WebSocket, { WebSocketServer } from "ws";', 'class WebSocket {}; class WebSocketServer {}'))
// Exercise the installed SettingsForms and Config parser, rather than an obsolete settings mock.
save('schemastery', bundled('dsh/node_modules/@deepseek-ai/schemastery/lib/index.mjs').replaceAll('"@deepseek-ai/cosmokit"', '"./cosmokit.mjs"'))
save('settings', official('dsh-settings')
  .replaceAll('"@deepseek-ai/cordis"', '"./cordis.mjs"')
  .replaceAll('"@deepseek-ai/cosmokit"', '"./cosmokit.mjs"')
  .replaceAll('"@deepseek-ai/schemastery"', '"./schemastery.mjs"')
  // Legacy YAML migration and expression interpolation are outside this read-only test.
  .replace('import { parse } from "yaml";', 'const parse = () => { throw new Error("Unexpected legacy migration") }')
  .replace('import { interpolate } from "@deepseek-ai/cordis-plugin-loader";', 'const interpolate = (_ctx, value) => value'))
const { SettingsForms } = await import(pathToFileURL(join(dir, 'settings.mjs')))
const { default: z } = await import(pathToFileURL(join(dir, 'schemastery.mjs')))
const { updateVolatile } = await import(pathToFileURL(join(dir, 'cosmokit.mjs')))
const { Context, resolveConfig } = await import(pathToFileURL(join(dir, 'cordis.mjs')))
const { TypertRemoteService } = await import(pathToFileURL(join(dir, 'protocol.mjs')))
const { TypertRegistry } = await import(pathToFileURL(join(dir, 'registry.mjs')))
const { TypertGatewayService } = await import(pathToFileURL(join(dir, 'gateway.mjs')))
test('current installed Cordis/Registry/Gateway accept the Host manifest and invoke its real service binding', async t => {
  const root = new Context(), fibers = []
  t.after(async () => { for (const fiber of fibers.reverse()) await fiber.dispose() })
  const registryFiber = root.plugin(TypertRegistry); fibers.push(registryFiber); await registryFiber
  class BalanceService extends TypertRemoteService {
    constructor(ctx) { super(ctx, 'balanceRing') }
    get(provider) { return { state: 'ready', wallets: [{ currency: 'CNY', total: provider === 'chosen' ? '8.00' : '1.00' }], kind: 'balance', at: 1000 } }
  }
  const serviceFiber = root.plugin(BalanceService); fibers.push(serviceFiber); await serviceFiber
  let gateway, withdraw
  const gatewayFiber = root.plugin({ inject: ['typert'], apply(ctx) {
    withdraw = ctx.typert.register(TYPERT)
    gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1048576 })
  } }); fibers.push(gatewayFiber); await gatewayFiber
  const request = { namespace: 'balanceRing', method: 'get', args: { provider: 'chosen' }, signal: new AbortController().signal, peer: {} }
  const result = await gateway.invoke(request)
  assert.equal(result.wallets[0].total, '8.00')
  await assert.rejects(gateway.invoke({ ...request, args: { provider: '../private' } }), /boundary validation/)
  await assert.rejects(gateway.invoke({ ...request, args: { provider: 'chosen', secret: 'wrong' } }), /do not match/)
  await withdraw()
  await assert.rejects(gateway.invoke(request), /withdrawn/)
})


test('installed SettingsForms resolves a custom DeepSeek key reference and reads live Config changes', async t => {
  const root = new Context(), fibers = [], requests = [], resolved = []
  t.after(async () => { for (const fiber of fibers.reverse()) await fiber.dispose() })
  const config = { baseURL: 'https://api.deepseek.com/anthropic', apiKeyEnv: 'CUSTOM_DS_KEY', secret: 'test-only-secret' }
  const provider = root.plugin({ Config: z.object({
    baseURL: z.string().volatile(), apiKeyEnv: z.string().volatile(), secret: z.string().role('secret').volatile(),
  }), apply() {} }, config)
  fibers.push(provider); await provider
  const entry = { id: 'provider-entry', options: { id: 'custom-deepseek', config }, fiber: provider }
  const support = root.plugin(ctx => {
    ctx.provide('configEditor', { configuration: () => [{ entry, inherited: {}, override: config }] })
    ctx.provide('profileContext', { home: dir, name: 'test' })
    ctx.provide('llm', { listConfigurableProviders: () => [{ provider: 'deepseek-official', settingsNs: 'custom-deepseek' }], listProviders: () => [{ id: 'deepseek-official' }] })
    ctx.provide('credentials', { resolve: async ref => { resolved.push(ref); return { value: 'test-only-key' } } })
  }); fibers.push(support); await support
  // Keep migration dormant; this test never opens the user's settings or credential files.
  root.provide('loader', { await: () => new Promise(() => {}) })
  const settings = root.plugin(SettingsForms); fibers.push(settings); await settings
  assert.equal(typeof root.get('settings').get, 'undefined')
  const view = root.get('settings').describe({ redactSecrets: true })[0]
  assert.equal(view.value.apiKeyEnv, 'CUSTOM_DS_KEY')
  assert.equal(Object.hasOwn(view.value, 'secret'), false)
  const reader = createReader(root, { fetch: async (url, options) => {
    requests.push(url)
    assert.equal(options.headers.Authorization, 'Bearer test-only-key')
    return { ok: true, text: async () => JSON.stringify({ balance_infos: [{ currency: 'CNY', total_balance: '36.78', topped_up_balance: '30.78', granted_balance: '6.00' }] }) }
  } })
  const first = await reader.get('deepseek-official')
  assert.equal(first.state, 'ready')
  assert.equal(first.wallets[0].total, '36.78')
  assert.equal(requests[0], 'https://api.deepseek.com/user/balance')
  assert.equal(resolved[0], 'CUSTOM_DS_KEY')
  const next = resolveConfig(provider.runtime, { ...config, apiKeyEnv: 'SECOND_DS_KEY' })
  updateVolatile(provider.config.apiKeyEnv, next.apiKeyEnv)
  const second = await reader.get('deepseek-official')
  assert.equal(second.state, 'ready')
  assert.equal(resolved[1], 'SECOND_DS_KEY')
  assert.equal(JSON.stringify(second).includes('test-only'), false)
})
