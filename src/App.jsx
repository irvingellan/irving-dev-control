import { useEffect, useState } from 'react';

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

export default function App() {
  const [docs, setDocs] = useState({ currentTask: '', status: '', actionQueue: null });
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [message, setMessage] = useState('Ready.');

  async function loadDocs({ announce = false, showLoading = false } = {}) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/docs');
      if (!response.ok) throw new Error('Request failed');
      setDocs(await response.json());
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
          <p className="eyebrow">Local prototype · v0.5</p>
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
        <DocumentCard title="Current Task" filename="docs/CURRENT_TASK.md" content={docs.currentTask} loading={loading} label="Read-only Codex task" />
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
