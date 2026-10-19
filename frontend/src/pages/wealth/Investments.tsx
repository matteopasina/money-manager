import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import LoadingSpinner from '../../components/LoadingSpinner'
import Alert from '../../components/Alert'
import StockPositions from '../../components/StockPositions'

export default function Investments() {
  const { data, loading, error, reload } = useApi(() => api.accounts.list(), [])
  if (loading) return <LoadingSpinner />
  if (error) return <Alert type="error">Impossibile caricare gli investimenti. <button className="btn-link" onClick={reload}>Riprova</button></Alert>
  return <><StockPositions accounts={data ?? []} /><p className="workspace-note">Questa vista gestisce le posizioni Microsoft registrate. Per gli altri investimenti consulta i <Link to="/wealth/accounts">conti e saldi</Link>. I valori sono già inclusi nel patrimonio.</p></>
}
