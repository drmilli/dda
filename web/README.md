# dda-web

The terminal site for the Autonomous On-Chain Due-Diligence Agent — a live "watch it think"
stream and a permanent, versioned report archive (the link every X post points to).

**Stack:** React 19 · TypeScript · Vite · React Router.

> Design docs live in the sibling `../docs/` folder — see
> [terminal-site.md](../docs/terminal-site.md) and [api-reference.md](../docs/api-reference.md).

## Layout

```
src/
  styles/      theme.css — design system (terminal/monospace, dark-first)
  api/         client.ts (fetch + SSE) · types.ts (backend mirror) · mock.ts (dev data)
  lib/         format.ts — truncateMint, timeAgo, status/confidence/module metadata
  hooks/       useReportStream (real SSE) · useMockStream (scripted demo playback)
  components/  Layout · Terminal · CheckCard · Narration · ReportCard · badges
  pages/       Archive (feed) · ReportDetail (versioned report) · LiveStream ("watch it think")
  App.tsx  main.tsx
```

## Design system

Terminal / monospace, v0-style, dark-first. Two rules from the brief drive the UI:

- **Facts vs. framing.** Deterministic evidence renders in a monospace grid (`CheckCard`); the LLM
  summary renders in a visually distinct violet-accented `Narration` block, explicitly labeled
  "narration, not evidence." They can never be mistaken for one another.
- **Evidence or it didn't happen.** Every `CheckCard` carries a "verify source" link and a "raw
  snapshot" download.

Tokens live in `src/styles/theme.css` (`:root`). Restyle by editing the CSS variables.

## Live data (wired to the backend)

The UI is wired to `dda-server` via `src/api/client.ts` (proxied `/api` → `http://localhost:3000`
in dev — see `vite.config.ts`). No mock data:

- **Archive** loads `GET /api/feed`; has loading / error / empty states.
- **SubmitBar** posts `POST /api/submit`, then routes to the live stream.
- **ReportDetail** loads by project id, project id + version, or report id (`/r/:id`); re-run posts
  a new submission.
- **LiveStream** subscribes to `GET /api/stream/:reportId` (SSE) via `useReportStream`.

Run both: start `dda-server` (`npm run dev:all`) then `npm run dev` here. Verified end-to-end
(browser → vite proxy → backend → Neon).

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api → http://localhost:3000)
```

Run the backend (`dda-server`) alongside it so `/api` and the SSE stream resolve.

## Notes

- `src/api/types.ts` is a hand-kept mirror of the backend domain types (two separate repos). Keep
  it in sync until we extract a shared package.
- **Facts vs. framing:** the `Terminal` prints exactly what modules computed — it never transforms
  a line. The LLM summary is rendered separately and clearly labeled as narration.

## Status

Wired to the live backend and verified against real Neon data — archive feed, submit-to-investigate,
versioned report pages, and the live SSE "watch it think" stream all run on real API responses.
Remaining: a dispute form (endpoint exists) and an admin review-queue view. See the
[roadmap](../docs/roadmap.md).
