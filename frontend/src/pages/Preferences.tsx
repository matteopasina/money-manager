import { useEffect, useState } from 'react'
import { api, SECRET_MASK } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { VISUAL_STYLES } from '../theme'
import { useTheme } from '../useTheme'
import type { ThemeMode } from '../theme'

const MODEL_PRESETS = [
  {
    group: 'Anthropic Claude',
    models: [
      { label: 'Claude Fable 5',        value: 'claude-fable-5' },
      { label: 'Claude Opus 4.8',       value: 'claude-opus-4-8' },
      { label: 'Claude Sonnet 5',       value: 'claude-sonnet-5' },
      { label: 'Claude Haiku 4.5',      value: 'claude-haiku-4-5-20251001' },
    ],
  },
  {
    group: 'Google Gemini',
    models: [
      { label: 'Gemini 3.5 Flash',            value: 'gemini/gemini-3.5-flash' },
      { label: 'Gemini 3.1 Pro Preview',      value: 'gemini/gemini-3.1-pro-preview' },
      { label: 'Gemini 3.1 Flash-Lite',       value: 'gemini/gemini-3.1-flash-lite' },
      { label: 'Gemini 3 Flash Preview',      value: 'gemini/gemini-3-flash-preview' },
      { label: 'Gemini 2.5 Pro',              value: 'gemini/gemini-2.5-pro' },
      { label: 'Gemini 2.5 Flash',            value: 'gemini/gemini-2.5-flash' },
    ],
  },
  {
    group: 'OpenAI',
    models: [
      { label: 'GPT-6 Luna',    value: 'gpt-6-luna' },
      { label: 'GPT-5.6 Luna',  value: 'gpt-5.6-luna' },
      { label: 'GPT-5.5',       value: 'gpt-5.5' },
      { label: 'GPT-5.4',       value: 'gpt-5.4' },
      { label: 'GPT-5.4 Mini',  value: 'gpt-5.4-mini' },
      { label: 'GPT-5.4 Nano',  value: 'gpt-5.4-nano' },
    ],
  },
  {
    group: 'Open Source (via Groq)',
    models: [
      { label: 'GPT-OSS 120B',      value: 'groq/openai/gpt-oss-120b' },
      { label: 'GPT-OSS 20B',       value: 'groq/openai/gpt-oss-20b' },
      { label: 'Llama 3.3 70B',     value: 'groq/llama-3.3-70b-versatile' },
      { label: 'Llama 3.1 8B',      value: 'groq/llama-3.1-8b-instant' },
      { label: 'Qwen3 32B',         value: 'groq/qwen/qwen3-32b' },
    ],
  },
  {
    group: 'Open Source (via Ollama — local)',
    models: [
      { label: 'GPT-OSS 20B',       value: 'ollama/gpt-oss:20b' },
      { label: 'Qwen3 32B',         value: 'ollama/qwen3:32b' },
      { label: 'Llama 3.3 70B',     value: 'ollama/llama3.3:70b' },
      { label: 'DeepSeek R1 32B',   value: 'ollama/deepseek-r1:32b' },
    ],
  },
]

export default function Preferences({ embedded = false }: { embedded?: boolean }) {
  const Heading = embedded ? 'h2' : 'h1'
  const [loading, setLoading] = useState(true)
  const [model, setModel]     = useState('')
  const [apiKey, setApiKey]   = useState('')          // write-only: blank unless replacing
  const [apiKeySaved, setApiKeySaved] = useState(false) // a key is stored server-side
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.settings.all().then(s => {
      setModel(s.llm_model || '')
      // Secrets come back masked; the input stays blank and typing replaces the stored key.
      setApiKeySaved(s.llm_api_key === SECRET_MASK)
    }).catch((e: unknown) => {
      setMsg({ type: 'error', text: `Couldn't load settings: ${e instanceof Error ? e.message : String(e)}` })
    }).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const writes = [api.settings.set('llm_model', model.trim())]
      // Write-only secret: only send when the user typed a new one
      if (apiKey.trim()) writes.push(api.settings.set('llm_api_key', apiKey.trim()))
      await Promise.all(writes)
      if (apiKey.trim()) { setApiKeySaved(true); setApiKey('') }
      setMsg({ type: 'success', text: 'Settings saved.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  const { mode, setMode, visualStyle, setVisualStyle } = useTheme()

  const THEME_OPTIONS: { value: ThemeMode; label: string; desc: string }[] = [
    { value: 'light',  label: '☀️ Chiaro',  desc: 'Sempre chiaro' },
    { value: 'dark',   label: '🌙 Scuro',   desc: 'Sempre scuro' },
    { value: 'system', label: '💻 Sistema', desc: 'Segui il sistema' },
  ]

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="page-header">
        <div>
          <Heading>Preferenze</Heading>
          <p>Aspetto e configurazione dell’assistente</p>
        </div>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="card" style={{ maxWidth: 560, marginBottom: '1.5rem' }}>
        <div className="section-title" style={{ marginBottom: '1rem' }}>Aspetto</div>
        <div className="form-group" style={{ margin: 0 }}>
          <fieldset className="visual-style-picker"><legend>Stile interfaccia</legend><div>{VISUAL_STYLES.map(style => <button key={style.value} type="button" aria-pressed={visualStyle === style.value} onClick={() => setVisualStyle(style.value)}><strong>{style.label}</strong><span>{style.description}</span></button>)}</div></fieldset>
          <label>Tema</label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className="btn btn-secondary"
                onClick={() => setMode(opt.value)}
                style={{
                  flex: 1, flexDirection: 'column', gap: '0.2rem', padding: '0.6rem 0.5rem',
                  background: mode === opt.value ? 'var(--ink)' : undefined,
                  color: mode === opt.value ? 'var(--bg-card)' : undefined,
                  borderColor: mode === opt.value ? 'var(--ink)' : undefined,
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
        <div className="section-title" style={{ marginBottom: '1rem' }}>Assistente</div>

        <div className="form-group">
          <label>Modelli suggeriti</label>
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
                      background: model === m.value ? 'var(--ink)' : undefined,
                      color: model === m.value ? 'var(--bg-card)' : undefined,
                      borderColor: model === m.value ? 'var(--ink)' : undefined,
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
          <label>Nome del modello</label>
          <input
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="e.g. gemini/gemini-2.5-flash"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Scegli un modello suggerito o inserisci il nome completo del modello.
          </p>
        </div>

        <div className="form-group">
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={apiKeySaved ? '•••••••• salvata — inserisci una nuova chiave per sostituirla' : "sk-… or your provider's key"}
            autoComplete="new-password"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            La chiave è cifrata e conservata sul server; non viene restituita al browser.
            Con Ollama lascia il campo vuoto.
          </p>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  )
}
