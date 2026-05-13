import { useMemo, useState } from 'react'
import { FileSpreadsheet, History, MessageCircle, Wallet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { DataTable } from '../../components/ui/DataTable'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { currency, formatDate } from '../../lib/formatters'

const today = () => new Date().toISOString().slice(0, 10)
const daysTo = (date) => Math.ceil((new Date(date) - new Date()) / 86400000)

export function Receivables() {
  const toast = useToast()
  const receivables = useERPStore((state) => state.receivables)
  const customers = useERPStore((state) => state.customers)
  const company = useERPStore((state) => state.company)
  const registerPayment = useERPStore((state) => state.registerPayment)
  const [tab, setTab] = useState('Todas')
  const [paying, setPaying] = useState(null)
  const [history, setHistory] = useState(null)
  const [payment, setPayment] = useState({ amount: 0, method: 'Efectivo', reference: '', date: today() })
  const filtered = useMemo(() => receivables.filter((item) => {
    const days = daysTo(item.dueDate)
    if (tab === 'Vigentes') return item.balance > 0 && days > 7
    if (tab === 'Por vencer <7 dias') return item.balance > 0 && days <= 7 && days >= 0
    if (tab === 'Vencidas') return item.balance > 0 && days < 0
    return true
  }), [receivables, tab])
  const total = filtered.reduce((sum, item) => sum + Number(item.balance || 0), 0)

  function savePayment() {
    try {
      registerPayment({ invoiceId: paying.invoiceId, ...payment, amount: Number(payment.amount) })
      toast.success('Pago registrado correctamente.')
      setPaying(null)
      setPayment({ amount: 0, method: 'Efectivo', reference: '', date: today() })
    } catch (error) {
      toast.error(error.message)
    }
  }

  function exportAging() {
    const rows = customers.map((customer) => {
      const own = receivables.filter((item) => item.customerId === customer.id && item.balance > 0)
      return own.reduce((row, item) => {
        const late = Math.max(-daysTo(item.dueDate), 0)
        const bucket = late <= 30 ? '0-30' : late <= 60 ? '31-60' : late <= 90 ? '61-90' : '+90'
        row[bucket] += item.balance
        row.Total += item.balance
        return row
      }, { Cliente: customer.name, '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0, Total: 0 })
    }).filter((row) => row.Total > 0)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Aging')
    XLSX.writeFile(book, 'trifusion-aging.xlsx')
  }

  return (
    <div className="space-y-5">
      <section className="panel rounded-lg p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><h2 className="font-display text-2xl font-bold">Cuentas por cobrar</h2><p className="text-sm text-white/45">{filtered.length} facturas | {currency.format(total)} pendientes</p></div>
          <Button variant="ghost" icon={FileSpreadsheet} onClick={exportAging}>Aging Excel</Button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">{['Todas', 'Vigentes', 'Por vencer <7 dias', 'Vencidas'].map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === item ? 'bg-blue-500' : 'bg-white/[0.06]'}`}>{item}</button>)}</div>
        <DataTable data={filtered} columns={[
          { header: 'Cliente', accessorKey: 'customerName' },
          { header: 'No. Factura', accessorKey: 'invoiceNumber' },
          { header: 'Emision', cell: ({ row }) => formatDate(row.original.createdAt) },
          { header: 'Vencimiento', accessorKey: 'dueDate' },
          { header: 'Total', cell: ({ row }) => currency.format(row.original.total) },
          { header: 'Pagado', cell: ({ row }) => currency.format(row.original.paid) },
          { header: 'Balance', cell: ({ row }) => currency.format(row.original.balance) },
          { header: 'Dias', cell: ({ row }) => daysTo(row.original.dueDate) },
          { header: 'Estado', cell: ({ row }) => <Status item={row.original} /> },
          { header: 'Acciones', cell: ({ row }) => <div className="flex gap-1"><Icon icon={Wallet} onClick={() => { setPaying(row.original); setPayment((p) => ({ ...p, amount: row.original.balance })) }} /><Icon icon={MessageCircle} onClick={() => remind(row.original, customers, company)} /><Icon icon={History} onClick={() => setHistory(row.original)} /></div> },
        ]} />
      </section>
      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title="Registrar pago" size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPaying(null)}>Cancelar</Button><Button variant="success" onClick={savePayment}>Confirmar pago</Button></div>}>
        {paying ? <div className="grid gap-3 md:grid-cols-2"><p className="md:col-span-2 text-white/60">Balance pendiente: {currency.format(paying.balance)}</p><Input label="Monto" type="number" value={payment.amount} onChange={(v) => setPayment((s) => ({ ...s, amount: v }))} /><Select label="Metodo" value={payment.method} onChange={(v) => setPayment((s) => ({ ...s, method: v }))} options={['Efectivo', 'Tarjeta', 'Transferencia', 'Cheque']} /><Input label="Referencia" value={payment.reference} onChange={(v) => setPayment((s) => ({ ...s, reference: v }))} /><Input label="Fecha" type="date" value={payment.date} onChange={(v) => setPayment((s) => ({ ...s, date: v }))} /></div> : null}
      </Modal>
      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title="Historial de pagos" size="md">
        {history ? <DataTable data={history.payments || []} columns={[{ header: 'Fecha', accessorKey: 'date' }, { header: 'Monto', cell: ({ row }) => currency.format(row.original.amount) }, { header: 'Metodo', accessorKey: 'method' }, { header: 'Referencia', accessorKey: 'reference' }]} /> : null}
      </Modal>
    </div>
  )
}

function Status({ item }) {
  const days = daysTo(item.dueDate)
  const color = days < 0 ? 'bg-red-500' : days <= 7 ? 'bg-amber-500' : 'bg-emerald-500'
  const text = days < 0 ? 'Vencida' : days <= 7 ? 'Por vencer' : 'Vigente'
  return <span className="inline-flex items-center gap-2"><span className={`h-2 w-8 rounded-full ${color}`} />{text}</span>
}
function Icon({ icon: IconSvg, onClick }) { return <button onClick={onClick} className="rounded-md border border-white/10 bg-white/[0.035] p-2 text-white/65 hover:bg-white/[0.08]"><IconSvg size={15} /></button> }
function Input({ label, value, onChange, type = 'text' }) { return <label><span className="label-dark">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="input-dark" /></label> }
function Select({ label, value, onChange, options }) { return <label><span className="label-dark">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="input-dark">{options.map((option) => <option key={option}>{option}</option>)}</select></label> }
function remind(item, customers, company) { const customer = customers.find((c) => c.id === item.customerId); window.open(`https://wa.me/${customer?.whatsapp || company.whatsapp}?text=${encodeURIComponent(`Estimado ${item.customerName}, le recordamos que tiene una factura No. ${item.invoiceNumber} por ${currency.format(item.balance)} con vencimiento el ${item.dueDate}. Para consultas: ${company.phone || company.whatsapp}. Gracias.`)}`) }
