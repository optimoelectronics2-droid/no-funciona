import { useMemo, useState } from 'react'
import { Eye, FileCheck2, Lock, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Autocomplete } from '../../components/ui/Autocomplete'
import { DatePicker } from '../../components/ui/DatePicker'
import { InvoicePreview } from '../../components/invoice/InvoicePreview'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { calculateInvoice, invoiceModes, ncfTypes, nextNcf } from '../../lib/taxEngine'
import { currency } from '../../lib/formatters'

const today = () => new Date().toISOString().slice(0, 10)
const MAX_INVOICE_DISCOUNT = 10
const addDays = (dateText, days) => {
  const date = new Date(dateText)
  date.setDate(date.getDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

const emptyLine = () => ({ id: crypto.randomUUID(), productId: '', sku: '', model: '', name: '', quantity: 1, price: 0, registeredPrice: 0, cost: 0, discount: 0, taxable: true, serials: [] })
const emptyPayment = () => ({ id: crypto.randomUUID(), method: 'Efectivo', amount: 0, reference: '', bank: '', last4: '', approval: '' })

export function InvoiceForm({ initialInvoice, duplicateOf, onDone }) {
  const toast = useToast()
  const products = useERPStore((state) => state.products)
  const customers = useERPStore((state) => state.customers)
  const users = useERPStore((state) => state.users)
  const company = useERPStore((state) => state.company)
  const taxSequences = useERPStore((state) => state.taxSequences)
  const upsertCustomer = useERPStore((state) => state.upsertCustomer)
  const saveInvoiceDraft = useERPStore((state) => state.saveInvoiceDraft)
  const updateInvoiceDraft = useERPStore((state) => state.updateInvoiceDraft)
  const createInvoice = useERPStore((state) => state.createInvoice)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [successInvoice, setSuccessInvoice] = useState(null)
  const [successCustomer, setSuccessCustomer] = useState(null)
  const [customerModal, setCustomerModal] = useState(false)
  const [customerDraft, setCustomerDraft] = useState({ type: 'persona', name: '', document: '', phone: '', whatsapp: '', preferredNcf: 'B02', paymentTerm: 'Contado', priceList: 'Detal', creditLimit: 0 })
  const base = duplicateOf || initialInvoice
  const makeForm = (source = base) => ({
    id: source && initialInvoice?.status === 'draft' ? initialInvoice.id : undefined,
    mode: source?.mode || invoiceModes.TAXED,
    ncfType: source?.ncfType || 'B01',
    customerId: source?.customerId || '',
    customerName: source?.customerName || '',
    issueDate: today(),
    paymentTerm: source?.paymentTerm || 'Contado',
    dueDate: source?.dueDate || today(),
    seller: source?.seller || users[0]?.name || 'Administrador',
    currencyCode: source?.currencyCode || 'DOP',
    exchangeRate: source?.exchangeRate || company.exchangeRate || 58.5,
    notesInternal: source?.notesInternal || '',
    notesCustomer: source?.notesCustomer || '',
    globalDiscount: source?.globalDiscount || 0,
    items: source?.items?.map((item) => ({ ...emptyLine(), ...item, id: crypto.randomUUID(), serials: item.serials || (item.serial ? [item.serial] : []) })) || [emptyLine()],
    payments: source?.payments || [emptyPayment()],
  })
  const [form, setForm] = useState(() => makeForm())
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId)
  const sequence = taxSequences.find((item) => item.id === form.ncfType)
  const ncfAvailable = sequence ? Math.max(Number(sequence.limit || 0) - Number(sequence.next || 0) + 1, 0) : 0
  const totals = useMemo(() => {
    const globalDiscount = Number(form.globalDiscount || 0)
    const discountedItems = form.items.map((item) => ({ ...item, discount: Number(item.discount || 0) + globalDiscount }))
    return calculateInvoice(discountedItems, form.mode)
  }, [form.items, form.mode, form.globalDiscount])
  const paid = form.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const paymentDiff = totals.total - paid
  const invoiceForPreview = { ...form, number: sequence ? nextNcf(sequence) : 'BORRADOR', ncfType: form.ncfType, totals, createdAt: form.issueDate, status: 'preview' }
  const hasSerialLines = form.items.some((line) => products.find((item) => item.id === line.productId)?.requiresSerial)

  function setField(key, value) {
    setForm((state) => ({ ...state, [key]: value }))
  }

  function setLine(lineId, patch) {
    setForm((state) => ({
      ...state,
      items: state.items.map((line) => {
        if (line.id !== lineId) return line
        const next = { ...line, ...patch }
        if (state.mode === invoiceModes.TAXED) next.taxable = true
        if (state.mode === invoiceModes.NO_TAX) next.taxable = false
        return next
      }),
    }))
  }

  function chooseProduct(lineId, product) {
    const price = priceForCustomer(product, selectedCustomer)
    setLine(lineId, {
      productId: product.id,
      sku: product.sku,
      model: product.model || product.brand || '',
      name: product.name,
      price,
      registeredPrice: price,
      cost: product.cost,
      taxable: product.taxable,
      serials: product.requiresSerial && product.serials[0] ? [product.serials[0]] : [],
    })
  }

  function validateDraft() {
    if (!form.customerId) throw new Error('Seleccione o cree un cliente antes de guardar.')
    if (!form.items.some((item) => item.productId || item.name)) throw new Error('Agregue al menos una linea de producto o servicio.')
  }

  function validateIssue() {
    validateDraft()
    if (form.ncfType !== 'NO_FISCAL' && (!sequence || !sequence.enabled)) throw new Error(`Configure y habilite la secuencia ${form.ncfType} antes de emitir.`)
    if (Number(form.globalDiscount || 0) > MAX_INVOICE_DISCOUNT) throw new Error(`El descuento global no puede pasar de ${MAX_INVOICE_DISCOUNT}%. Requiere autorizacion admin.`)
    form.items.forEach((item) => {
      const product = products.find((productItem) => productItem.id === item.productId)
      if (!product) throw new Error(`Seleccione un producto valido en la linea ${item.name || 'sin nombre'}.`)
      if (Number(item.quantity || 0) <= 0) throw new Error(`La cantidad de ${item.name} debe ser mayor que cero.`)
      if (product.status === 'Inactivo' || product.status === 'Eliminado' || product.deletedAt) throw new Error(`${product.name} no esta disponible para facturar.`)
      if (product.category !== 'Servicios' && Number(product.stock || 0) < Number(item.quantity || 0)) throw new Error(`${product.name} no tiene stock suficiente. Disponible: ${product.stock || 0}.`)
      if (Number(item.discount || 0) + Number(form.globalDiscount || 0) > MAX_INVOICE_DISCOUNT) throw new Error(`${product.name} excede el descuento maximo de ${MAX_INVOICE_DISCOUNT}%. Requiere autorizacion admin.`)
      const minimumAllowedPrice = Math.max(Number(product.cost || 0), Number(priceForCustomer(product, selectedCustomer) || product.price || 0) * 0.9)
      if (Number(item.price || 0) < minimumAllowedPrice) throw new Error(`${product.name} no puede venderse por debajo del costo ni con rebaja mayor al 10%. Precio minimo: ${currency.format(minimumAllowedPrice)}.`)
      if (product.requiresSerial && (item.serials || []).length !== Number(item.quantity)) throw new Error(`${product.name} requiere seleccionar ${item.quantity} serial(es).`)
    })
    if (Math.abs(paymentDiff) > 0.01) throw new Error(`La forma de pago no cuadra. Diferencia RD$${Math.abs(paymentDiff).toFixed(2)}.`)
  }

  function handleSaveDraft() {
    try {
      validateDraft()
      const payload = { ...form, customerName: selectedCustomer?.name || form.customerName, totals, status: 'draft' }
      const saved = form.id ? updateInvoiceDraft(form.id, payload) : saveInvoiceDraft(payload)
      setField('id', saved.id)
      toast.success('Borrador guardado correctamente.')
      onDone?.(saved)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleIssue() {
    try {
      validateIssue()
      const invoice = createInvoice({ ...form, customerName: selectedCustomer.name, totals })
      setSuccessCustomer(selectedCustomer)
      setSuccessInvoice(invoice)
      setForm(makeForm(null))
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
      setForm((state) => ({ ...state, customerId: saved.id, customerName: saved.name, paymentTerm: saved.paymentTerm || state.paymentTerm }))
      setCustomerModal(false)
      toast.success('Cliente registrado correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-5">
      <section className="module-surface p-4 sm:p-5">
        <h2 className="font-display text-2xl font-bold">Nueva factura desde cero</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ModeButton active={form.mode === invoiceModes.TAXED} title="CON ITBIS" body="Todas las lineas gravadas al 18%." onClick={() => setField('mode', invoiceModes.TAXED)} />
          <ModeButton active={form.mode === invoiceModes.NO_TAX} title="SIN ITBIS" body="Venta limpia sin desglose fiscal." onClick={() => setField('mode', invoiceModes.NO_TAX)} />
          <ModeButton active={form.mode === invoiceModes.MIXED} title="MIXTA" body="Lineas gravadas y exentas separadas." onClick={() => setField('mode', invoiceModes.MIXED)} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <Field label="Tipo de comprobante">
            <select value={form.ncfType} onChange={(event) => setField('ncfType', event.target.value)} className="input-dark">
              {ncfOptions(form.mode).map((type) => <option key={type} value={type}>{type} {ncfTypes[type] || ''}</option>)}
            </select>
          </Field>
          <Field label="NCF">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm font-bold">{sequence ? nextNcf(sequence) : 'Sin comprobante'}</div>
          </Field>
          <Field label="Disponibles">
            <span className={`inline-flex rounded-lg px-3 py-2 text-sm font-bold ${ncfAvailable > 20 ? 'bg-emerald-500/15 text-emerald-200' : ncfAvailable > 0 ? 'bg-amber-500/15 text-amber-200' : 'bg-red-500/15 text-red-200'}`}>{sequence ? ncfAvailable : 'N/A'}</span>
          </Field>
          <DatePicker label="Fecha de emision" value={form.issueDate} onChange={(value) => setField('issueDate', value)} />
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <div className="panel rounded-lg p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Autocomplete
                  value={selectedCustomer}
                  items={customers}
                  placeholder="Buscar cliente por nombre, RNC o cedula"
                  getMeta={(customer) => `${customer.rnc || customer.cedula || 'Consumidor final'} · Balance ${currency.format(customer.balance || 0)}`}
                  onSelect={(customer) => setForm((state) => ({ ...state, customerId: customer.id, customerName: customer.name, paymentTerm: customer.paymentTerm || state.paymentTerm }))}
                  emptyText="No hay clientes registrados"
                />
              </div>
              <Button type="button" icon={Plus} onClick={() => setCustomerModal(true)}>Nuevo cliente</Button>
            </div>
            {selectedCustomer ? (
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm">
                <p className="font-bold">{selectedCustomer.name}</p>
                <p className="text-white/50">{selectedCustomer.rnc || selectedCustomer.cedula || 'Sin documento'} · Balance {currency.format(selectedCustomer.balance || 0)} · Lista {selectedCustomer.priceList || 'Detal'}</p>
                {Number(selectedCustomer.balance || 0) > 0 ? <p className="mt-2 text-amber-300">Cliente con balance pendiente. Puede continuar bajo aprobacion interna.</p> : null}
              </div>
            ) : null}
          </div>

          <div className="panel rounded-lg p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Condicion de pago">
                <select value={form.paymentTerm} onChange={(event) => {
                  const value = event.target.value
                  setForm((state) => ({ ...state, paymentTerm: value, dueDate: value === 'Contado' ? state.issueDate : addDays(state.issueDate, Number(value.split(' ')[0])) }))
                }} className="input-dark">
                  {['Contado', '15 dias', '30 dias', '45 dias', '60 dias', '90 dias'].map((term) => <option key={term}>{term}</option>)}
                </select>
              </Field>
              <DatePicker label="Vencimiento" value={form.dueDate} onChange={(value) => setField('dueDate', value)} />
          <Field label="Vendedor">
            <select value={form.seller} onChange={(event) => setField('seller', event.target.value)} className="input-dark">
              {['Administrador', ...users.map((user) => user.name)].map((user) => <option key={user}>{user}</option>)}
            </select>
          </Field>
          <Field label="Moneda">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm font-bold">DOP</div>
          </Field>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <textarea value={form.notesInternal} onChange={(event) => setField('notesInternal', event.target.value)} placeholder="Notas internas" className="input-dark min-h-20" />
              <textarea value={form.notesCustomer} onChange={(event) => setField('notesCustomer', event.target.value)} placeholder="Notas para el cliente" className="input-dark min-h-20" />
            </div>
          </div>

          <div className="panel rounded-lg p-5">
            <div className="premium-scroll overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="text-left text-xs uppercase text-white/45">
                  <tr><th>#</th><th>Producto</th><th>Cant.</th><th>Precio Unit.</th><th>Desc.%</th><th>Subtotal</th><th>ITBIS</th><th>Total</th>{hasSerialLines ? <th>IMEI / Serial</th> : null}<th></th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {form.items.map((line, index) => {
                    const product = products.find((item) => item.id === line.productId)
                    const calc = calculateInvoice([line], form.mode).items[0]
                    return (
                      <tr key={line.id} className="align-top">
                        <td className="py-3 text-white/45">{index + 1}</td>
                        <td className="w-72 py-3">
                          <Autocomplete
                            value={product}
                            items={products.filter((item) => item.status !== 'Inactivo' && item.status !== 'Eliminado' && !item.deletedAt && (item.category === 'Servicios' || Number(item.stock || 0) > 0))}
                            onSelect={(item) => chooseProduct(line.id, item)}
                            getMeta={(item) => `${item.sku || 'Sin SKU'}${item.model ? ` · ${item.model}` : ''} · ${currency.format(item.price)} · Stock ${item.stock || 0}`}
                            getSearchText={(item) => `${item.name || ''} ${item.sku || ''} ${item.barcode || ''} ${item.model || ''} ${item.brand || ''} ${(item.serials || []).join(' ')}`}
                            placeholder="Buscar por nombre, codigo, modelo o serial"
                            startText="Escriba nombre, codigo, modelo o serial para buscar"
                            minQueryLength={1}
                            emptyText="No hay productos con stock para esa busqueda"
                          />
                          {product && product.stock <= 0 && product.category !== 'Servicios' ? <p className="mt-1 text-xs text-amber-300">Sin stock disponible.</p> : null}
                        </td>
                        <td className="py-3"><input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setLine(line.id, { quantity: Number(e.target.value) })} className="input-dark w-20" /></td>
                        <td className="py-3"><input type="number" value={line.price} onChange={(e) => setLine(line.id, { price: Number(e.target.value) })} className="input-dark w-28" /></td>
                        <td className="py-3"><input type="number" min="0" max={MAX_INVOICE_DISCOUNT} value={line.discount} onChange={(e) => setLine(line.id, { discount: Number(e.target.value) })} className="input-dark w-20" /></td>
                        <td className="py-3 font-bold">{currency.format(calc?.net || 0)}</td>
                        <td className="py-3">{form.mode === invoiceModes.MIXED ? <input type="checkbox" checked={line.taxable} onChange={(e) => setLine(line.id, { taxable: e.target.checked })} /> : <span className="inline-flex items-center gap-1 text-white/50"><Lock size={12} />{line.taxable ? 'Si' : 'No'}</span>}</td>
                        <td className="py-3 font-bold">{currency.format((calc?.net || 0) + (calc?.tax || 0))}</td>
                        {hasSerialLines ? <td className="py-3">
                          {product?.requiresSerial ? (
                            <select value={line.serials[0] || ''} onChange={(e) => setLine(line.id, { serials: e.target.value ? [e.target.value] : [] })} className="input-dark w-40">
                              <option value="">Serial</option>
                              {(product.serials || []).map((serial) => <option key={serial}>{serial}</option>)}
                            </select>
                          ) : <span className="text-white/35">No aplica</span>}
                        </td> : null}
                        <td className="py-3"><button type="button" onClick={() => setForm((state) => ({ ...state, items: state.items.length === 1 ? [emptyLine()] : state.items.filter((item) => item.id !== line.id) }))} className="text-red-300"><Trash2 size={16} /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" icon={Plus} onClick={() => setForm((state) => ({ ...state, items: [...state.items, emptyLine()] }))}>Agregar producto</Button>
              <Button type="button" variant="ghost" icon={Plus} onClick={() => {
                const service = products.find((product) => product.category === 'Servicios')
                setForm((state) => ({ ...state, items: [...state.items, service ? { ...emptyLine(), productId: service.id, name: service.name, price: service.price, cost: service.cost, taxable: service.taxable } : { ...emptyLine(), name: 'Servicio', taxable: false }] }))
              }}>Agregar servicio</Button>
              <label className="ml-auto flex items-center gap-2 text-sm text-white/60">Descuento global % <input type="number" min="0" max={MAX_INVOICE_DISCOUNT} value={form.globalDiscount} onChange={(e) => setField('globalDiscount', Number(e.target.value))} className="input-dark w-20" /></label>
            </div>
          </div>

          <PaymentEditor payments={form.payments} total={totals.total} onChange={(payments) => setField('payments', payments)} />
        </div>

        <aside className="panel h-fit rounded-lg p-5 2xl:sticky 2xl:top-24">
          <TotalsPanel totals={totals} mode={form.mode} />
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <p className="text-xs font-bold uppercase text-white/40">Pago asignado</p>
            <p className={Math.abs(paymentDiff) <= 0.01 ? 'mt-1 text-lg font-bold text-emerald-300' : 'mt-1 text-lg font-bold text-amber-300'}>{currency.format(paid)} / {currency.format(totals.total)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${Math.min((paid / (totals.total || 1)) * 100, 100)}%` }} /></div>
            {Math.abs(paymentDiff) > 0.01 ? <p className="mt-2 text-xs text-amber-300">Diferencia: {currency.format(paymentDiff)}</p> : null}
          </div>
          <div className="mt-4 grid gap-2">
            <Button type="button" variant="ghost" icon={Save} onClick={handleSaveDraft}>Guardar borrador</Button>
            <Button type="button" variant="ghost" icon={Eye} onClick={() => setPreviewOpen(true)}>Vista previa</Button>
            <Button type="button" variant="success" icon={FileCheck2} className="py-3 text-base" onClick={handleIssue}>EMITIR FACTURA</Button>
          </div>
        </aside>
      </section>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Vista previa de factura" size="xl">
        <InvoicePreview invoice={invoiceForPreview} company={company} customer={selectedCustomer} format="letter" showActions={false} />
      </Modal>

      <Modal open={customerModal} onClose={() => setCustomerModal(false)} title="Nuevo cliente rapido" size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCustomerModal(false)}>Cancelar</Button><Button variant="success" onClick={saveQuickCustomer}>Guardar cliente</Button></div>}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Tipo"><select value={customerDraft.type} onChange={(e) => setCustomerDraft((s) => ({ ...s, type: e.target.value }))} className="input-dark"><option value="empresa">Empresa</option><option value="persona">Persona fisica</option><option value="final">Consumidor final</option></select></Field>
          <Field label="Nombre / razon social"><input value={customerDraft.name} onChange={(e) => setCustomerDraft((s) => ({ ...s, name: e.target.value }))} className="input-dark" /></Field>
          <Field label="RNC / Cedula"><input value={customerDraft.document} onChange={(e) => setCustomerDraft((s) => ({ ...s, document: e.target.value }))} className="input-dark" /></Field>
          <Field label="Telefono"><input value={customerDraft.phone} onChange={(e) => setCustomerDraft((s) => ({ ...s, phone: e.target.value }))} className="input-dark" /></Field>
          <Field label="WhatsApp"><input value={customerDraft.whatsapp} onChange={(e) => setCustomerDraft((s) => ({ ...s, whatsapp: e.target.value }))} className="input-dark" /></Field>
          <Field label="Comprobante preferido"><select value={customerDraft.preferredNcf} onChange={(e) => setCustomerDraft((s) => ({ ...s, preferredNcf: e.target.value }))} className="input-dark"><option>B01</option><option>B02</option></select></Field>
        </div>
      </Modal>

      <Modal open={Boolean(successInvoice)} onClose={() => setSuccessInvoice(null)} title={`Factura emitida: ${successInvoice?.number}`} size="xl">
        {successInvoice ? (
          <div className="space-y-4">
            <InvoicePreview invoice={successInvoice} company={company} customer={successCustomer} format="letter" />
            <div className="no-print flex justify-end">
              <Button variant="success" onClick={() => { setSuccessInvoice(null); setSuccessCustomer(null) }}>Nueva factura</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function PaymentEditor({ payments, total, onChange }) {
  const update = (id, patch) => onChange(payments.map((payment) => (payment.id === id ? { ...payment, ...patch } : payment)))
  return (
    <div className="panel rounded-lg p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-xl font-bold">Forma de pago multi-metodo</h3>
        <Button type="button" variant="ghost" icon={Plus} onClick={() => onChange([...payments, emptyPayment()])}>Agregar metodo</Button>
      </div>
      <div className="space-y-3">
        {payments.map((payment) => (
          <div key={payment.id} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-6">
            <select value={payment.method} onChange={(e) => update(payment.id, { method: e.target.value })} className="input-dark"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Cheque</option><option>Credito</option></select>
            <input type="number" value={payment.amount} onChange={(e) => update(payment.id, { amount: Number(e.target.value) })} className="input-dark" placeholder="Monto" />
            <input value={payment.reference} onChange={(e) => update(payment.id, { reference: e.target.value })} className="input-dark md:col-span-2" placeholder="Referencia / aprobacion / cheque" />
            <input value={payment.bank} onChange={(e) => update(payment.id, { bank: e.target.value })} className="input-dark" placeholder="Banco" />
            <button type="button" onClick={() => onChange(payments.length === 1 ? [emptyPayment()] : payments.filter((item) => item.id !== payment.id))} className="text-red-300"><Trash2 size={18} /></button>
            {payment.method === 'Efectivo' ? <p className="md:col-span-6 text-xs text-white/45">Cambio: {currency.format(Math.max(Number(payment.amount || 0) - total, 0))}</p> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function TotalsPanel({ totals, mode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-display text-xl font-bold">Totales</h3>
      {mode !== invoiceModes.NO_TAX ? <Line label="Subtotal gravado" value={totals.taxableSubtotal} /> : null}
      {mode !== invoiceModes.TAXED ? <Line label={mode === invoiceModes.NO_TAX ? 'Subtotal' : 'Subtotal exento'} value={totals.exemptSubtotal} /> : null}
      <Line label="ITBIS 18%" value={totals.itbis} />
      <Line label="TOTAL" value={totals.total} strong />
    </div>
  )
}

function ModeButton({ active, title, body, onClick }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border p-4 text-left transition ${active ? 'border-blue-400 bg-blue-500/15' : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.06]'}`}><p className="font-display text-lg font-bold">{active ? '✓ ' : ''}{title}</p><p className="mt-1 text-sm text-white/50">{body}</p></button>
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-white/45">{label}</span>{children}</label>
}

function Line({ label, value, strong }) {
  return <div className={`flex justify-between gap-3 ${strong ? 'border-t border-white/10 pt-3 text-xl font-extrabold' : 'text-sm text-white/62'}`}><span>{label}</span><span>{currency.format(value || 0)}</span></div>
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
  return product.price
}
