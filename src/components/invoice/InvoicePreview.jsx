import QRCode from 'qrcode'
import { ExternalLink, Mail, MessageCircle, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { currency, formatDate } from '../../lib/formatters'
import { ncfTypes } from '../../lib/taxEngine'
import { Button } from '../ui/Button'

const WARRANTY_POLICY = `NOTA DE LA GARANTÍA

El daño del producto debe ser por un defecto de fabricación, falla técnica o irregularidad. No aplica garantía por daños ocasionados por el cliente, técnico, catástrofes naturales o problemas con voltajes (Equipos quemados).

ES OBLIGATORIO MOSTRAR LA FACTURA DE COMPRA Y LA CAJA PARA EXIGIR GARANTÍA.

El producto pierde la garantía si ha sido abierto o intentando ser reparado por el cliente.

La garantía va a variar dependiendo el producto, algunos productos no aplican garantía.

DEVOLUCIONES:

No hacemos devolución de dinero. El costo del equipo que se quiera devolver debe consumirse en cualquier equipo de nuestro inventario o se procederá a realizar una nota de crédito para consumo posterior.

Es indispensable presentar el comprobante de compra (Factura física o electrónica).

Es indispensable contar con el producto completo, tal y como fue entregado, es decir con todos sus elementos tales como: etiquetas, accesorios, empaques, manuales originales en buen estado y sin señal de uso.`
const INSTAGRAM_URL = 'https://www.instagram.com/trifusiontechnologies/'
const publicAsset = (path) => `${import.meta.env.BASE_URL}${path}`

export function InvoicePreview({ invoice, company, customer, format = 'letter', showActions = true, title = 'FACTURA' }) {
  const [qr, setQr] = useState('')
  const verification = useMemo(() => buildVerificationData(invoice, company), [company, invoice])
  useEffect(() => {
    if (!invoice) return
    let active = true
    QRCode.toDataURL(buildQrPayload(invoice, verification), {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 531,
      color: {
        dark: '#071A3F',
        light: '#FFFFFF',
      },
    }).then((value) => {
      if (active) setQr(value)
    })
    return () => {
      active = false
    }
  }, [invoice, verification])
  if (!invoice) return null
  if (format === 'ticket') return <TicketInvoice invoice={invoice} company={company} customer={customer} qr={qr} title={title} showActions={showActions} />
  return <LetterInvoice invoice={invoice} company={company} customer={customer} qr={qr} compact={format === 'half'} title={title} showActions={showActions} />
}

function LetterInvoice({ invoice, company, customer, qr, compact, title, showActions }) {
  const invoiceNumber = displayInvoiceNumber(invoice)
  const fiscalLabel = fiscalDocumentLabel(invoice)
  const customerDocument = customer?.rnc ? `RNC: ${customer.rnc}` : customer?.cedula ? `Cédula: ${customer.cedula}` : ''
  const emitted = isEmitted(invoice)

  return (
    <div className="space-y-3">
      {showActions ? <Actions invoice={invoice} customer={customer} company={company} /> : null}
      <div id="invoice-preview" className={`invoice-paper mx-auto rounded-sm p-8 text-[12.5px] leading-relaxed ${compact ? 'max-w-[720px]' : 'max-w-[816px]'}`}>
        <Header company={company} title={title} />
        <section className="mt-5 grid grid-cols-2 gap-5 border-y border-slate-300 py-4">
          <div>
            <p className="text-2xl font-extrabold tracking-tight text-slate-950">{title}</p>
            <p>No. {invoiceNumber}</p>
            <p>Fecha: {formatDate(invoice.issuedAt || invoice.createdAt || invoice.issueDate)}</p>
          </div>
          <div className="text-right">
            {invoice.ncf ? <p><b>NCF:</b> {invoice.ncf}</p> : null}
            {fiscalLabel ? <p><b>Comprobante:</b> {fiscalLabel}</p> : null}
            {invoice.dueDate ? <p><b>Vence:</b> {invoice.dueDate}</p> : null}
            <p><b>Estado:</b> {statusLabel(invoice.status)}</p>
          </div>
        </section>
        <section className="grid grid-cols-2 gap-5 border-b border-slate-300 py-4">
          <div>
            <p className="text-xs font-extrabold uppercase text-slate-500">Cliente</p>
            <p className="mt-1 text-lg font-extrabold text-slate-950">{customer?.name || invoice.customerName || 'Consumidor final'}</p>
            {customerDocument ? <p>{customerDocument}</p> : null}
            {customer?.address || customer?.fullAddress ? <p>{customer.address || customer.fullAddress}</p> : null}
            {customer?.phone || customer?.whatsapp ? <p>{customer.phone || customer.whatsapp}</p> : null}
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase text-slate-500">Resumen administrativo</p>
            <p><b>Vendedor:</b> {invoice.seller || 'Administrador'}</p>
            <p><b>Pago:</b> {(invoice.payments || []).map((payment) => payment.method).join(', ') || invoice.paymentMethod || 'N/A'}</p>
          </div>
        </section>
        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-950 text-left text-[11px] uppercase">
              <th className="py-2">#</th><th className="py-2">Descripción</th><th className="py-2 text-right">Cant</th><th className="py-2 text-right">Precio</th><th className="py-2 text-right">Desc.</th><th className="py-2 text-right">ITBIS</th><th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((item, index) => (
              <tr key={`${item.id || item.productId}-${index}`} className="border-b border-slate-200 align-top">
                <td className="py-2">{index + 1}</td>
                <td className="py-2">
                  <p className="font-bold text-slate-950">{item.name}</p>
                  {item.sku || item.model ? <p className="text-xs text-slate-500">{[item.sku, item.model].filter(Boolean).join(' · ')}</p> : null}
                  {(item.serials || (item.serial ? [item.serial] : [])).map((serial) => <p key={serial} className="text-xs text-slate-500">Serial: {serial}</p>)}
                  {!item.taxable ? <p className="text-xs text-slate-500">Exento de ITBIS</p> : null}
                </td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">{currency.format(item.price || 0)}</td>
                <td className="py-2 text-right">{Number(item.discount || 0) ? `${Number(item.discount || 0)}%` : '-'}</td>
                <td className="py-2 text-right">{currency.format(item.tax || 0)}</td>
                <td className="py-2 text-right font-bold">{currency.format((item.net || 0) + (item.tax || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="mt-5 grid grid-cols-[1fr_300px] gap-8">
          <div className="text-slate-600">
            {invoice.notesCustomer || company?.invoiceTerms ? <p>{invoice.notesCustomer || company.invoiceTerms}</p> : null}
          </div>
          <div className="space-y-1">
            <TotalLine label="Subtotal gravado" value={invoice.totals?.taxableSubtotal} />
            <TotalLine label="Subtotal exento" value={invoice.totals?.exemptSubtotal} />
            <TotalLine label="ITBIS 18%" value={invoice.totals?.itbis} />
            <TotalLine label="TOTAL" value={invoice.totals?.total} strong />
          </div>
        </section>
        <footer className="mt-8 grid grid-cols-[1fr_105mm] items-end gap-6 border-t border-slate-300 pt-4">
          <div className="whitespace-pre-line text-[9.5px] leading-snug text-slate-700">{WARRANTY_POLICY}</div>
          <div className="text-center text-xs">
            {emitted ? (
              <div className="invoice-validation-set mx-auto mb-2">
                <ValidationQr qr={qr} />
                <ValidationSeal />
              </div>
            ) : null}
            <div className="border-t border-slate-950 pt-2">Firma autorizada</div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function TicketInvoice({ invoice, company, customer, qr, title, showActions }) {
  const invoiceNumber = displayInvoiceNumber(invoice)
  return (
    <div className="space-y-3">
      {showActions ? <Actions invoice={invoice} customer={customer} company={company} /> : null}
      <div id="invoice-preview" className="invoice-paper mx-auto w-[302px] rounded-sm p-3 text-center font-mono text-[11px]">
        <p className="text-lg font-black">{company?.name || 'TRIFUSION TECHNOLOGIES'}</p>
        {company?.rnc ? <p>RNC: {company.rnc}</p> : null}
        {company?.address ? <p>{company.address}</p> : null}
        {company?.phone ? <p>Tel: {company.phone}</p> : null}
        <p>- - - - - - - - - - - - - - -</p>
        <p className="text-base font-black">{title}</p>
        <p className="font-bold">{invoiceNumber}</p>
        {invoice.ncf ? <p>NCF: {invoice.ncf}</p> : null}
        <p>{formatDate(invoice.issuedAt || invoice.createdAt)}</p>
        <p>Cliente: {customer?.name || invoice.customerName || 'Final'}</p>
        <p>- - - - - - - - - - - - - - -</p>
        {(invoice.items || []).map((item, index) => (
          <div key={`${item.productId}-${index}`} className="py-1 text-left">
            <p>{index + 1}. {item.name}</p>
            <p className="text-right">{item.quantity} x {currency.format(item.price)} = {currency.format((item.net || 0) + (item.tax || 0))}</p>
          </div>
        ))}
        <p>- - - - - - - - - - - - - - -</p>
        <p>SUBTOTAL {currency.format(invoice.totals?.subtotal || 0)}</p>
        <p>ITBIS {currency.format(invoice.totals?.itbis || 0)}</p>
        <p className="mt-1 text-xl font-black">TOTAL {currency.format(invoice.totals?.total || 0)}</p>
        {qr ? <img src={qr} alt="QR de validación" className="mx-auto mt-2 h-20 w-20" /> : null}
        <p className="mt-1 text-[9px]">Escanee el QR para validar</p>
        <p className="mt-2">TRIFUSION TECHNOLOGIES</p>
      </div>
    </div>
  )
}

function Header({ company, title }) {
  const logoUrl = company?.logoUrl || publicAsset('trifusion-logo.png')
  return (
    <header className="flex items-start gap-4">
      <div className="grid h-20 w-20 shrink-0 place-items-center rounded border border-slate-200 bg-black"><img src={logoUrl} alt="Logo Trifusion Technologies" className="h-full w-full object-contain" /></div>
      <div>
        <p className="text-2xl font-black tracking-tight text-slate-950">{company?.name || 'TRIFUSION TECHNOLOGIES'}</p>
        {company?.rnc ? <p>RNC: {company.rnc}</p> : null}
        {company?.address ? <p>{company.address}</p> : null}
        {company?.phone || company?.whatsapp ? <p>{[company?.phone && `Tel: ${company.phone}`, company?.whatsapp && `WA: ${company.whatsapp}`].filter(Boolean).join(' | ')}</p> : null}
        {company?.email ? <p>{company.email}</p> : null}
      </div>
      <p className="ml-auto text-xs font-bold uppercase tracking-widest text-slate-400">{title}</p>
    </header>
  )
}

function ValidationQr({ qr }) {
  return (
    <div className="invoice-qr-card" aria-label="Codigo QR de validacion de factura">
      {qr ? <img src={qr} width="531" height="531" alt="QR de validacion de factura" className="invoice-validation-qr" /> : null}
      <span className="text-[7px] font-black uppercase text-[#071a3f]">Validar QR</span>
    </div>
  )
}

function ValidationSeal() {
  return (
    <div className="invoice-validation" aria-label="Sello de validacion digital Trifusion Technologies">
      <img src={publicAsset('sello-real.png')} width="531" height="531" alt="Sello Trifusion Technologies" className="invoice-legal-stamp" />
    </div>
  )
}

function TotalLine({ label, value, strong }) {
  if (!Number(value || 0) && !strong) return null
  return <div className={`flex justify-between gap-3 ${strong ? 'border-t border-slate-950 pt-2 text-lg font-black text-slate-950' : 'text-slate-700'}`}><span>{label}</span><span>{currency.format(value || 0)}</span></div>
}

function Actions({ invoice, customer, company }) {
  const phone = sanitizePhone(customer?.whatsapp || customer?.phone || company?.whatsapp || company?.phone)
  const subject = `Factura ${displayInvoiceNumber(invoice)} - Trifusion Technologies`
  const body = `TRIFUSION TECHNOLOGIES\nFactura ${displayInvoiceNumber(invoice)}\nTotal: ${currency.format(invoice.totals?.total || 0)}`
  return (
    <div className="no-print flex flex-wrap justify-end gap-2">
      <Button variant="ghost" icon={Printer} onClick={printInvoice}>Imprimir / PDF</Button>
      <Button variant="ghost" icon={MessageCircle} onClick={() => phone && window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`)}>WhatsApp</Button>
      <Button variant="ghost" icon={Mail} onClick={() => window.location.href = `mailto:${customer?.email || company?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Correo</Button>
      <Button variant="ghost" icon={ExternalLink} onClick={() => window.open(INSTAGRAM_URL, '_blank')}>Instagram</Button>
    </div>
  )
}

function displayInvoiceNumber(invoice) {
  const number = String(invoice?.number || '')
  if (!number || number === 'SIN NCF') return 'BORRADOR'
  if (number.startsWith('SIN-NCF-')) return number.replace('SIN-NCF-', 'FAC-')
  return number
}

function fiscalDocumentLabel(invoice) {
  if (!invoice?.ncf || invoice?.ncfType === 'NO_FISCAL') return ''
  return ncfTypes[invoice.ncfType] || invoice.ncfType || ''
}

function statusLabel(status) {
  const map = { paid: 'PAGADA', credit: 'CRÉDITO', draft: 'BORRADOR', preview: 'VISTA PREVIA', voided: 'ANULADA' }
  return map[status] || String(status || 'EMITIDA').toUpperCase()
}

function buildVerificationData(invoice, company) {
  return {
    serial: invoice?.authenticationSerial || buildPreviewSerial(invoice),
    token: invoice?.verificationToken || buildVerificationToken(invoice, company),
  }
}

function buildQrPayload(invoice, verification) {
  return [
    'Factura legítima de Trifusion Technologies',
    'Documento validado digitalmente',
    'Código único de autenticación',
    `Serial: ${verification.serial}`,
    `Token: ${verification.token}`,
    `Factura: ${displayInvoiceNumber(invoice)}`,
  ].join('\n')
}

function buildVerificationToken(invoice, company) {
  const raw = `${company?.name || 'TRIFUSION'}|${displayInvoiceNumber(invoice)}|${invoice?.issuedAt || invoice?.createdAt || ''}|${invoice?.totals?.total || 0}`
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) hash = ((hash << 5) - hash + raw.charCodeAt(index)) | 0
  const value = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0')
  return `AUTH-${value.slice(0, 4)}-${value.slice(4, 8)}`
}

function buildPreviewSerial(invoice) {
  const raw = `${displayInvoiceNumber(invoice)}|${invoice?.createdAt || invoice?.issueDate || ''}|${invoice?.totals?.total || 0}`
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) hash = ((hash << 5) - hash + raw.charCodeAt(index)) | 0
  return `TFT-${new Date().getFullYear()}-${Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6)}`
}

function isEmitted(invoice) {
  return invoice?.status && !['draft', 'preview'].includes(invoice.status)
}

function sanitizePhone(phone = '') {
  return String(phone).replace(/[^\d]/g, '')
}

function printInvoice() {
  const currentTitle = document.title
  document.title = 'TRIFUSION TECHNOLOGIES'
  requestAnimationFrame(() => {
    window.print()
    setTimeout(() => {
      document.title = currentTitle
    }, 300)
  })
}
