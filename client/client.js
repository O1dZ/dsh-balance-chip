window.__ModuleLoader__.load({ id: 'dsh-balance-chip', factory(require) {
  const react = require('react')
  const { jsx: h, jsxs } = require('react/jsx-runtime')
  const { Tooltip } = require('@deepseek-ai/dsh-client-ui-primitives')
  const { createPortal } = require('react-dom')
  const NS = 'dsh-balance-chip'
  const CSS = '.dbc_root{position:relative;display:flex;align-items:center}.dbc_trigger{appearance:none;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}.dbc_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.dbc_trigger:focus-visible,.dbc_refresh:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#60a5fa);outline-offset:2px}.dbc_ring{width:18px;height:18px;overflow:visible}.dbc_track{stroke:var(--dsw-alias-border-l3,#555)}.dbc_fill{transition:stroke-dashoffset .25s,stroke .25s;transform:rotate(-90deg);transform-origin:center}.dbc_panel{position:absolute;bottom:calc(100% + 9px);right:0;z-index:1000;width:min(280px,calc(100vw - 32px));box-sizing:border-box;padding:16px;border:1px solid var(--dsw-alias-border-l3,#454545);border-radius:14px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#303033));color:var(--dsw-alias-label-primary,#eee);box-shadow:0 8px 32px #0004;font-family:var(--dsw-font-family);font-size:12px;line-height:20px}.dbc_heading{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:600}.dbc_provider{color:var(--dsw-alias-label-secondary,#bbb);overflow-wrap:anywhere;margin:4px 0 12px}.dbc_amount{font-size:26px;line-height:34px;font-weight:600;font-variant-numeric:tabular-nums;margin:3px 0 10px}.dbc_row{display:flex;justify-content:space-between;gap:12px;font-variant-numeric:tabular-nums}.dbc_foot{color:var(--dsw-alias-label-tertiary,#999);font-size:11px;margin-top:12px}.dbc_refresh{border:0;border-radius:6px;padding:3px 7px;background:var(--dsw-alias-interactive-bg-hover,#444);color:inherit;cursor:pointer;font:inherit}.dbc_refresh:disabled{opacity:.5;cursor:wait}.dbc_tip{font-size:12px;white-space:pre-line}.dbc_status{color:var(--dsw-alias-label-secondary,#bbb)}'
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
    return result
  })
  if (value.state === 'ready' && wallets.length === 0) throw new TypeError('Empty balance')
  const result = { state: value.state, wallets, at: value.at }
  if (value.kind !== undefined) {
    if (!['balance', 'key-limit', 'quota-units'].includes(value.kind)) throw new TypeError('Invalid balance kind')
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
    const primary = snapshot.wallets[0]
    const amount = primary ? money(primary) : statusText(snapshot.state)
    // Monetary reference is a display scale, not a claim about the account's maximum.
    const reference = primary?.currency === 'CNY' ? 50 : primary?.currency === 'USD' ? 10 : null
    const value = primary ? Number(primary.total) : null
    const ratio = reference === null || value === null ? null : Math.max(0, Math.min(1, value / reference))
    const color = snapshot.stale || !primary || reference === null ? 'var(--dsw-alias-label-tertiary,#999)' : value <= 0 ? '#ef6464' : reference && value < reference / 10 ? '#f2b84b' : '#67c58a'
    const circumference = 2 * Math.PI * 5.5
    const title = snapshot.kind === 'key-limit' ? 'API Key 剩余额度' : snapshot.kind === 'quota-units' ? '剩余额度' : '账户余额'
    const label = (snapshot.provider ?? '当前供应商') + ' · ' + title + ' · ' + amount + (snapshot.stale ? '（上次查询值）' : '')
    const trigger = h('button', {
      type: 'button', className: 'dbc_trigger', 'aria-label': label, 'aria-haspopup': 'dialog', 'aria-expanded': open,
      onClick: () => { setOpen(previous => !previous); if (!open) void store.reread() },
      children: jsxs('svg', { className: 'dbc_ring', viewBox: '0 0 14 14', 'aria-hidden': true, children: [
        h('circle', { className: 'dbc_track', cx: 7, cy: 7, r: 5.5, fill: 'none', strokeWidth: 2 }),
        h('circle', { className: 'dbc_fill', cx: 7, cy: 7, r: 5.5, fill: 'none', strokeWidth: 2, stroke: color, strokeLinecap: 'round', strokeDasharray: ratio === null ? '1 4' : circumference, strokeDashoffset: ratio === null ? 0 : circumference * (1 - ratio) }),
      ] }),
    })
    const rows = []
    for (const row of snapshot.wallets) {
      rows.push(h('div', { className: 'dbc_amount', children: money(row) }, row.currency + '-total'))
      for (const key of ['paid', 'bonus']) if (row[key] !== undefined) rows.push(jsxs('div', { className: 'dbc_row', children: [h('span', { children: key === 'paid' ? '充值余额' : '赠金余额' }), h('span', { children: money({ ...row, total: row[key] }) })] }, row.currency + '-' + key))
    }
    return jsxs('div', { className: 'dbc_root', ref: rootRef, children: [
      h(Tooltip, { label: h('div', { className: 'dbc_tip', children: label }), side: 'top', align: 'end', portal: true, disabled: open, delayMs: 200, children: trigger }),
      open && createPortal(jsxs('div', { className: 'dbc_panel', style: position ?? { visibility: 'hidden', position: 'fixed' }, ref: panelRef, role: 'dialog', 'aria-label': title, children: [
        jsxs('div', { className: 'dbc_heading', children: [h('span', { children: title }), h('button', { className: 'dbc_refresh', type: 'button', disabled: snapshot.refreshing, onClick: () => { void store.reread() }, children: snapshot.refreshing ? '查询中…' : '刷新' })] }),
        h('div', { className: 'dbc_provider', children: (snapshot.provider ?? '正在读取当前模型') + (snapshot.model ? ' / ' + snapshot.model : '') }),
        ...rows,
        !primary && h('div', { className: 'dbc_status', children: statusText(snapshot.state) }),
        snapshot.stale && h('div', { className: 'dbc_status', children: statusText(snapshot.failure) + '，显示上次查询值' }),
        h('div', { className: 'dbc_foot', children: (snapshot.at ? '更新于 ' + clockText(snapshot.at) + ' · ' : '') + '随模型切换刷新 · 每 60 秒更新' }),
        reference !== null && h('div', { className: 'dbc_foot', children: '圆环显示参考：' + (primary.currency === 'CNY' ? '¥ 50' : '$ 10') + '，不代表账户额度上限' }),
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
