import type { SyncStatus } from '../../api/client'
import { relTime } from './utils'

const SYNC_INTERVALS = [
  { hours: 6,   label: 'Every 6 hours' },
  { hours: 12,  label: 'Every 12 hours' },
  { hours: 24,  label: 'Daily' },
  { hours: 72,  label: 'Every 3 days' },
  { hours: 168, label: 'Weekly' },
]

interface Props {
  syncStatus: SyncStatus
  syncingNow: boolean
  onUpdateSettings: (enabled: boolean, intervalHours: number) => void
  onSyncNow: () => void
}

export default function SyncStatusCard({ syncStatus, syncingNow, onUpdateSettings, onSyncNow }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Automatic sync</div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>
            Connected accounts sync on app start and then on the chosen interval. Recently synced
            accounts are skipped until the interval elapses.
          </div>
        </div>
        <button className="btn btn-primary" onClick={onSyncNow} disabled={syncingNow} style={{ flexShrink: 0 }}>
          {syncingNow ? 'Syncing…' : 'Sync now'}
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
          Enabled
        </label>
        <select
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
            <div key={i.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '12.5px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, alignSelf: 'center' }} />
              <span style={{ fontWeight: 600, color: 'var(--ink)', minWidth: 140 }}>{i.name}</span>
              <span style={{ color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {!i.configured ? 'Not configured'
                  : i.last_status === 'error' ? `Failed ${relTime(i.last_run_at)} — ${i.last_message}`
                  : i.last_success_at ? `Synced ${relTime(i.last_success_at)}${i.due ? ' · due' : ''}${i.last_status === 'success' && i.last_message ? ` — ${i.last_message}` : ''}`
                  : 'Never synced'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
