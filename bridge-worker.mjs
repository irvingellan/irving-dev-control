import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const actionQueuePath = resolve('docs/ACTION_QUEUE.json');
const statusPath = resolve('docs/STATUS.md');
let checking = false;

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

async function processPendingAction() {
  if (checking) return;
  checking = true;

  try {
    const actionQueue = JSON.parse(await readFile(actionQueuePath, 'utf8'));
    if (actionQueue.action !== 'continue' || actionQueue.status !== 'pending') return;

    const processingAction = { ...actionQueue, status: 'processing', startedAt: new Date().toISOString() };
    await writeJson(actionQueuePath, processingAction);
    console.log('Bridge worker: continue action processing');

    await wait(1_200);

    // Do not overwrite a newer queue item created while this action was running.
    const latestAction = JSON.parse(await readFile(actionQueuePath, 'utf8'));
    if (latestAction.startedAt !== processingAction.startedAt || latestAction.status !== 'processing') return;

    const completedAt = new Date().toISOString();
    const completedAction = { ...latestAction, status: 'completed', completedAt };
    await Promise.all([
      writeJson(actionQueuePath, completedAction),
      writeFile(statusPath, `Last bridge action: continue\nResult: completed\nCompleted at: ${completedAt}\n`),
    ]);
    console.log('Bridge worker: continue action completed');
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Bridge worker error:', error.message);
  } finally {
    checking = false;
  }
}

await processPendingAction();
setInterval(processPendingAction, 300);
console.log('Bridge worker is watching docs/ACTION_QUEUE.json');
