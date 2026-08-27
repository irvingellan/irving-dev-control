# Irving Dev Control

A deliberately small, local control-panel prototype for a future ChatGPT/Codex development workflow. Version 0.3 has no external integrations.

## What it does

- Displays `docs/CURRENT_TASK.md` and `docs/STATUS.md` in the browser.
- Refresh reloads those files from the local project.
- Continue writes a pending local action to `docs/ACTION_QUEUE.json`. The local bridge worker changes it from pending, to processing, to completed, then records the result in `docs/STATUS.md`.
- The dashboard checks local documents every second, so bridge status changes appear without a manual refresh.
- Run Tests, Review Changes, and Next Step are local placeholders that record the latest selected action in browser storage.
- Shows a Screenshot Inbox card for Desktop and Downloads with a fixed `0 new screenshots` count.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:5174](http://localhost:5174). This project always uses port 5174, keeping it separate from CleanFlow. Edit either Markdown file, then select **Refresh** to load its latest contents.

`npm run dev` starts both the web server and bridge worker. To run only the worker, use `npm run bridge`.

## Verify a production build

```bash
npm run build
```

## Project structure

- `src/` — the React control panel.
- `server.mjs` — minimal local endpoint for the project documents plus the Vite development server.
- `bridge-worker.mjs` — polls the action queue and completes the local Continue action.
- `docs/` — the displayed task and status source files.
