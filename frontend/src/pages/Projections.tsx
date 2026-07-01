import { useState } from 'react'
import Predictions from './Predictions'
import GoalCalculator from './GoalCalculator'

export default function Projections() {
  const [tab, setTab] = useState<'forecast' | 'goal'>('forecast')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Projections</h1>
          <p>Forecast where your net worth is headed, or plan toward a target</p>
        </div>
      </div>

      <div className="tab-tray" style={{ marginBottom: '22px' }}>
        <button className={`tab-btn${tab === 'forecast' ? ' active' : ''}`} onClick={() => setTab('forecast')}>
          Forecast
        </button>
        <button className={`tab-btn${tab === 'goal' ? ' active' : ''}`} onClick={() => setTab('goal')}>
          Goal Planner
        </button>
      </div>

      {/* Both tabs stay mounted so switching is instant and data doesn't refetch */}
      <div style={{ display: tab === 'forecast' ? 'block' : 'none' }}><Predictions /></div>
      <div style={{ display: tab === 'goal' ? 'block' : 'none' }}><GoalCalculator /></div>
    </div>
  )
}
