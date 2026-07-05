import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

/**
 * Manual submission — paste a mint, run the full battery, jump to the live
 * "watch it think" stream. This is the secondary entry point from the brief.
 */
export function SubmitBar() {
  const [mint, setMint] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = mint.trim();
    if (value.length < 32) {
      setErr('Enter a valid Solana mint address.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.submit(value);
      navigate(`/live/${res.report_id}?project=${res.project_id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'submission failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="submitbar" onSubmit={submit}>
      <span className="prompt">$</span>
      <input
        className="submit-input"
        placeholder="paste a Solana mint to investigate…"
        value={mint}
        onChange={(e) => setMint(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'submitting…' : 'investigate'}
      </button>
      {err && <span className="submit-err">{err}</span>}
    </form>
  );
}
