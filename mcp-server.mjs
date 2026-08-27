import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { getControlStatus, queueContinueAction, saveCurrentTask } from './control-service.mjs';

const host = '127.0.0.1';
const port = 5180;

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function createMcpServer() {
  const server = new McpServer({ name: 'irving-dev-control', version: '0.7.0' });

  server.registerTool('get_status', {
    description: 'Read the current Irving Dev Control task, queue action, and bridge status. This tool never changes files or invokes Codex.',
  }, async () => textResult(await getControlStatus()));

  server.registerTool('set_task', {
    description: 'Save a non-empty task as docs/CURRENT_TASK.md without invoking Codex. Use this before send_to_codex when the task needs to change.',
    inputSchema: {
      task: z.string().min(1).describe('Exact non-empty task text to save for the read-only Codex action.'),
    },
  }, async ({ task }) => textResult({ currentTask: await saveCurrentTask(task) }));

  server.registerTool('send_to_codex', {
    description: 'Queue the saved CURRENT_TASK.md for the existing read-only Codex bridge worker. This only creates the pending queue action; the worker invokes Codex.',
  }, async () => textResult({ actionQueue: await queueContinueAction() }));

  return server;
}

const httpServer = createServer(async (request, response) => {
  if (request.url !== '/mcp') {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }

  if (!['POST', 'GET', 'DELETE'].includes(request.method)) {
    response.writeHead(405, { Allow: 'POST, GET, DELETE' });
    response.end();
    return;
  }

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
    }
  } finally {
    await transport.close();
    await server.close();
  }
});

httpServer.listen(port, host, () => {
  console.log(`Irving Dev Control MCP server is running at http://${host}:${port}/mcp`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => httpServer.close(() => process.exit(0)));
}
