export default function Callout({ children, type = 'warn' }: { children: React.ReactNode; type?: 'warn' | 'info' }) {
  const bg     = type === 'warn' ? '#fef9c3' : '#eff6ff'
  const border = type === 'warn' ? '#fbbf24' : '#93c5fd'
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 6, padding: '0.6rem 0.8rem',
      fontSize: '0.82rem', marginTop: '0.75rem', lineHeight: 1.5, color: '#1f2937',
    }}>
      {children}
    </div>
  )
}
