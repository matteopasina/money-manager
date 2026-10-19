import type { SyncStatus } from '../../api/client'
import { relTime } from './utils'

const SYNC_INTERVALS = [
  { hours: 6,   label: 'Ogni 6 ore' },
  { hours: 12,  label: 'Ogni 12 ore' },
  { hours: 24,  label: 'Ogni giorno' },
  { hours: 72,  label: 'Ogni 3 giorni' },
  { hours: 168, label: 'Ogni settimana' },
]

interface Props {
  syncStatus: SyncStatus
  syncingNow: boolean
  onUpdateSettings: (enabled: boolean, intervalHours: number) => void
  onSyncNow: () => void
  onRefresh: () => void
}

export default function SyncStatusCard({ syncStatus, syncingNow, onUpdateSettings, onSyncNow, onRefresh }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Sincronizzazione automatica</div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>
            I conti collegati vengono sincronizzati all’avvio e poi all’intervallo scelto.
            I conti aggiornati di recente attendono il prossimo intervallo.
          </div>
        </div>
        <button className="btn btn-secondary" onClick={onRefresh} disabled={syncingNow}>Aggiorna stato</button>
        <button className="btn btn-primary" onClick={onSyncNow} disabled={syncingNow || !syncStatus.integrations.some(i => i.configured)} style={{ flexShrink: 0 }}>
          {syncingNow ? 'Sincronizzazione…' : 'Sincronizza ora'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '12px 0 14px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer', fontSize: '13px', color: 'var(--ink-soft)' }}>
          <input
            type="checkbox"
            checked={syncStatus.enabled}
            onChange={e => onUpdateSettings(e.target.checked, syncStatus.interval_hours)}
            style={{ width: 'auto' }}
          />
          Attiva
        </label>
        <select
          aria-label="Intervallo sincronizzazione automatica"
          value={syncStatus.interval_hours}
          onChange={e => onUpdateSettings(syncStatus.enabled, Number(e.target.value))}
          disabled={!syncStatus.enabled}
          style={{ maxWidth: 180 }}
        >
          {SYNC_INTERVALS.map(o => <option key={o.hours} value={o.hours}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {syncStatus.integrations.map(i => {
          const dot = !i.configured ? 'var(--ink-ghost)'
            : i.last_status === 'error' ? 'var(--loss)'
            : i.last_status === 'success' ? 'var(--gain)'
            : 'var(--accent)'
          return (
            <div key={i.id} className="sync-integration-row">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, alignSelf: 'center' }} />
              <span style={{ fontWeight: 600, color: 'var(--ink)', minWidth: 140 }}>{i.name}</span>
              <span className="sync-integration-message">
                {!i.configured ? 'Non configurato'
                  : i.last_status === 'error' ? `Errore ${relTime(i.last_run_at)} — ${i.last_message}`
                  : i.last_success_at ? `Sincronizzato ${relTime(i.last_success_at)}${i.due ? ' · da aggiornare' : ''}${i.last_status === 'success' && i.last_message ? ` — ${i.last_message}` : ''}`
                  : 'Mai sincronizzato'}
                {i.last_status === 'error' && i.last_success_at && <small style={{ display: 'block' }}>Ultima sincronizzazione riuscita: {relTime(i.last_success_at)}</small>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
