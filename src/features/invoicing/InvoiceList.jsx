import { useDeferredValue, useMemo, useState } from 'react'
import { Columns3, Copy, Download, Eye, History, Mail, MessageCircle, PackageOpen, Pencil, Printer, RotateCcw, Search, SlidersHorizontal, Trash2, XCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
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
  const [productsView, setProductsView] = useState(null)
  const [historyView, setHistoryView] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const [filters, setFilters] = useState(defaultAdvancedFilters)
  const deferredQuery = useDeferredValue(query)
  const sellers = useMemo(() => uniqueValues(invoices.map((invoice) => invoice.seller)), [invoices])
  const paymentMethods = useMemo(() => uniqueValues(invoices.flatMap((invoice) => (invoice.payments || []).map((payment) => payment.method).concat(invoice.paymentMethod || []))), [invoices])
  const searchResults = useMemo(() => {
    const queryText = normalize(deferredQuery)
    const matched = invoices.filter((invoice) => {
      const customer = customers.find((item) => item.id === invoice.customerId)
      const text = buildInvoiceSearchText(invoice, customer)
      const total = getInvoiceTotal(invoice)
      return (!queryText || text.includes(queryText) || queryText.split(/\s+/).every((part) => text.includes(part)))
        && (mode === 'all' || invoice.mode === mode)
        && (status === 'all' || invoice.status === status)
        && (ncfType === 'all' || invoice.ncfType === ncfType)
        && matchesQuickFilter(invoice, quickFilter)
        && matchesDateRange(invoice, filters.dateFrom, filters.dateTo)
        && matchesNumberMin(total, filters.minTotal)
        && matchesNumberMax(total, filters.maxTotal)
        && matchesExact(filters.seller, invoice.seller)
        && matchesPayment(invoice, filters.paymentMethod)
        && matchesLineSearch(invoice, filters.productQuery, ['name', 'sku', 'model', 'category'])
        && matchesLineSearch(invoice, filters.serialQuery, ['serial', 'serials'])
    })
    const sorted = sortInvoices(matched, filters.sortBy)
    const limit = parseResultLimit(filters.resultLimit)
    return {
      matched: sorted,
      visible: limit ? sorted.slice(0, limit) : sorted,
    }
  }, [customers, deferredQuery, filters, invoices, mode, ncfType, quickFilter, status])
  const filtered = searchResults.visible
  const buckets = buildFiscalBuckets(filtered)
  const totalMatched = searchResults.matched.length
  const hiddenByLimit = Math.max(totalMatched - filtered.length, 0)

  function setFilter(key, value) {
    setFilters((state) => ({ ...state, [key]: value }))
  }

  function resetFilters() {
    setQuery('')
    setMode('all')
    setStatus('all')
    setNcfType('all')
    setQuickFilter('all')
    setFilters(defaultAdvancedFilters)
  }

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
          <IconButton title="Descargar PDF" icon={Download} onClick={() => { setSelected(row.original); setTimeout(() => window.print(), 50) }} />
          <IconButton title="Editar" icon={Pencil} disabled={row.original.status !== 'draft'} onClick={() => setEditing(row.original)} />
          <IconButton title="Duplicar" icon={Copy} onClick={() => handleDuplicate(row.original.id)} />
          <IconButton title="Imprimir" icon={Printer} onClick={() => { setSelected(row.original); setTimeout(() => window.print(), 50) }} />
          <IconButton title="WhatsApp" icon={MessageCircle} onClick={() => openWhatsApp(row.original, customers, company)} />
          <IconButton title="Email" icon={Mail} onClick={() => openEmail(row.original, customers, company)} />
          <IconButton title="Productos vendidos" icon={PackageOpen} onClick={() => setProductsView(row.original)} />
          <IconButton title="Historial / logs" icon={History} onClick={() => setHistoryView(row.original)} />
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.025] p-2">
              <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs font-bold text-white/70 transition hover:bg-white/[0.08]">
                <SlidersHorizontal size={15} />
                Busqueda avanzada
              </button>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white/45">
                <span>{totalMatched} encontrada(s)</span>
                {hiddenByLimit ? <span>{hiddenByLimit} oculta(s) por limite</span> : null}
                <button type="button" onClick={resetFilters} className="rounded-lg border border-white/10 px-3 py-2 text-white/60 transition hover:bg-white/[0.07]">Limpiar</button>
              </div>
            </div>
            {advancedOpen ? (
              <div className="grid gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
                <div className="toolbar-grid">
                  <label><span className="label-dark">Desde</span><input type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} className="input-dark" /></label>
                  <label><span className="label-dark">Hasta</span><input type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} className="input-dark" /></label>
                  <label><span className="label-dark">Monto minimo</span><input type="number" min="0" value={filters.minTotal} onChange={(e) => setFilter('minTotal', e.target.value)} className="input-dark" placeholder="0.00" /></label>
                  <label><span className="label-dark">Monto maximo</span><input type="number" min="0" value={filters.maxTotal} onChange={(e) => setFilter('maxTotal', e.target.value)} className="input-dark" placeholder="Sin limite" /></label>
                </div>
                <div className="toolbar-grid">
                  <label><span className="label-dark">Vendedor</span><select value={filters.seller} onChange={(e) => setFilter('seller', e.target.value)} className="input-dark"><option value="all">Todos</option>{sellers.map((seller) => <option key={seller} value={seller}>{seller}</option>)}</select></label>
                  <label><span className="label-dark">Metodo de pago</span><select value={filters.paymentMethod} onChange={(e) => setFilter('paymentMethod', e.target.value)} className="input-dark"><option value="all">Todos</option>{paymentMethods.map((payment) => <option key={payment} value={payment}>{payment}</option>)}</select></label>
                  <label><span className="label-dark">Producto / SKU / modelo</span><input value={filters.productQuery} onChange={(e) => setFilter('productQuery', e.target.value)} className="input-dark" placeholder="Ej. iPhone, SKU, laptop" /></label>
                  <label><span className="label-dark">Serial / IMEI</span><input value={filters.serialQuery} onChange={(e) => setFilter('serialQuery', e.target.value)} className="input-dark" placeholder="Serial, IMEI o parte" /></label>
                </div>
                <div className="toolbar-grid">
                  <label><span className="label-dark">Mostrar maximo</span><select value={filters.resultLimit} onChange={(e) => setFilter('resultLimit', e.target.value)} className="input-dark"><option value="5">5 registros</option><option value="10">10 registros</option><option value="25">25 registros</option><option value="50">50 registros</option><option value="100">100 registros</option><option value="all">Todos</option></select></label>
                  <label><span className="label-dark">Orden</span><select value={filters.sortBy} onChange={(e) => setFilter('sortBy', e.target.value)} className="input-dark"><option value="newest">Mas recientes</option><option value="oldest">Mas antiguas</option><option value="total_desc">Mayor monto</option><option value="total_asc">Menor monto</option><option value="customer">Cliente A-Z</option><option value="number">Numero / NCF</option></select></label>
                </div>
              </div>
            ) : null}
            <div className="toolbar-grid">
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="input-dark"><option value="all">Modo: todos</option><option value={invoiceModes.TAXED}>Con ITBIS</option><option value={invoiceModes.NO_TAX}>Sin ITBIS</option><option value={invoiceModes.MIXED}>Mixta</option></select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-dark"><option value="all">Estado: todos</option><option value="draft">Borrador</option><option value="paid">Pagada</option><option value="credit">Credito</option><option value="voided">Anulada</option></select>
              <select value={ncfType} onChange={(e) => setNcfType(e.target.value)} className="input-dark"><option value="all">NCF todos</option><option>B01</option><option>B02</option><option>B14</option><option>B15</option><option>E31</option><option>E32</option><option>NO_FISCAL</option></select>
            </div>
          </div>
        </div>
        <PremiumInvoiceTable data={filtered} columns={columns} />
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Total label="Facturas mostradas" value={`${filtered.length} / ${totalMatched}`} />
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

      <Modal open={Boolean(productsView)} onClose={() => setProductsView(null)} title={`Productos vendidos ${productsView?.number || ''}`} size="xl">
        {productsView ? <SoldProducts invoice={productsView} /> : null}
      </Modal>

      <Modal open={Boolean(historyView)} onClose={() => setHistoryView(null)} title={`Historial ${historyView?.number || ''}`} size="md">
        {historyView ? <InvoiceHistory invoice={historyView} /> : null}
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

function PremiumInvoiceTable({ data, columns }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState({ id: 'Fecha', dir: 'desc' })
  const [visible, setVisible] = useState(() => new Set(columns.map((column) => column.header)))
  const [columnsOpen, setColumnsOpen] = useState(false)
  const visibleColumns = columns.filter((column) => visible.has(column.header))
  const sorted = useMemo(() => sortTableData(data, sort), [data, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  function toggleColumn(header) {
    setVisible((current) => {
      const next = new Set(current)
      if (next.has(header) && next.size > 3) next.delete(header)
      else next.add(header)
      return next
    })
  }

  function sortBy(header) {
    setSort((current) => ({ id: header, dir: current.id === header && current.dir === 'asc' ? 'desc' : 'asc' }))
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#101119]/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.035] p-3">
        <div className="text-xs font-bold uppercase text-white/45">{sorted.length} resultado(s) organizados</div>
        <div className="relative flex flex-wrap gap-2">
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} className="input-dark max-w-36">
            <option value="10">10 por pagina</option>
            <option value="25">25 por pagina</option>
            <option value="50">50 por pagina</option>
            <option value="100">100 por pagina</option>
          </select>
          <button type="button" onClick={() => setColumnsOpen((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-white/70 hover:bg-white/[0.08]"><Columns3 size={15} /> Columnas</button>
          {columnsOpen ? (
            <div className="absolute right-0 top-12 z-20 grid min-w-56 gap-1 rounded-lg border border-white/10 bg-[#111118] p-2 shadow-2xl">
              {columns.map((column) => (
                <label key={column.header} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/70 hover:bg-white/[0.06]">
                  <input type="checkbox" checked={visible.has(column.header)} onChange={() => toggleColumn(column.header)} />
                  {column.header}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="premium-scroll max-h-[68vh] overflow-auto">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#171822] text-xs uppercase text-white/48 shadow-lg shadow-black/20">
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.header} className="px-4 py-3">
                  <button type="button" onClick={() => sortBy(column.header)} className="inline-flex items-center gap-1 font-bold hover:text-white">
                    {column.header}
                    <span className="text-white/30">{sort.id === column.header ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {pageRows.length ? pageRows.map((invoice) => (
              <tr key={invoice.id} className="transition odd:bg-white/[0.018] hover:bg-blue-500/[0.08]">
                {visibleColumns.map((column) => (
                  <td key={`${invoice.id}-${column.header}`} className="px-4 py-3 text-white/78">
                    {column.cell ? column.cell({ row: { original: invoice } }) : invoice[column.accessorKey] || '-'}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-sm text-white/45">No hay facturas para estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.025] p-3 text-sm text-white/55">
        <span>Pagina {safePage} de {totalPages}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-white/10 px-3 py-2 font-bold hover:bg-white/[0.07]">Anterior</button>
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-white/10 px-3 py-2 font-bold hover:bg-white/[0.07]">Siguiente</button>
        </div>
      </div>
    </div>
  )
}

function SoldProducts({ invoice }) {
  return (
    <div className="space-y-2">
      {(invoice.items || []).map((item, index) => (
        <div key={`${item.productId || item.name}-${index}`} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm md:grid-cols-[1fr_80px_120px_120px]">
          <div><p className="font-bold text-white">{item.name}</p><p className="text-white/45">{item.sku || 'Sin SKU'} {item.model ? `· ${item.model}` : ''}</p><p className="text-xs text-white/35">{(item.serials || (item.serial ? [item.serial] : [])).join(', ')}</p></div>
          <p>Cant. {item.quantity}</p>
          <p>{currency.format(item.price || 0)}</p>
          <p className="font-bold">{currency.format((Number(item.net || 0) + Number(item.tax || 0)) || (Number(item.price || 0) * Number(item.quantity || 0)))}</p>
        </div>
      ))}
    </div>
  )
}

function InvoiceHistory({ invoice }) {
  const entries = [
    ['Creada', invoice.createdAt || invoice.issueDate],
    ['Emitida', invoice.issuedAt],
    ['Actualizada', invoice.updatedAt],
    ['Estado', invoice.status],
    ['Vendedor', invoice.seller],
    ['Notas cliente', invoice.notesCustomer],
    ['Notas internas', invoice.notesInternal],
    ['Motivo anulacion', invoice.voidReason],
  ].filter(([, value]) => value)
  return <div className="space-y-2">{entries.map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm"><p className="text-xs font-bold uppercase text-white/40">{label}</p><p className="mt-1 text-white/78">{String(value)}</p></div>)}</div>
}

function sortTableData(data, sort) {
  const getters = {
    '#': (invoice) => invoice.number || '',
    NCF: (invoice) => invoice.ncf || invoice.number || '',
    Tipo: (invoice) => invoice.ncfType || '',
    Cliente: (invoice) => invoice.customerName || '',
    Fecha: (invoice) => getInvoiceDate(invoice).getTime(),
    Pago: (invoice) => paymentLabel(invoice),
    Vendedor: (invoice) => invoice.seller || '',
    Items: (invoice) => (invoice.items || []).length,
    Total: (invoice) => getInvoiceTotal(invoice),
    Estado: (invoice) => invoice.status || '',
  }
  const getter = getters[sort.id] || (() => '')
  return [...data].sort((a, b) => {
    const left = getter(a)
    const right = getter(b)
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right))
    return sort.dir === 'asc' ? result : -result
  })
}

function paymentLabel(invoice) {
  return (invoice.payments || []).map((payment) => payment.method).join(', ') || invoice.paymentMethod || '-'
}

function openWhatsApp(invoice, customers, company) {
  const customer = customers.find((item) => item.id === invoice.customerId)
  const phone = customer?.whatsapp || company.whatsapp
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Factura ${invoice.number} por ${currency.format(invoice.totals?.total || 0)} - ${company.name || 'Trifusion Technologies'}`)}`)
}

function openEmail(invoice, customers, company) {
  const customer = customers.find((item) => item.id === invoice.customerId)
  const subject = `Factura ${invoice.number || invoice.ncf || ''}`
  const body = `Hola ${customer?.name || invoice.customerName || ''},\n\nAdjuntamos la referencia de su factura ${invoice.number || invoice.ncf || ''} por ${currency.format(invoice.totals?.total || 0)}.\n\n${company.name || 'Trifusion Technologies'}`
  window.location.href = `mailto:${customer?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

const defaultAdvancedFilters = {
  dateFrom: '',
  dateTo: '',
  minTotal: '',
  maxTotal: '',
  seller: 'all',
  paymentMethod: 'all',
  productQuery: '',
  serialQuery: '',
  resultLimit: '5',
  sortBy: 'newest',
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

function buildInvoiceSearchText(invoice, customer) {
  return normalize([
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
    getInvoiceTotal(invoice),
    ...(invoice.items || []).flatMap((item) => [item.name, item.sku, item.model, item.category, item.serial, ...(item.serials || [])]),
  ].join(' '))
}

function getInvoiceDate(invoice) {
  const value = invoice.issuedAt || invoice.createdAt || invoice.issueDate
  const date = value ? new Date(value) : new Date(0)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function getInvoiceTotal(invoice) {
  return Number(invoice.totals?.total || invoice.total || 0)
}

function matchesDateRange(invoice, dateFrom, dateTo) {
  const date = getInvoiceDate(invoice)
  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`)
    if (date < from) return false
  }
  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59`)
    if (date > to) return false
  }
  return true
}

function matchesNumberMin(value, minimum) {
  if (minimum === '') return true
  return Number(value) >= Number(minimum)
}

function matchesNumberMax(value, maximum) {
  if (maximum === '') return true
  return Number(value) <= Number(maximum)
}

function matchesExact(filterValue, value) {
  return filterValue === 'all' || normalize(value) === normalize(filterValue)
}

function matchesPayment(invoice, paymentMethod) {
  if (paymentMethod === 'all') return true
  return normalize(invoice.paymentMethod) === normalize(paymentMethod)
    || (invoice.payments || []).some((payment) => normalize(payment.method) === normalize(paymentMethod))
}

function matchesLineSearch(invoice, query, fields) {
  const text = normalize(query)
  if (!text) return true
  const haystack = normalize((invoice.items || []).flatMap((item) => fields.flatMap((field) => item[field] || [])).join(' '))
  return haystack.includes(text) || text.split(/\s+/).every((part) => haystack.includes(part))
}

function sortInvoices(invoices, sortBy) {
  return [...invoices].sort((a, b) => {
    if (sortBy === 'oldest') return getInvoiceDate(a) - getInvoiceDate(b)
    if (sortBy === 'total_desc') return getInvoiceTotal(b) - getInvoiceTotal(a)
    if (sortBy === 'total_asc') return getInvoiceTotal(a) - getInvoiceTotal(b)
    if (sortBy === 'customer') return String(a.customerName || '').localeCompare(String(b.customerName || ''))
    if (sortBy === 'number') return String(a.ncf || a.number || '').localeCompare(String(b.ncf || b.number || ''))
    return getInvoiceDate(b) - getInvoiceDate(a)
  })
}

function parseResultLimit(value) {
  if (value === 'all') return 0
  const limit = Number(value)
  return Number.isFinite(limit) && limit > 0 ? limit : 5
}

function uniqueValues(values) {
  return [...new Set(values.flat().filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b))
}

function matchesQuickFilter(invoice, filter) {
  const date = getInvoiceDate(invoice)
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
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}
