import { useEffect, useState } from 'react'
import { api } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { useTheme, type ThemeMode } from '../ThemeContext'

const MODEL_PRESETS = [
  {
    group: 'Anthropic Claude',
    models: [
      { label: 'Claude Opus 4.6',       value: 'claude-opus-4-6' },
      { label: 'Claude Sonnet 4.6',     value: 'claude-sonnet-4-6' },
      { label: 'Claude Haiku 4.5',      value: 'claude-haiku-4-5-20251001' },
    ],
  },
  {
    group: 'Google Gemini',
    models: [
      { label: 'Gemini 3.1 Pro Preview',      value: 'gemini/gemini-3.1-pro-preview' },
      { label: 'Gemini 3.1 Flash Lite Preview',value: 'gemini/gemini-3.1-flash-lite-preview' },
      { label: 'Gemini 2.5 Pro',              value: 'gemini/gemini-2.5-pro' },
      { label: 'Gemini 2.5 Flash',            value: 'gemini/gemini-2.5-flash' },
      { label: 'Gemini 2.5 Flash Lite',       value: 'gemini/gemini-2.5-flash-lite' },
    ],
  },
  {
    group: 'OpenAI',
    models: [
      { label: 'GPT-5.4',       value: 'gpt-5.4' },
      { label: 'GPT-5.3',       value: 'gpt-5.3' },
      { label: 'GPT-4.1',       value: 'gpt-4.1' },
      { label: 'GPT-4.1 Mini',  value: 'gpt-4.1-mini' },
    ],
  },
  {
    group: 'Open Source (via Groq)',
    models: [
      { label: 'Llama 4 Maverick',  value: 'groq/meta-llama/llama-4-maverick-17b-128e-instruct' },
      { label: 'Llama 4 Scout',     value: 'groq/meta-llama/llama-4-scout-17b-16e-instruct' },
      { label: 'Qwen QwQ 32B',      value: 'groq/qwen-qwq-32b' },
    ],
  },
  {
    group: 'Open Source (via Ollama — local)',
    models: [
      { label: 'Gemma 4 31B',       value: 'ollama/gemma4:31b' },
      { label: 'Llama 4 Scout',     value: 'ollama/llama4:scout' },
      { label: 'DeepSeek R1 32B',   value: 'ollama/deepseek-r1:32b' },
      { label: 'Qwen 3.5 14B',      value: 'ollama/qwen3.5:14b' },
    ],
  },
]

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [model, setModel]     = useState('')
  const [apiKey, setApiKey]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.settings.all().then(s => {
      setModel(s.llm_model || '')
      setApiKey(s.llm_api_key || '')
    }).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      await Promise.all([
        api.settings.set('llm_model', model.trim()),
        api.settings.set('llm_api_key', apiKey.trim()),
      ])
      setMsg({ type: 'success', text: 'Settings saved.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  const { mode, setMode } = useTheme()

  const THEME_OPTIONS: { value: ThemeMode; label: string; desc: string }[] = [
    { value: 'light',  label: '☀️ Light',  desc: 'Always light' },
    { value: 'dark',   label: '🌙 Dark',   desc: 'Always dark' },
    { value: 'system', label: '💻 System', desc: 'Follow macOS setting' },
  ]

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure appearance and AI assistant</p>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="card" style={{ maxWidth: 560, marginBottom: '1.5rem' }}>
        <div className="section-title" style={{ marginBottom: '1rem' }}>Appearance</div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Theme</label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className="btn btn-secondary"
                onClick={() => setMode(opt.value)}
                style={{
                  flex: 1, flexDirection: 'column', gap: '0.2rem', padding: '0.6rem 0.5rem',
                  background: mode === opt.value ? 'var(--accent)' : undefined,
                  color: mode === opt.value ? '#fff' : undefined,
                  borderColor: mode === opt.value ? 'var(--accent)' : undefined,
                  fontSize: '0.82rem',
                }}
              >
                <span>{opt.label}</span>
                <span style={{ fontSize: '0.68rem', opacity: 0.75 }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="section-title" style={{ marginBottom: '1rem' }}>AI Assistant</div>

        <div className="form-group">
          <label>Model presets</label>
          {MODEL_PRESETS.map(group => (
            <div key={group.group} style={{ marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {group.group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {group.models.map(m => (
                  <button
                    key={m.value}
                    className="btn btn-secondary btn-sm"
                    onClick={() => setModel(m.value)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.55rem',
                      background: model === m.value ? 'var(--accent)' : undefined,
                      color: model === m.value ? '#fff' : undefined,
                      borderColor: model === m.value ? 'var(--accent)' : undefined,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label>Model string</label>
          <input
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="e.g. gemini/gemini-2.5-flash"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Click a preset above or type any LiteLLM-compatible string.
          </p>
        </div>

        <div className="form-group">
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-… or your provider's key"
            autoComplete="new-password"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Stored server-side only — never sent to the browser.
            For Ollama leave this blank.
          </p>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
