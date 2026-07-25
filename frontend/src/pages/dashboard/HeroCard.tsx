import { useNavigate } from 'react-router-dom'
import { fmt } from '../../utils/money'
import { formatDateLabel } from '../../utils/date'
import type { Metrics } from './data'

interface Props {
  metrics: Metrics
  baseCurrency: string
  spark: { line: string; area: string } | null
  delta: number
  pct: number
  invested: number
  liquidPct: number
}

export default function HeroCard({ metrics, baseCurrency, spark, delta, pct, invested, liquidPct }: Props) {
  const navigate = useNavigate()

  return (
    <>
      <div
        className="hero-card"
        style={{
          marginBottom: '18px',
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(130% 220% at 88% -50%, #3E3525 0%, #241F18 55%)',
        }}
      >
        {spark && (
          <svg viewBox="0 0 300 76" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 110, opacity: 0.45, pointerEvents: 'none' }}>
            <defs>
              <linearGradient id="herosparkfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B8842B" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#B8842B" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={spark.area} fill="url(#herosparkfill)" />
            <path d={spark.line} fill="none" stroke="#B8842B" strokeWidth="1.4" opacity="0.9" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="hero-eyebrow">Total net worth</div>
          <div className="hero-figure">{fmt(metrics.totalNow, baseCurrency)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            <span className="hero-delta-chip" style={delta < 0 ? { background: 'rgba(217,116,90,0.18)', color: '#E4937C' } : undefined}>
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{fmt(delta, baseCurrency)} · {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </span>
            <span style={{ fontSize: 13, color: 'var(--on-ink-muted)' }}>vs. previous snapshot</span>
          </div>
        </div>
        <div className="hero-side" style={{ position: 'relative' }}>
          <div>
            <div className="hero-side-label">Liquid</div>
            <div className="hero-side-value">{fmt(metrics.liquid, baseCurrency)}</div>
          </div>
          <div>
            <div className="hero-side-label">Invested</div>
            <div className="hero-side-value">{fmt(invested, baseCurrency)}</div>
          </div>
          <div>
            <div style={{ display: 'flex', height: 5, borderRadius: 99, overflow: 'hidden', gap: 3, marginBottom: 6 }}>
              <div style={{ width: `${liquidPct}%`, background: '#A6CE8B' }} />
              <div style={{ width: `${100 - liquidPct}%`, background: '#B8842B' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--on-ink-faint)' }}>
              <span>{liquidPct}% liquid</span><span>{100 - liquidPct}% invested</span>
            </div>
          </div>
          {metrics.latestDate && (
            <div style={{ fontSize: '11.5px', color: 'var(--on-ink-faint)' }}>
              Updated {formatDateLabel(metrics.latestDate, { withYear: true })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '13px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: '30px' }}>
        {metrics.byType.map(g => {
          const tileDelta = g.prev > 0 ? ((g.now - g.prev) / g.prev) * 100 : null
          return (
            <div
              key={g.type}
              className="account-tile card"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/accounts')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                  {g.type}
                </span>
                {tileDelta !== null && Math.abs(tileDelta) >= 0.05 && (
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: tileDelta >= 0 ? 'var(--gain)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {tileDelta >= 0 ? '▲' : '▼'} {Math.abs(tileDelta).toFixed(1)}%
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 25, marginTop: 11, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(g.now, baseCurrency)}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.accounts.length === 1 ? g.accounts[0] : `${g.accounts.length} accounts`} · {((g.now / metrics.totalNow) * 100).toFixed(1)}%
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
