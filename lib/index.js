import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { createReader } from './adapters.js'
import { parseProvider } from './wire.js'
export const name = 'dsh-balance-chip'
export class BalanceRingService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'balanceRing')
    this.reader = createReader(ctx, { environment: ref => launchEnvironmentOf(ctx).get(ref)?.value })
  }
  get(provider) { return this.reader.get(parseProvider(provider)) }
}
export function apply(ctx) { ctx.plugin(BalanceRingService) }
