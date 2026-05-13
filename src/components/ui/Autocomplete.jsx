import { useMemo, useState } from 'react'

export function Autocomplete({
  value,
  items,
  getLabel = (item) => item.name,
  getMeta,
  getSearchText,
  onSelect,
  placeholder = 'Buscar...',
  emptyText = 'Sin resultados',
  startText = 'Escriba para buscar',
  minQueryLength = 0,
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const selectedLabel = value ? getLabel(value) : ''
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term.length < minQueryLength) return []
    if (!term) return items.slice(0, 8)
    return items.filter((item) => {
      const searchText = getSearchText ? getSearchText(item) : `${getLabel(item)} ${getMeta?.(item) || ''}`
      return searchText.toLowerCase().includes(term)
    }).slice(0, 12)
  }, [getLabel, getMeta, getSearchText, items, minQueryLength, query])

  return (
    <div className="relative">
      <input
        disabled={disabled}
        value={focused ? query : selectedLabel}
        onFocus={() => {
          setFocused(true)
          setQuery('')
        }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400/60 disabled:opacity-50"
      />
      {focused ? (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-lg border border-white/10 bg-[#111118] p-1 shadow-2xl">
          {query.trim().length < minQueryLength ? (
            <p className="px-3 py-2 text-sm text-white/45">{startText}</p>
          ) : filtered.length ? (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(item)
                  setFocused(false)
                  setQuery('')
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
              >
                <p className="font-bold text-white">{getLabel(item)}</p>
                {getMeta ? <p className="text-xs text-white/45">{getMeta(item)}</p> : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-white/45">{emptyText}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
