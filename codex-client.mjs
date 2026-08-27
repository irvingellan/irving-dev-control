/**
 * MCP client that connects to codex-from-chatgpt's Streamable HTTP endpoint.
 *
 * Maintains a single, reusable MCP session and exposes three functions:
 *   startJob(workspace, prompt)  → codex_start
 *   getJob(jobId, detail?)       → codex_get
 *   continueJob(jobId, prompt)   → codex_continue
 *
 * The module does NOT duplicate any job-state, approval, persistence, or
 * recovery logic from codex-from-chatgpt — it is a thin, typed relay.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const CODEX_MCP_URL = process.env.CODEX_MCP_URL ?? 'http://127.0.0.1:8787/mcp';

/** @type {Client | null} */
let client = null;

/** @type {StreamableHTTPClientTransport | null} */
let transport = null;

/** @type {Promise<void> | null} */
let connecting = null;

/**
 * Parse the structured content from an MCP tool call result.
 * codex-from-chatgpt returns `structuredContent` on success and sets
 * `isError: true` on failure with the error in the text content.
 */
function parseToolResult(result) {
  if (result.structuredContent) return result.structuredContent;

  // Fall back to parsing the first text content block.
  const textContent = result.content?.find((c) => c.type === 'text');
  if (textContent?.text) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return { raw: textContent.text };
    }
  }

  return result;
}

/**
 * Ensure the MCP client is connected and the session is initialized.
 * Re-uses an existing connection when possible. Creates a new one on
 * the first call or after a disconnect.
 */
async function ensureConnected() {
  // Re-use an already-open session.
  if (client && transport) return;

  // Avoid multiple concurrent connection attempts.
  if (connecting) {
    await connecting;
    return;
  }

  connecting = (async () => {
    try {
      transport = new StreamableHTTPClientTransport(new URL(CODEX_MCP_URL));
      client = new Client({ name: 'irving-dev-control', version: '0.7.0' });

      transport.onclose = () => {
        client = null;
        transport = null;
      };

      transport.onerror = (error) => {
        console.error('Codex MCP transport error:', error.message);
      };

      await client.connect(transport);
    } catch (error) {
      client = null;
      transport = null;
      throw new Error(
        `Could not connect to codex-from-chatgpt at ${CODEX_MCP_URL}: ${error.message}`,
      );
    }
  })();

  try {
    await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Call an MCP tool by name with the given arguments.
 * Handles connection lifecycle and error wrapping.
 */
async function callTool(name, args) {
  try {
    await ensureConnected();
  } catch (error) {
    throw new Error(`MCP connection failed: ${error.message}`);
  }

  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (error) {
    // Connection may have been lost between ensureConnected and callTool.
    client = null;
    transport = null;
    throw new Error(`MCP tool "${name}" call failed: ${error.message}`);
  }

  if (result.isError) {
    const parsed = parseToolResult(result);
    throw new Error(parsed.error || parsed.raw || `Tool "${name}" returned an error.`);
  }

  return parseToolResult(result);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create a new Codex job in the given workspace.
 * Maps to codex-from-chatgpt's `codex_start` tool.
 *
 * @param {string} workspace  Absolute path to the target workspace.
 * @param {string} prompt     Instruction for Codex.
 * @returns {Promise<object>} Job start result with job_id, thread_id, status, revision.
 */
export async function startJob(workspace, prompt) {
  if (!workspace || typeof workspace !== 'string') throw new Error('workspace is required.');
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt is required.');

  return callTool('codex_start', { workspace, prompt });
}

/**
 * Get a snapshot of an existing Codex job.
 * Maps to codex-from-chatgpt's `codex_get` tool.
 *
 * @param {string} jobId     The job_id returned by startJob.
 * @param {string} [detail]  "compact" | "standard" | "debug". Defaults to "compact".
 * @returns {Promise<object>} Job snapshot.
 */
export async function getJob(jobId, detail = 'compact') {
  if (!jobId || typeof jobId !== 'string') throw new Error('jobId is required.');

  return callTool('codex_get', { job_id: jobId, detail });
}

/**
 * Send another prompt to an existing Codex job (same persistent thread).
 * Maps to codex-from-chatgpt's `codex_continue` tool.
 *
 * @param {string} jobId   The job_id to continue.
 * @param {string} prompt  Next instruction for Codex.
 * @returns {Promise<object>} Updated job start result.
 */
export async function continueJob(jobId, prompt) {
  if (!jobId || typeof jobId !== 'string') throw new Error('jobId is required.');
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt is required.');

  return callTool('codex_continue', { job_id: jobId, prompt });
}

/**
 * Close the MCP session and release resources.
 */
export async function disconnect() {
  if (transport) {
    try { await transport.close(); } catch { /* best effort */ }
  }
  client = null;
  transport = null;
}
