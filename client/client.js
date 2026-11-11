window.__ModuleLoader__.load({ id: 'dsh-balance-chip', factory(require) {
  const react = require('react')
  const { jsx: h, jsxs } = require('react/jsx-runtime')
  const { Tooltip } = require('@deepseek-ai/dsh-client-ui-primitives')
  const { createPortal } = require('react-dom')
  const NS = 'dsh-balance-chip'
  const CSS = '.dbc_root{position:relative;display:flex;align-items:center}.dbc_trigger{appearance:none;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}.dbc_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.dbc_trigger:focus-visible,.dbc_refresh:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#60a5fa);outline-offset:2px}.dbc_ring{width:20px;height:20px;overflow:visible}.dbc_track{stroke:var(--dsw-alias-border-l3,#555)}.dbc_fill{transition:stroke-dashoffset .25s,stroke .25s;transform:rotate(-90deg);transform-origin:center}.dbc_panel{position:absolute;bottom:calc(100% + 9px);right:0;z-index:1000;width:min(280px,calc(100vw - 32px));box-sizing:border-box;padding:16px;border:1px solid var(--dsw-alias-border-l3,#454545);border-radius:14px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#303033));color:var(--dsw-alias-label-primary,#eee);box-shadow:0 8px 32px #0004;font-family:var(--dsw-font-family);font-size:12px;line-height:20px}.dbc_heading{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:600}.dbc_provider{color:var(--dsw-alias-label-secondary,#bbb);overflow-wrap:anywhere;margin:4px 0 12px}.dbc_amount{font-size:26px;line-height:34px;font-weight:600;font-variant-numeric:tabular-nums;margin:3px 0 10px}.dbc_row{display:flex;justify-content:space-between;gap:12px;font-variant-numeric:tabular-nums}.dbc_foot{color:var(--dsw-alias-label-tertiary,#999);font-size:11px;margin-top:12px}.dbc_refresh{border:0;border-radius:6px;padding:3px 7px;background:var(--dsw-alias-interactive-bg-hover,#444);color:inherit;cursor:pointer;font:inherit}.dbc_refresh:disabled{opacity:.5;cursor:wait}.dbc_tip{font-size:12px;white-space:pre-line}.dbc_status{color:var(--dsw-alias-label-secondary,#bbb)}.dbc_cfg{border-top:1px solid var(--dsw-alias-border-l3,#454545);margin-top:12px;padding-top:10px;display:grid;gap:8px}.dbc_input{width:96px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,#454545);border-radius:6px;background:transparent;color:inherit;font:inherit;padding:3px 6px}.dbc_input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#60a5fa);outline-offset:1px}.dbc_cfgbtns{display:flex;gap:8px;align-items:center;justify-content:flex-end}.dbc_btn{border:0;border-radius:6px;padding:3px 8px;background:var(--dsw-alias-interactive-bg-hover,#444);color:inherit;cursor:pointer;font:inherit}.dbc_actions{display:flex;align-items:center;gap:6px}.dbc_gear{appearance:none;display:grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#bbb);cursor:pointer}.dbc_gear:hover{background:var(--dsw-alias-interactive-bg-hover,#444)}.dbc_gear:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#60a5fa);outline-offset:2px}.dbc_gear[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,#444);color:var(--dsw-alias-label-primary,#eee)}'
  function styles() {
    if (typeof document === 'undefined') return () => {}
    const previous = document.querySelector('style[data-plugin-css="' + NS + '"]')
    const tag = document.createElement('style')
    tag.dataset.pluginCss = NS
    tag.textContent = CSS
    previous?.remove()
    document.head.appendChild(tag)
    return () => tag.remove()
  }
  function formatAmount(raw) {
    const value = Number(raw)
    if (!Number.isFinite(value)) return '—'
    // Truncate decimal text before converting: 0.29 * 100 can be 28.999999999999996.
    const decimal = String(raw).trim().match(/^(-?)(\d+)(?:\.(\d*))?$/)
    const truncated = decimal ? Number(decimal[1] + decimal[2] + '.' + (decimal[3] ?? '').slice(0, 2)) : Math.trunc(value * 100) / 100
    return truncated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  // Reference amounts live on the host; the panel edits them.
  const CONFIG_PATH = '/__dsh-balance-chip/config'
  const REFERENCE_KEYS = { CNY: 'referenceCny', USD: 'referenceUsd' }
  const REFERENCE_DEFAULTS = { referenceCny: 50, referenceUsd: 10 }
  function referenceOf(config, currency) {
    const key = REFERENCE_KEYS[currency]
    if (!key) return null
    const value = Number(config?.[key])
    return Number.isFinite(value) && value > 0 ? value : REFERENCE_DEFAULTS[key]
  }
  // Three concentric rings, each covering 100% of the reference (300% in total).
  const RINGS = [8.4, 5.6, 2.8]
  const RING_OPACITY = [1, 0.72, 0.5]
  function ringFractions(value, reference) {
    if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) return null
    const ratio = Math.max(0, value / reference)
    return RINGS.map((_, index) => Math.max(0, Math.min(1, ratio - index)))
  }
  // Inner rings only appear once they hold something; an empty one stays hidden.
  function ringVisible(index, fill) {
    return index === 0 || (fill !== null && fill > 0)
  }
  function usageFractions(wallets) {
    return wallets.map(row => Math.max(0, Math.min(1, Number(row.total) / 100)))
  }
  // Usage rings colour by remaining percentage, mirroring the balance thresholds.
  function usageHealth(remaining) {
    return remaining <= 0 ? '#ef6464' : remaining < 10 ? '#f2b84b' : '#67c58a'
  }
  function resetText(iso) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    const sameDay = date.toDateString() === new Date().toDateString()
    return sameDay
      ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  function money(row) { return ({ CNY: '¥ ', USD: '$ ', CREDIT: '' }[row.currency] ?? row.currency + ' ') + formatAmount(row.total) + (row.currency === 'CREDIT' ? ' 额度单位' : '') }
  function decorate(wallets) { return (Array.isArray(wallets) ? wallets : []).map(row => ({ currency: row.currency, total: String(row.balance) })).filter(row => row.total.trim() !== '' && Number.isFinite(Number(row.total))) }
  function clockText(at) { return new Date(at).toLocaleTimeString() }
  function createBalanceStore(ctx) {
      const IDLE = { state: 'idle' }
      let snapshot = { status: 'starting', attempt: null, remote: false, waiting: true, read: IDLE }
      let revision = 0
      let reading = null
      const listeners = new Set()
      /** When this store began looking for the account namespace. */
      const lookedAt = Date.now()
      /** How long "still looking" is reported as an attempt rather than an absence. */
      const REACHABLE_WINDOW_MS = 20_000

      const publish = (next) => {
        snapshot = next
        for (const listener of listeners) listener()
      }

      /** Update only the connection half of the snapshot. */
      const publishConnection = (patch) => {
        publish({ ...snapshot, ...patch })
      }

      /** Optional services must be resolved individually through Cordis's public lookup. */
      const accountServices = () => {
        const remote = ctx.get('remote')
        const api = ctx.get('remote.account')
        return typeof remote?.$stream === 'function'
          && typeof api?.getBalance === 'function'
          && typeof api?.watch === 'function'
          ? { remote, api }
          : null
      }

      const clientMetadata = () => ({
        version: '0.2.0-rc.2',
        locale: ctx.locale.getSnapshot().active,
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })

      /** Read the wallet summary once; concurrent callers share the in-flight read. */
      const read = () => {
        if (reading !== null) return reading
        if (snapshot.status !== 'credential-stored') return Promise.resolve()
        const services = accountServices()
        if (services === null) {
          publish({ ...snapshot, read: { state: 'failed', reason: 'no-account-service' } })
          return Promise.resolve()
        }
        const generation = revision
        const keeping = snapshot.read.state === 'ready' ? snapshot.read : { state: 'reading' }
        publish({ ...snapshot, read: keeping })
        const request = (async () => {
          const failed = (reason) => publish({ ...snapshot, read: snapshot.read.state === 'ready' ? { ...snapshot.read, stale: true, failure: reason } : { state: 'failed', reason } })
          try {
            const result = await services.api.getBalance(clientMetadata())
            if (generation !== revision) return
            if (result === null || typeof result !== 'object' || result.ok !== true) {
              failed('remote')
              return
            }
            const value = result.value ?? {}
            publish({
              ...snapshot,
              read: {
                state: 'ready',
                wallets: decorate(value.value),
                bonusWallets: decorate(value.bonusWallets),
                at: Date.now(),
              },
            })
          } catch {
            if (generation === revision) failed('threw')
          }
        })()
        reading = request
        const settle = () => { if (reading === request) reading = null }
        request.then(settle, settle)
        return request
      }

      /** Fold one account-state frame in and re-read whenever the credential can have changed. */
      const applyState = (view) => {
        const status = typeof view?.status === 'string' ? view.status : 'unknown'
        const previous = snapshot
        const signedInBefore = previous.status === 'credential-stored'
        const signedIn = status === 'credential-stored'
        if (!signedIn) { revision++; reading = null }
        publish({
          status,
          attempt: view?.attempt ?? null,
          remote: true,
          read: signedIn && signedInBefore ? previous.read : IDLE,
        })
        if (signedIn) void read()
      }

      /**
       * Own the account stream for this store's lifetime, waiting for the
       * namespace to appear and reconnecting if a stream instance ends.
       *
       * @returns disposer that stops the provider loop and the active stream.
       */
      const start = () => {
        let disposed = false
        let retryTimer = null
        let attempt = 0
        let everConnected = false
        let activeStream = null

        /** The retry cadence: quick while the page is still composing, then gentle. */
        const retryDelay = () => Math.min(500 * 2 ** Math.min(attempt, 5), 15_000)

        /** True while "no account API yet" should read as an attempt, not an absence. */
        const stillTrying = () => !everConnected && Date.now() - lookedAt < REACHABLE_WINDOW_MS

        const run = () => {
          if (disposed) return
          const services = accountServices()
          if (services === null) {
            publishConnection({ remote: false, waiting: stillTrying() })
            attempt += 1
            retryTimer = setTimeout(run, retryDelay())
            return
          }
          attempt = 0
          everConnected = true
          publishConnection({ remote: true, waiting: false })

          let stream = null
          const receive = async () => {
            try {
              for await (const frame of stream) {
                if (disposed) return
                applyState(frame.value)
                frame.accept()
              }
            } catch {
              /* the reconnect below owns the recovery */
            }
            if (activeStream === stream) activeStream = null
            if (disposed) return
            // The stream is over (or its opener threw). Wait, then take a fresh
            // one: a host-side reconnect must not leave a dead chip.
            publishConnection({ remote: false, waiting: true })
            if (retryTimer !== null) clearTimeout(retryTimer)
            retryTimer = setTimeout(run, retryDelay())
          }

          try {
            // The opener is invoked by the stream, so a throwing `watch()` lands
            // in `receive`'s catch instead of escaping the owning effect.
            stream = services.remote.$stream({
              name: NS,
              open: (signal) => services.api.watch(signal),
              ended: () => new Error('dsh-balance-chip: account stream ended'),
            })
            activeStream = stream
            void receive()
          } catch {
            publishConnection({ remote: false, waiting: true })
            retryTimer = setTimeout(run, retryDelay())
          }
        }

        run()

        // Safety net for a composition whose account stream stays silent.
        const poll = setInterval(() => {
          if (snapshot.status === 'credential-stored') void read()
        }, 60_000)

        return () => {
          disposed = true
          revision++
          clearInterval(poll)
          if (retryTimer !== null) clearTimeout(retryTimer)
          const stream = activeStream
          activeStream = null
          return stream?.dispose()
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        getSnapshot() {
          return snapshot
        },
        start,
        reread: read,
      }
    }

  // Handwritten strict JSON codecs for the installed Harness 0.2 Typert factory contract.
function parseProvider(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) throw new TypeError('Invalid provider')
  return value
}
function parseView(value) {
  const states = ['ready', 'unsupported', 'unconfigured', 'permission', 'malformed', 'failed', 'timeout']
  if (!value || !states.includes(value.state) || !Number.isFinite(value.at) || !Array.isArray(value.wallets)) throw new TypeError('Invalid balance view')
  const wallets = value.wallets.map(row => {
    if (!row || typeof row.currency !== 'string' || !/^[A-Z]{3,12}$/.test(row.currency) || typeof row.total !== 'string' || row.total.trim() === '' || !Number.isFinite(Number(row.total))) throw new TypeError('Invalid wallet')
    const result = { currency: row.currency, total: row.total }
    for (const key of ['paid', 'bonus']) if (row[key] !== undefined) {
      if (typeof row[key] !== 'string' || row[key].trim() === '' || !Number.isFinite(Number(row[key]))) throw new TypeError('Invalid wallet breakdown')
      result[key] = row[key]
    }
    for (const key of ['label', 'resetAt']) if (row[key] !== undefined) {
      if (typeof row[key] !== 'string' || row[key].trim() === '') throw new TypeError('Invalid wallet label')
      result[key] = row[key]
    }
    return result
  })
  if (value.state === 'ready' && wallets.length === 0) throw new TypeError('Empty balance')
  const result = { state: value.state, wallets, at: value.at }
  if (value.kind !== undefined) {
    if (!['balance', 'key-limit', 'quota-units', 'usage-percent'].includes(value.kind)) throw new TypeError('Invalid balance kind')
    result.kind = value.kind
  }
  return result
}
function contribution() {
  return { package: 'dsh-balance-chip', descriptors: [{
    id: 'dsh-balance-chip#balanceRing/get', service: 'balanceRing', namespace: 'balanceRing', method: 'get',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'provider', wire: 'provider', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-balance-chip#Provider', create: () => ({ parse: parseProvider }) } }],
    result: { mode: 'strict', typeSymbol: 'dsh-balance-chip#View', create: () => ({ parse: parseView }), decode: parseView, encode: parseView },
  }] }
}

  /** Per-composer model subscription; a previous provider's reply never wins a model switch. */
  function createProviderStore(ctx, sessionId, account) {
    let snapshot = { provider: null, model: null, state: 'connecting', wallets: [], refreshing: false }
    let revision = 0, reading = null, selectionKey = null, unsubscribeDirectory = null, directory = null, stopAccount = null
    let disposed = false, retry = null, poll = null
    const listeners = new Set()
    const publish = next => { snapshot = next; for (const fn of listeners) fn() }
    const read = () => {
      if (disposed || !snapshot.provider) return Promise.resolve()
      if (reading) return reading
      if (snapshot.provider === 'deepseek-account') return account.getSnapshot().status === 'credential-stored' ? account.reread() : Promise.resolve()
      const api = ctx.get('remote.balanceRing')
      if (!api?.get) { publish({ ...snapshot, state: 'connecting' }); return Promise.resolve() }
      const generation = revision
      const provider = snapshot.provider
      publish({ ...snapshot, refreshing: true })
      const operation = (async () => {
        try {
          const result = await api.get(provider)
          if (disposed || generation !== revision) return
          const view = result?.ok === true ? parseView(result.value) : { state: 'failed', wallets: [], at: Date.now() }
          // Preserve only this provider's last successful value; label a failed refresh explicitly.
          publish(view.state !== 'ready' && snapshot.wallets.length ? { ...snapshot, refreshing: false, stale: true, failure: view.state } : { ...snapshot, ...view, refreshing: false, stale: false, failure: null })
        } catch {
          if (!disposed && generation === revision) publish({ ...snapshot, state: snapshot.wallets.length ? 'ready' : 'failed', stale: snapshot.wallets.length > 0, failure: 'failed', refreshing: false })
        }
      })()
      reading = operation
      operation.finally(() => { if (reading === operation) reading = null })
      return operation
    }
    const accountChanged = () => {
      if (disposed || snapshot.provider !== 'deepseek-account') return
      const current = account.getSnapshot()
      const readState = current.read
      const state = !current.remote ? current.waiting ? 'connecting' : 'unavailable' : current.status !== 'credential-stored' ? 'signed-out' : readState.state === 'ready' && readState.wallets.length ? 'ready' : readState.state === 'failed' || readState.state === 'ready' ? 'failed' : 'loading'
      const wallets = state === 'ready' ? readState.wallets.map(row => ({ ...row, paid: row.total, bonus: readState.bonusWallets.find(b => b.currency === row.currency)?.total ?? '0', total: String(Number(row.total) + Number(readState.bonusWallets.find(b => b.currency === row.currency)?.total ?? 0)) })) : []
      publish({ ...snapshot, state, wallets, kind: 'balance', at: readState.at, refreshing: false, stale: readState.stale === true, failure: readState.stale === true ? 'failed' : null })
    }
    function changed() {
      const current = directory.store.getSnapshot()
      const selected = current.current
      if (!selected?.provider || !selected?.model) return
      const key = JSON.stringify([selected.provider, selected.model])
      if (key === selectionKey) return
      selectionKey = key
      revision++
      reading = null
      stopAccount?.(); stopAccount = null
      publish({ provider: selected.provider, model: selected.model, state: 'loading', wallets: [], refreshing: false })
      if (selected.provider === 'deepseek-account') {
        stopAccount = account.subscribe(accountChanged)
        accountChanged()
        if (account.getSnapshot().status === 'credential-stored') void account.reread()
      } else void read()
    }
    function connect() {
      if (disposed) return
      if (snapshot.state === 'connecting' && ctx.get('remote.balanceRing')?.get) void read()
      const resolver = ctx.get('modelDirectories')
      if (!directory && resolver?.directoryFor) {
        try {
          directory = resolver.directoryFor(sessionId)
          unsubscribeDirectory = directory.store.subscribe(changed)
          changed()
          void directory.load().catch(() => {})
        } catch { directory = null }
      }
      retry = setTimeout(connect, directory && ctx.get('remote.balanceRing') ? 15000 : 1000)
    }
    return {
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      getSnapshot: () => snapshot,
      reread: read,
      start() {
        disposed = false
        connect()
        poll = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) void read() }, 60000)
        return () => { disposed = true; revision++; clearTimeout(retry); clearInterval(poll); unsubscribeDirectory?.(); stopAccount?.(); unsubscribeDirectory = null; stopAccount = null; directory = null; selectionKey = null; reading = null }
      },
    }
  }
  const statusText = state => ({ connecting: '正在连接余额服务…', loading: '正在查询余额…', unsupported: '该供应商不支持余额查询', unconfigured: '未找到可用的 API 凭证', permission: '余额接口权限不足', malformed: '余额接口返回格式异常', failed: '余额查询失败', timeout: '余额查询超时', unavailable: '账号服务不可用', 'signed-out': '未登录 DeepSeek 账号' }[state] ?? '余额暂不可用')
  // Same geometry as the DSH settings icon, inlined so the panel never depends on the icon export.
  function GearIcon({ size = 14 }) {
    return jsxs('svg', { width: size, height: size, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true, children: [
      h('path', { d: 'M12.1192 4.91016C11.9392 4.52714 11.7007 4.1292 11.4483 3.78809C11.385 3.70258 11.3517 3.68409 11.2462 3.67383C10.7419 3.6248 10.2318 3.69454 9.72662 3.64551C9.29108 3.60318 8.93739 3.40341 8.67682 3.05176C8.38762 2.66127 8.19217 2.20926 7.90338 1.81934C7.83985 1.73359 7.80848 1.71542 7.70221 1.70508C7.24758 1.6609 6.7511 1.66104 6.29791 1.70508C6.19164 1.71542 6.16027 1.73359 6.09674 1.81934C5.80775 2.20954 5.61248 2.66131 5.3233 3.05176C5.06273 3.40341 4.70904 3.60318 4.2735 3.64551C3.76831 3.69454 3.25825 3.6248 2.75397 3.67383C2.6484 3.68409 2.61509 3.70258 2.55182 3.78809C2.30019 4.12814 2.06125 4.52646 1.88092 4.91016C1.83256 5.01309 1.83242 5.04912 1.88092 5.15235C2.07954 5.57482 2.37449 5.94529 2.5733 6.36817C2.76971 6.78606 2.76964 7.21293 2.5733 7.63086C2.37462 8.05374 2.07947 8.42453 1.88092 8.84668C1.83235 8.95004 1.83257 8.98695 1.88092 9.08985C2.06098 9.47285 2.2994 9.87079 2.55182 10.2119C2.61509 10.2974 2.6484 10.3159 2.75397 10.3262C3.25879 10.3753 3.76834 10.3055 4.2735 10.3545C4.70904 10.3968 5.06273 10.5966 5.3233 10.9482C5.6125 11.3387 5.80795 11.7907 6.09674 12.1807C6.16027 12.2664 6.19164 12.2846 6.29791 12.2949C6.7511 12.339 7.24758 12.3391 7.70221 12.2949C7.80848 12.2846 7.83985 12.2664 7.90338 12.1807C8.19237 11.7905 8.38764 11.3387 8.67682 10.9482C8.93739 10.5966 9.29108 10.3968 9.72662 10.3545C10.2318 10.3055 10.7419 10.3752 11.2462 10.3262C11.3517 10.3159 11.385 10.2974 11.4483 10.2119C11.7007 9.87079 11.9391 9.47285 12.1192 9.08985C12.1675 8.98695 12.1678 8.95004 12.1192 8.84668C11.9205 8.42428 11.6255 8.05377 11.4268 7.63086C11.2305 7.21293 11.2304 6.78606 11.4268 6.36817C11.6256 5.94531 11.9207 5.5746 12.1192 5.15235C12.1677 5.04912 12.1676 5.01309 12.1192 4.91016ZM13.2051 5.66309C13.0064 6.08573 12.7114 6.45579 12.5128 6.87793C12.4642 6.98123 12.4645 7.01829 12.5128 7.1211C12.7112 7.54328 13.0064 7.91405 13.2051 8.33692C13.4015 8.75487 13.4015 9.18169 13.2051 9.59961C12.9911 10.0551 12.7109 10.5221 12.4122 10.9258C12.1522 11.277 11.7974 11.4782 11.3624 11.5205C10.8573 11.5696 10.3477 11.4999 9.84283 11.5488C9.73621 11.5592 9.70429 11.5772 9.64069 11.6631C9.35229 12.0526 9.15705 12.5044 8.86823 12.8945C8.60854 13.2452 8.25275 13.447 7.81842 13.4893C7.28749 13.5409 6.71096 13.5407 6.1817 13.4893C5.74737 13.447 5.39158 13.2452 5.1319 12.8945C4.84312 12.5045 4.64808 12.0529 4.35944 11.6631C4.29583 11.5772 4.26392 11.5592 4.15729 11.5488C3.65283 11.5 3.14295 11.5696 2.63776 11.5205C2.20274 11.4782 1.84796 11.277 1.58795 10.9258C1.28834 10.5209 1.00864 10.0543 0.794982 9.59961C0.598644 9.18169 0.598598 8.75487 0.794982 8.33692C0.993688 7.91405 1.28889 7.54328 1.48737 7.1211C1.53567 7.01829 1.53593 6.98123 1.48737 6.87793C1.28887 6.45603 0.993667 6.08569 0.794982 5.66309C0.598535 5.24516 0.59869 4.81829 0.794982 4.40039C1.00898 3.94492 1.28922 3.47791 1.58795 3.07422C1.84796 2.723 2.20274 2.5218 2.63776 2.47949C3.14295 2.43038 3.65283 2.50003 4.15729 2.45117C4.26391 2.44081 4.29583 2.4228 4.35944 2.33692C4.64783 1.94742 4.84308 1.49557 5.1319 1.10547C5.39158 0.754835 5.74737 0.553005 6.1817 0.510744C6.71263 0.459147 7.28917 0.459309 7.81842 0.510744C8.25275 0.553005 8.60854 0.754835 8.86823 1.10547C9.157 1.49551 9.35204 1.94708 9.64069 2.33692C9.70429 2.4228 9.73621 2.44081 9.84283 2.45117C10.3477 2.50007 10.8573 2.43039 11.3624 2.47949C11.7974 2.5218 12.1522 2.723 12.4122 3.07422C12.7118 3.47909 12.9915 3.94567 13.2051 4.40039C13.4014 4.81829 13.4016 5.24516 13.2051 5.66309Z', fill: 'currentColor' }),
      h('path', { d: 'M7.9317 7C7.9317 6.48569 7.51438 6.06836 7.00006 6.06836C6.48575 6.06836 6.06842 6.48569 6.06842 7C6.06842 7.51432 6.48575 7.93164 7.00006 7.93164C7.51438 7.93164 7.9317 7.51432 7.9317 7ZM9.13092 7C9.13092 8.17706 8.17712 9.13086 7.00006 9.13086C5.823 9.13086 4.8692 8.17706 4.8692 7C4.8692 5.82294 5.823 4.86914 7.00006 4.86914C8.17712 4.86914 9.13092 5.82294 9.13092 7Z', fill: 'currentColor' }),
    ] })
  }
  function BalanceRing({ store }) {
    const snapshot = react.useSyncExternalStore(store.subscribe, store.getSnapshot)
    const [open, setOpen] = react.useState(false)
    const rootRef = react.useRef(null)
    const panelRef = react.useRef(null)
    const [position, setPosition] = react.useState(null)
    react.useLayoutEffect(() => {
      if (!open || typeof window === 'undefined') return
      const place = () => {
        const rect = rootRef.current?.getBoundingClientRect()
        if (!rect) return
        const width = Math.min(280, window.innerWidth - 32)
        const height = panelRef.current?.offsetHeight ?? 240
        setPosition({ position: 'fixed', bottom: 'auto', right: 'auto', left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)), top: Math.max(16, Math.min(rect.top - height - 9, window.innerHeight - height - 16)), maxHeight: window.innerHeight - 32, overflowY: 'auto' })
      }
      place()
      window.addEventListener('resize', place)
      window.addEventListener('scroll', place, true)
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
      if (panelRef.current) observer?.observe(panelRef.current)
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer?.disconnect() }
    }, [open])
    react.useEffect(() => {
      if (!open || typeof document === 'undefined') return
      const outside = event => { if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false) }
      const escape = event => { if (event.key === 'Escape') { setOpen(false); rootRef.current?.querySelector('button')?.focus() } }
      document.addEventListener('pointerdown', outside)
      document.addEventListener('keydown', escape)
      return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
    }, [open])
    const [showConfig, setShowConfig] = react.useState(false)
    const [config, setConfig] = react.useState(null)
    react.useEffect(() => {
      let alive = true
      fetch(CONFIG_PATH).then(response => response.json()).then(body => { if (alive && body?.ok) setConfig(body.config) }).catch(() => {})
      return () => { alive = false }
    }, [])
    const cnyInput = react.useRef(null)
    const usdInput = react.useRef(null)
    react.useEffect(() => {
      if (!showConfig || !config) return
      if (cnyInput.current) cnyInput.current.value = String(config.referenceCny)
      if (usdInput.current) usdInput.current.value = String(config.referenceUsd)
    }, [showConfig, config])
    const primary = snapshot.wallets[0]
    // Usage rings, outer to inner: rolling (shortest), weekly, monthly (longest).
    const usageMode = snapshot.kind === 'usage-percent'
    const usageWallets = usageMode ? snapshot.wallets.slice(0, RINGS.length) : []
    const amount = primary ? money(primary) : statusText(snapshot.state)
    // Monetary reference is a display scale, not a claim about the account's maximum.
    const reference = primary && !usageMode ? referenceOf(config, primary.currency) : null
    const value = primary ? Number(primary.total) : null
    const fractions = usageMode
      ? usageFractions(usageWallets)
      : reference === null || value === null ? null : ringFractions(value, reference)
    const percent = reference === null || value === null ? null : Math.round(Math.max(0, value / reference) * 100)
    const color = snapshot.stale || !primary || reference === null ? 'var(--dsw-alias-label-tertiary,#999)' : value <= 0 ? '#ef6464' : reference && value < reference / 10 ? '#f2b84b' : '#67c58a'
    const usageColor = row => snapshot.stale ? 'var(--dsw-alias-label-tertiary,#999)' : usageHealth(Number(row.total))
    const title = usageMode ? 'Go 套餐剩余' : snapshot.kind === 'key-limit' ? 'API Key 剩余额度' : snapshot.kind === 'quota-units' ? '剩余额度' : '账户余额'
    const label = usageMode
      ? (snapshot.provider ?? '当前供应商') + ' · ' + title + ' · ' + usageWallets.map(row => (row.label ?? '') + ' ' + Math.round(Number(row.total)) + '%').join(' · ') + (snapshot.stale ? '（上次查询值）' : '')
      : (snapshot.provider ?? '当前供应商') + ' · ' + title + ' · ' + amount + (percent === null ? '' : ' · ' + percent + '%') + (snapshot.stale ? '（上次查询值）' : '')
    const [saveState, setSaveState] = react.useState(null)
    const readAmount = (input, key) => {
      const raw = input?.value?.trim() ?? ''
      const value = Number(raw)
      return raw !== '' && Number.isFinite(value) && value > 0 ? value : REFERENCE_DEFAULTS[key]
    }
    const saveReference = () => {
      const next = { referenceCny: readAmount(cnyInput.current, 'referenceCny'), referenceUsd: readAmount(usdInput.current, 'referenceUsd') }
      setSaveState('saving')
      fetch(CONFIG_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
        .then(response => response.json())
        .then(body => { if (body?.ok) { setConfig(body.config); setSaveState('saved') } else setSaveState('failed') })
        .catch(() => setSaveState('failed'))
    }
    const resetReference = () => {
      if (cnyInput.current) cnyInput.current.value = String(REFERENCE_DEFAULTS.referenceCny)
      if (usdInput.current) usdInput.current.value = String(REFERENCE_DEFAULTS.referenceUsd)
      saveReference()
    }
    const toggleConfig = () => {
      if (!showConfig && !config) {
        fetch(CONFIG_PATH).then(response => response.json()).then(body => { if (body?.ok) setConfig(body.config) }).catch(() => {})
      }
      setShowConfig(previous => !previous)
    }
    const trigger = h('button', {
      type: 'button', className: 'dbc_trigger', 'aria-label': label, 'aria-haspopup': 'dialog', 'aria-expanded': open,
      onClick: () => { setOpen(previous => !previous); if (!open) void store.reread() },
      children: jsxs('svg', { className: 'dbc_ring', viewBox: '0 0 20 20', 'aria-hidden': true, children: RINGS.flatMap((radius, index) => {
        const circumference = 2 * Math.PI * radius
        const fill = fractions === null ? null : fractions[index]
        // Usage mode draws one ring per window; balance mode hides rings that hold nothing.
        const visible = usageMode ? index < usageWallets.length : ringVisible(index, fill)
        if (!visible) return []
        const stroke = usageMode ? usageColor(usageWallets[index]) : color
        return [
          h('circle', { key: 'track-' + index, className: 'dbc_track', cx: 10, cy: 10, r: radius, fill: 'none', strokeWidth: 1.6 }),
          h('circle', { key: 'fill-' + index, className: 'dbc_fill', cx: 10, cy: 10, r: radius, fill: 'none', strokeWidth: 1.6, stroke, strokeOpacity: usageMode ? 1 : RING_OPACITY[index], strokeLinecap: 'round', strokeDasharray: fill === null ? '1 4' : circumference, strokeDashoffset: fill === null ? 0 : circumference * (1 - fill) }),
        ]
      }) }),
    })
    const rows = []
    if (usageMode) {
      for (const row of usageWallets) rows.push(jsxs('div', { className: 'dbc_row', children: [h('span', { children: (row.label ?? '窗口') + ' 剩余' }), h('span', { children: Math.round(Number(row.total)) + '%' + (row.resetAt ? ' · 重置 ' + resetText(row.resetAt) : '') })] }, 'usage-' + (row.label ?? row.currency)))
    } else {
      for (const row of snapshot.wallets) {
        rows.push(h('div', { className: 'dbc_amount', children: money(row) }, row.currency + '-total'))
        for (const key of ['paid', 'bonus']) if (row[key] !== undefined) rows.push(jsxs('div', { className: 'dbc_row', children: [h('span', { children: key === 'paid' ? '充值余额' : '赠金余额' }), h('span', { children: money({ ...row, total: row[key] }) })] }, row.currency + '-' + key))
      }
    }
    return jsxs('div', { className: 'dbc_root', ref: rootRef, children: [
      h(Tooltip, { label: h('div', { className: 'dbc_tip', children: label }), side: 'top', align: 'end', portal: true, disabled: open, delayMs: 200, children: trigger }),
      open && createPortal(jsxs('div', { className: 'dbc_panel', style: position ?? { visibility: 'hidden', position: 'fixed' }, ref: panelRef, role: 'dialog', 'aria-label': title, children: [
        jsxs('div', { className: 'dbc_heading', children: [
          h('span', { children: title }),
          jsxs('div', { className: 'dbc_actions', children: [
            !usageMode && h('button', { className: 'dbc_gear', type: 'button', 'aria-expanded': showConfig, 'aria-label': '参考金额配置', title: '参考金额配置', onClick: toggleConfig, children: h(GearIcon, { size: 14 }) }),
            h('button', { className: 'dbc_refresh', type: 'button', disabled: snapshot.refreshing, onClick: () => { void store.reread() }, children: snapshot.refreshing ? '查询中…' : '刷新' }),
          ] }),
        ] }),
        h('div', { className: 'dbc_provider', children: (snapshot.provider ?? '正在读取当前模型') + (snapshot.model ? ' / ' + snapshot.model : '') }),
        ...rows,
        !primary && h('div', { className: 'dbc_status', children: statusText(snapshot.state) }),
        snapshot.stale && h('div', { className: 'dbc_status', children: statusText(snapshot.failure) + '，显示上次查询值' }),
        h('div', { className: 'dbc_foot', children: (snapshot.at ? '更新于 ' + clockText(snapshot.at) + ' · ' : '') + '随模型切换刷新 · 每 60 秒更新' }),
        !usageMode && showConfig && jsxs('div', { className: 'dbc_cfg', children: [
          jsxs('div', { className: 'dbc_row', children: [h('span', { children: '满格参考（CNY）' }), h('input', { className: 'dbc_input', type: 'number', min: '0', step: 'any', ref: cnyInput, defaultValue: String(REFERENCE_DEFAULTS.referenceCny) })] }),
          jsxs('div', { className: 'dbc_row', children: [h('span', { children: '满格参考（USD）' }), h('input', { className: 'dbc_input', type: 'number', min: '0', step: 'any', ref: usdInput, defaultValue: String(REFERENCE_DEFAULTS.referenceUsd) })] }),
          jsxs('div', { className: 'dbc_cfgbtns', children: [
            h('span', { className: 'dbc_status', children: saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : saveState === 'failed' ? '保存失败' : '' }),
            h('button', { className: 'dbc_btn', type: 'button', onClick: resetReference, children: '恢复默认' }),
            h('button', { className: 'dbc_btn', type: 'button', onClick: saveReference, children: '保存' }),
          ] }),
        ] }),
        usageMode && h('div', { className: 'dbc_foot', children: '来源：opencode Go 用量接口 · 圆环为剩余百分比（外圈滚动 / 中圈周 / 内圈月），不代表金额' }),
        !usageMode && reference !== null && h('div', { className: 'dbc_foot', children: '圆环显示参考：' + (primary.currency === 'CNY' ? '¥ ' : '$ ') + String(Number(reference.toFixed(2))) + ' / 圈 × ' + RINGS.length + ' 圈（最多 ' + (primary.currency === 'CNY' ? '¥ ' : '$ ') + String(Number((reference * RINGS.length).toFixed(2))) + '），不代表账户额度上限' }),
      ] }), document.body),
    ] })
  }
  return {
    name: NS, inject: ['slots', 'locale'], createProviderStore, createBalanceStore, formatAmount,
    apply(ctx) {
      ctx.effect(styles, 'balance-ring: styles')
      // Mount one namespace for the plugin, shared by all composers.
      ctx.inject(['remote'], async scope => { await scope.get('remote').$mount(contribution()) })
      const account = createBalanceStore(ctx)
      ctx.effect(() => account.start(), 'balance-ring: account')
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right', id: NS, order: 10,
        inject(sessionId) {
          return { context: ctx, sessionId, account }
        },
      }, function MountedRing({ context, sessionId, account }) {
        // Slot props may be recomputed on UI updates. The mounted component owns one stable store.
        const store = react.useMemo(() => createProviderStore(context, sessionId, account), [context, sessionId, account])
        react.useEffect(() => store.start(), [store])
        return h(BalanceRing, { store })
      }))
    },
  }
} })
