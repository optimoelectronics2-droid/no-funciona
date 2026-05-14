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
import { startErpRealtimeSync } from './services/realtimeSync'

export default function App() {
  const setCommandOpen = useERPStore((state) => state.setCommandOpen)
  const syncStatus = useERPStore((state) => state.syncStatus)
  const syncError = useERPStore((state) => state.syncError)
  const [authState, setAuthState] = useState({ loading: true, user: null })
  useEffect(() => onAuthStateChanged(auth, (user) => setAuthState({ loading: false, user })), [])
  useEffect(() => {
    if (authState.loading) return undefined
    return startErpRealtimeSync(authState.user)
  }, [authState.loading, authState.user])
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
      {syncStatus === 'connecting' || syncStatus === 'uploading' ? <div className="fixed right-4 top-4 z-50 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs font-bold text-white/70">Sincronizando datos...</div> : null}
      {syncStatus === 'error' ? <div className="fixed right-4 top-4 z-50 max-w-md rounded-lg border border-red-400/30 bg-red-950/90 px-3 py-2 text-xs font-bold text-red-100 shadow-2xl">Error de sincronizacion: {syncError}</div> : null}
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
