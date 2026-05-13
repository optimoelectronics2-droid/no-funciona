import { useMemo, useState } from 'react'
import { CalendarDays, FileText, PackagePlus, Plus, Save, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Autocomplete } from '../../components/ui/Autocomplete'
import { DatePicker } from '../../components/ui/DatePicker'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { calculateInvoice, invoiceModes } from '../../lib/taxEngine'
import { currency } from '../../lib/formatters'

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
const blankLine = () => ({ id: crypto.randomUUID(), productId: '', name: '', quantity: 1, price: 0, cost: 0, discount: 0, taxable: true })

export function QuoteForm({ initialQuote, onDone }) {
  const toast = useToast()
  const products = useERPStore((state) => state.products)
  const customers = useERPStore((state) => state.customers)
  const upsertQuote = useERPStore((state) => state.upsertQuote)
  const [form, setForm] = useState(() => ({
    ...initialQuote,
    mode: initialQuote?.mode || invoiceModes.TAXED,
    customerId: initialQuote?.customerId || '',
    customerName: initialQuote?.customerName || '',
    date: initialQuote?.date || today(),
    validUntil: initialQuote?.validUntil || addDays(15),
    commercialTerms: initialQuote?.commercialTerms || 'Precios sujetos a disponibilidad. Esta cotizacion no constituye documento fiscal.',
    items: initialQuote?.items?.map((item) => ({ ...blankLine(), ...item, id: crypto.randomUUID() })) || [blankLine()],
    status: initialQuote?.status || 'Borrador',
  }))
  const customer = customers.find((item) => item.id === form.customerId)
  const totals = useMemo(() => calculateInvoice(form.items, form.mode), [form.items, form.mode])

  function setLine(lineId, patch) {
    setForm((state) => ({
      ...state,
      items: state.items.map((line) => line.id === lineId ? { ...line, ...patch, taxable: state.mode === invoiceModes.NO_TAX ? false : state.mode === invoiceModes.TAXED ? true : patch.taxable ?? line.taxable } : line),
    }))
  }

  function save(status = form.status) {
    try {
      if (!form.customerId) throw new Error('Seleccione un cliente para la cotizacion.')
      if (!form.items.some((item) => item.productId || item.name)) throw new Error('Agregue al menos un producto o servicio.')
      const saved = upsertQuote({ ...form, customerName: customer?.name || form.customerName, status, totals })
      toast.success(status === 'Enviada' ? 'Cotizacion enviada correctamente.' : 'Cotizacion guardada correctamente.')
      onDone?.(saved)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function chooseProduct(lineId, item) {
    setLine(lineId, { productId: item.id, name: item.name, price: item.price, cost: item.cost, taxable: item.taxable })
  }

  function removeLine(lineId) {
    setForm((state) => ({ ...state, items: state.items.length === 1 ? [blankLine()] : state.items.filter((item) => item.id !== lineId) }))
  }

  return (
    <div className="space-y-5">
      <section className="module-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-blue-200/80"><Sparkles size={14} /> Cotizacion premium</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Crear cotizacion clara y rapida</h2>
            <p className="mt-1 max-w-2xl text-sm text-white/48">Cliente, validez, productos y totales quedan separados para evitar cruces de columnas y hacer el flujo usable en PC, tablet y movil.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="ghost" icon={Save} onClick={() => save('Borrador')}>Guardar</Button>
            <Button variant="success" icon={Send} onClick={() => save('Enviada')}>Enviar</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(260px,1.4fr)_180px_180px_180px]">
          <label>
            <span className="label-dark">Cliente *</span>
            <Autocomplete value={customer} items={customers} getMeta={(item) => item.rnc || item.cedula || item.whatsapp} onSelect={(item) => setForm((state) => ({ ...state, customerId: item.id, customerName: item.name }))} emptyText="Registre un cliente primero" />
          </label>
          <DatePicker label="Fecha" value={form.date} onChange={(value) => setForm((state) => ({ ...state, date: value }))} />
          <DatePicker label="Valida hasta" value={form.validUntil} onChange={(value) => setForm((state) => ({ ...state, validUntil: value }))} />
          <label>
            <span className="label-dark">Modo fiscal</span>
            <select value={form.mode} onChange={(e) => setForm((s) => ({ ...s, mode: e.target.value }))} className="input-dark">
              <option value={invoiceModes.TAXED}>Con ITBIS</option>
              <option value={invoiceModes.NO_TAX}>Sin ITBIS</option>
              <option value={invoiceModes.MIXED}>Mixta</option>
            </select>
          </label>
          <label className="xl:col-span-4">
            <span className="label-dark">Condiciones comerciales</span>
            <input value={form.commercialTerms} onChange={(e) => setForm((s) => ({ ...s, commercialTerms: e.target.value }))} className="input-dark" />
          </label>
        </div>
      </section>

      <section className="quote-workspace">
        <div className="panel rounded-lg p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-xl font-bold">Productos cotizados</h3>
              <p className="text-sm text-white/45">Cada linea es independiente; nada depende de scroll horizontal.</p>
            </div>
            <Button variant="ghost" icon={Plus} onClick={() => setForm((s) => ({ ...s, items: [...s.items, blankLine()] }))}>Agregar producto</Button>
          </div>

          <div className="space-y-3">
            {form.items.map((line, index) => {
              const product = products.find((item) => item.id === line.productId)
              const total = calculateInvoice([line], form.mode).total
              return (
                <div key={line.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-white/45"><PackagePlus size={14} /> Linea {index + 1}</p>
                    <button type="button" onClick={() => removeLine(line.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-400/20 bg-red-500/10 text-red-200 transition hover:bg-red-500/20" aria-label="Eliminar linea"><Trash2 size={15} /></button>
                  </div>
                  <div className="quote-line-fields">
                    <label className="quote-wide min-w-0">
                      <span className="label-dark">Producto</span>
                      <Autocomplete value={product} items={products.filter((item) => item.status !== 'Inactivo')} getMeta={(item) => `${item.sku} · ${item.brand || 'Sin marca'} · Stock ${item.stock ?? 0} · ${currency.format(item.price)}`} onSelect={(item) => chooseProduct(line.id, item)} emptyText="No hay productos" />
                    </label>
                    <Input label="Cant." type="number" value={line.quantity} onChange={(value) => setLine(line.id, { quantity: Number(value) })} />
                    <Input label="Precio" type="number" value={line.price} onChange={(value) => setLine(line.id, { price: Number(value) })} />
                    <Input label="Desc.%" type="number" value={line.discount} onChange={(value) => setLine(line.id, { discount: Number(value) })} />
                    <label>
                      <span className="label-dark">ITBIS</span>
                      {form.mode === invoiceModes.MIXED ? (
                        <button type="button" onClick={() => setLine(line.id, { taxable: !line.taxable })} className={`h-[42px] w-full rounded-lg border text-sm font-bold ${line.taxable ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-black/20 text-white/45'}`}>{line.taxable ? 'Si' : 'No'}</button>
                      ) : (
                        <div className="grid h-[42px] place-items-center rounded-lg border border-white/10 bg-black/20 text-sm font-bold text-white/70">{line.taxable ? 'Si' : 'No'}</div>
                      )}
                    </label>
                    <div>
                      <span className="label-dark">Total</span>
                      <div className="grid h-[42px] place-items-center rounded-lg border border-white/10 bg-black/20 px-3 text-sm font-extrabold text-white">{currency.format(total)}</div>
                    </div>
                  </div>
                  {product ? <p className="mt-2 text-xs text-white/42">{product.sku} · {product.brand || 'Sin marca'} {product.model || ''} · Disponible: {product.stock ?? 0}</p> : null}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="panel h-fit rounded-lg p-4 sm:p-5 min-[1680px]:sticky min-[1680px]:top-24">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-500/15 text-blue-200"><FileText size={20} /></div>
            <div>
              <h3 className="font-display text-xl font-bold">Resumen</h3>
              <p className="text-xs text-white/45">{form.items.length} linea(s) preparadas</p>
            </div>
          </div>
          <div className="space-y-2">
            <SummaryLine label="Subtotal" value={totals.subtotal} />
            <SummaryLine label="ITBIS" value={totals.itbis} />
            <SummaryLine label="Costo estimado" value={totals.cost} subtle />
            <SummaryLine label="Ganancia estimada" value={totals.profit} subtle />
            <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-xs font-extrabold uppercase text-emerald-200/70">Total cotizado</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-white">{currency.format(totals.total)}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <Button variant="ghost" icon={CalendarDays} onClick={() => setForm((state) => ({ ...state, validUntil: addDays(15) }))}>Validez 15 dias</Button>
            <Button variant="ghost" icon={Save} onClick={() => save('Borrador')}>Guardar borrador</Button>
            <Button variant="success" icon={Send} className="py-3 text-base" onClick={() => save('Enviada')}>Enviar cotizacion</Button>
          </div>
        </aside>
      </section>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <label>
      <span className="label-dark">{label}</span>
      <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="input-dark" />
    </label>
  )
}

function SummaryLine({ label, value, subtle }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm ${subtle ? 'text-white/50' : 'text-white/72'}`}>
      <span>{label}</span>
      <b className="text-white">{currency.format(value || 0)}</b>
    </div>
  )
}
