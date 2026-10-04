import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

// Load the actual installed framework, without reading profiles or credentials.
if (!process.env.DSH_DESKTOP_ASAR) throw new Error('Set DSH_DESKTOP_ASAR to your local Harness resources/app.asar before running integration tests.')
const archive = readFileSync(process.env.DSH_DESKTOP_ASAR)
const header = JSON.parse(archive.toString('utf8', 16, 16 + archive.readUInt32LE(12)))
const dataStart = 8 + archive.readUInt32LE(4)
function bundled(path) {
  let entry = header
  for (const part of path.split('/')) entry = entry.files[part]
  return archive.toString('utf8', dataStart + Number(entry.offset), dataStart + Number(entry.offset) + entry.size)
}
const scratch = mkdtempSync(join(tmpdir(), 'dsh-balance-cordis-test-'))
writeFileSync(join(scratch, 'cosmokit.mjs'), bundled('dsh/node_modules/@deepseek-ai/cosmokit/lib/index.js'))
writeFileSync(join(scratch, 'cordis.mjs'), bundled('dsh/node_modules/@deepseek-ai/cordis/lib/index.js').replace('from "@deepseek-ai/cosmokit"', 'from "./cosmokit.mjs"'))
const { Context, Service } = await import(pathToFileURL(join(scratch, 'cordis.mjs')))
after(() => rmSync(scratch, { recursive: true, force: true }))
const source = readFileSync(process.env.DSH_BALANCE_SOURCE ?? new URL('../client/client.js', import.meta.url), 'utf8')
const BALANCE = { ok: true, value: { value: [{ currency: 'CNY', balance: '87.6543' }], bonusWallets: [] } }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

function clock() {
  let now = 0, sequence = 0
  const pending = new Map()
  const schedule = (fn, ms, repeat = false) => {
    const id = ++sequence
    pending.set(id, { fn, at: now + ms, ms, repeat })
    return id
  }
  return {
    Date: class extends Date { static now() { return now } },
    setTimeout: (fn, ms) => schedule(fn, ms),
    clearTimeout: id => pending.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, true),
    clearInterval: id => pending.delete(id),
    async advance(ms) {
      const end = now + ms
      for (;;) {
        const next = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) break
        const [id, task] = next
        now = task.at
        if (task.repeat) task.at += task.ms
        else pending.delete(id)
        task.fn()
        await flush()
      }
      now = end
      await flush()
    },
    count: () => pending.size,
  }
}

async function harness(t, options = {}) {
  const timer = clock()
  let plugin, registered, reads = 0, streamsDisposed = 0, nextBalance = () => Promise.resolve(BALANCE)
  const fibers = []
  const openStreams = new Set()
  const root = new Context()
  const react = { Fragment: Symbol('fragment'), useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
  const jsx = (type, props) => typeof type === 'function' ? type(props) : props.children
  vm.runInNewContext(source, {
    ...timer,
    window: { __ModuleLoader__: { load(entry) {
      plugin = entry.factory(name => {
        if (name === 'react') return react
        if (name === 'react-dom') return {}
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Tooltip: ({ children }) => children }
        throw new Error(`Unexpected module: ${name}`)
      })
    } } },
  })
  const ui = root.plugin({ name: 'test-ui', apply(ctx) {
    ctx.provide('slots', {
      inject(_name, register) { return register() },
      register(meta, component) { registered = { meta, component }; return () => {} },
    })
    ctx.provide('locale', {
      register() { return () => {} },
      bind() { return key => ({ label: '账户余额', connecting: '正在连接账号…', unavailable: '账号服务不可用', signedOut: '未登录', loading: '余额…' })[key] ?? key },
      getSnapshot() { return { active: 'zh' } },
    })
  } })
  fibers.push(ui)
  await ui
  const mountRemote = async () => {
    const fiber = root.plugin({ name: 'test-gateway', apply(ctx) {
      const remote = new Service(ctx, 'remote')
      remote.$stream = config => {
        const controller = new AbortController()
        const iterator = config.open(controller.signal)[Symbol.asyncIterator]()
        const stream = {
          [Symbol.asyncIterator]: () => iterator,
          dispose() { streamsDisposed++; openStreams.delete(stream); controller.abort(); return iterator.return?.() },
        }
        openStreams.add(stream)
        return stream
      }
    } })
    fibers.push(fiber)
    await fiber
  }
  const mountAccount = async () => {
    const fiber = root.plugin({ name: 'test-account', apply(ctx) {
      const account = new Service(ctx, 'remote.account')
      account.getBalance = meta => { reads++; assert.equal(meta.locale, 'zh'); return nextBalance() }
      account.watch = async function* (signal) {
        yield { value: { status: options.status ?? 'credential-stored' }, accept() {} }
        await new Promise(resolve => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', resolve, { once: true })
        })
      }
    } })
    fibers.push(fiber)
    await fiber
  }
  if (options.remote !== false) await mountRemote()
  if (options.account !== false) await mountAccount()
  const consumer = root.plugin({ inject: ['slots', 'locale'], apply(ctx) {
    const store = plugin.createBalanceStore(ctx)
    ctx.effect(() => store.start())
    ctx.slots.register({ inject: () => ({ store }) }, ({ store }) => {
      const s = store.getSnapshot()
      if (!s.remote) return s.waiting ? '正在连接账号…' : '账号服务不可用'
      if (s.status !== 'credential-stored') return '未登录'
      return s.read.state === 'ready' ? '账户余额 ¥ ' + (Math.floor(Number(s.read.wallets[0].total) * 100) / 100).toFixed(2) : '余额…'
    })
  } })
  fibers.push(consumer)
  await consumer
  await flush()
  assert.ok(registered, 'The chip must stay mounted when account services are missing')
  const props = registered.meta.inject()
  t.after(async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
    for (const stream of openStreams) await stream.dispose()
  })
  return {
    timer, root, consumer, mountRemote, mountAccount, store: props.store,
    text: () => [registered.component(props)].flat(Infinity).filter(value => value != null).join(''),
    reads: () => reads, disposed: () => streamsDisposed,
    respondWith(fn) { nextBalance = fn },
  }
}

test('real Cordis rejects undeclared property access, while optional service lookup works', async t => {
  const h = await harness(t)
  const fiber = h.root.plugin({ name: 'access-contract', inject: ['slots', 'locale'], apply(ctx) {
    assert.throws(() => ctx.remote, /without inject/)
    assert.equal(typeof ctx.get('remote.account').getBalance, 'function')
  } })
  await fiber
  await fiber.dispose()
})

test('already mounted sibling services produce a visible balance', async t => {
  const h = await harness(t)
  assert.match(h.text(), /账户余额.*¥ 87\.65/)
  assert.equal(h.reads(), 1)
})

test('late gateway and namespace recover automatically', async t => {
  const h = await harness(t, { remote: false, account: false })
  assert.equal(h.text(), '正在连接账号…')
  await h.timer.advance(1200)
  await h.mountRemote()
  await h.mountAccount()
  await h.timer.advance(5000)
  assert.match(h.text(), /¥ 87\.65/)
})

test('a late account namespace is independently resolved from its gateway', async t => {
  const h = await harness(t, { account: false })
  await h.timer.advance(1200)
  await h.mountAccount()
  await h.timer.advance(5000)
  assert.match(h.text(), /¥ 87\.65/)
})

test('missing services remain visible as unavailable, then recover after the grace window', async t => {
  const h = await harness(t, { remote: false, account: false })
  await h.timer.advance(31000)
  assert.equal(h.text(), '账号服务不可用')
  assert.equal(h.reads(), 0)
  await h.mountRemote()
  await h.mountAccount()
  await h.timer.advance(15000)
  assert.match(h.text(), /¥ 87\.65/)
})

test('a signed-out account does not issue balance requests', async t => {
  const h = await harness(t, { status: 'signed-out' })
  assert.equal(h.text(), '未登录')
  await h.store.reread()
  assert.equal(h.reads(), 0)
})

test('account refresh failure retains its previous wallets and marks them stale', async t => {
  const h = await harness(t)
  h.respondWith(() => Promise.resolve({ ok: false }))
  await h.store.reread()
  const view = h.store.getSnapshot().read
  assert.equal(view.state, 'ready')
  assert.equal(view.stale, true)
  assert.equal(view.wallets[0].total, '87.6543')
})

test('manual refresh coalesces requests; disposal closes the stream and invalidates pending reads', async t => {
  const h = await harness(t)
  let resolve
  h.respondWith(() => new Promise(done => { resolve = done }))
  const first = h.store.reread()
  const second = h.store.reread()
  assert.equal(first, second)
  const before = h.store.getSnapshot()
  await h.consumer.dispose()
  assert.equal(h.disposed(), 1)
  assert.equal(h.timer.count(), 0)
  resolve({ ok: true, value: { value: [{ currency: 'CNY', balance: '99.99' }] } })
  await first
  assert.equal(h.store.getSnapshot(), before)
  await h.timer.advance(120000)
  assert.equal(h.reads(), 2)
})
