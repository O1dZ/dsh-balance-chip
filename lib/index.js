import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { createReader } from './adapters.js'
import { parseProvider } from './wire.js'
import { CONFIG_PATH, handleConfigRequest } from './config.js'

export const name = 'dsh-balance-chip'

export class BalanceRingService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'balanceRing')
    this.reader = createReader(ctx, { environment: ref => launchEnvironmentOf(ctx).get(ref)?.value })
  }
  get(provider) { return this.reader.get(parseProvider(provider)) }
}

export function apply(ctx) {
  ctx.plugin(BalanceRingService)
  // The reference amounts persist in the plugin data directory, not in browser storage.
  ctx.inject(['webServer'], scope => {
    const webServer = scope.get('webServer')
    scope.effect(() => webServer.register({ kind: 'exact', path: CONFIG_PATH, handler: handleConfigRequest }), 'dsh-balance-chip: config route')
  })
}
