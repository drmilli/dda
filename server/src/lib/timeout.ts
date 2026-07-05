/**
 * Races a promise against a deadline. On timeout, resolves to `fallback` (never
 * rejects). Used to keep readiness probes and the rate limiter from hanging when
 * a dependency (Redis/Postgres) is unreachable — ioredis queues commands offline
 * rather than erroring, so an explicit deadline is required.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    timer.unref?.();
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
