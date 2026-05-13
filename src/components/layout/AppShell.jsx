import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  BarChart3,
  Boxes,
  Calculator,
  CircleDollarSign,
  Command,
  FilePlus2,
  FileText,
  Gauge,
  Menu,
  PackagePlus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { auth } from '../../lib/firebase'
import { useERPStore } from '../../store/useERPStore'
import { Button } from '../ui/Button'

const navGroups = [
  {
    label: 'Operaciones',
    items: [
      { to: '/', label: 'Dashboard', icon: Gauge },
      { to: '/pos', label: 'POS rapido', icon: ShoppingCart },
      { to: '/facturacion', label: 'Facturas', icon: ReceiptText },
      { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { to: '/inventario', label: 'Inventario', icon: Boxes },
      { to: '/inventario/entradas', label: 'Entradas', icon: PackagePlus },
    ],
  },
  {
    label: 'Clientes y finanzas',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/cxc', label: 'Cuentas por cobrar', icon: Wallet },
      { to: '/caja', label: 'Caja y arqueo', icon: Calculator },
    ],
  },
  {
    label: 'Control',
    items: [
      { to: '/servicio', label: 'Servicio tecnico', icon: Wrench },
      { to: '/fiscal', label: 'Fiscal DGII', icon: ShieldCheck },
      { to: '/reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
  {
    label: 'Sistema',
    items: [{ to: '/configuracion', label: 'Configuracion', icon: Settings }],
  },
]

const flatNav = navGroups.flatMap((group) => group.items)
const mobileNav = [
  flatNav.find((item) => item.to === '/'),
  flatNav.find((item) => item.to === '/pos'),
  flatNav.find((item) => item.to === '/facturacion'),
  flatNav.find((item) => item.to === '/inventario'),
  flatNav.find((item) => item.to === '/reportes'),
].filter(Boolean)

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const setCommandOpen = useERPStore((state) => state.setCommandOpen)
  const company = useERPStore((state) => state.company)
  const cash = useERPStore((state) => state.cashRegister)

  return (
    <div className="h-screen overflow-hidden bg-[#0A0A0F] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,.16),transparent_30%),radial-gradient(circle_at_84%_18%,rgba(16,185,129,.10),transparent_28%)]" />

      <aside className="erp-sidebar no-print group fixed inset-y-0 left-0 z-40 hidden w-20 border-r border-white/10 bg-[#0b0b11]/95 backdrop-blur-xl transition-[width,box-shadow] duration-300 hover:w-72 hover:shadow-2xl hover:shadow-black/40 md:block">
        <div className="flex h-full flex-col p-3">
          <button onClick={() => navigate('/configuracion')} className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-left hover:bg-white/[0.05]">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-500 font-display text-xl font-extrabold shadow-lg shadow-blue-500/25">{company.name ? company.name[0] : 'T'}</div>
            <div className="min-w-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <p className="truncate font-display text-sm font-bold leading-5">{company.name || 'Configurar empresa'}</p>
              <p className="text-[10px] font-bold uppercase text-white/38">Fiscal ERP</p>
            </div>
          </button>

          <div className="mt-4 grid gap-2 group-hover:grid-cols-2">
            <button onClick={() => navigate('/facturacion/nueva')} title="Facturar" className="grid h-11 place-items-center rounded-lg border border-blue-400/25 bg-blue-500/15 text-sm font-extrabold text-blue-100 transition hover:bg-blue-500/25">
              <FilePlus2 className="group-hover:hidden" size={18} />
              <span className="hidden group-hover:inline">Facturar</span>
            </button>
            <button onClick={() => setCommandOpen(true)} title="Buscar" className="grid h-11 place-items-center rounded-lg border border-white/10 bg-white/[0.045] text-sm font-extrabold text-white/70 transition hover:bg-white/[0.08]">
              <Search className="group-hover:hidden" size={18} />
              <span className="hidden group-hover:inline">Buscar</span>
            </button>
          </div>

          <nav className="premium-scroll mt-4 flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="my-2 border-t border-white/10 group-hover:hidden" />
                <p className="mb-1 hidden px-3 text-[10px] font-extrabold uppercase tracking-widest text-white/28 group-hover:block">{group.label}</p>
                <div className="grid gap-1">
                  {group.items.map((item) => <NavItem key={item.to} item={item} />)}
                </div>
              </div>
            ))}
          </nav>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-2 text-emerald-200">
              <CircleDollarSign size={18} />
              <span className="hidden truncate text-sm font-bold group-hover:inline">Caja {cash.status}</span>
            </div>
            <p className="mt-1 hidden truncate text-xs text-white/45 group-hover:block">{company.rnc || 'Sin RNC'} · {company.city || 'Configure ubicacion'}</p>
            <button onClick={() => signOut(auth)} className="mt-3 hidden text-xs font-bold text-red-200 group-hover:block">Cerrar sesion</button>
          </div>
        </div>
      </aside>

      <main className="flex h-screen flex-col overflow-hidden md:pl-20">
        <header className="no-print z-20 h-[var(--header-h)] shrink-0 border-b border-white/10 bg-[#0A0A0F]/78 px-3 backdrop-blur-xl sm:px-4 lg:px-6">
          <div className="flex h-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" icon={Menu} className="px-3 md:hidden" onClick={() => setCommandOpen(true)} aria-label="Abrir busqueda" />
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold sm:text-xl">{titleFor(location.pathname)}</p>
                <p className="truncate text-xs text-white/45">Workspace ERP fiscal, retail e inventario</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <button onClick={() => setCommandOpen(true)} className="flex min-w-[260px] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-left text-sm text-white/45 xl:min-w-[340px]">
                <Search size={16} />Buscar cliente, factura, IMEI, modulo<span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/35">Ctrl K</span>
              </button>
              <Button variant="success" icon={FileText} onClick={() => navigate('/facturacion/nueva')}>Nueva factura</Button>
            </div>
          </div>
        </header>

        <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} className="premium-scroll flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1880px] p-3 pb-24 sm:p-4 lg:p-6">
            <Outlet />
          </div>
        </motion.div>
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#0A0A0F]/92 px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
        {mobileNav.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold ${isActive ? 'bg-blue-500 text-white' : 'text-white/50'}`} end={item.to === '/'}><item.icon size={17} /><span className="w-full truncate text-center">{mobileLabel(item.label)}</span></NavLink>)}
      </nav>

      <CommandPalette />
    </div>
  )
}

function NavItem({ item }) {
  return (
    <NavLink key={item.to} to={item.to} title={item.label} className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-bold transition ${isActive ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-white/58 hover:bg-white/[0.06] hover:text-white'}`} end={item.to === '/'}>
      <item.icon className="shrink-0" size={19} />
      <span className="hidden min-w-0 truncate group-hover:inline">{item.label}</span>
    </NavLink>
  )
}

function CommandPalette() {
  const navigate = useNavigate()
  const open = useERPStore((state) => state.commandOpen)
  const setOpen = useERPStore((state) => state.setCommandOpen)
  const commands = [
    ['Crear factura', '/facturacion/nueva'],
    ['Crear cotizacion', '/cotizaciones'],
    ['Registrar producto', '/inventario'],
    ['Entrada de mercancia', '/inventario/entradas'],
    ['Nuevo cliente', '/clientes'],
    ['Reportes', '/reportes'],
  ]
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] grid place-items-start bg-black/60 px-4 pt-20 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-white/10 bg-[#111118] p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-3 py-3"><Command size={18} className="text-blue-300" /><input autoFocus className="w-full bg-transparent text-sm outline-none placeholder:text-white/35" placeholder="Buscar comandos..." /></div>
        <div className="p-2 text-sm text-white/65">{commands.map(([label, path]) => <button key={path} onClick={() => { navigate(path); setOpen(false) }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/[0.06]">{label}</button>)}</div>
      </div>
    </div>
  )
}

function titleFor(pathname) {
  return flatNav.find((entry) => entry.to === pathname)?.label || (pathname === '/facturacion/nueva' ? 'Nueva factura' : 'Trifusion ERP')
}

function mobileLabel(label) {
  if (label.includes('POS')) return 'POS'
  if (label === 'Dashboard') return 'Inicio'
  if (label === 'Facturas') return 'Facturar'
  return label.split(' ')[0]
}
