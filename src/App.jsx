import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Route, Routes } from 'react-router-dom'
import { auth } from './lib/firebase'
import { AppShell } from './components/layout/AppShell'
import { ToastViewport } from './components/ui/Toast'
import { Dashboard } from './features/dashboard/Dashboard'
import { InvoiceForm } from './features/invoicing/InvoiceForm'
import { InvoiceList } from './features/invoicing/InvoiceList'
import { Inventory } from './features/inventory/Inventory'
import { ProductEntry } from './features/inventory/ProductEntry'
import { CRM } from './features/crm/CRM'
import { CashDesk } from './features/cash/CashDesk'
import { ServiceDesk } from './features/service/ServiceDesk'
import { Fiscal } from './features/fiscal/Fiscal'
import { Reports } from './features/reports/Reports'
import { SettingsPage } from './features/settings/SettingsPage'
import { QuoteList } from './features/quotes/QuoteList'
import { Receivables } from './features/receivables/Receivables'
import { AuthPage } from './features/auth/AuthPage'
import { useERPStore } from './store/useERPStore'

export default function App() {
  const setCommandOpen = useERPStore((state) => state.setCommandOpen)
  const [authState, setAuthState] = useState({ loading: true, user: null })
  useEffect(() => onAuthStateChanged(auth, (user) => setAuthState({ loading: false, user })), [])
  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCommandOpen])

  if (authState.loading) return <div className="grid min-h-screen place-items-center bg-[#0A0A0F] text-white">Cargando sesion...</div>
  if (!authState.user) return <><AuthPage /><ToastViewport /></>

  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="/pos" element={<InvoiceForm />} />
          <Route path="/facturacion" element={<InvoiceList />} />
          <Route path="/facturacion/nueva" element={<InvoiceForm />} />
          <Route path="/cotizaciones" element={<QuoteList />} />
          <Route path="/inventario" element={<Inventory />} />
          <Route path="/inventario/entradas" element={<ProductEntry />} />
          <Route path="/clientes" element={<CRM />} />
          <Route path="/cxc" element={<Receivables />} />
          <Route path="/caja" element={<CashDesk />} />
          <Route path="/servicio" element={<ServiceDesk />} />
          <Route path="/fiscal" element={<Fiscal />} />
          <Route path="/reportes" element={<Reports />} />
          <Route path="/configuracion" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastViewport />
    </>
  )
}
