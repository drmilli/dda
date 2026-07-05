import type { Check } from '../api/types.js';
import { timeAgo } from '../lib/format.js';
import { StatusBadge, ConfidenceBadge, ModuleTag } from './badges.js';

/**
 * One deterministic finding. Monospace grid = "this is evidence." Every card
 * carries a re-verify link + a raw-snapshot download, per invariant #1.
 */
export function CheckCard({ check }: { check: Check }) {
  const isImage = check.raw_snapshot_ref.includes('/image/');
  return (
    <article className={`check ${check.status === 'flagged' ? 'is-flag' : ''}`}>
      <div className="chead">
        <ModuleTag module={check.module} />
        <StatusBadge status={check.status} />
        <ConfidenceBadge confidence={check.confidence} />
        <span className="ts">{timeAgo(check.checked_at)}</span>
      </div>
      <div className="cbody">
        <p className="claim">{check.claim}</p>
        <div className="evidence">
          <a href={check.evidence_url} target="_blank" rel="noreferrer">
            ↗ verify source
          </a>
          <a href={check.raw_snapshot_ref} target="_blank" rel="noreferrer">
            ⤓ raw {isImage ? 'screenshot' : 'snapshot'}
          </a>
        </div>
      </div>
    </article>
  );
}
