# Engagement Dashboard UI (Astro)

This is the UI for the CLI engagement dashboard (`absurdity-index engage dashboard`).

It is intentionally separate from the public site and is built into `cli/dist/dashboard-ui/` for the CLI server to serve.

## Dev

1. Start the CLI dashboard backend (API + SSE):

```bash
npm run dev --prefix cli -- engage dashboard --port 3847 --dry-run
```

2. Start the Astro UI dev server (proxies `/api/*` to the backend by default):

```bash
npm run dashboard-ui:dev --prefix cli
```

If the backend is on a different port, set:

```bash
DASHBOARD_API_ORIGIN=http://127.0.0.1:3900 npm run dashboard-ui:dev --prefix cli
```

## Build

```bash
npm run build --prefix cli
```

## Electron Wrapper

To run the dashboard as a compact desktop window (no browser chrome):

```bash
npm run dashboard:app --prefix cli
```

Notes:
- Defaults to `--dry-run` and always-on-top (toggle with `Cmd/Ctrl+Shift+T`).
- Size can be overridden: `npm run dashboard:app --prefix cli -- --width 1200 --height 780`
