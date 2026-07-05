import { Link } from 'react-router-dom';
import type { ReportResponse } from '../api/types.js';
import { truncateMint, timeAgo, flagCount } from '../lib/format.js';
import { ModuleTag } from './badges.js';

/** A single row in the archive feed. */
export function ReportCard({ data }: { data: ReportResponse }) {
  const { project, report, checks } = data;
  const flags = flagCount(checks.map((c) => c.status));
  const running = report.status === 'running';
  const modules = [...new Set(checks.map((c) => c.module))];

  const verdict =
    report.summary ??
    (running ? 'Battery in progress — checks streaming live…' : 'No summary available.');

  return (
    <Link to={`/reports/${project.id}`} className="panel rcard">
      <div className="top">
        <span className="mint">{truncateMint(project.mint, 6, 6)}</span>
        {project.x_handle && <span className="pill">{project.x_handle}</span>}
        <span className="spacer" style={{ flex: 1 }} />
        {running ? (
          <span className="pill pill--live">
            <span className="dot" />
            live
          </span>
        ) : flags > 0 ? (
          <span className="badge badge--flag">
            <span className="glyph">✗</span>
            {flags} flagged
          </span>
        ) : (
          <span className="badge badge--confirmed">
            <span className="glyph">✓</span>
            no discrepancies
          </span>
        )}
      </div>

      <p className="verdict">{verdict}</p>

      <div className="bottom">
        {modules.map((m) => (
          <ModuleTag key={m} module={m} />
        ))}
        <span className="spacer" style={{ flex: 1 }} />
        <span className="pill">{project.discovery_source}</span>
        <span className="pill">v{report.version}</span>
        <span className="faint mono" style={{ fontSize: 11 }}>
          {timeAgo(report.started_at)}
        </span>
      </div>
    </Link>
  );
}
