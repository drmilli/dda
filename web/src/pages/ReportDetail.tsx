import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { truncateMint, timeAgo, flagCount } from '../lib/format.js';
import { SectionLabel } from '../components/Layout.js';
import { CheckCard } from '../components/CheckCard.js';
import { Narration } from '../components/Narration.js';
import { DisputeForm } from '../components/DisputeForm.js';

/**
 * Permanent, versioned report page — the link every X post points to. Evidence
 * (deterministic checks) is kept visually distinct from the LLM narration.
 * Reached by project id (latest), project id + version, or report id.
 * See docs/terminal-site.md.
 */
export function ReportDetail() {
  const { projectId, version, reportId } = useParams();
  const navigate = useNavigate();
  const [rerunning, setRerunning] = useState(false);

  const { data, loading, error, reload } = useAsync(() => {
    if (reportId) return api.reportById(reportId);
    if (version) return api.reportVersion(projectId!, Number(version));
    return api.latestReport(projectId!);
  }, [projectId, version, reportId]);

  if (loading) return <div className="empty">loading report…</div>;
  if (error || !data) {
    return (
      <div className="empty">
        <div>report not found — {error ?? 'no data'}</div>
        <Link className="btn" style={{ marginTop: 12, display: 'inline-block' }} to="/">
          ← back to archive
        </Link>
      </div>
    );
  }

  const { project, report, checks } = data;
  const flags = flagCount(checks.map((c) => c.status));

  async function rerun() {
    setRerunning(true);
    try {
      const res = await api.submit(project.mint);
      navigate(`/live/${res.report_id}?project=${res.project_id}`);
    } catch {
      setRerunning(false);
      reload();
    }
  }

  return (
    <>
      <div className="panel rd-head">
        <div className="idline">
          <h1 className="mono">{truncateMint(project.mint, 8, 8)}</h1>
          {flags > 0 ? (
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
          <span className="pill">{project.discovery_source}</span>
          <span className="pill">version {report.version}</span>
          <span className="spacer" style={{ flex: 1 }} />
          {report.status === 'running' && (
            <Link to={`/live/${report.id}?project=${project.id}`} className="pill pill--live">
              <span className="dot" />
              watch live
            </Link>
          )}
          <button className="btn btn--ghost" type="button" onClick={rerun} disabled={rerunning}>
            {rerunning ? 'starting…' : '↻ re-run'}
          </button>
        </div>

        <div className="rd-links">
          <span className="rd-link">
            <b>mint</b>
            <span className="mono">{truncateMint(project.mint, 6, 6)}</span>
          </span>
          {project.x_handle && (
            <a
              className="rd-link"
              href={`https://x.com/${project.x_handle.replace('@', '')}`}
              target="_blank"
              rel="noreferrer"
            >
              <b>x</b> {project.x_handle}
            </a>
          )}
          {project.github_url && (
            <a className="rd-link" href={project.github_url} target="_blank" rel="noreferrer">
              <b>github</b> {project.github_url.replace('https://github.com/', '')}
            </a>
          )}
          {project.website_url && (
            <a className="rd-link" href={project.website_url} target="_blank" rel="noreferrer">
              <b>site</b> {project.website_url.replace('https://', '')}
            </a>
          )}
          <span className="rd-link">
            <b>launched</b> {timeAgo(project.launch_ts)}
          </span>
        </div>
      </div>

      {report.status === 'running' && (
        <div className="empty" style={{ padding: '20px' }}>
          Battery in progress — <Link to={`/live/${report.id}?project=${project.id}`}>watch it live →</Link>
        </div>
      )}

      {report.summary && (
        <>
          <SectionLabel text="verdict" hint="written from verified results only" />
          <Narration summary={report.summary} />
        </>
      )}

      {checks.length > 0 && (
        <>
          <SectionLabel
            text="evidence"
            hint={`${checks.length} checks · each independently re-verifiable`}
          />
          <div className="checks">
            {checks.map((c, i) => (
              <CheckCard key={`${c.module}-${i}`} check={c} />
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 28 }}>
        <DisputeForm reportId={report.id} checks={checks} />
      </div>

      <div className="disclaimer">
        Point-in-time snapshot, captured {timeAgo(report.completed_at ?? report.started_at)}. Not
        investment advice. Each claim links to its source and a raw snapshot stored at check time —
        re-verify independently. This report states falsifiable facts, not conclusions about intent.
      </div>
    </>
  );
}
