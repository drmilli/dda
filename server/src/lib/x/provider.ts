import { env } from '../env.js';
import { moduleConfig } from '../../config/index.js';
import { logger } from '../logger.js';

/**
 * Third-party X read provider (Sorsa / SociaVault / Netrows-class) for the
 * expensive reads the official API can't/won't serve cheaply — chiefly
 * following-list verification. Selected via config `M3.read_provider` and keyed
 * by `X_READ_PROVIDER_KEY`. See docs/modules.md#module-3.
 *
 * Left as an integration seam: each provider's API differs, so the concrete
 * request is wired when a provider is chosen. Returns null (unknown) until then,
 * which keeps the follow-check inconclusive rather than fabricating a result.
 */
export class ThirdPartyXSource {
  readonly provider = moduleConfig.M3?.read_provider ?? 'none';

  async doesFollow(_fromHandle: string, _targetHandle: string): Promise<boolean | null> {
    if (!env.X_READ_PROVIDER_KEY || this.provider === 'none') return null;
    // TODO: implement the chosen provider's following-list lookup here.
    logger.debug({ provider: this.provider }, 'follow-check provider not implemented — returning null');
    return null;
  }
}
