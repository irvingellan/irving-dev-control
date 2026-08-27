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

      <CodexBridgeTest />
    </main>
  );
}

// ── Codex Bridge Test section (temporary, for integration validation) ──

function CodexBridgeTest() {
  const [prompt, setPrompt] = useState('');
  const [continuePrompt, setContinuePrompt] = useState('');
  const [jobId, setJobId] = useState('');
  const [threadId, setThreadId] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState('Ready. Make sure codex-from-chatgpt is running on port 8787.');

  async function handleStart() {
    if (!prompt.trim()) { setBridgeMessage('Enter a prompt before starting.'); return; }
    setBusy(true);
    setBridgeMessage('Starting Codex job…');
    try {
      const response = await fetch('/api/codex/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: '/Users/irvingellan/Documents/ChatGPT/irving-dev-control', prompt: prompt.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Start failed');
      setJobId(result.job_id || '');
      setThreadId(result.thread_id || '');
      setSnapshot(result);
      setBridgeMessage(`Job started: ${result.job_id} (thread: ${result.thread_id})`);
    } catch (error) {
      setBridgeMessage(`Start failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    if (!jobId) { setBridgeMessage('No job ID to refresh.'); return; }
    setBusy(true);
    setBridgeMessage('Refreshing job…');
    try {
      const response = await fetch(`/api/codex/jobs/${encodeURIComponent(jobId)}?detail=standard`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Get failed');
      setSnapshot(result);
      setBridgeMessage(`Job ${jobId}: ${result.status}${result.activity ? ` — ${result.activity}` : ''}`);
    } catch (error) {
      setBridgeMessage(`Refresh failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    if (!jobId) { setBridgeMessage('No job ID to continue.'); return; }
    if (!continuePrompt.trim()) { setBridgeMessage('Enter a continue prompt.'); return; }
    setBusy(true);
    setBridgeMessage('Continuing job…');
    try {
      const response = await fetch(`/api/codex/jobs/${encodeURIComponent(jobId)}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: continuePrompt.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Continue failed');
      setSnapshot(result);
      const newThread = result.thread_id || threadId;
      const reused = newThread === threadId ? '✓ same thread reused' : '⚠ new thread';
      setBridgeMessage(`Continue sent (${reused}). Thread: ${newThread}`);
    } catch (error) {
      setBridgeMessage(`Continue failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 24, padding: 22, gridColumn: 'span 2' }}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Integration test · codex-from-chatgpt</p>
          <h2>Codex Bridge Test</h2>
        </div>
        <code>127.0.0.1:8787/mcp</code>
      </div>

      <p style={{ color: '#9fb2ca', fontSize: '.9rem', margin: '8px 0 16px' }}>{bridgeMessage}</p>

      {/* Start job */}
      <label style={{ display: 'block', color: '#aebdd1', fontSize: '.82rem', marginBottom: 4 }}>Start prompt</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={busy}
        placeholder="Describe a read-only task for Codex…"
        style={{ width: '100%', minHeight: 80, resize: 'vertical', border: '1px solid #334b6d', borderRadius: 9, padding: 12, color: '#e8edf7', background: '#101b2c', font: '.9rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace', marginBottom: 8 }}
      />
      <button onClick={handleStart} disabled={busy} style={{ marginRight: 8 }}>{busy ? 'Working…' : 'Start Job'}</button>
      <button onClick={handleRefresh} disabled={busy || !jobId}>Refresh Job</button>

      {/* Job ID display */}
      {jobId && (
        <div style={{ margin: '16px 0 8px', padding: '10px 14px', background: '#101b2c', borderRadius: 9, border: '1px solid #334b6d' }}>
          <span style={{ color: '#77a8f7', fontSize: '.74rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Job ID</span>
          <pre style={{ margin: '4px 0 0', color: '#c8d3e4', fontSize: '.85rem' }}>{jobId}</pre>
          {threadId && <>
            <span style={{ color: '#77a8f7', fontSize: '.74rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Thread ID</span>
            <pre style={{ margin: '4px 0 0', color: '#c8d3e4', fontSize: '.85rem' }}>{threadId}</pre>
          </>}
        </div>
      )}

      {/* Continue job */}
      {jobId && (
        <>
          <label style={{ display: 'block', color: '#aebdd1', fontSize: '.82rem', margin: '12px 0 4px' }}>Continue prompt (same thread)</label>
          <textarea
            value={continuePrompt}
            onChange={(e) => setContinuePrompt(e.target.value)}
            disabled={busy}
            placeholder="Follow-up instruction for the same Codex thread…"
            style={{ width: '100%', minHeight: 60, resize: 'vertical', border: '1px solid #334b6d', borderRadius: 9, padding: 12, color: '#e8edf7', background: '#101b2c', font: '.9rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace', marginBottom: 8 }}
          />
          <button onClick={handleContinue} disabled={busy}>{busy ? 'Working…' : 'Continue Job'}</button>
        </>
      )}

      {/* Job snapshot */}
      {snapshot && (
        <div style={{ marginTop: 16 }}>
          <span style={{ color: '#77a8f7', fontSize: '.74rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Job Snapshot</span>
          <pre style={{ margin: '4px 0 0', color: '#c8d3e4', fontSize: '.85rem', maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(snapshot, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

