export function DatePicker({ label, value, onChange, required = false, error }) {
  return (
    <label className="block">
      {label ? <span className="mb-1 block text-xs font-bold uppercase text-white/45">{label}{required ? ' *' : ''}</span> : null}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border bg-black/20 px-3 py-2.5 text-sm outline-none transition ${error ? 'border-red-400/70' : 'border-white/10 focus:border-blue-400/60'}`}
      />
      {error ? <span className="mt-1 block text-xs text-red-300">{error}</span> : null}
    </label>
  )
}
