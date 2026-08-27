import { readFile, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildCodexPrompt } from './bridge-config.mjs';

const actionQueuePath = resolve('docs/ACTION_QUEUE.json');
const currentTaskPath = resolve('docs/CURRENT_TASK.md');
const statusPath = resolve('docs/STATUS.md');
const projectRoot = resolve('.');
const execFileAsync = promisify(execFile);
let checking = false;

const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

async function gitStatus() {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: projectRoot });
  return stdout;
}

function runCodex(prompt) {
  return new Promise((resolveRun, rejectRun) => {
    const codex = spawn('codex', [
      '--sandbox', 'read-only',
      '--ask-for-approval', 'never',
      'exec',
      '--ephemeral',
      '--color', 'never',
      prompt,
    ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    codex.stdout.on('data', (chunk) => { stdout += chunk; });
    codex.stderr.on('data', (chunk) => { stderr += chunk; });
    codex.on('error', rejectRun);
    codex.on('close', (code) => {
      if (code === 0 && stdout.trim()) return resolveRun(stdout.trim());
      rejectRun(new Error(stderr.trim() || `Codex exited with code ${code}.`));
    });
  });
}

async function failAction(action, error) {
  const failedAt = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const failedAction = { ...action, status: 'failed', failedAt, error: message };
  await Promise.all([
    writeJson(actionQueuePath, failedAction),
    writeFile(statusPath, `Last bridge action: continue\nResult: failed\nFailed at: ${failedAt}\nError: ${message}\n`),
  ]);
  console.error('Bridge worker: continue action failed:', message);
}

async function processPendingAction() {
  if (checking) return;
  checking = true;

  try {
    const actionQueue = JSON.parse(await readFile(actionQueuePath, 'utf8'));
    if (actionQueue.action !== 'continue' || actionQueue.status !== 'pending') return;

    const processingAction = { ...actionQueue, status: 'processing', startedAt: new Date().toISOString() };
    await writeJson(actionQueuePath, processingAction);
    console.log('Bridge worker: continue action processing');

    // Read the task now, rather than using a value captured when the action was queued.
    const currentTask = await readFile(currentTaskPath, 'utf8');
    if (!currentTask.trim()) throw new Error('CURRENT_TASK.md is empty.');

    // The official Codex CLI runs in an ephemeral, read-only sandbox. Snapshot the
    // working tree after this worker's own state write, then reject any Codex run
    // that changes it.
    const statusBeforeCodex = await gitStatus();
    const codexResult = await runCodex(buildCodexPrompt(currentTask));
    const statusAfterCodex = await gitStatus();
    if (statusAfterCodex !== statusBeforeCodex) {
      throw new Error('Codex changed the working tree despite the read-only action.');
    }

    // Do not overwrite a newer queue item created while Codex was running.
    const latestAction = JSON.parse(await readFile(actionQueuePath, 'utf8'));
    if (latestAction.startedAt !== processingAction.startedAt || latestAction.status !== 'processing') return;

    const completedAt = new Date().toISOString();
    const completedAction = { ...latestAction, status: 'completed', completedAt, codexResult };
    await Promise.all([
      writeJson(actionQueuePath, completedAction),
      writeFile(statusPath, `Last bridge action: continue\nResult: completed\nCompleted at: ${completedAt}\n\nCodex response:\n${codexResult}\n`),
    ]);
    console.log('Bridge worker: continue action completed');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      try {
        const currentAction = JSON.parse(await readFile(actionQueuePath, 'utf8'));
        if (currentAction.status === 'processing') await failAction(currentAction, error);
        else console.error('Bridge worker error:', error.message);
      } catch {
        console.error('Bridge worker error:', error.message);
      }
    }
  } finally {
    checking = false;
  }
}

await processPendingAction();
setInterval(processPendingAction, 300);
console.log('Bridge worker is watching docs/ACTION_QUEUE.json');
