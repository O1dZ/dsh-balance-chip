import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createReader } from '../lib/adapters.js'
import { contribution, parseView } from '../lib/wire.js'
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const reply = data => ({ ok: true, text: async () => JSON.stringify(data) })
const ready = (total, currency = 'CNY') => ({ ok: true, value: { state: 'ready', wallets: [{ currency, total }], at: 1000, kind: 'balance' } })
function host(providers, profiles, options = {}) {
  const calls = [], refs = []
  const services = {
    llm: { listConfigurableProviders: () => providers.map(provider => ({ provider, settingsNs: 'routes', settingsPath: ['providers', provider] })), listProviders: () => providers.map(id => ({ id })) },
    settings: { describe: () => [{ ns: 'routes', value: { providers: profiles } }] },
    credentials: { resolve: async ref => { refs.push(ref); return options.missing ? undefined : { value: 'TEST-ONLY-KEY' } }, readRecord: async () => options.record },
  }
  const reader = createReader({ get: key => services[key] }, { fetch: async (url, init) => { calls.push({ url, init }); return options.fetch(url, init) }, now: () => 1000 })
  return { reader, calls, refs }
}
test('DeepSeek alias follows endpoint and uses current credential reference; multiple currencies remain separate', async () => {
  const h = host(['alias'], { alias: { baseURL: 'https://api.deepseek.com/anthropic', apiKeyEnv: 'MY_KEY' } }, { fetch: () => reply({ balance_infos: [{ currency: 'CNY', total_balance: '3.2', topped_up_balance: '2.2', granted_balance: '1' }, { currency: 'USD', total_balance: '4' }] }) })
  const value = await h.reader.get('alias')
  assert.equal(value.state, 'ready'); assert.equal(value.wallets.length, 2); assert.deepEqual(h.refs, ['MY_KEY'])
  assert.equal(h.calls[0].url, 'https://api.deepseek.com/user/balance'); assert.equal(h.calls[0].init.redirect, 'error')
  assert.equal(JSON.stringify(value).includes('TEST-ONLY'), false)
})
test('Moonshot and SiliconFlow use their own parsers, origins and currencies', async () => {
  const h = host(['moonshotai-cn', 'sf'], { 'moonshotai-cn': {}, sf: { baseURL: 'https://api.siliconflow.cn/v1' } }, { fetch: url => reply({ data: url.includes('moonshot') ? { available_balance: 8, cash_balance: 6, voucher_balance: 2 } : { totalBalance: '9', chargeBalance: '7', balance: '2' } }) })
  assert.equal((await h.reader.get('moonshotai-cn')).wallets[0].total, '8')
  assert.equal((await h.reader.get('sf')).wallets[0].total, '9')
  assert.equal(h.calls[0].url, 'https://api.moonshot.cn/v1/users/me/balance')
})
test('OpenRouter key limit is distinguished from account money; unlimited does not mean zero', async () => {
  let key = { limit_remaining: 12 }
  const h = host(['openrouter'], { openrouter: {} }, { fetch: url => url.endsWith('/key') ? reply({ data: key }) : { ok: false, status: 403 } })
  const value = await h.reader.get('openrouter'); assert.equal(value.kind, 'key-limit'); assert.equal(value.wallets[0].total, '12')
  key = { limit_remaining: null }
  assert.equal((await h.reader.get('openrouter')).state, 'permission')
})
test('custom gateway discovery never converts unknown quota units to money', async () => {
  const h = host(['custom'], { custom: { baseURL: 'https://gateway.example/v1' } }, { fetch: url => url.endsWith('/api/user/self') ? reply({ success: true, data: { quota: 1234567 } }) : { ok: false, status: 404 } })
  const value = await h.reader.get('custom'); assert.equal(value.kind, 'quota-units'); assert.equal(value.wallets[0].currency, 'CREDIT')
  assert.ok(h.calls.every(call => new URL(call.url).origin === 'https://gateway.example'))
})
test('unsupported, missing credentials, malformed replies, HTTP denial and timeout never produce zero', async () => {
  for (const [url, options, state] of [
    ['https://api.openai.com/v1', { fetch: () => { throw new Error('must not fetch') } }, 'unsupported'],
    ['https://api.deepseek.com', { missing: true, fetch: () => { throw new Error('must not fetch') } }, 'unconfigured'],
    ['https://api.deepseek.com', { fetch: () => reply({ balance_infos: [{ currency: 'CNY', total_balance: null }] }) }, 'malformed'],
    ['https://api.deepseek.com', { fetch: () => ({ ok: false, status: 401 }) }, 'permission'],
    ['https://api.deepseek.com', { fetch: () => { const e = new Error('SECRET-TEXT'); e.name = 'TimeoutError'; throw e } }, 'timeout'],
    ['http://external.example', { fetch: () => { throw new Error('must not fetch') } }, 'unsupported'],
  ]) {
    const h = host(['route'], { route: { baseURL: url } }, options)
    const value = await h.reader.get('route'); assert.equal(value.state, state); assert.deepEqual(value.wallets, []); assert.equal(JSON.stringify(value).includes('SECRET'), false)
  }
})
test('API key login records are supported; parallel queries are joined; unknown providers are never requested', async () => {
  let complete
  const h = host(['openrouter'], { openrouter: {} }, { missing: true, record: { kind: 'api-key', key: 'RECORD-TEST-KEY' }, fetch: () => new Promise(resolve => { complete = resolve }) })
  const a = h.reader.get('openrouter'), b = h.reader.get('openrouter'); assert.equal(a, b)
  await flush(); complete(reply({ data: { limit_remaining: 2 } })); await a
  assert.equal(h.calls.length, 1); assert.equal((await h.reader.get('unknown')).state, 'unconfigured'); assert.equal(h.calls.length, 1)
})
function client() {
  let plugin
  const tasks = new Map(); let n = 0
  const schedule = fn => { const id = ++n; tasks.set(id, fn); return id }
  vm.runInNewContext(readFileSync(new URL('../client/client.js', import.meta.url), 'utf8'), {
    Date, setTimeout: schedule, clearTimeout: id => tasks.delete(id), setInterval: schedule, clearInterval: id => tasks.delete(id),
    window: { __ModuleLoader__: { load: entry => { plugin = entry.factory(name => ({ react: {}, 'react/jsx-runtime': {}, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name]) } } },
  })
  let current = { provider: 'a', model: 'one' }; const subs = new Set(), calls = [], completions = []
  const api = { get: provider => { calls.push(provider); return new Promise(resolve => completions.push(resolve)) } }
  const directory = { load: async () => {}, store: { getSnapshot: () => ({ current }), subscribe: fn => { subs.add(fn); return () => subs.delete(fn) } } }
  const services = { modelDirectories: { directoryFor: () => directory }, 'remote.balanceRing': api }
  const account = { getSnapshot: () => ({ status: 'signed-out', remote: true, read: { state: 'idle' } }), subscribe: () => () => {}, reread() { throw new Error('Do not query a signed-out account') } }
  const store = plugin.createProviderStore({ get: key => services[key] }, 'session', account), stop = store.start()
  return { plugin, store, stop, calls, completions, tasks, services, switch(provider, model) { current = { provider, model }; for (const fn of subs) fn() }, subscriptions: () => subs.size }
}
test('model switch immediately refreshes and rejects old provider reply, including same-provider model changes', async () => {
  const c = client(); assert.deepEqual(c.calls, ['a'])
  c.switch('b', 'two'); assert.equal(c.store.getSnapshot().wallets.length, 0); assert.deepEqual(c.calls, ['a', 'b'])
  c.completions[1](ready('20', 'USD')); await flush()
  c.completions[0](ready('999')); await flush(); assert.equal(c.store.getSnapshot().wallets[0].total, '20'); assert.equal(c.store.getSnapshot().provider, 'b')
  c.switch('b', 'three'); assert.deepEqual(c.calls, ['a', 'b', 'b']); assert.equal(c.store.getSnapshot().wallets.length, 0)
  c.stop(); assert.equal(c.tasks.size, 0); assert.equal(c.subscriptions(), 0)
  c.completions[2](ready('777')); await flush(); assert.equal(c.store.getSnapshot().wallets.length, 0)
})
test('failed refresh retains this provider only, marks stale, and manual refresh coalesces', async () => {
  const c = client(); c.completions[0](ready('18')); await flush()
  const a = c.store.reread(), b = c.store.reread(); assert.equal(a, b); assert.equal(c.calls.length, 2)
  c.completions[1]({ ok: false }); await a
  assert.equal(c.store.getSnapshot().wallets[0].total, '18'); assert.equal(c.store.getSnapshot().stale, true)
  c.switch('deepseek-account', 'four'); assert.equal(c.store.getSnapshot().state, 'signed-out'); assert.equal(c.store.getSnapshot().wallets.length, 0)
  c.stop()
})
test('strict wire factories reject arbitrary fields and invalid values', () => {
  const descriptor = contribution().descriptors[0]
  assert.throws(() => descriptor.parameters[0].codec.create().parse('../other'))
  assert.throws(() => parseView({ state: 'ready', wallets: [{ currency: 'CNY', total: '' }], at: 1 }))
  assert.equal(descriptor.result.create().parse({ ...ready('5').value, secret: 'DO-NOT-CARRY' }).secret, undefined)
})
test('decimal money is truncated without losing a cent to binary floating point', () => {
  const c = client()
  assert.equal(c.plugin.formatAmount('0.29'), '0.29')
  assert.equal(c.plugin.formatAmount('10.019'), '10.01')
  assert.equal(c.plugin.formatAmount('-0.299'), '-0.29')
  c.stop()
})
test('React effect restart reattaches the selection subscription and rejects the earlier lifetime reply', async () => {
  const c = client(); c.stop()
  const stopAgain = c.store.start()
  assert.equal(c.subscriptions(), 1); assert.deepEqual(c.calls, ['a', 'a'])
  c.completions[1](ready('7')); await flush()
  c.completions[0](ready('99')); await flush()
  assert.equal(c.store.getSnapshot().wallets[0].total, '7')
  stopAgain(); assert.equal(c.tasks.size, 0); assert.equal(c.subscriptions(), 0)
})
