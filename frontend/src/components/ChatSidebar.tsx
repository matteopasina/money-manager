import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Trash2 } from 'lucide-react'
import { api, type ChatMessage } from '../api/client'

export default function ChatSidebar() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])  // display messages
  const [apiHistory, setApiHistory] = useState<ChatMessage[]>([])  // full API history
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load LLM model from settings (api_key is read server-side)
    api.settings.all().then(s => {
      setModel(s.llm_model || '')
    }).catch(() => {})
  }, [])

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
      const res = await api.chat({ messages: newHistory, model })
      setMessages([...newDisplay, { role: 'assistant', content: res.reply }])
      setApiHistory(res.messages)
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      setMessages([...newDisplay, { role: 'assistant', content: `Error: ${err}` }])
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setMessages([])
    setApiHistory([])
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="chat-toggle"
        style={{ margin: '0.5rem 0.75rem' }}
      >
        <MessageCircle size={14} /> AI Assistant
      </button>
    )
  }

  return (
    <div className="chat-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <MessageCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
          AI Assistant
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <Trash2 size={13} />
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={13} />
          </button>
        </div>
      </div>

      {!model && (
        <div className="alert alert-info" style={{ fontSize: '0.75rem', padding: '0.5rem' }}>
          Add <code>llm_model</code> to app settings to enable chat.
        </div>
      )}

      <div className="chat-history">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="chat-msg assistant"><span className="spinner" /></div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about your finances..."
          disabled={loading || !model}
          style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
        />
        <button className="btn btn-primary btn-sm" onClick={send} disabled={loading || !model}>
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}
