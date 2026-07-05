import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/client.js';
import { timeAgo } from '../lib/format.js';
import type { ReviewItem } from '../api/types.js';

const TOKEN_KEY = 'dda_admin_token';

/**
 * Admin review queue — the human gate for person-naming / intent / M5–M6
 * conclusion findings that cannot auto-post. Bearer-token auth (fail closed).
 * See docs/publisher.md and docs/api-reference.md.
 */
export function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [connected, setConnected] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const q = await adminApi.reviewQueue(token);
      setItems(q);
      setConnected(true);
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">human gate · legal firewall</div>
        <h1>Review queue</h1>
        <p>
          Findings that name a person, assert intent, or derive from the weaker modules are held
          here — a human approves, edits, or rejects before anything can post.
        </p>
      </div>

      <form
        className="submitbar"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <span className="prompt">⚿</span>
        <input
          className="submit-input"
          type="password"
          placeholder="admin token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="btn" type="submit">
          {connected ? 'refresh' : 'connect'}
        </button>
      </form>

      {error && <div className="submit-err mono">{error}</div>}
      {loading && <div className="empty">loading queue…</div>}

      {connected && !loading && items.length === 0 && (
        <div className="empty">Queue is empty — nothing awaiting review.</div>
      )}

      <div className="checks">
        {items.map((item) => (
          <ReviewRow key={item.id} item={item} token={token} onResolved={load} />
        ))}
      </div>
    </>
  );
}

function ReviewRow({
  item,
  token,
  onResolved,
}: {
  item: ReviewItem;
  token: string;
  onResolved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.proposedText);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(action: 'approve' | 'edit' | 'reject') {
    setBusy(true);
    setMsg(null);
    try {
      const res = await adminApi.resolve(token, item.id, {
        action,
        text: action === 'reject' ? undefined : text,
      });
      setMsg(
        action === 'reject'
          ? 'rejected'
          : `approved${res.dryRun ? ' (dry-run — not actually posted)' : ' & posted'}`,
      );
      setTimeout(onResolved, 700);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'action failed');
      setBusy(false);
    }
  }

  return (
    <article className="check">
      <div className="chead">
        <span className="mtag">{item.module}</span>
        <span className="badge badge--inconclusive">
          <span className="glyph">⚑</span>
          {item.tier}
        </span>
        <Link to={`/r/${item.reportId}`} className="pill">
          view report
        </Link>
        <span className="ts">{timeAgo(item.createdAt)}</span>
      </div>
      <div className="cbody">
        {editing ? (
          <textarea
            className="review-edit"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
        ) : (
          <p className="claim">{text}</p>
        )}

        {msg ? (
          <div className="dispute-done mono">{msg}</div>
        ) : (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" disabled={busy} onClick={() => act(editing ? 'edit' : 'approve')}>
              {editing ? 'approve edited' : '✓ approve & post'}
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              disabled={busy}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? 'cancel edit' : '✎ edit'}
            </button>
            <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => act('reject')}>
              ✗ reject
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
