// Handwritten strict JSON codecs for the installed Harness 0.2 Typert factory contract.
export function parseProvider(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) throw new TypeError('Invalid provider')
  return value
}
export function parseView(value) {
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
export function contribution() {
  return { package: 'dsh-balance-chip', descriptors: [{
    id: 'dsh-balance-chip#balanceRing/get', service: 'balanceRing', namespace: 'balanceRing', method: 'get',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'provider', wire: 'provider', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-balance-chip#Provider', create: () => ({ parse: parseProvider }) } }],
    result: { mode: 'strict', typeSymbol: 'dsh-balance-chip#View', create: () => ({ parse: parseView }), decode: parseView, encode: parseView },
  }] }
}
