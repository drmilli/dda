import { api } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { ReportCard } from '../components/ReportCard.js';
import { SubmitBar } from '../components/SubmitBar.js';

/**
 * Home — the permanent archive of investigated tokens, loaded live from the
 * backend feed. Each card links to its versioned report page.
 */
export function Archive() {
  const { data, loading, error, reload } = useAsync(() => api.feed(), []);

  const reports = data ?? [];
  const live = reports.filter((r) => r.report.status === 'running');
  const done = reports.filter((r) => r.report.status !== 'running');

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">autonomous · falsifiable · sourced</div>
        <h1>Report archive</h1>
        <p>
          Every qualifying token launch, tested against a battery of mechanical checks. Each finding
          is a specific claim paired with a re-verifiable source and a raw snapshot captured at check
          time. No trust scores — only evidence.
        </p>
      </div>

      <SubmitBar />

      {loading && <div className="empty">loading reports…</div>}

      {error && (
        <div className="empty">
          <div>couldn't reach the backend — {error}</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={reload}>
            retry
          </button>
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="empty">
          No reports yet. Paste a mint above to run the first investigation.
        </div>
      )}

      {live.length > 0 && (
        <>
          <div className="section-label">
            <span className="txt">◆ investigating now</span>
            <span className="line" />
          </div>
          <div className="feed">
            {live.map((r) => (
              <ReportCard key={r.report.id} data={r} />
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <div className="section-label">
            <span className="txt">recent reports</span>
            <span className="line" />
            <span className="hint">{done.length} archived</span>
          </div>
          <div className="feed">
            {done.map((r) => (
              <ReportCard key={r.report.id} data={r} />
            ))}
          </div>
        </>
      )}

      <div className="disclaimer">
        Not investment advice. Every report is a point-in-time snapshot; results can change as
        on-chain state and public records mutate. Findings are falsifiable facts, not conclusions
        about intent.
      </div>
    </>
  );
}
