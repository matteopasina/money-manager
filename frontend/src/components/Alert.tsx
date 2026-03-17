interface AlertProps {
  type: 'success' | 'error' | 'info' | 'warning'
  children: React.ReactNode
  onClose?: () => void
  style?: React.CSSProperties
}

export default function Alert({ type, children, onClose, style }: AlertProps) {
  return (
    <div className={`alert alert-${type}`} style={{ marginBottom: '1rem', ...style }}>
      {children}
      {onClose && (
        <button
          onClick={onClose}
          style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
