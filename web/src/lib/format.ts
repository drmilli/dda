import type { CheckStatus, Confidence } from '../api/types.js';

/** 7xKq...9fB2 — a mint/address shortened for display. */
export function truncateMint(mint: string, head = 4, tail = 4): string {
  if (mint.length <= head + tail + 1) return mint;
  return `${mint.slice(0, head)}…${mint.slice(-tail)}`;
}

/** "3m ago", "2h ago", "5d ago" from an ISO timestamp. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const STATUS_META: Record<CheckStatus, { label: string; glyph: string; cls: string }> = {
  confirmed: { label: 'CONFIRMED', glyph: '✓', cls: 'badge--confirmed' },
  flagged: { label: 'FLAGGED', glyph: '✗', cls: 'badge--flag' },
  inconclusive: { label: 'INCONCLUSIVE', glyph: '~', cls: 'badge--inconclusive' },
  not_applicable: { label: 'N/A', glyph: '·', cls: 'badge--not_applicable' },
};

export const CONFIDENCE_PIPS: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const MODULE_LABEL: Record<string, string> = {
  M1: 'on-chain',
  M2: 'github',
  M3: 'x-history',
  M4: 'kol-supply',
  M5: 'product',
  M6: 'ai-copy',
};

/** Count of flagged checks — drives the verdict tone. */
export function flagCount(statuses: CheckStatus[]): number {
  return statuses.filter((s) => s === 'flagged').length;
}
