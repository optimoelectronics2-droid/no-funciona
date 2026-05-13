import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { DataTable } from '../../components/ui/DataTable'
import { useERPStore } from '../../store/useERPStore'
import { currency, formatDate } from '../../lib/formatters'

export function CashDesk() {
  const cash = useERPStore((state) => state.cashRegister)
  const openCashRegister = useERPStore((state) => state.openCashRegister)
  const closeCashRegister = useERPStore((state) => state.closeCashRegister)
  const [amount, setAmount] = useState(cash.counted)
  const difference = Number(amount) - cash.expected
  return (
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <section className="panel rounded-lg p-5">
        <h2 className="font-display text-2xl font-bold">Caja y arqueo</h2>
        <p className="mt-1 text-sm text-white/45">No permitir facturar sin caja abierta esta activo.</p>
        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-bold uppercase text-white/40">Estado</p>
          <p className={cash.status === 'open' ? 'mt-2 text-3xl font-extrabold text-emerald-300' : 'mt-2 text-3xl font-extrabold text-red-300'}>{cash.status}</p>
          <p className="mt-2 text-sm text-white/50">Apertura: {formatDate(cash.openedAt)}</p>
        </div>
        <div className="mt-4 grid gap-2 text-sm">
          <Line label="Fondo inicial" value={cash.openingAmount} />
          <Line label="Esperado" value={cash.expected} />
          <Line label="Contado" value={amount} />
          <Line label="Diferencia" value={difference} />
        </div>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-4 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-3 outline-none" />
        <div className="mt-3 flex gap-2">
          <Button icon={Unlock} variant="success" onClick={() => openCashRegister(amount)}>Abrir</Button>
          <Button icon={Lock} variant="danger" onClick={() => closeCashRegister(amount)}>Cerrar</Button>
        </div>
      </section>
      <section className="panel rounded-lg p-5">
        <h3 className="font-display text-xl font-bold">Movimientos de caja</h3>
        <DataTable data={cash.movements} columns={[
          { header: 'Tipo', accessorKey: 'type' },
          { header: 'Metodo', accessorKey: 'method' },
          { header: 'Nota', accessorKey: 'note' },
          { header: 'Monto', cell: ({ row }) => currency.format(row.original.amount) },
        ]} />
      </section>
    </div>
  )
}

function Line({ label, value }) {
  return <div className="flex justify-between rounded-lg bg-white/[0.035] px-3 py-2"><span className="text-white/50">{label}</span><span className="font-bold">{currency.format(value)}</span></div>
}

