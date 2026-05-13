import { AlertTriangle, Boxes, CircleDollarSign, ReceiptText, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { MetricCard } from '../../components/ui/MetricCard'
import { DataTable } from '../../components/ui/DataTable'
import { useERPStore } from '../../store/useERPStore'
import { currency, formatDate } from '../../lib/formatters'

const today = () => new Date().toISOString().slice(0, 10)
const monthKey = () => new Date().toISOString().slice(0, 7)

export function Dashboard() {
  const invoices = useERPStore((state) => state.invoices)
  const products = useERPStore((state) => state.products)
  const customers = useERPStore((state) => state.customers)
  const cash = useERPStore((state) => state.cashRegister)
  const expenses = useERPStore((state) => state.expenses)

  const validInvoices = invoices.filter((item) => !['voided', 'anulada', 'draft'].includes(item.status))
  const todayInvoices = validInvoices.filter((item) => String(item.issueDate || item.issuedAt || item.createdAt).startsWith(today()))
  const monthInvoices = validInvoices.filter((item) => String(item.issueDate || item.issuedAt || item.createdAt).startsWith(monthKey()))
  const todaySales = sumTotals(todayInvoices, 'total')
  const monthSales = sumTotals(monthInvoices, 'total')
  const netProfit = sumTotals(validInvoices, 'profit')
  const monthExpenses = expenses
    .filter((item) => String(item.date || item.createdAt || '').startsWith(monthKey()) && item.status !== 'cancelled')
    .reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0)
  const lowStock = products.filter((item) => item.category !== 'Servicios' && item.status !== 'Eliminado' && Number(item.stock || 0) <= Number(item.stockMin || 0))
  const inventoryValue = products.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.stock || 0), 0)
  const receivableCustomers = customers.filter((item) => Number(item.balance || 0) > 0)
  const topProducts = buildTopProducts(validInvoices).slice(0, 6)

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} accent="green" label="Ventas de hoy" value={currency.format(todaySales)} detail={`${todayInvoices.length} facturas emitidas`} />
        <MetricCard icon={ReceiptText} accent="blue" label="Ventas del mes" value={currency.format(monthSales)} detail={`${monthInvoices.length} documentos reales`} />
        <MetricCard icon={TrendingUp} accent="amber" label="Ganancia neta" value={currency.format(netProfit - monthExpenses)} detail={`Gastos del mes: ${currency.format(monthExpenses)}`} />
        <MetricCard icon={Boxes} accent="red" label="Stock crítico" value={lowStock.length} detail={`${currency.format(inventoryValue)} valorizado`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="panel rounded-lg p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Resumen administrativo</h2>
              <p className="text-sm text-white/45">Desglose directo de ventas, caja, inventario y cuentas sin gráficos pesados.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryLine icon={CircleDollarSign} title="Caja esperada" value={currency.format(cash.expected)} detail={cash.status === 'open' ? 'Caja abierta' : 'Caja cerrada'} />
            <SummaryLine icon={Users} title="Clientes con balance" value={receivableCustomers.length} detail={currency.format(receivableCustomers.reduce((sum, item) => sum + Number(item.balance || 0), 0))} />
            <SummaryLine icon={TrendingDown} title="Gastos del mes" value={currency.format(monthExpenses)} detail="Registrados en administración" />
            <SummaryLine icon={AlertTriangle} title="Productos agotándose" value={lowStock.length} detail="Revisar reposición" />
          </div>
        </div>

        <div className="panel rounded-lg p-5">
          <h2 className="font-display text-xl font-bold">Top vendidos</h2>
          <div className="mt-4 space-y-3">
            {topProducts.length ? topProducts.map((item) => (
              <div key={item.name} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{item.name}</p>
                  <p className="text-sm text-emerald-300">{item.quantity} und.</p>
                </div>
                <p className="text-sm text-white/45">{currency.format(item.total)}</p>
              </div>
            )) : <p className="text-sm text-white/45">Aun no hay ventas registradas.</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel rounded-lg p-5">
          <h2 className="font-display text-xl font-bold">Facturas recientes</h2>
          <DataTable
            data={validInvoices.slice(0, 12)}
            columns={[
              { header: 'Numero', accessorKey: 'number' },
              { header: 'Cliente', accessorKey: 'customerName' },
              { header: 'Fecha', cell: ({ row }) => formatDate(row.original.issueDate || row.original.issuedAt || row.original.createdAt) },
              { header: 'Total', cell: ({ row }) => currency.format(row.original.totals?.total || 0) },
            ]}
          />
        </div>
        <div className="panel rounded-lg p-5">
          <h2 className="font-display text-xl font-bold">Alertas de inventario</h2>
          <DataTable
            data={lowStock.slice(0, 12)}
            columns={[
              { header: 'Producto', accessorKey: 'name' },
              { header: 'Código', accessorKey: 'sku' },
              { header: 'Stock', cell: ({ row }) => row.original.stock || 0 },
              { header: 'Mínimo', cell: ({ row }) => row.original.stockMin || 0 },
            ]}
          />
        </div>
      </section>
    </div>
  )
}

function SummaryLine({ icon: Icon, title, value, detail }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold text-white/70"><Icon size={17} /> {title}</p>
        <p className="mt-1 text-xs text-white/40">{detail}</p>
      </div>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  )
}

function sumTotals(invoices, key) {
  return invoices.reduce((sum, item) => sum + Number(item.totals?.[key] || 0), 0)
}

function buildTopProducts(invoices) {
  const map = new Map()
  invoices.forEach((invoice) => {
    ;(invoice.items || []).forEach((item) => {
      const current = map.get(item.name) || { name: item.name, quantity: 0, total: 0 }
      current.quantity += Number(item.quantity || 0)
      current.total += Number(item.net || 0) + Number(item.tax || 0)
      map.set(item.name, current)
    })
  })
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}
