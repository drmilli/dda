import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { StreamLine } from '../api/types.js';

/**
 * Subscribes to a report's live SSE stream and accumulates deterministic
 * check lines in order. Every line is real module output — never LLM text.
 * See docs/terminal-site.md.
 */
export function useReportStream(reportId: string | null) {
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    setLines([]);
    setDone(false);

    const es = new EventSource(api.streamUrl(reportId));
    es.addEventListener('line', (e) => {
      const line = JSON.parse((e as MessageEvent).data) as StreamLine;
      setLines((prev) => [...prev, line]);
    });
    es.addEventListener('done', () => {
      setDone(true);
      es.close();
    });
    es.onerror = () => es.close();

    return () => es.close();
  }, [reportId]);

  return { lines, done };
}
