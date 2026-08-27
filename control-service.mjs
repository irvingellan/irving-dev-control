import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const docs = {
  currentTask: resolve('docs/CURRENT_TASK.md'),
  status: resolve('docs/STATUS.md'),
  actionQueue: resolve('docs/ACTION_QUEUE.json'),
};

export async function readActionQueue() {
  try {
    return JSON.parse(await readFile(docs.actionQueue, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function getControlStatus() {
  const [currentTask, status, actionQueue] = await Promise.all([
    readFile(docs.currentTask, 'utf8'),
    readFile(docs.status, 'utf8'),
    readActionQueue(),
  ]);

  return { currentTask, status, actionQueue };
}

export async function saveCurrentTask(content) {
  if (typeof content !== 'string') throw new Error('Task content must be text.');
  if (!content.trim()) throw new Error('Task content cannot be empty.');

  await writeFile(docs.currentTask, content);
  return content;
}

export async function queueContinueAction() {
  const actionQueue = {
    action: 'continue',
    taskFile: 'docs/CURRENT_TASK.md',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  await writeFile(docs.actionQueue, `${JSON.stringify(actionQueue, null, 2)}\n`);
  return actionQueue;
}
