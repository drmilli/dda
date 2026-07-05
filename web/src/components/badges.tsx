import type { CheckStatus, Confidence, ModuleId } from '../api/types.js';
import { STATUS_META, CONFIDENCE_PIPS, MODULE_LABEL } from '../lib/format.js';

export function StatusBadge({ status }: { status: CheckStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`badge ${m.cls}`}>
      <span className="glyph">{m.glyph}</span>
      {m.label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const on = CONFIDENCE_PIPS[confidence];
  return (
    <span className={`conf conf--${confidence}`} title={`${confidence} confidence`}>
      <span className="pips">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`pip ${i < on ? 'on' : ''}`} />
        ))}
      </span>
      {confidence}
    </span>
  );
}

export function ModuleTag({ module }: { module: ModuleId }) {
  return (
    <span className="mtag" title={MODULE_LABEL[module]}>
      {module} <span className="dim">/ {MODULE_LABEL[module]}</span>
    </span>
  );
}
