import { useMemo, useState } from 'react'
import { Bar, Doughnut, Line as LineChart } from 'react-chartjs-2'
import { Download, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '../../components/ui/Button'
import { DataTable } from '../../components/ui/DataTable'
import { useERPStore } from '../../store/useERPStore'
import { buildFiscalBuckets, invoiceModes } from '../../lib/taxEngine'
import { currency, formatDate } from '../../lib/formatters'

export function Reports() {
  const invoices = useERPStore((state) => state.invoices)
  const [mode, setMode] = useState('all')
  const active = useMemo(() => invoices.filter((invoice) => invoice.status !== 'voided'), [invoices])
  const filtered = useMemo(() => (mode === 'all' ? active : active.filter((invoice) => invoice.mode === mode)), [active, mode])
  const buckets = useMemo(() => buildFiscalBuckets(active), [active])
  const totalGeneral = buckets.taxed.total + buckets.noTax.total + buckets.mixed.total
  const barData = useMemo(() => ({
    labels: ['Periodo'],
    datasets: [
      { label: 'Con ITBIS', data: [buckets.taxed.total], backgroundColor: '#3B82F6' },
      { label: 'Sin ITBIS', data: [buckets.noTax.total], backgroundColor: '#10B981' },
      { label: 'Mixtas', data: [buckets.mixed.total], backgroundColor: '#64748B' },
    ],
  }), [buckets])
  const itbisData = useMemo(() => ({
    labels: active.map((invoice) => (invoice.issuedAt || invoice.createdAt || '').slice(0, 10)),
    datasets: [
      {
        label: 'ITBIS',
        data: active.map((invoice) => invoice.totals?.itbis || 0),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, .16)',
        tension: 0.35,
        fill: true,
      },
    ],
  }), [active])
  const distributionData = useMemo(() => ({
    labels: ['Con ITBIS', 'Sin ITBIS', 'Mixta'],
    datasets: [
      {
        data: [buckets.taxed.total, buckets.noTax.total, buckets.mixed.total],
        backgroundColor: ['#3B82F6', '#10B981', '#64748B'],
      },
    ],
  }), [buckets])

  function exportExcel() {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(active.filter((i) => i.mode === invoiceModes.TAXED)), 'Ventas con ITBIS')
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(active.filter((i) => i.mode === invoiceModes.NO_TAX)), 'Ventas sin ITBIS')
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(active.filter((i) => i.mode === invoiceModes.MIXED)), 'Ventas mixtas')
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ tipo: 'Con ITBIS', ...buckets.taxed }, { tipo: 'Sin ITBIS', ...buckets.noTax }, { tipo: 'Mixta', ...buckets.mixed }, { tipo: 'Total general', total: totalGeneral }]), 'Resumen consolidado')
    XLSX.writeFile(book, 'trifusion-reportes-separados.xlsx')
  }

  function export607() {
    const rows = active.filter((invoice) => [invoiceModes.TAXED, invoiceModes.MIXED].includes(invoice.mode)).map((invoice) => `${invoice.customerRnc || ''}|${invoice.ncfType}|${invoice.ncf || invoice.number}|${(invoice.issuedAt || invoice.createdAt || '').slice(0, 10)}|${invoice.totals.subtotal}|${invoice.totals.itbis}`)
    const blob = new Blob([rows.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'DGII-607-Trifusion.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    window.print()
  }

  return (
    <div className="space-y-5">
      <div className="printable-report report-print-area space-y-5">
      <section className="grid gap-4 xl:grid-cols-3">
        <Bucket title="VENTAS CON ITBIS" bucket={buckets.taxed} />
        <Bucket title="VENTAS SIN ITBIS" bucket={buckets.noTax} noTax />
        <Bucket title="VENTAS MIXTAS" bucket={buckets.mixed} />
      </section>
      <section className="module-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><p className="text-sm text-white/45">TOTAL GENERAL</p><p className="font-display text-3xl font-bold">{currency.format(totalGeneral)}</p><p className="text-sm text-white/45">Este total incluye el ITBIS que debe declararse a la DGII.</p></div>
          <div className="no-print flex flex-wrap gap-2"><Button variant="ghost" icon={Printer} onClick={printReport}>Imprimir / PDF</Button><Button variant="ghost" icon={Download} onClick={exportExcel}>Excel separado</Button><Button variant="ghost" icon={Download} onClick={export607}>607 TXT</Button></div>
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-3">
        <ChartPanel title="Barras agrupadas"><Bar data={barData} options={chartOptions} /></ChartPanel>
        <ChartPanel title="ITBIS cobrado"><LineChart data={itbisData} options={chartOptions} /></ChartPanel>
        <ChartPanel title="Distribucion"><Doughnut data={distributionData} options={doughnutOptions} /></ChartPanel>
      </section>
      <section className="panel rounded-lg p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Tabla detallada</h2><select value={mode} onChange={(e) => setMode(e.target.value)} className="input-dark"><option value="all">Todos</option><option value={invoiceModes.TAXED}>Con ITBIS</option><option value={invoiceModes.NO_TAX}>Sin ITBIS</option><option value={invoiceModes.MIXED}>Mixta</option></select></div>
        <DataTable data={filtered} columns={[
          { header: 'No.', accessorKey: 'number' },
          { header: 'NCF', cell: ({ row }) => row.original.ncf || row.original.number },
          { header: 'Cliente', accessorKey: 'customerName' },
          { header: 'Fecha', cell: ({ row }) => formatDate(row.original.issuedAt || row.original.createdAt) },
          { header: 'Modo', accessorKey: 'mode' },
          { header: 'Subtotal', cell: ({ row }) => currency.format(row.original.totals?.subtotal || 0) },
          { header: 'ITBIS', cell: ({ row }) => currency.format(row.original.totals?.itbis || 0) },
          { header: 'Total', cell: ({ row }) => currency.format(row.original.totals?.total || 0) },
          { header: 'Estado', accessorKey: 'status' },
          { header: 'Ganancia', cell: ({ row }) => currency.format(row.original.totals?.profit || 0) },
        ]} />
        <div className="mt-4 space-y-1 text-sm text-white/62">
          <p>Ventas CON ITBIS: subtotal {currency.format(buckets.taxed.subtotal)} | ITBIS {currency.format(buckets.taxed.itbis)} | Total {currency.format(buckets.taxed.total)}</p>
          <p>Ventas SIN ITBIS: Total {currency.format(buckets.noTax.total)}</p>
          <p>Ventas MIXTAS: subtotal {currency.format(buckets.mixed.subtotal)} | ITBIS parcial {currency.format(buckets.mixed.itbis)} | Total {currency.format(buckets.mixed.total)}</p>
        </div>
      </section>
      </div>
    </div>
  )
}

function Bucket({ title, bucket, noTax }) {
  return <div className="panel rounded-lg p-5"><h3 className="font-display text-xl font-bold">{title}</h3><div className="mt-4 space-y-2 text-sm"><Line label="Facturas" value={bucket.count} raw /><Line label={noTax ? 'Total' : 'Subtotal'} value={bucket.subtotal || bucket.total} />{!noTax ? <Line label="ITBIS" value={bucket.itbis} /> : null}<Line label="Total" value={bucket.total} /><Line label="Ganancia" value={bucket.profit} /></div></div>
}
function Line({ label, value, raw }) { return <div className="flex justify-between"><span className="text-white/50">{label}</span><span className="font-bold">{raw ? value : currency.format(value || 0)}</span></div> }
function ChartPanel({ title, children }) { return <div className="panel flex h-80 flex-col rounded-lg p-5"><h3 className="mb-3 font-display text-lg font-bold">{title}</h3><div className="min-h-0 flex-1">{children}</div></div> }
const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.06)' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.06)' } } } }
const doughnutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } } }
