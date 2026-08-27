import { createServer as createViteServer } from 'vite';
import { createServer } from 'node:http';
import { getControlStatus, queueContinueAction, saveCurrentTask } from './control-service.mjs';

// This single server hosts both the React app and its local API.
// Keep it separate from CleanFlow's development port.
const port = 5174;
async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
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

  vite.middlewares(request, response);
});

server.listen(port, () => {
  console.log(`Irving Dev Control is running at http://localhost:${port}`);
});
