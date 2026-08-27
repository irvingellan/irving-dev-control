export const CODEX_TASK_PREFIX = `You are working in the Irving Dev Control repository.
This is a read-only task: do not modify, create, delete, commit, or revert any files.
Return a concise answer to the task below.`;

export function buildCodexPrompt(currentTask) {
  return `${CODEX_TASK_PREFIX}\n\nTask from docs/CURRENT_TASK.md:\n${currentTask.trim()}`;
}
