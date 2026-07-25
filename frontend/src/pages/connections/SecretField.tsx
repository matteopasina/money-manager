interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  saved: boolean
  placeholder: string
  noun?: string
}

// Write-only secret input: the value is never pre-filled from the server (the
// backend only ever returns a masked placeholder for saved secrets), so the
// field stays blank and typing a new value replaces the stored one.
export default function SecretField({ label, value, onChange, saved, placeholder, noun = 'value' }: Props) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={saved ? `•••••••• saved — paste a new ${noun} to replace` : placeholder}
        autoComplete="new-password"
      />
    </div>
  )
}
