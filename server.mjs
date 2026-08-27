import { createServer as createViteServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

// This single server hosts both the React app and its local API.
// Keep it separate from CleanFlow's development port.
const port = 5174;
const docs = {
  currentTask: resolve('docs/CURRENT_TASK.md'),
  status: resolve('docs/STATUS.md'),
  actionQueue: resolve('docs/ACTION_QUEUE.json'),
};

async function readActionQueue() {
  try {
    return JSON.parse(await readFile(docs.actionQueue, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });

const server = createServer(async (request, response) => {
  if (request.url === '/api/docs') {
    try {
      const [currentTask, status, actionQueue] = await Promise.all([
        readFile(docs.currentTask, 'utf8'),
        readFile(docs.status, 'utf8'),
        readActionQueue(),
      ]);
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
    const actionQueue = {
      action: 'continue',
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    try {
      await writeFile(docs.actionQueue, `${JSON.stringify(actionQueue, null, 2)}\n`);
      response.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(actionQueue));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Could not queue the continue action.' }));
      console.error(error);
    }
    return;
  }

  vite.middlewares(request, response);
});

server.listen(port, () => {
  console.log(`Irving Dev Control is running at http://localhost:${port}`);
});
