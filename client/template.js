window.__ModuleLoader__.load({ id: 'dsh-balance-chip', factory(require) {
  const react = require('react')
  const { jsx: h, jsxs } = require('react/jsx-runtime')
  const { Tooltip } = require('@deepseek-ai/dsh-client-ui-primitives')
  const { createPortal } = require('react-dom')
  const NS = 'dsh-balance-chip'
  const CSS = '.dbc_root{position:relative;display:flex;align-items:center}.dbc_trigger{appearance:none;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}.dbc_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.dbc_trigger:focus-visible,.dbc_refresh:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#60a5fa);outline-offset:2px}.dbc_ring{width:20px;height:20px;overflow:visible}.dbc_track{stroke:var(--dsw-alias-border-l3,#555)}.dbc_fill{transition:stroke-dashoffset .25s,stroke .25s;transform:rotate(-90deg);transform-origin:center}.dbc_panel{position:absolute;bottom:calc(100% + 9px);right:0;z-index:1000;width:min(280px,calc(100vw - 32px));box-sizing:border-box;padding:16px;border:1px solid var(--dsw-alias-border-l3,#454545);border-radius:14px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#303033));color:var(--dsw-alias-label-primary,#eee);box-shadow:0 8px 32px #0004;font-family:var(--dsw-font-family);font-size:12px;line-height:20px}.dbc_heading{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:600}.dbc_provider{color:var(--dsw-alias-label-secondary,#bbb);overflow-wrap:anywhere;margin:4px 0 12px}.dbc_amount{font-size:26px;line-height:34px;font-weight:600;font-variant-numeric:tabular-nums;margin:3px 0 10px}.dbc_row{display:flex;justify-content:space-between;gap:12px;font-variant-numeric:tabular-nums}.dbc_foot{color:var(--dsw-alias-label-tertiary,#999);font-size:11px;margin-top:12px}.dbc_refresh{border:0;border-radius:6px;padding:3px 7px;background:var(--dsw-alias-interactive-bg-hover,#444);color:inherit;cursor:pointer;font:inherit}.dbc_refresh:disabled{opacity:.5;cursor:wait}.dbc_tip{font-size:12px;white-space:pre-line}.dbc_status{color:var(--dsw-alias-label-secondary,#bbb)}.dbc_cfg{border-top:1px solid var(--dsw-alias-border-l3,#454545);margin-top:12px;padding-top:10px;display:grid;gap:8px}.dbc_input{width:96px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,#454545);border-radius:6px;background:transparent;color:inherit;font:inherit;padding:3px 6px}.dbc_input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#60a5fa);outline-offset:1px}.dbc_cfgbtns{display:flex;gap:8px;align-items:center;justify-content:flex-end}.dbc_btn{border:0;border-radius:6px;padding:3px 8px;background:var(--dsw-alias-interactive-bg-hover,#444);color:inherit;cursor:pointer;font:inherit}'
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
  /* ACCOUNT_STORE */
  /* WIRE */
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
    const [config, setConfig] = react.useState(null)
    react.useEffect(() => {
      let alive = true
      fetch(CONFIG_PATH).then(response => response.json()).then(body => { if (alive && body?.ok) setConfig(body.config) }).catch(() => {})
      return () => { alive = false }
    }, [])
    const cnyInput = react.useRef(null)
    const usdInput = react.useRef(null)
    react.useEffect(() => {
      if (!config) return
      if (cnyInput.current && document.activeElement !== cnyInput.current) cnyInput.current.value = String(config.referenceCny)
      if (usdInput.current && document.activeElement !== usdInput.current) usdInput.current.value = String(config.referenceUsd)
    }, [config])
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
        jsxs('div', { className: 'dbc_heading', children: [h('span', { children: title }), h('button', { className: 'dbc_refresh', type: 'button', disabled: snapshot.refreshing, onClick: () => { void store.reread() }, children: snapshot.refreshing ? '查询中…' : '刷新' })] }),
        h('div', { className: 'dbc_provider', children: (snapshot.provider ?? '正在读取当前模型') + (snapshot.model ? ' / ' + snapshot.model : '') }),
        ...rows,
        !primary && h('div', { className: 'dbc_status', children: statusText(snapshot.state) }),
        snapshot.stale && h('div', { className: 'dbc_status', children: statusText(snapshot.failure) + '，显示上次查询值' }),
        h('div', { className: 'dbc_foot', children: (snapshot.at ? '更新于 ' + clockText(snapshot.at) + ' · ' : '') + '随模型切换刷新 · 每 60 秒更新' }),
        !usageMode && jsxs('div', { className: 'dbc_cfg', children: [
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
