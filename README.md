# Irving Dev Control

A deliberately small, local control-panel prototype for a future ChatGPT/Codex development workflow. Version 0.7 adds a private local MCP server around the existing read-only Codex action.

## What it does

- Displays `docs/CURRENT_TASK.md` and `docs/STATUS.md` in the browser.
- Refresh reloads those files from the local project.
- Continue references `docs/CURRENT_TASK.md` in a pending queue action. At execution time, the bridge worker reads that file, builds a read-only Codex prompt, and records Codex's response in `docs/STATUS.md`.
- Edit the Current Task in the dashboard, then choose **Save Task** or **Send to Codex**. Send saves first, then queues the read-only action.
- A failed Codex run is recorded as `failed` with its useful error text in the queue and status document.
- The dashboard checks local documents every second, so bridge status changes appear without a manual refresh.
- Run Tests, Review Changes, and Next Step are local placeholders that record the latest selected action in browser storage.
- Shows a Screenshot Inbox card for Desktop and Downloads with a fixed `0 new screenshots` count.
- Exposes three local MCP tools over Streamable HTTP: `get_status`, `set_task`, and `send_to_codex`.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:5174](http://localhost:5174). This project always uses port 5174, keeping it separate from CleanFlow. Edit either Markdown file, then select **Refresh** to load its latest contents.

`npm run dev` starts both the web server and bridge worker. To run only the worker, use `npm run bridge`.

## Run the local MCP server

In a second terminal, run:

```bash
npm run mcp
```

The MCP endpoint is [http://127.0.0.1:5180/mcp](http://127.0.0.1:5180/mcp). It binds only to the local loopback interface; no tunnel, public exposure, or authentication layer is configured in this prototype.

Available tools:

- `get_status` reads the current task, queue, and status document.
- `set_task` saves a non-empty task without running Codex.
- `send_to_codex` queues the saved task for the existing bridge worker.

## Verify a production build

```bash
npm run build
```

## Project structure

- `src/` — the React control panel.
- `server.mjs` — minimal local endpoint for the project documents plus the Vite development server.
- `mcp-server.mjs` — local Streamable HTTP MCP layer for the same document and queue operations.
- `control-service.mjs` — shared document and action-queue functions used by both local servers.
- `bridge-worker.mjs` — polls the action queue and completes the local Continue action.
- `bridge-config.mjs` — the configurable prompt for the read-only Codex action.
- `docs/` — the displayed task and status source files.
