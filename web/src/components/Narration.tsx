/**
 * The LLM summary. Rendered deliberately DIFFERENTLY from the evidence grid
 * (non-monospace, violet accent, explicit label) so readers never mistake
 * framing for facts. See docs/terminal-site.md — facts vs. framing.
 */
export function Narration({ summary }: { summary: string }) {
  return (
    <div className="narration">
      <div className="tag">◆ generated summary — narration, not evidence</div>
      <p>{summary}</p>
    </div>
  );
}
