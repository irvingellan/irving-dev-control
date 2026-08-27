import { createServer as createViteServer } from 'vite';
import { createServer } from 'node:http';
import { getControlStatus, queueContinueAction, saveCurrentTask } from './control-service.mjs';
import { startJob, getJob, continueJob } from './codex-client.mjs';

// This single server hosts both the React app and its local API.
// Keep it separate from CleanFlow's development port.
const port = 5174;
async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

function jsonResponse(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function errorResponse(response, status, error) {
  const message = error instanceof Error ? error.message : String(error);
  jsonResponse(response, status, { error: message });
}

/** Extract a job ID and query params from a URL like /api/codex/jobs/:jobId or /api/codex/jobs/:jobId/continue */
function matchCodexJobUrl(urlString) {
  try {
    const parsed = new URL(urlString, 'http://localhost');
    const match = parsed.pathname.match(/^\/api\/codex\/jobs\/([^/]+)(\/continue)?$/);
    if (!match) return null;
    return {
      jobId: decodeURIComponent(match[1]),
      isContinue: match[2] === '/continue',
      detail: parsed.searchParams.get('detail') || 'compact',
    };
  } catch {
    return null;
  }
}

const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });

const server = createServer(async (request, response) => {
  if (request.url === '/api/docs') {
    try {
      const { currentTask, status, actionQueue } = await getControlStatus();
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ currentTask, status, actionQueue }));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Could not read the project docs.' }));
      console.error(error);
    }
    return;
  }

  if (request.url === '/api/actions/continue' && request.method === 'POST') {
    try {
      const actionQueue = await queueContinueAction();
      response.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(actionQueue));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Could not queue the continue action.' }));
      console.error(error);
    }
    return;
  }

  if (request.url === '/api/task' && request.method === 'POST') {
    try {
      const { content } = await readJsonBody(request);
      const currentTask = await saveCurrentTask(content);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ currentTask }));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message || 'Could not save the current task.' }));
    }
    return;
  }

  // ── Codex bridge endpoints (proxy to codex-from-chatgpt MCP) ──────

  if (request.url === '/api/codex/start' && request.method === 'POST') {
    try {
      const { workspace, prompt } = await readJsonBody(request);
      const result = await startJob(workspace, prompt);
      jsonResponse(response, 201, result);
    } catch (error) {
      console.error('POST /api/codex/start failed:', error.message);
      errorResponse(response, 502, error);
    }
    return;
  }

  const jobMatch = matchCodexJobUrl(request.url);

  if (jobMatch && !jobMatch.isContinue && request.method === 'GET') {
    try {
      const result = await getJob(jobMatch.jobId, jobMatch.detail);
      jsonResponse(response, 200, result);
    } catch (error) {
      console.error(`GET /api/codex/jobs/${jobMatch.jobId} failed:`, error.message);
      errorResponse(response, 502, error);
    }
    return;
  }

  if (jobMatch && jobMatch.isContinue && request.method === 'POST') {
    try {
      const { prompt } = await readJsonBody(request);
      const result = await continueJob(jobMatch.jobId, prompt);
      jsonResponse(response, 200, result);
    } catch (error) {
      console.error(`POST /api/codex/jobs/${jobMatch.jobId}/continue failed:`, error.message);
      errorResponse(response, 502, error);
    }
    return;
  }

  vite.middlewares(request, response);
});

server.listen(port, () => {
  console.log(`Irving Dev Control is running at http://localhost:${port}`);
});
