import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Terminal } from '../components/Terminal.js';
import { useReportStream } from '../hooks/useReportStream.js';
import { MODULE_LABEL } from '../lib/format.js';
import type { ModuleId } from '../api/types.js';

const ALL: ModuleId[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];

/**
 * "Watch it think" — the brand surface. Subscribes to the live SSE stream of a
 * report and renders each real deterministic check line as it arrives.
 * See docs/terminal-site.md.
 */
export function LiveStream() {
  const { reportId = '' } = useParams();
  const [params] = useSearchParams();
  const projectId = params.get('project');
  const { lines, done } = useReportStream(reportId || null);

  const seen = new Set(lines.map((l) => l.module));
  const active = lines.length ? lines[lines.length - 1]!.module : null;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">watch it think</div>
        <h1>Live investigation</h1>
        <p>
          Each line is a real deterministic check output — never model narration. The terminal
          renders the structured result stream over SSE as it happens.
        </p>
      </div>

      <Terminal lines={lines} live={!done} title={`dda-agent — investigating ${reportId.slice(0, 8)}`} />

      <div className="mprog">
        {ALL.map((m) => {
          const state = active === m && !done ? 'running' : seen.has(m) ? 'done' : '';
          return (
            <span key={m} className={`m ${state}`}>
              {m} · {MODULE_LABEL[m]}
              {state === 'running' ? ' ⟳' : state === 'done' ? ' ✓' : ''}
            </span>
          );
        })}
      </div>

      {!lines.length && !done && (
        <p className="mono dim" style={{ marginTop: 18 }}>
          waiting for the agent to start streaming… (a battery only streams while it runs)
        </p>
      )}

      <p className="mono dim" style={{ marginTop: 18 }}>
        {done && '— run complete — '}
        <Link to={projectId ? `/reports/${projectId}` : `/r/${reportId}`}>
          open the finalized report →
        </Link>
      </p>

      <div className="disclaimer">
        Modules that don't apply to this project are skipped. A completed run finalizes into a
        versioned, permanent report. Nothing here is a safety signal — the filter selects what to
        investigate, never what is safe.
      </div>
    </>
  );
}
