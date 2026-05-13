import { useState } from 'react'
import { Eye, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { DataTable } from '../../components/ui/DataTable'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { currency } from '../../lib/formatters'

const emptyCustomer = {
  type: 'Persona fisica', name: '', rnc: '', cedula: '', phone: '', mobile: '', whatsapp: '', email: '',
  street: '', sector: '', city: '', province: '', preferredNcf: 'B02', priceList: 'Detal', paymentTerm: 'Contado',
  creditLimit: 0, balance: 0, internalNotes: '', tags: [], status: 'Activo', notes: [],
}

export function CRM() {
  const toast = useToast()
  const customers = useERPStore((state) => state.customers)
  const invoices = useERPStore((state) => state.invoices)
  const quotes = useERPStore((state) => state.quotes)
  const receivables = useERPStore((state) => state.receivables)
  const upsertCustomer = useERPStore((state) => state.upsertCustomer)
  const deleteCustomer = useERPStore((state) => state.deleteCustomer)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  function save(customer) {
    try {
      validateCustomer(customer)
      upsertCustomer(customer)
      toast.success('Cliente guardado correctamente.')
      setEditing(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function remove(customer) {
    try {
      deleteCustomer(customer.id)
      toast.success('Cliente eliminado o desactivado correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-bold">Clientes</h2><p className="text-sm text-white/45">Registro desde cero, credito, historial y equipos comprados.</p></div>
        <Button icon={Plus} onClick={() => setEditing(emptyCustomer)}>Nuevo cliente</Button>
      </div>
      <DataTable data={customers} columns={[
        { header: 'Cliente', cell: ({ row }) => <div><p className="font-bold text-white">{row.original.name}</p><p className="text-xs text-white/45">{row.original.rnc || row.original.cedula || 'Consumidor final'} · {row.original.email}</p></div> },
        { header: 'Telefono', accessorKey: 'whatsapp' },
        { header: 'Comprobante', accessorKey: 'preferredNcf' },
        { header: 'Lista', accessorKey: 'priceList' },
        { header: 'Credito', cell: ({ row }) => currency.format(row.original.creditLimit || 0) },
        { header: 'Balance', cell: ({ row }) => currency.format(row.original.balance || 0) },
        { header: 'Estado', accessorKey: 'status' },
        { header: 'Acciones', cell: ({ row }) => <div className="flex gap-1"><Icon icon={Eye} onClick={() => setViewing(row.original)} /><Icon icon={Pencil} onClick={() => setEditing(row.original)} /><Icon icon={MessageCircle} onClick={() => window.open(`https://wa.me/${row.original.whatsapp}`)} /><Icon icon={Trash2} onClick={() => remove(row.original)} /></div> },
      ]} />
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Editar cliente' : 'Crear cliente'} size="xl">
        {editing ? <CustomerForm customer={editing} onSave={save} /> : null}
      </Modal>
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Detalle de cliente" size="xl">
        {viewing ? <CustomerDetail customer={viewing} invoices={invoices.filter((item) => item.customerId === viewing.id)} quotes={quotes.filter((item) => item.customerId === viewing.id)} receivables={receivables.filter((item) => item.customerId === viewing.id)} /> : null}
      </Modal>
    </section>
  )
}

function CustomerForm({ customer, onSave }) {
  const [draft, setDraft] = useState(customer)
  const set = (key, value) => setDraft((state) => ({ ...state, [key]: value }))
  const tagOptions = ['VIP', 'Credito', 'Gobierno', 'Tecnico', 'Proveedor']
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Select label="Tipo" value={draft.type} onChange={(v) => set('type', v)} options={['Empresa', 'Persona fisica', 'Consumidor final']} />
        <Input label="Nombre / razon social *" value={draft.name} onChange={(v) => set('name', v)} />
        {draft.type === 'Empresa' ? <Input label="RNC" value={draft.rnc} onChange={(v) => set('rnc', v)} /> : null}
        {draft.type === 'Persona fisica' ? <Input label="Cedula" value={draft.cedula} onChange={(v) => set('cedula', v)} /> : null}
        <Input label="Telefono" value={draft.phone} onChange={(v) => set('phone', v)} />
        <Input label="Celular" value={draft.mobile} onChange={(v) => set('mobile', v)} />
        <Input label="WhatsApp" value={draft.whatsapp} onChange={(v) => set('whatsapp', v)} />
        <Input label="Email" value={draft.email} onChange={(v) => set('email', v)} />
        <Input label="Calle" value={draft.street} onChange={(v) => set('street', v)} />
        <Input label="Sector" value={draft.sector} onChange={(v) => set('sector', v)} />
        <Input label="Ciudad" value={draft.city} onChange={(v) => set('city', v)} />
        <Input label="Provincia" value={draft.province} onChange={(v) => set('province', v)} />
        <Select label="Comprobante" value={draft.preferredNcf} onChange={(v) => set('preferredNcf', v)} options={['B01', 'B02']} />
        <Select label="Lista de precio" value={draft.priceList} onChange={(v) => set('priceList', v)} options={['Detal', 'Mayor', 'Especial', 'Tecnico']} />
        <Select label="Condicion pago" value={draft.paymentTerm} onChange={(v) => set('paymentTerm', v)} options={['Contado', '15 dias', '30 dias', '45 dias', '60 dias', '90 dias']} />
        <Input type="number" label="Limite credito" value={draft.creditLimit} onChange={(v) => set('creditLimit', Number(v))} />
        <Select label="Estado" value={draft.status} onChange={(v) => set('status', v)} options={['Activo', 'Inactivo']} />
        <label className="md:col-span-3"><span className="label-dark">Etiquetas</span><div className="flex flex-wrap gap-2">{tagOptions.map((tag) => <button type="button" key={tag} onClick={() => set('tags', draft.tags?.includes(tag) ? draft.tags.filter((item) => item !== tag) : [...(draft.tags || []), tag])} className={`rounded-lg border px-3 py-2 text-sm ${draft.tags?.includes(tag) ? 'border-blue-400 bg-blue-500/15' : 'border-white/10 bg-white/[0.035]'}`}>{tag}</button>)}</div></label>
        <label className="md:col-span-3"><span className="label-dark">Notas internas</span><textarea value={draft.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} className="input-dark min-h-24" /></label>
      </div>
      <div className="flex justify-end"><Button onClick={() => onSave(draft)}>Guardar cliente</Button></div>
    </div>
  )
}

function CustomerDetail({ customer, invoices, quotes, receivables }) {
  const [tab, setTab] = useState('Resumen')
  const tabs = ['Resumen', 'Facturas', 'Cuentas por cobrar', 'Cotizaciones', 'Equipos', 'Notas']
  const serialItems = invoices.flatMap((invoice) => invoice.items?.flatMap((item) => (item.serials || (item.serial ? [item.serial] : [])).map((serial) => ({ serial, product: item.name, invoice: invoice.number, date: invoice.issuedAt || invoice.createdAt }))) || [])
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === item ? 'bg-blue-500' : 'bg-white/[0.06]'}`}>{item}</button>)}</div>
      {tab === 'Resumen' ? <div className="grid gap-3 md:grid-cols-3"><Box label="Balance" value={currency.format(customer.balance || 0)} /><Box label="Credito disponible" value={currency.format((customer.creditLimit || 0) - (customer.balance || 0))} /><Box label="Documento" value={customer.rnc || customer.cedula || 'N/A'} /></div> : null}
      {tab === 'Facturas' ? <SimpleRows rows={invoices.map((i) => [i.number, currency.format(i.totals?.total || 0), i.status])} /> : null}
      {tab === 'Cuentas por cobrar' ? <SimpleRows rows={receivables.map((r) => [r.invoiceNumber, currency.format(r.balance), r.status])} /> : null}
      {tab === 'Cotizaciones' ? <SimpleRows rows={quotes.map((q) => [q.number, currency.format(q.totals?.total || 0), q.status])} /> : null}
      {tab === 'Equipos' ? <SimpleRows rows={serialItems.map((s) => [s.product, s.serial, s.invoice])} /> : null}
      {tab === 'Notas' ? <p className="rounded-lg bg-white/[0.035] p-3 text-white/60">{customer.internalNotes || 'Sin notas.'}</p> : null}
    </div>
  )
}

function validateCustomer(customer) {
  if (!customer.name?.trim()) throw new Error('El nombre / razon social es obligatorio.')
  if (customer.type === 'Empresa' && customer.rnc && customer.rnc.replace(/\D/g, '').length < 9) throw new Error('El RNC debe tener 9 a 11 digitos.')
  if (customer.type === 'Persona fisica' && customer.cedula && customer.cedula.replace(/\D/g, '').length !== 11) throw new Error('La cedula debe tener 11 digitos.')
}
function Icon({ icon: IconSvg, onClick }) { return <button onClick={onClick} className="rounded-md border border-white/10 bg-white/[0.035] p-2 text-white/65 hover:bg-white/[0.08]"><IconSvg size={15} /></button> }
function Input({ label, value, onChange, type = 'text' }) { return <label><span className="label-dark">{label}</span><input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-dark" /></label> }
function Select({ label, value, onChange, options }) { return <label><span className="label-dark">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="input-dark">{options.map((o) => <option key={o}>{o}</option>)}</select></label> }
function Box({ label, value }) { return <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4"><p className="text-xs font-bold uppercase text-white/40">{label}</p><p className="mt-2 font-display text-xl font-bold">{value}</p></div> }
function SimpleRows({ rows }) { return <div className="space-y-2">{rows.length ? rows.map((row, index) => <div key={index} className="grid grid-cols-3 gap-3 rounded-lg bg-white/[0.035] p-3 text-sm">{row.map((cell) => <span key={cell}>{cell}</span>)}</div>) : <p className="text-white/45">Sin registros.</p>}</div> }
