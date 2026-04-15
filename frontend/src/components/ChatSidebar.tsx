import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircle, X, Send, Trash2 } from 'lucide-react'
import { api, type ChatMessage } from '../api/client'

async function fetchPageContext(pathname: string): Promise<string> {
  const parts: string[] = [`Page: ${pathname}`]
  try {
    const [accounts, txns] = await Promise.all([
      api.accounts.list(false),
      api.transactions.list({}),
    ])
    if (accounts.length) {
      parts.push('Accounts:\n' + accounts.map(a =>
        `  - ${a.name} (${a.currency}, ${a.account_type}, ${a.active ? 'active' : 'inactive'})`
      ).join('\n'))
    }
    const recent = txns.slice(0, 20)
    if (recent.length) {
      parts.push('Recent transactions (latest 20):\n' + recent.map(t =>
        `  - ${t.date} | ${t.description} | ${t.amount} ${t.category ? `[${t.category}]` : ''}`
      ).join('\n'))
    }
    if (pathname.includes('predictions')) {
      try {
        const f = await api.analytics.forecast()
        parts.push(`Forecast: monthly growth ${f.monthly_growth}, currency ${f.currency}`)
      } catch { /* ignore */ }
    }
  } catch { /* ignore — don't break chat if context fetch fails */ }
  return parts.join('\n\n')
}

export default function ChatSidebar() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [apiHistory, setApiHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.settings.all().then(s => setModel(s.llm_model || '')).catch(() => {})
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function send() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: q }
    const newDisplay = [...messages, userMsg]
    const newHistory = [...apiHistory, userMsg]
    setMessages(newDisplay)
    setApiHistory(newHistory)
    setLoading(true)
    try {
      const page_context = await fetchPageContext(location.pathname)
      const res = await api.chat({ messages: newHistory, model, page_context })
      setMessages([...newDisplay, { role: 'assistant', content: res.reply }])
      setApiHistory(res.messages)
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      setMessages([...newDisplay, { role: 'assistant', content: `Error: ${err}` }])
    } finally {
      setLoading(false)
    }
  }

  function clear() { setMessages([]); setApiHistory([]) }

  return (
    <>
      {/* Floating toggle button — bottom right, hidden when panel is open */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 200,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '999px',
            padding: '0.6rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}
        >
          <MessageCircle size={16} /> AI Assistant
        </button>
      )}

      {/* Right panel */}
      {open && (
        <div style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: 360, zIndex: 200,
          background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageCircle size={15} /> AI Assistant
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={clear} title="Clear chat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}>
                <Trash2 size={15} />
              </button>
              <button onClick={() => setOpen(false)} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {!model && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
                No model configured. Go to <strong>Settings</strong> to add one.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`} style={{ whiteSpace: 'pre-wrap' }}>
                {m.content}
              </div>
            ))}
            {loading && <div className="chat-msg assistant"><span className="spinner" style={{ width: 14, height: 14 }} /></div>}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: '0.4rem' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask about your finances…"
              disabled={loading || !model}
              style={{ flex: 1, fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
            />
            <button className="btn btn-primary btn-sm" onClick={send} disabled={loading || !model}>
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
