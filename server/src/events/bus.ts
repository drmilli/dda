import { connection, attachRedisErrorHandler } from '../queue/connection.js';
import type { StreamLine } from '../types/index.js';

/**
 * Live-stream event bus over Redis pub/sub. Module workers publish deterministic
 * StreamLine events; the SSE route subscribes per report. See docs/terminal-site.md.
 */
const channel = (reportId: string) => `stream:${reportId}`;

export type StreamMessage =
  | { type: 'line'; line: StreamLine }
  | { type: 'done'; status: string };

/** Report-global monotonic sequence for ordering lines across module workers. */
export async function nextSeq(reportId: string): Promise<number> {
  return connection.incr(`stream:${reportId}:seq`);
}

export async function publishStreamLine(line: StreamLine): Promise<void> {
  await connection.publish(channel(line.report_id), JSON.stringify({ type: 'line', line }));
}

export async function publishStreamDone(reportId: string, status = 'complete'): Promise<void> {
  await connection.publish(channel(reportId), JSON.stringify({ type: 'done', status }));
}

/** Subscribe to a report's stream. Returns an unsubscribe fn. */
export function subscribeStream(
  reportId: string,
  onMessage: (msg: StreamMessage) => void,
): () => void {
  const sub = connection.duplicate();
  attachRedisErrorHandler(sub, 'redis-sub');
  void sub.subscribe(channel(reportId));
  sub.on('message', (_ch, payload) => {
    try {
      onMessage(JSON.parse(payload) as StreamMessage);
    } catch {
      /* ignore malformed */
    }
  });
  return () => {
    void sub.unsubscribe(channel(reportId));
    void sub.quit();
  };
}
