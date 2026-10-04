// Credentials and URLs stay on the Host. All requests use the selected route's origin.
const DEFAULTS = {
  'deepseek-official': ['https://api.deepseek.com', 'DEEPSEEK_API_KEY'],
  deepseek: ['https://api.deepseek.com', 'DEEPSEEK_API_KEY'],
  moonshotai: ['https://api.moonshot.ai/v1', 'MOONSHOT_API_KEY'],
  'moonshotai-cn': ['https://api.moonshot.cn/v1', 'MOONSHOT_API_KEY'],
  openrouter: ['https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY'],
  siliconflow: ['https://api.siliconflow.cn/v1', 'SILICONFLOW_API_KEY'],
}
const decimal = value => (typeof value === 'string' && value.trim() !== '' || typeof value === 'number') && Number.isFinite(Number(value)) ? String(value) : null
const wallet = (currency, total, paid, bonus) => {
  if (typeof currency !== 'string' || !/^[A-Z]{3,12}$/.test(currency) || decimal(total) === null) throw new Error('malformed')
  return { currency, total: decimal(total), ...(decimal(paid) === null ? {} : { paid: decimal(paid) }), ...(decimal(bonus) === null ? {} : { bonus: decimal(bonus) }) }
}
function profileFor(ctx, provider) {
  const llm = ctx.get('llm')
  const entry = llm?.listConfigurableProviders().find(row => row.provider === provider)
  if (!entry) return null
  // Harness 0.2 exposes live Config forms through describe(); settings.get() was removed.
  const settings = ctx.get('settings')
  let profile = settings?.describe({ redactSecrets: true }).find(row => row.ns === entry.settingsNs)?.value
  for (const key of entry.settingsPath ?? []) profile = profile && Object.hasOwn(profile, key) ? profile[key] : undefined
  if (!profile || typeof profile !== 'object') return null
  // The directory includes dormant routes. Only active routes may cause a request.
  if (!llm.listProviders().some(row => row.id === provider)) return null
  return profile
}
export function createReader(ctx, { fetch: fetchImpl = globalThis.fetch, environment = () => undefined, now = Date.now } = {}) {
  const inflight = new Map()
  async function perform(provider) {
    const at = now()
    const failure = state => ({ state, wallets: [], at })
    const profile = profileFor(ctx, provider)
    if (!profile) return failure('unconfigured')
    const defaults = DEFAULTS[provider]
    const base = profile.baseURL || (provider === 'deepseek-official' ? environment('DEEPSEEK_BASE_URL') : undefined) || defaults?.[0]
    let url
    try { url = new URL(base) } catch { return failure('unsupported') }
    if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) return failure('unsupported')
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return failure('unsupported')
    const ref = profile.apiKeyEnv || defaults?.[1] || provider.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY'
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return failure('unconfigured')
    const credentials = ctx.get('credentials')
    let key = credentials ? (await credentials.resolve(ref))?.value : environment(ref)
    if (!key && !profile.apiKeyEnv && credentials?.readRecord && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(provider)) {
      const record = await credentials.readRecord('llm-pi-ai/' + provider)
      if (record?.kind === 'api-key') key = record.key || record.env?.[ref]
    }
    if (typeof key !== 'string' || !key) return failure('unconfigured')
    const origin = url.origin
    const root = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '')
    async function request(path) {
      const destination = new URL(path, origin)
      if (destination.origin !== origin) throw new Error('unsupported')
      const response = await fetchImpl(destination.href, { method: 'GET', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'permission' : response.status === 404 || response.status === 405 ? 'unsupported' : 'failed')
      const text = await response.text()
      if (text.length > 1048576) throw new Error('malformed')
      try { return JSON.parse(text) } catch { throw new Error('malformed') }
    }
    const ready = (wallets, kind = 'balance') => {
      if (!wallets.length) throw new Error('malformed')
      return { state: 'ready', wallets, kind, at }
    }
    try {
      // Classify by configured endpoint, not the route alias or model name.
      if (url.hostname === 'api.deepseek.com') {
        const data = await request('/user/balance')
        if (!Array.isArray(data.balance_infos)) throw new Error('malformed')
        return ready(data.balance_infos.map(row => wallet(row.currency, row.total_balance, row.topped_up_balance, row.granted_balance)))
      }
      if (['api.moonshot.cn', 'api.moonshot.ai'].includes(url.hostname)) {
        const data = (await request('/v1/users/me/balance')).data
        return ready([wallet(url.hostname.endsWith('.cn') ? 'CNY' : 'USD', data?.available_balance, data?.cash_balance, data?.voucher_balance)])
      }
      if (['api.siliconflow.cn', 'api.siliconflow.com'].includes(url.hostname)) {
        const data = (await request('/v1/user/info')).data
        // totalBalance includes balance and chargeBalance; do not add it again.
        return ready([wallet(url.hostname.endsWith('.cn') ? 'CNY' : 'USD', data?.totalBalance, data?.chargeBalance, data?.balance)])
      }
      if (url.hostname === 'openrouter.ai') {
        const data = (await request('/api/v1/key')).data
        if (decimal(data?.limit_remaining) !== null) return ready([wallet('USD', data.limit_remaining)], 'key-limit')
        // Account credits now require a management key. Do not manufacture an unlimited balance.
        const credits = (await request('/api/v1/credits')).data
        if (decimal(credits?.total_credits) === null || decimal(credits?.total_usage) === null) throw new Error('malformed')
        return ready([wallet('USD', Number(credits.total_credits) - Number(credits.total_usage))])
      }
      // Official OpenAI/Anthropic and OAuth subscriptions expose no ordinary-key money balance.
      if (['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'].includes(url.hostname)) return failure('unsupported')
      // A custom configured gateway may implement a known balance shape. No cross-origin redirect.
      for (const path of [root + '/user/balance', '/api/user/self', root + '/dashboard/billing/subscription']) {
        try {
          const data = await request(path)
          if (Array.isArray(data.balance_infos)) return ready(data.balance_infos.map(row => wallet(row.currency, row.total_balance, row.topped_up_balance, row.granted_balance)))
          if (data.success === true && decimal(data.data?.quota) !== null) return ready([wallet('CREDIT', data.data.quota)], 'quota-units')
          if (decimal(data.hard_limit_usd) !== null) {
            const usage = await request(root + '/dashboard/billing/usage')
            if (decimal(usage.total_usage) !== null) return ready([wallet('USD', Number(data.hard_limit_usd) - Number(usage.total_usage) / 100)])
          }
        } catch (error) {
          if (['permission', 'failed'].includes(error.message) || ['TimeoutError', 'AbortError'].includes(error.name)) throw error
        }
      }
      return failure('unsupported')
    } catch (error) {
      return failure(['permission', 'malformed', 'unsupported', 'failed'].includes(error.message) ? error.message : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'failed')
    }
  }
  return {
    get(provider) {
      if (inflight.has(provider)) return inflight.get(provider)
      // Errors outside HTTP (for example credential store failure) must not leak raw text.
      const task = perform(provider).catch(() => ({ state: 'failed', wallets: [], at: now() }))
      inflight.set(provider, task)
      task.finally(() => { if (inflight.get(provider) === task) inflight.delete(provider) })
      return task
    },
  }
}
