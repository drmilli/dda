import { useState, type FormEvent } from 'react';
import { api } from '../api/client.js';
import type { Check } from '../api/types.js';

/**
 * Public path to contest a finding (docs/security-and-legal.md). Lets a
 * project/person dispute the whole report or a specific check; the submission
 * routes to the internal review process.
 */
export function DisputeForm({ reportId, checks }: { reportId: string; checks: Check[] }) {
  const [open, setOpen] = useState(false);
  const [checkId, setCheckId] = useState('');
  const [contact, setContact] = useState('');
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (statement.trim().length < 5) {
      setErr('Please describe the dispute.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.createDispute({
        report_id: reportId,
        check_id: checkId || undefined,
        contact: contact || undefined,
        statement: statement.trim(),
      });
      setOkId(res.dispute_id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'submission failed');
    } finally {
      setBusy(false);
    }
  }

  if (okId) {
    return (
      <div className="dispute-done mono">
        ✓ Dispute received (ref {okId.slice(0, 8)}). We'll re-run the checks and post a visible
        correction if a finding is wrong.
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn btn--ghost" type="button" onClick={() => setOpen(true)}>
        contest a finding
      </button>
    );
  }

  return (
    <form className="dispute-form" onSubmit={submit}>
      <div className="section-label">
        <span className="txt">contest this report</span>
        <span className="line" />
      </div>

      <label className="field">
        <span>finding</span>
        <select value={checkId} onChange={(e) => setCheckId(e.target.value)}>
          <option value="">Whole report</option>
          {checks.map((c) => (
            <option key={c.id} value={c.id}>
              [{c.module}] {c.claim.slice(0, 70)}…
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>contact (optional)</span>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="email or handle" />
      </label>

      <label className="field">
        <span>what's wrong?</span>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={4}
          placeholder="Explain what the finding gets wrong, with evidence if you have it."
        />
      </label>

      {err && <div className="submit-err">{err}</div>}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'submitting…' : 'submit dispute'}
        </button>
        <button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>
          cancel
        </button>
      </div>
    </form>
  );
}
