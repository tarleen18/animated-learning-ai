import { useState, useEffect, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

function Bubble({ role, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: 18, background: role === 'user' ? '#2563eb' : '#eef2ff', color: role === 'user' ? 'white' : '#0f172a' }}>
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', text: 'Hi — ask me a question and I will design an animated lesson storyboard for it.' }
  ]);
  const [input, setInput] = useState('Why do seasons happen?');
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [renderingMap, setRenderingMap] = useState({});
  const listRef = useRef();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function purchaseCredits() {
    setBillingLoading(true);
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Unable to create checkout session');
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now(), role: 'assistant', text: `Billing error: ${err.message}` }]);
    } finally {
      setBillingLoading(false);
    }
  }

  async function send() {
    const q = input.trim();
    if (!q) return;
    const userMsg = { id: Date.now(), role: 'user', text: q };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      const lesson = await res.json();
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', text: 'Generated lesson storyboard', lesson };
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      setMessages((m) => [...m, { id: Date.now() + 2, role: 'assistant', text: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleRender(lesson) {
    try {
      const res = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson }) });
      if (res.status === 202) {
        const data = await res.json();
        const jobId = data.jobId;
        setRenderingMap((s) => ({ ...s, [jobId]: { status: 'queued' } }));
        pollJob(jobId);
      } else if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setMessages((m) => [...m, { id: Date.now(), role: 'assistant', text: 'Rendered video', videoUrl: url }]);
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Render failed');
      }
    } catch (e) {
      setMessages((m) => [...m, { id: Date.now(), role: 'assistant', text: `Render error: ${e.message}` }]);
    }
  }

  async function pollJob(jobId) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/job-status?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) throw new Error('job not found');
        const data = await res.json();
        setRenderingMap((s) => ({ ...s, [jobId]: data }));
        if (data.status === 'completed') {
          setMessages((m) => [...m, { id: Date.now(), role: 'assistant', text: 'Render complete', videoUrl: data.meta?.url }]);
          return;
        }
        if (data.status === 'failed') {
          setMessages((m) => [...m, { id: Date.now(), role: 'assistant', text: `Render failed: ${data.meta?.error || 'unknown'}` }]);
          return;
        }
      } catch (e) {
      }
      setTimeout(poll, 2000);
    };
    poll();
  }

  return (
    <div style={styles.container}>
      <div style={styles.app}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eef2ff', fontWeight: 700 }}>
          <div>Animated Learning — Chat</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {session?.user ? (
              <>
                <div style={{ color: '#0f172a' }}>{session.user.name || session.user.email}</div>
                <div style={{ background: '#eef2ff', padding: '6px 10px', borderRadius: 999, color: '#0f172a' }}>
                  Credits: {session.user.credits ?? 0}
                </div>
                <button onClick={purchaseCredits} disabled={billingLoading} style={{ border: 'none', background: '#2563eb', color: 'white', padding: '8px 12px', borderRadius: 10, cursor: 'pointer' }}>
                  {billingLoading ? 'Loading…' : 'Buy credits'}
                </button>
                <button onClick={() => signOut()} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer' }}>Sign out</button>
              </>
            ) : (
              <button onClick={() => signIn()} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer' }}>Sign in</button>
            )}
          </div>
        </div>
        <div style={styles.content} ref={listRef}>
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <Bubble role={m.role}>
                {m.text}
                {m.lesson && (
                  <div style={{ marginTop: 8 }}>
                    <div style={styles.lessonPreview}>
                      <p><strong>Objective:</strong> {m.lesson.learningObjective}</p>
                      <p><strong>Key Concepts:</strong> {m.lesson.keyConcepts?.join(', ')}</p>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {m.lesson.storyboard?.slice(0,3).map(s => (
                          <div key={s.number} style={styles.sceneSmall}><strong>Scene {s.number}:</strong> {s.onScreenText}</div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <button style={styles.primaryButton} onClick={() => handleRender(m.lesson)}>Render Lesson</button>
                      </div>
                    </div>
                  </div>
                )}
                {m.videoUrl && (
                  <div style={{ marginTop: 8 }}>
                    <video src={m.videoUrl} controls style={{ width: '100%', borderRadius: 12 }} />
                    <a href={m.videoUrl} download style={{ display: 'block', marginTop: 6 }}>Download</a>
                  </div>
                )}
              </Bubble>
            </div>
          ))}
        </div>

        <div style={styles.inputRow}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} style={styles.input} />
          <button style={styles.sendButton} onClick={send} disabled={loading}>{loading ? '...' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', justifyContent: 'center', padding: 24, background: '#f8fafc', minHeight: '100vh' },
  app: { width: '100%', maxWidth: 900, borderRadius: 12, boxShadow: '0 10px 30px rgba(2,6,23,0.08)', background: 'white', display: 'flex', flexDirection: 'column', height: '80vh', overflow: 'hidden' },
  header: { padding: 16, borderBottom: '1px solid #eef2ff', fontWeight: 700 },
  content: { padding: 16, overflowY: 'auto', flex: 1 },
  card: {
    maxWidth: 900,
    margin: '0 auto 2rem',
    padding: '2rem',
    borderRadius: 24,
    background: 'white',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)'
  },
  title: {
    margin: 0,
    fontSize: '2.5rem'
  },
  subtitle: {
    margin: '1rem 0 1.5rem',
    color: '#475569'
  },
  textarea: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    borderRadius: 16,
    border: '1px solid #d1d5db',
    resize: 'vertical'
  },
  button: {
    marginTop: '1rem',
    padding: '1rem 1.5rem',
    fontSize: '1rem',
    borderRadius: 16,
    border: 'none',
    color: 'white',
    background: '#2563eb',
    cursor: 'pointer'
  },
  error: {
    color: '#b91c1c',
    marginTop: '1rem'
  },
  warningCard: {
    marginTop: '0.5rem',
    padding: '0.75rem 1rem',
    borderRadius: 12,
    background: '#fff7ed',
    border: '1px solid #fde3a7',
    color: '#92400e'
  },
  lessonCard: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '2rem',
    borderRadius: 24,
    background: 'white',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)'
  },
  scenesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '1rem',
    marginTop: '1.5rem'
  },
  sceneCard: {
    padding: '1rem',
    borderRadius: 20,
    background: '#f1f5f9',
    minHeight: 220
  },
  sceneHeader: {
    fontWeight: 700,
    marginBottom: '0.75rem'
  },
  exportCard: {
    marginTop: '2rem',
    padding: '1.5rem',
    borderRadius: 20,
    background: '#ffffff',
    border: '1px solid #cbd5e1'
  },
  primaryButton: {
    padding: '1rem 1.5rem',
    borderRadius: 16,
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontSize: '1rem',
    cursor: 'pointer'
  },
  videoWrapper: {
    marginTop: '1rem',
    display: 'grid',
    gap: '0.75rem'
  },
  video: {
    width: '100%',
    borderRadius: 20,
    boxShadow: '0 15px 40px rgba(15, 23, 42, 0.12)'
  },
  downloadLink: {
    display: 'inline-block',
    marginTop: '0.5rem',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 700
  },
  metaCard: {
    marginTop: '2rem',
    padding: '1.5rem',
    borderRadius: 20,
    background: '#eef2ff'
  },
  inputRow: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eef2ff' },
  input: { flex: 1, borderRadius: 12, padding: 12, border: '1px solid #e6eefc' },
  sendButton: { background: '#2563eb', color: 'white', border: 'none', padding: '12px 16px', borderRadius: 12, cursor: 'pointer' },
  lessonPreview: { background: '#fff', padding: 12, borderRadius: 10, border: '1px solid #eef2ff' },
  sceneSmall: { padding: 8, background: '#f8fafc', borderRadius: 8 }
};

