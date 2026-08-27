import { useEffect, useRef, useState } from 'react';

const actions = ['Continue', 'Run Tests', 'Review Changes', 'Next Step'];

function DocumentCard({ title, filename, content, loading, label = 'Project document' }) {
  return (
    <section className="card document-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{label}</p>
          <h2>{title}</h2>
        </div>
        <code>{filename}</code>
      </div>
      <pre>{loading ? 'Loading…' : content || 'No content yet.'}</pre>
    </section>
  );
}

function TaskEditor({ value, loading, saving, sending, onChange, onSave, onSend }) {
  return (
    <section className="card task-editor">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Read-only Codex task</p>
          <h2>Current Task</h2>
        </div>
        <code>docs/CURRENT_TASK.md</code>
      </div>
      <textarea
        aria-label="Current Task"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading || saving || sending}
        placeholder="Describe the read-only task to send to Codex…"
      />
      <div className="task-actions">
        <button onClick={onSave} disabled={loading || saving || sending}>{saving ? 'Saving…' : 'Save Task'}</button>
        <button className="send-task" onClick={onSend} disabled={loading || saving || sending}>{sending ? 'Queueing…' : 'Send to Codex'}</button>
      </div>
    </section>
  );
}

export default function App() {
  const [docs, setDocs] = useState({ currentTask: '', status: '', actionQueue: null });
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('Ready.');
  const [taskText, setTaskText] = useState('');
  const taskIsDirty = useRef(false);

  async function loadDocs({ announce = false, showLoading = false } = {}) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/docs');
      if (!response.ok) throw new Error('Request failed');
      const nextDocs = await response.json();
      setDocs(nextDocs);
      if (!taskIsDirty.current) setTaskText(nextDocs.currentTask);
      if (announce) setMessage(`Documents refreshed at ${new Date().toLocaleTimeString()}.`);
    } catch {
      if (announce) setMessage('Unable to read the local project documents.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function refresh() {
    return loadDocs({ announce: true, showLoading: true });
  }

  function selectAction(action) {
    localStorage.setItem('irving-dev-control:last-action', action);
    setMessage(`${action} selected — placeholder only; no command has run.`);
  }

  function updateTask(value) {
    taskIsDirty.current = true;
    setTaskText(value);
  }

  async function saveTask({ announce = true } = {}) {
    if (!taskText.trim()) {
      setMessage('Enter a task before saving or sending it to Codex.');
      return false;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: taskText }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Request failed');
      taskIsDirty.current = false;
      setDocs((current) => ({ ...current, currentTask: saved.currentTask }));
      if (announce) setMessage('Current task saved.');
      return true;
    } catch (error) {
      setMessage(`Unable to save the current task: ${error.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continueTask() {
    setQueueing(true);
    try {
      const response = await fetch('/api/actions/continue', { method: 'POST' });
      const actionQueue = await response.json();
      if (!response.ok) throw new Error(actionQueue.error || 'Request failed');
      setDocs((current) => ({ ...current, actionQueue }));
      setMessage('Continue action queued');
    } catch (error) {
      setMessage(`Unable to queue the Continue action: ${error.message}`);
    } finally {
      setQueueing(false);
    }
  }

  async function sendToCodex() {
    const saved = await saveTask({ announce: false });
    if (!saved) return;
    await continueTask();
    setMessage('Task saved and sent to Codex.');
  }

  useEffect(() => {
    loadDocs({ showLoading: true });
    const lastAction = localStorage.getItem('irving-dev-control:last-action');
    if (lastAction) setMessage(`Last local selection: ${lastAction}.`);
    const poll = setInterval(() => loadDocs(), 1_000);
    return () => clearInterval(poll);
  }, []);

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">Local prototype · v0.6</p>
          <h1>Irving Dev Control</h1>
          <p className="subtitle">A quiet place to see what matters and choose the next development action.</p>
        </div>
        <button className="refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </header>

      <div className="action-bar" aria-label="Development actions">
        {actions.map((action) => action === 'Continue'
          ? <button key={action} onClick={continueTask} disabled={queueing}>{queueing ? 'Queueing…' : action}</button>
          : <button key={action} onClick={() => selectAction(action)}>{action}</button>)}
      </div>
      <p className="action-note" role="status">{message}</p>

      <div className="content-grid">
        <TaskEditor value={taskText} loading={loading} saving={saving} sending={queueing} onChange={updateTask} onSave={saveTask} onSend={sendToCodex} />
        <DocumentCard title="Status" filename="docs/STATUS.md" content={docs.status} loading={loading} />
        <section className="card pending-action">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Local bridge</p>
              <h2>Pending Action</h2>
            </div>
            <code>docs/ACTION_QUEUE.json</code>
          </div>
          <pre>{loading ? 'Loading…' : docs.actionQueue ? JSON.stringify(docs.actionQueue, null, 2) : 'No pending action.'}</pre>
        </section>
        <aside className="card inbox">
          <p className="eyebrow">Screenshot Inbox</p>
          <h2>Nothing new</h2>
          <div className="sources">
            <span>Desktop source</span>
            <span>Downloads source</span>
          </div>
          <strong>0 new screenshots</strong>
          <p>Filesystem monitoring will be added in a later version.</p>
        </aside>
      </div>
    </main>
  );
}
