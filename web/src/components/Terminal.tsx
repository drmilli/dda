import { useEffect, useRef } from 'react';
import type { StreamLine } from '../api/types.js';

const GLYPH: Record<StreamLine['kind'], string> = {
  info: '·',
  pass: '✓',
  flag: '✗',
  error: '~',
};

/**
 * Renders the deterministic CheckResult stream in a monospace terminal.
 * It prints exactly what each module computed — it never transforms the text.
 * A hallucinated line here would be a published false statement, so the LLM is
 * never in this path. See docs/terminal-site.md.
 */
export function Terminal({
  lines,
  live = false,
  title = 'dda-agent — live check stream',
}: {
  lines: StreamLine[];
  live?: boolean;
  title?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div className="term-wrap">
      <div className="term-bar">
        <span className="dots">
          <span className="tdot" />
          <span className="tdot" />
          <span className="tdot" />
        </span>
        <span className="title">{title}</span>
      </div>
      <div className="term" ref={bodyRef}>
        {lines.map((l) => (
          <div key={`${l.module}-${l.seq}`} className={`ln ${l.kind}`}>
            <span className="mod">[{l.module}]</span> {GLYPH[l.kind]} {l.text}
          </div>
        ))}
        {live && <span className="caret" />}
      </div>
    </div>
  );
}
