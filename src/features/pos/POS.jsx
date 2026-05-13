import { useMemo, useState } from 'react'
import { Download, Mail, Minus, Plus, Printer, ScanBarcode, Send, Trash2 } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { Button } from '../../components/ui/Button'
import { InvoicePreview } from '../../components/invoice/InvoicePreview'
import { useERPStore } from '../../store/useERPStore'
import { calculateInvoice, invoiceModes } from '../../lib/taxEngine'
import { currency } from '../../lib/formatters'

export function POS() {
  const products = useERPStore((state) => state.products)
  const customers = useERPStore((state) => state.customers)
  const company = useERPStore((state) => state.company)
  const createInvoice = useERPStore((state) => state.createInvoice)
  const [mode, setMode] = useState(invoiceModes.TAXED)
  const [query, setQuery] = useState('')
  const [customerId, setCustomerId] = useState(customers[0]?.id)
  const [paymentMethod, setPaymentMethod] = useState('Efectivo')
  const [cart, setCart] = useState([])
  const [lastInvoice, setLastInvoice] = useState(null)
  const customer = customers.find((item) => item.id === customerId)
  const totals = useMemo(() => calculateInvoice(cart, mode), [cart, mode])
  const filtered = products.filter((product) => `${product.name} ${product.sku} ${product.barcode}`.toLowerCase().includes(query.toLowerCase()))

  function addProduct(product) {
    const serial = product.requiresSerial ? product.serials[0] : ''
    setCart((items) => {
      const existing = items.find((item) => item.productId === product.id && !product.requiresSerial)
      if (existing) return items.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      return [
        ...items,
        { productId: product.id, name: product.name, quantity: 1, price: product.price, cost: product.cost, taxable: product.taxable, serial },
      ]
    })
  }

  function sell() {
    const invoice = createInvoice({ customer, mode, ncfType: 'B01', items: cart, paymentMethod, seller: 'Admin Trifusion' })
    setLastInvoice(invoice)
    setCart([])
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <section className="space-y-4">
        <div className="panel rounded-lg p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <ScanBarcode size={19} className="text-blue-300" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-white/35" placeholder="Escanea codigo de barras, SKU, IMEI o busca producto" />
            </div>
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="rounded-lg border border-white/10 bg-[#111118] px-3 py-3 text-sm font-bold outline-none">
              <option value={invoiceModes.TAXED}>Factura con ITBIS</option>
              <option value={invoiceModes.NO_TAX}>Factura sin ITBIS</option>
              <option value={invoiceModes.MIXED}>Factura mixta</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((product) => (
            <button key={product.id} onClick={() => addProduct(product)} className="panel rounded-lg p-4 text-left transition hover:border-blue-400/50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-white">{product.name}</p>
                  <p className="mt-1 text-xs text-white/45">{product.sku} · {product.location}</p>
                </div>
                <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-bold text-white/55">{product.stock}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-display text-xl font-bold">{currency.format(product.price)}</span>
                <span className={product.taxable ? 'text-xs font-bold text-blue-300' : 'text-xs font-bold text-emerald-300'}>{product.taxable ? 'ITBIS' : 'Exento'}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel rounded-lg p-4">
        <h2 className="font-display text-2xl font-bold">Venta mostrador</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="rounded-lg border border-white/10 bg-[#0d0e14] px-3 py-3 text-sm outline-none">
            {customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-lg border border-white/10 bg-[#0d0e14] px-3 py-3 text-sm outline-none">
            <option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Credito</option>
          </select>
        </div>
        <div className="premium-scroll mt-4 max-h-[340px] space-y-2 overflow-y-auto">
          {cart.map((item) => (
            <div key={`${item.productId}-${item.serial || 'bulk'}`} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{item.name}</p>
                  {item.serial ? <p className="text-xs text-blue-200">Serial/IMEI {item.serial}</p> : null}
                </div>
                <button onClick={() => setCart((items) => items.filter((i) => i !== item))} className="text-white/45 hover:text-red-300"><Trash2 size={16} /></button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button className="rounded bg-white/10 p-1" onClick={() => setCart((items) => items.map((i) => (i === item ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i)))}><Minus size={14} /></button>
                  <span className="w-8 text-center font-bold">{item.quantity}</span>
                  <button className="rounded bg-white/10 p-1" onClick={() => setCart((items) => items.map((i) => (i === item ? { ...i, quantity: i.quantity + 1 } : i)))}><Plus size={14} /></button>
                </div>
                <span className="font-bold">{currency.format(item.price * item.quantity)}</span>
              </div>
            </div>
          ))}
        </div>
        <Totals totals={totals} />
        <Button disabled={!cart.length} onClick={sell} className="mt-4 w-full py-3" icon={Send}>Facturar en menos de 30 segundos</Button>
        {lastInvoice ? (
          <div className="mt-5 space-y-3">
            <div className="flex gap-2">
              <Button variant="ghost" icon={Printer} onClick={() => window.print()}>Imprimir</Button>
              <Button variant="ghost" icon={Download} onClick={downloadPdf}>PDF</Button>
              <Button variant="ghost" icon={Mail} onClick={() => window.open(`mailto:?subject=Factura ${lastInvoice.number}`)}>Email</Button>
            </div>
            <InvoicePreview invoice={lastInvoice} company={company} customer={customer} />
          </div>
        ) : null}
      </section>
    </div>
  )
}

export function Invoicing() {
  return <POS />
}

function Totals({ totals }) {
  return (
    <div className="mt-5 space-y-2 rounded-lg border border-white/10 bg-black/20 p-4">
      <Row label="Subtotal gravado" value={totals.taxableSubtotal} />
      <Row label="Subtotal exento / sin ITBIS" value={totals.exemptSubtotal} />
      <Row label="ITBIS 18%" value={totals.itbis} />
      <Row label="Total" value={totals.total} strong />
    </div>
  )
}

function Row({ label, value, strong }) {
  return <div className={`flex justify-between ${strong ? 'text-xl font-extrabold text-white' : 'text-sm text-white/62'}`}><span>{label}</span><span>{currency.format(value)}</span></div>
}

async function downloadPdf() {
  const element = document.getElementById('invoice-preview')
  if (!element) return
  const canvas = await html2canvas(element, { scale: 2 })
  const pdf = new jsPDF('p', 'mm', 'letter')
  const image = canvas.toDataURL('image/png')
  pdf.addImage(image, 'PNG', 8, 8, 200, 0)
  pdf.save('factura-trifusion.pdf')
}

