import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import type { AssistantInsight } from '../../api/client'
import { insightTone } from './data'

interface Props {
  insights: AssistantInsight[]
  loading: boolean
  onAskHelper: (prompt: string) => void
}

export default function InsightsCard({ insights, loading, onAskHelper }: Props) {
  const navigate = useNavigate()

  return (
    <div
      className="card"
      role="link"
      tabIndex={0}
      onClick={() => navigate('/financial-helper')}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') navigate('/financial-helper')
      }}
      style={{ marginBottom: '18px', padding: '18px', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={16} /> Financial helper
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>
            A few things worth checking before you dive into the details.
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); onAskHelper('Give me a concise financial review of my current dashboard.') }}>
          Ask helper
        </button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-faint)', fontSize: '0.82rem' }}>
          <span className="spinner" style={{ width: 16, height: 16 }} /> Reviewing your finances…
        </div>
      ) : insights.length === 0 ? (
        <div style={{ color: 'var(--ink-faint)', fontSize: '0.82rem' }}>
          No helper insights yet. Add transactions, balances, or budgets and I’ll have more to say.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {insights.map((insight, idx) => {
            const tone = insightTone(insight.severity)
            return (
              <div key={`${insight.title}-${idx}`} style={{ background: tone.bg, border: '1px solid var(--border-soft)', borderRadius: 8, padding: '12px 13px', minHeight: 132, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: tone.dot, flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{insight.title}</div>
                </div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.45, color: 'var(--ink-soft)', flex: 1 }}>{insight.body}</div>
                {insight.action_label && insight.action_prompt && (
                  <button className="btn-link" style={{ alignSelf: 'flex-start' }} onClick={e => { e.stopPropagation(); onAskHelper(insight.action_prompt!) }}>
                    {insight.action_label} →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
