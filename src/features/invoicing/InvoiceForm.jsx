import { useDeferredValue, useMemo, useState } from 'react'
import { Barcode, ChevronDown, FileCheck2, Minus, Plus, Save, Search, Trash2, UserPlus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Autocomplete } from '../../components/ui/Autocomplete'
import { InvoicePreview } from '../../components/invoice/InvoicePreview'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { calculateInvoice, invoiceModes, ncfTypes, nextNcf } from '../../lib/taxEngine'
import { currency } from '../../lib/formatters'

const today = () => new Date().toISOString().slice(0, 10)
const emptyPayment = () => ({ id: crypto.randomUUID(), method: 'Efectivo', amount: 0, reference: '' })
const emptyLineFromProduct = (product, customer) => ({
  id: crypto.randomUUID(),
  productId: product.id,
  sku: product.sku || '',
  model: product.model || product.brand || '',
  name: product.name,
  quantity: 1,
  price: priceForCustomer(product, customer),
  registeredPrice: priceForCustomer(product, customer),
  cost: product.cost || 0,
  discount: 0,
  taxable: product.taxable,
  serials: product.requiresSerial && product.serials?.[0] ? [product.serials[0]] : [],
})

export function InvoiceForm({ initialInvoice, duplicateOf, onDone }) {
  const toast = useToast()
  const products = useERPStore((state) => state.products)
  const customers = useERPStore((state) => state.customers)
  const users = useERPStore((state) => state.users)
  const company = useERPStore((state) => state.company)
  const taxSequences = useERPStore((state) => state.taxSequences)
  const invoices = useERPStore((state) => state.invoices)
  const upsertCustomer = useERPStore((state) => state.upsertCustomer)
  const saveInvoiceDraft = useERPStore((state) => state.saveInvoiceDraft)
  const updateInvoiceDraft = useERPStore((state) => state.updateInvoiceDraft)
  const createInvoice = useERPStore((state) => state.createInvoice)
  const source = duplicateOf || initialInvoice
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [successInvoice, setSuccessInvoice] = useState(null)
  const [successCustomer, setSuccessCustomer] = useState(null)
  const [customerModal, setCustomerModal] = useState(false)
  const [customerDraft, setCustomerDraft] = useState({ type: 'persona', name: '', document: '', phone: '', whatsapp: '', preferredNcf: 'B02', paymentTerm: 'Contado', priceList: 'Detal', creditLimit: 0 })
  const [form, setForm] = useState(() => ({
    id: source && initialInvoice?.status === 'draft' ? initialInvoice.id : undefined,
    mode: source?.mode || invoiceModes.TAXED,
    ncfType: source?.ncfType || 'B01',
    customerId: source?.customerId || '',
    customerName: source?.customerName || '',
    issueDate: source?.issueDate || today(),
    dueDate: source?.dueDate || today(),
    seller: source?.seller || users[0]?.name || 'Administrador',
    paymentMethod: source?.payments?.[0]?.method || source?.paymentMethod || 'Efectivo',
    notesCustomer: source?.notesCustomer || '',
    notesInternal: source?.notesInternal || '',
    globalDiscount: source?.globalDiscount || 0,
    items: source?.items?.map((item) => ({ ...item, id: crypto.randomUUID(), serials: item.serials || (item.serial ? [item.serial] : []) })) || [],
    payments: source?.payments || [emptyPayment()],
  }))

  const selectedCustomer = customers.find((customer) => customer.id === form.customerId)
  const sequence = taxSequences.find((item) => item.id === form.ncfType)
  const visibleProducts = useMemo(() => products.filter((item) => !item.deletedAt && item.status !== 'Eliminado' && item.status !== 'Inactivo'), [products])
  const recentProducts = useMemo(() => buildRecentProducts(invoices, visibleProducts), [invoices, visibleProducts])
  const topProducts = useMemo(() => buildTopProducts(invoices, visibleProducts), [invoices, visibleProducts])
  const discountedItems = useMemo(() => form.items.map((item) => ({ ...item, discount: Number(item.discount || 0) + Number(form.globalDiscount || 0) })), [form.globalDiscount, form.items])
  const totals = useMemo(() => calculateInvoice(discountedItems, form.mode), [discountedItems, form.mode])
  const invoiceForPreview = { ...form, number: sequence ? nextNcf(sequence) : 'BORRADOR', totals, createdAt: form.issueDate, status: 'preview' }

  function setField(key, value) {
    setForm((state) => ({ ...state, [key]: value }))
  }

  function addProduct(product) {
    if (!product) return
    if (product.category !== 'Servicios' && Number(product.stock || 0) <= 0) {
      toast.error(`${product.name} no tiene stock disponible.`)
      return
    }
    setForm((state) => {
      const existing = state.items.find((item) => item.productId === product.id && !product.requiresSerial)
      if (existing) {
        return {
          ...state,
          items: state.items.map((item) => item.id === existing.id ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item),
        }
      }
      return { ...state, items: [...state.items, emptyLineFromProduct(product, selectedCustomer)] }
    })
  }

  function updateLine(lineId, patch) {
    setForm((state) => ({
      ...state,
      items: state.items.map((item) => {
        if (item.id !== lineId) return item
        const next = { ...item, ...patch }
        if (state.mode === invoiceModes.TAXED) next.taxable = true
        if (state.mode === invoiceModes.NO_TAX) next.taxable = false
        return next
      }),
    }))
  }

  function removeLine(lineId) {
    setForm((state) => ({ ...state, items: state.items.filter((item) => item.id !== lineId) }))
  }

  function buildPayload(status = 'draft') {
    const payments = [{ id: form.payments[0]?.id || crypto.randomUUID(), method: form.paymentMethod, amount: totals.total, reference: form.payments[0]?.reference || '' }]
    return { ...form, payments, customerName: selectedCustomer?.name || form.customerName, totals, status }
  }

  function validateIssue() {
    if (!selectedCustomer) throw new Error('Seleccione un cliente antes de facturar.')
    if (!form.items.length) throw new Error('Agregue al menos un producto.')
    if (form.ncfType !== 'NO_FISCAL' && (!sequence || !sequence.enabled)) throw new Error(`Configure y habilite la secuencia ${form.ncfType}.`)
    form.items.forEach((item) => {
      const product = products.find((productItem) => productItem.id === item.productId)
      if (!product) throw new Error(`Producto invalido: ${item.name || 'sin nombre'}.`)
      if (Number(item.quantity || 0) <= 0) throw new Error(`La cantidad de ${item.name} debe ser mayor que cero.`)
      if (product.category !== 'Servicios' && Number(product.stock || 0) < Number(item.quantity || 0)) throw new Error(`${product.name} no tiene stock suficiente. Disponible: ${product.stock || 0}.`)
      if (product.requiresSerial && (item.serials || []).length !== Number(item.quantity)) throw new Error(`${product.name} requiere seleccionar ${item.quantity} serial(es).`)
    })
  }

  function handleSaveDraft() {
    try {
      if (!selectedCustomer) throw new Error('Seleccione un cliente para guardar el borrador.')
      if (!form.items.length) throw new Error('Agregue al menos un producto.')
      const saved = form.id ? updateInvoiceDraft(form.id, buildPayload('draft')) : saveInvoiceDraft(buildPayload('draft'))
      setField('id', saved.id)
      toast.success('Borrador guardado.')
      onDone?.(saved)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleIssue() {
    try {
      validateIssue()
      const invoice = createInvoice(buildPayload('paid'))
      setSuccessCustomer(selectedCustomer)
      setSuccessInvoice(invoice)
      setForm((state) => ({ ...state, id: undefined, items: [], payments: [emptyPayment()], notesCustomer: '', notesInternal: '', globalDiscount: 0 }))
      toast.success(`Factura emitida: ${invoice.number}`)
      onDone?.(invoice)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function saveQuickCustomer() {
    try {
      const saved = upsertCustomer({
        ...customerDraft,
        rnc: customerDraft.type === 'empresa' ? customerDraft.document : '',
        cedula: customerDraft.type === 'persona' ? customerDraft.document : '',
        balance: 0,
      })
      setForm((state) => ({ ...state, customerId: saved.id, customerName: saved.name }))
      setCustomerModal(false)
      toast.success('Cliente agregado.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
      <aside className="space-y-4">
        <section className="panel rounded-lg p-4">
          <p className="text-xs font-extrabold uppercase text-blue-200/80">Cliente</p>
          <div className="mt-3 flex gap-2">
            <div className="min-w-0 flex-1">
              <Autocomplete
                value={selectedCustomer}
                items={customers}
                placeholder="Buscar cliente"
                getMeta={(customer) => `${customer.rnc || customer.cedula || customer.phone || 'Sin documento'} · ${currency.format(customer.balance || 0)}`}
                getSearchText={(customer) => `${customer.name || ''} ${customer.rnc || ''} ${customer.cedula || ''} ${customer.phone || ''} ${customer.whatsapp || ''}`}
                onSelect={(customer) => setForm((state) => ({ ...state, customerId: customer.id, customerName: customer.name, ncfType: customer.preferredNcf || state.ncfType }))}
              />
            </div>
            <button type="button" title="Cliente rapido" onClick={() => setCustomerModal(true)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-white/70 hover:bg-white/[0.08]"><UserPlus size={18} /></button>
          </div>
          {selectedCustomer ? <p className="mt-3 text-xs text-white/45">{selectedCustomer.rnc || selectedCustomer.cedula || 'Consumidor final'} · {selectedCustomer.priceList || 'Detal'}</p> : null}
        </section>

        <section className="panel rounded-lg p-4">
          <p className="text-xs font-extrabold uppercase text-blue-200/80">Factura</p>
          <div className="mt-3 space-y-3">
            <select value={form.ncfType} onChange={(event) => setField('ncfType', event.target.value)} className="input-dark">
              {ncfOptions(form.mode).map((type) => <option key={type} value={type}>{type} {ncfTypes[type] || ''}</option>)}
            </select>
            <select value={form.paymentMethod} onChange={(event) => setField('paymentMethod', event.target.value)} className="input-dark">
              <option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Cheque</option><option>Credito</option>
            </select>
            <select value={form.mode} onChange={(event) => setField('mode', event.target.value)} className="input-dark">
              <option value={invoiceModes.TAXED}>Con ITBIS</option>
              <option value={invoiceModes.NO_TAX}>Sin ITBIS</option>
              <option value={invoiceModes.MIXED}>Mixta</option>
            </select>
          </div>
          <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="mt-3 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-bold text-white/60">
            Mas opciones <ChevronDown size={16} />
          </button>
          {advancedOpen ? (
            <div className="mt-3 space-y-3">
              <input type="date" value={form.issueDate} onChange={(event) => setField('issueDate', event.target.value)} className="input-dark" />
              <select value={form.seller} onChange={(event) => setField('seller', event.target.value)} className="input-dark">
                {['Administrador', ...users.map((user) => user.name)].map((user) => <option key={user}>{user}</option>)}
              </select>
              <input type="number" min="0" max="10" value={form.globalDiscount} onChange={(event) => setField('globalDiscount', Number(event.target.value))} className="input-dark" placeholder="Descuento global %" />
              <textarea value={form.notesCustomer} onChange={(event) => setField('notesCustomer', event.target.value)} className="input-dark min-h-20" placeholder="Nota para el cliente" />
            </div>
          ) : null}
        </section>
      </aside>

      <main className="min-w-0 space-y-4">
        <section className="module-surface p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold">Facturacion rapida</h2>
              <p className="text-sm text-white/45">Busca, agrega y emite sin recorrer formularios largos.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white/60">
              {sequence ? nextNcf(sequence) : 'No fiscal'}
            </div>
          </div>
          <ProductSearch products={visibleProducts} recentProducts={recentProducts} topProducts={topProducts} onSelect={addProduct} />
        </section>

        <section className="panel rounded-lg p-4">
          <div className="premium-scroll overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="text-left text-xs uppercase text-white/45">
                <tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>ITBIS</th><th>Total</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {form.items.length ? form.items.map((line) => {
                  const product = products.find((item) => item.id === line.productId)
                  const calc = calculateInvoice([{ ...line, discount: Number(line.discount || 0) + Number(form.globalDiscount || 0) }], form.mode).items[0]
                  return (
                    <tr key={line.id} className="align-middle">
                      <td className="py-3">
                        <p className="font-bold text-white">{line.name}</p>
                        <p className="text-xs text-white/40">{line.sku || 'Sin SKU'} · Stock {product?.stock ?? 'N/A'} · {product?.category || 'Producto'}</p>
                        {product?.requiresSerial ? <select value={line.serials?.[0] || ''} onChange={(event) => updateLine(line.id, { serials: event.target.value ? [event.target.value] : [] })} className="input-dark mt-2 max-w-48"><option value="">Serial/IMEI</option>{(product.serials || []).map((serial) => <option key={serial}>{serial}</option>)}</select> : null}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => updateLine(line.id, { quantity: Math.max(1, Number(line.quantity || 1) - 1) })} className="rounded bg-white/10 p-1"><Minus size={14} /></button>
                          <input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} className="input-dark w-16 text-center" />
                          <button type="button" onClick={() => updateLine(line.id, { quantity: Number(line.quantity || 0) + 1 })} className="rounded bg-white/10 p-1"><Plus size={14} /></button>
                        </div>
                      </td>
                      <td className="py-3"><input type="number" value={line.price} onChange={(event) => updateLine(line.id, { price: Number(event.target.value) })} className="input-dark w-28" /></td>
                      <td className="py-3">{form.mode === invoiceModes.MIXED ? <input type="checkbox" checked={line.taxable} onChange={(event) => updateLine(line.id, { taxable: event.target.checked })} /> : line.taxable ? 'Si' : 'No'}</td>
                      <td className="py-3 font-bold">{currency.format((calc?.net || 0) + (calc?.tax || 0))}</td>
                      <td className="py-3 text-right"><button type="button" onClick={() => removeLine(line.id)} className="text-red-300"><Trash2 size={17} /></button></td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan="6" className="py-10 text-center text-sm text-white/40">Busca un producto o escanea un codigo para iniciar la factura.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <aside className="panel h-fit rounded-lg p-5 xl:sticky xl:top-24">
        <p className="text-xs font-extrabold uppercase text-blue-200/80">Resumen</p>
        <div className="mt-4 space-y-2">
          <Line label="Subtotal" value={totals.subtotal} />
          <Line label="ITBIS" value={totals.itbis} />
          <Line label="Total" value={totals.total} strong />
        </div>
        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-white/55">
          <p>{form.items.length} producto(s)</p>
          <p>{form.paymentMethod}</p>
          <p>{selectedCustomer?.name || 'Sin cliente'}</p>
        </div>
        <div className="mt-5 grid gap-2">
          <Button variant="success" icon={FileCheck2} className="py-3 text-base" disabled={!form.items.length} onClick={handleIssue}>Facturar ahora</Button>
          <Button variant="ghost" icon={Save} disabled={!form.items.length} onClick={handleSaveDraft}>Guardar borrador</Button>
          <Button variant="ghost" disabled={!form.items.length} onClick={() => setPreviewOpen(true)}>Vista previa</Button>
        </div>
      </aside>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Vista previa" size="xl">
        <InvoicePreview invoice={invoiceForPreview} company={company} customer={selectedCustomer} format="letter" showActions={false} />
      </Modal>

      <Modal open={customerModal} onClose={() => setCustomerModal(false)} title="Cliente rapido" size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCustomerModal(false)}>Cancelar</Button><Button variant="success" onClick={saveQuickCustomer}>Guardar</Button></div>}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Tipo"><select value={customerDraft.type} onChange={(event) => setCustomerDraft((state) => ({ ...state, type: event.target.value }))} className="input-dark"><option value="persona">Persona</option><option value="empresa">Empresa</option><option value="final">Final</option></select></Field>
          <Field label="Nombre"><input value={customerDraft.name} onChange={(event) => setCustomerDraft((state) => ({ ...state, name: event.target.value }))} className="input-dark" autoFocus /></Field>
          <Field label="RNC / Cedula"><input value={customerDraft.document} onChange={(event) => setCustomerDraft((state) => ({ ...state, document: event.target.value }))} className="input-dark" /></Field>
          <Field label="Telefono"><input value={customerDraft.phone} onChange={(event) => setCustomerDraft((state) => ({ ...state, phone: event.target.value, whatsapp: event.target.value }))} className="input-dark" /></Field>
        </div>
      </Modal>

      <Modal open={Boolean(successInvoice)} onClose={() => setSuccessInvoice(null)} title={`Factura emitida: ${successInvoice?.number}`} size="xl">
        {successInvoice ? <InvoicePreview invoice={successInvoice} company={company} customer={successCustomer} format="letter" /> : null}
      </Modal>
    </div>
  )
}

function ProductSearch({ products, recentProducts, topProducts, onSelect }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(() => {
    const text = normalize(deferredQuery)
    if (!text) return [...recentProducts, ...topProducts].slice(0, 8)
    return products
      .map((product) => ({ product, score: scoreProduct(product, text) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((entry) => entry.product)
  }, [deferredQuery, products, recentProducts, topProducts])

  function choose(product) {
    onSelect(product)
    setQuery('')
    setActiveIndex(0)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((value) => Math.min(value + 1, Math.max(results.length - 1, 0)))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((value) => Math.max(value - 1, 0))
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      choose(results[activeIndex])
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
        <Search className="text-blue-200" size={20} />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-white/35"
          placeholder="Buscar producto, SKU, marca, modelo, categoria, serial o codigo"
        />
        <Barcode className="text-white/35" size={20} />
      </div>
      <div className="mt-3 grid gap-2">
        {results.map((product, index) => (
          <button key={product.id} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(product)} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${activeIndex === index ? 'border-blue-400 bg-blue-500/15' : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.06]'}`}>
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-blue-500/15 text-blue-100">
              {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <Barcode size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-white">{product.name}</p>
              <p className="truncate text-xs text-white/45">{product.sku || product.barcode || 'Sin codigo'} · {product.category || 'Categoria'} · {product.brand || 'Marca'}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-bold">{currency.format(product.price || 0)}</p>
              <p className={Number(product.stock || 0) > 0 || product.category === 'Servicios' ? 'text-xs text-emerald-300' : 'text-xs text-red-300'}>Stock {product.category === 'Servicios' ? 'servicio' : product.stock || 0}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-white/45">{label}</span>{children}</label>
}

function Line({ label, value, strong }) {
  return <div className={`flex justify-between gap-3 ${strong ? 'border-t border-white/10 pt-3 text-3xl font-black' : 'text-sm text-white/62'}`}><span>{label}</span><span>{currency.format(value || 0)}</span></div>
}

function ncfOptions(mode) {
  if (mode === invoiceModes.TAXED) return ['B01', 'B14', 'B15', 'E31', 'E34']
  if (mode === invoiceModes.NO_TAX) return ['B02', 'E32', 'NO_FISCAL']
  return ['B01', 'B02', 'B14', 'B15', 'E31', 'E32', 'E34', 'NO_FISCAL']
}

function priceForCustomer(product, customer) {
  const list = customer?.priceList
  if (list === 'Mayor') return product.wholesalePrice || product.price
  if (list === 'Tecnico') return product.technicianPrice || product.price
  if (list === 'Especial') return product.specialPrice || product.price
  return product.price || 0
}

function buildRecentProducts(invoices, products) {
  const ids = []
  invoices.slice(0, 20).forEach((invoice) => (invoice.items || []).forEach((item) => ids.push(item.productId)))
  return uniqueById(ids.map((productId) => products.find((product) => product.id === productId)).filter(Boolean)).slice(0, 4)
}

function buildTopProducts(invoices, products) {
  const counts = new Map()
  invoices.forEach((invoice) => (invoice.items || []).forEach((item) => counts.set(item.productId, (counts.get(item.productId) || 0) + Number(item.quantity || 0))))
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([productId]) => products.find((product) => product.id === productId))
    .filter(Boolean)
    .slice(0, 4)
}

function uniqueById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

function scoreProduct(product, query) {
  const fields = [
    product.name,
    product.sku,
    product.barcode,
    product.brand,
    product.model,
    product.category,
    ...(product.serials || []),
  ].map(normalize)
  let score = 0
  fields.forEach((field) => {
    if (!field) return
    if (field === query) score += 100
    else if (field.startsWith(query)) score += 70
    else if (field.includes(query)) score += 40
    else if (query.split(/\s+/).every((part) => field.includes(part))) score += 25
    else if (levenshtein(field.slice(0, query.length + 2), query) <= 2) score += 10
  })
  return score
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, index) => [index])
  for (let index = 0; index <= a.length; index += 1) matrix[0][index] = index
  for (let row = 1; row <= b.length; row += 1) {
    for (let col = 1; col <= a.length; col += 1) {
      matrix[row][col] = b[row - 1] === a[col - 1]
        ? matrix[row - 1][col - 1]
        : Math.min(matrix[row - 1][col - 1] + 1, matrix[row][col - 1] + 1, matrix[row - 1][col] + 1)
    }
  }
  return matrix[b.length][a.length]
}
