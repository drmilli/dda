import { hasXCreds } from './oauth.js';
import { OfficialXSource } from './official.js';
import { ThirdPartyXSource } from './provider.js';

/** A resolved X user (official API). */
export interface XUser {
  id: string; // numeric id — stable across renames
  username: string;
  name: string;
  createdAt: string; // ISO 8601 account creation
  followers: number;
  verified: boolean;
}

/**
 * The XDataSource abstraction (docs/modules.md#module-3). Cheap owned/profile
 * reads go through the official API; expensive following-list reads route to a
 * third-party provider. Any method may return null when unsupported/unconfigured
 * so Module 3 degrades gracefully (to Wayback-only).
 */
export interface XDataSource {
  name: string;
  /** Profile + real account-creation date + numeric id. */
  getUser(handle: string): Promise<XUser | null>;
  /** Has `fromHandle` ever mentioned `needle` (mentions-only affiliation check)? */
  hasMentioned(fromHandle: string, needle: string): Promise<boolean | null>;
  /** Does `fromHandle` follow `targetHandle`? Requires the third-party provider. */
  doesFollow(fromHandle: string, targetHandle: string): Promise<boolean | null>;
}

/**
 * Resolve the active data source. Returns null when no X credentials are set,
 * so Module 3 falls back to Wayback-only. The provider is layered in for
 * follow-checks when configured.
 */
export function resolveXDataSource(): XDataSource | null {
  if (!hasXCreds()) return null;
  return new OfficialXSource(new ThirdPartyXSource());
}
