import { useDeferredValue, useMemo, useState } from 'react'
import { Copy, Eye, MessageCircle, Pencil, Printer, RotateCcw, Search, Trash2, XCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { DataTable } from '../../components/ui/DataTable'
import { InvoicePreview } from '../../components/invoice/InvoicePreview'
import { InvoiceForm } from './InvoiceForm'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { buildFiscalBuckets, invoiceModes } from '../../lib/taxEngine'
import { currency, formatDate } from '../../lib/formatters'

export function InvoiceList() {
  const toast = useToast()
  const invoices = useERPStore((state) => state.invoices)
  const customers = useERPStore((state) => state.customers)
  const company = useERPStore((state) => state.company)
  const duplicateInvoice = useERPStore((state) => state.duplicateInvoice)
  const voidInvoice = useERPStore((state) => state.voidInvoice)
  const deleteInvoice = useERPStore((state) => state.deleteInvoice)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')
  const [ncfType, setNcfType] = useState('all')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const deferredQuery = useDeferredValue(query)
  const filtered = useMemo(() => invoices.filter((invoice) => {
    const customer = customers.find((item) => item.id === invoice.customerId)
    const text = normalize([
      invoice.number,
      invoice.ncf,
      invoice.ncfType,
      invoice.customerName,
      customer?.name,
      customer?.rnc,
      customer?.cedula,
      customer?.phone,
      customer?.whatsapp,
      invoice.issuedAt,
      invoice.createdAt,
      invoice.issueDate,
      invoice.status,
      invoice.mode,
      invoice.seller,
      invoice.paymentMethod,
      (invoice.payments || []).map((payment) => `${payment.method} ${payment.reference}`).join(' '),
      invoice.totals?.total,
      ...(invoice.items || []).flatMap((item) => [item.name, item.sku, item.model, item.serial, ...(item.serials || [])]),
    ].join(' '))
    const queryText = normalize(deferredQuery)
    return (!queryText || text.includes(queryText) || queryText.split(/\s+/).every((part) => text.includes(part)))
      && (mode === 'all' || invoice.mode === mode)
      && (status === 'all' || invoice.status === status)
      && (ncfType === 'all' || invoice.ncfType === ncfType)
      && matchesQuickFilter(invoice, quickFilter)
  }), [customers, deferredQuery, invoices, mode, ncfType, quickFilter, status])
  const buckets = buildFiscalBuckets(filtered)

  function handleDuplicate(invoiceId) {
    try {
      const draft = duplicateInvoice(invoiceId)
      toast.success('Factura duplicada como borrador. Revise antes de emitir.')
      setEditing(draft)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleVoid() {
    try {
      voidInvoice(voiding.id, voidReason)
      toast.success('Factura anulada correctamente.')
      setVoiding(null)
      setVoidReason('')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleDelete() {
    try {
      deleteInvoice(deleting.id, deleteReason)
      toast.success('Factura eliminada correctamente.')
      setDeleting(null)
      setDeleteReason('')
    } catch (error) {
      toast.error(error.message)
    }
  }

  const columns = [
    { header: '#', accessorKey: 'number' },
    { header: 'NCF', cell: ({ row }) => row.original.ncf || row.original.number },
    { header: 'Tipo', accessorKey: 'ncfType' },
    { header: 'Cliente', accessorKey: 'customerName' },
    { header: 'Fecha', cell: ({ row }) => formatDate(row.original.issuedAt || row.original.createdAt) },
    { header: 'Pago', cell: ({ row }) => (row.original.payments || []).map((payment) => payment.method).join(', ') || row.original.paymentMethod || '-' },
    { header: 'Vendedor', cell: ({ row }) => row.original.seller || '-' },
    { header: 'Items', cell: ({ row }) => (row.original.items || []).length },
    { header: 'Total', cell: ({ row }) => currency.format(row.original.totals?.total || 0) },
    { header: 'Estado', cell: ({ row }) => <span className={row.original.status === 'voided' ? 'text-red-300 line-through' : 'text-emerald-300'}>{row.original.status}</span> },
    {
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <IconButton title="Ver detalle" icon={Eye} onClick={() => setSelected(row.original)} />
          <IconButton title="Editar" icon={Pencil} disabled={row.original.status !== 'draft'} onClick={() => setEditing(row.original)} />
          <IconButton title="Duplicar" icon={Copy} onClick={() => handleDuplicate(row.original.id)} />
          <IconButton title="Imprimir" icon={Printer} onClick={() => { setSelected(row.original); setTimeout(() => window.print(), 50) }} />
          <IconButton title="WhatsApp" icon={MessageCircle} onClick={() => openWhatsApp(row.original, customers, company)} />
          <IconButton title="Eliminar borrador/no fiscal" icon={Trash2} disabled={row.original.status !== 'draft' && row.original.ncfType !== 'NO_FISCAL' && Boolean(row.original.ncf)} onClick={() => setDeleting(row.original)} />
          <IconButton title="Anular" icon={XCircle} disabled={row.original.status === 'draft' || row.original.status === 'voided'} onClick={() => setVoiding(row.original)} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <section className="module-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">Lista de facturas</h2>
            <p className="text-sm text-white/45">Emitidas, borradores, creditos y anulaciones sin eliminar historial fiscal.</p>
          </div>
          <div className="w-full space-y-3 lg:max-w-5xl">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <Search size={16} className="text-white/35" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-white/35" placeholder="Buscar factura, cliente, NCF, RNC, telefono, producto, vendedor, pago, fecha o total" />
            </div>
            <div className="flex flex-wrap gap-2">
              {quickFilters.map((filter) => (
                <button key={filter.id} type="button" onClick={() => setQuickFilter(filter.id)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${quickFilter === filter.id ? 'border-blue-400 bg-blue-500/15 text-blue-100' : 'border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>{filter.label}</button>
              ))}
            </div>
            <div className="toolbar-grid">
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="input-dark"><option value="all">Modo: todos</option><option value={invoiceModes.TAXED}>Con ITBIS</option><option value={invoiceModes.NO_TAX}>Sin ITBIS</option><option value={invoiceModes.MIXED}>Mixta</option></select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-dark"><option value="all">Estado: todos</option><option value="draft">Borrador</option><option value="paid">Pagada</option><option value="credit">Credito</option><option value="voided">Anulada</option></select>
              <select value={ncfType} onChange={(e) => setNcfType(e.target.value)} className="input-dark"><option value="all">NCF todos</option><option>B01</option><option>B02</option><option>B14</option><option>B15</option><option>E31</option><option>E32</option><option>NO_FISCAL</option></select>
            </div>
          </div>
        </div>
        <DataTable data={filtered} columns={columns} />
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Total label="Facturas mostradas" value={filtered.length} />
          <Total label="Total con ITBIS" value={currency.format(buckets.taxed.total)} />
          <Total label="Total sin ITBIS" value={currency.format(buckets.noTax.total)} />
          <Total label="ITBIS total" value={currency.format(buckets.taxed.itbis + buckets.mixed.itbis)} />
        </div>
      </section>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Detalle de factura" size="xl">
        {selected ? <InvoicePreview invoice={selected} company={company} customer={customers.find((customer) => customer.id === selected.customerId)} format="letter" /> : null}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar borrador" size="full">
        {editing ? <InvoiceForm initialInvoice={editing} onDone={() => setEditing(null)} /> : null}
      </Modal>

      <Modal
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title={`Anular factura ${voiding?.number || ''}`}
        description="Las facturas fiscales no se eliminan; se anulan con motivo obligatorio."
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setVoiding(null)}>Cancelar</Button><Button variant="danger" icon={RotateCcw} onClick={handleVoid}>Confirmar anulacion</Button></div>}
      >
        <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="input-dark min-h-32 w-full" placeholder="Motivo obligatorio de anulacion, minimo 10 caracteres" />
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Eliminar factura ${deleting?.number || ''}`}
        description="Solo se eliminan borradores o facturas no fiscales. Las fiscales emitidas deben anularse."
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" icon={Trash2} onClick={handleDelete}>Eliminar</Button></div>}
      >
        {deleting?.status !== 'draft' ? <textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="input-dark min-h-32 w-full" placeholder="Motivo obligatorio de eliminacion, minimo 10 caracteres" /> : <p className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-white/62">Este borrador no afecta la numeracion fiscal y puede eliminarse directamente.</p>}
      </Modal>
    </div>
  )
}

function IconButton({ icon: Icon, title, onClick, disabled }) {
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className="rounded-md border border-white/10 bg-white/[0.035] p-2 text-white/65 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"><Icon size={15} /></button>
}

function Total({ label, value }) {
  return <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3"><p className="text-xs font-bold uppercase text-white/40">{label}</p><p className="mt-1 font-display text-xl font-bold">{value}</p></div>
}

function openWhatsApp(invoice, customers, company) {
  const customer = customers.find((item) => item.id === invoice.customerId)
  const phone = customer?.whatsapp || company.whatsapp
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Factura ${invoice.number} por ${currency.format(invoice.totals?.total || 0)} - ${company.name || 'Trifusion Technologies'}`)}`)
}

const quickFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'paid', label: 'Pagadas' },
  { id: 'credit', label: 'Credito' },
  { id: 'taxed', label: 'Con ITBIS' },
  { id: 'no_tax', label: 'Sin ITBIS' },
  { id: 'voided', label: 'Anuladas' },
]

function matchesQuickFilter(invoice, filter) {
  const date = new Date(invoice.issuedAt || invoice.createdAt || invoice.issueDate || Date.now())
  const now = new Date()
  if (filter === 'today') return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
  if (filter === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    return date >= start
  }
  if (filter === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  if (filter === 'paid') return invoice.status === 'paid'
  if (filter === 'credit') return invoice.status === 'credit' || (invoice.payments || []).some((payment) => payment.method === 'Credito')
  if (filter === 'taxed') return invoice.mode === invoiceModes.TAXED || invoice.mode === invoiceModes.MIXED
  if (filter === 'no_tax') return invoice.mode === invoiceModes.NO_TAX
  if (filter === 'voided') return invoice.status === 'voided'
  return true
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
