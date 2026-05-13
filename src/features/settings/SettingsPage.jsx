import { useState } from 'react'
import { Building2, Save, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'

export function SettingsPage() {
  const toast = useToast()
  const company = useERPStore((state) => state.company)
  const branches = useERPStore((state) => state.branches)
  const suppliers = useERPStore((state) => state.suppliers)
  const categories = useERPStore((state) => state.categories)
  const taxSequences = useERPStore((state) => state.taxSequences)
  const auditLogs = useERPStore((state) => state.auditLogs)
  const updateSettings = useERPStore((state) => state.updateSettings)
  const updateCategories = useERPStore((state) => state.updateCategories)
  const updateExchangeRate = useERPStore((state) => state.updateExchangeRate)
  const upsertBranch = useERPStore((state) => state.upsertBranch)
  const upsertSupplier = useERPStore((state) => state.upsertSupplier)
  const updateTaxSequence = useERPStore((state) => state.updateTaxSequence)
  const [companyDraft, setCompanyDraft] = useState(company)
  const [branchDraft, setBranchDraft] = useState({ name: '', address: '', city: '', province: '', phone: '', warehouse: '', register: '' })
  const [supplierDraft, setSupplierDraft] = useState({ name: '', rnc: '', phone: '', email: '', active: true })
  const [categoryText, setCategoryText] = useState(categories.join(', '))

  function saveCompany() {
    try {
      updateSettings(companyDraft)
      updateExchangeRate(companyDraft.exchangeRate || 58.5)
      toast.success('Configuracion de empresa guardada.')
    } catch (error) {
      toast.error(error.message)
    }
  }
  function saveBranch() {
    try {
      if (!branchDraft.name.trim()) throw new Error('El nombre de la tienda/sucursal es obligatorio.')
      upsertBranch(branchDraft)
      setBranchDraft({ name: '', address: '', city: '', province: '', phone: '', warehouse: '', register: '' })
      toast.success('Tienda registrada correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }
  function saveSupplier() {
    try {
      if (!supplierDraft.name.trim()) throw new Error('El nombre del proveedor es obligatorio.')
      upsertSupplier(supplierDraft)
      setSupplierDraft({ name: '', rnc: '', phone: '', email: '', active: true })
      toast.success('Proveedor registrado correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel rounded-lg p-5">
        <div className="mb-4 flex items-center gap-3"><Building2 className="text-blue-300" /><div><h2 className="font-display text-2xl font-bold">Personalizacion inicial del sistema</h2><p className="text-sm text-white/45">Todo empieza vacio: registra empresa, tienda, secuencias, proveedores y categorias.</p></div></div>
        <div className="grid gap-3 md:grid-cols-4">
          {['name:Nombre empresa', 'rnc:RNC', 'address:Direccion', 'city:Ciudad', 'province:Provincia', 'phone:Telefono', 'whatsapp:WhatsApp', 'email:Email'].map((item) => {
            const [key, label] = item.split(':')
            return <Input key={key} label={label} value={companyDraft[key]} onChange={(value) => setCompanyDraft((state) => ({ ...state, [key]: value }))} />
          })}
          <Input type="number" label="Tasa USD" value={companyDraft.exchangeRate} onChange={(value) => setCompanyDraft((state) => ({ ...state, exchangeRate: Number(value) }))} />
          <Input type="number" label="Descuento max %" value={companyDraft.maxDiscountPercent} onChange={(value) => setCompanyDraft((state) => ({ ...state, maxDiscountPercent: Number(value) }))} />
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={companyDraft.requireOpenRegister} onChange={(e) => setCompanyDraft((state) => ({ ...state, requireOpenRegister: e.target.checked }))} /> Requerir caja abierta</label>
        </div>
        <div className="mt-4 flex justify-end"><Button icon={Save} onClick={saveCompany}>Guardar empresa</Button></div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel rounded-lg p-5">
          <h3 className="font-display text-xl font-bold">Registrar tienda / ubicacion</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {['name:Nombre tienda', 'address:Direccion', 'city:Ciudad', 'province:Provincia', 'phone:Telefono', 'warehouse:Almacen', 'register:Caja'].map((item) => { const [key, label] = item.split(':'); return <Input key={key} label={label} value={branchDraft[key]} onChange={(value) => setBranchDraft((state) => ({ ...state, [key]: value }))} /> })}
          </div>
          <Button className="mt-4" onClick={saveBranch}>Guardar tienda</Button>
          <List items={branches.map((branch) => `${branch.name} · ${branch.city || branch.address}`)} />
        </div>
        <div className="panel rounded-lg p-5">
          <h3 className="font-display text-xl font-bold">Registrar proveedor</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {['name:Nombre', 'rnc:RNC', 'phone:Telefono', 'email:Email'].map((item) => { const [key, label] = item.split(':'); return <Input key={key} label={label} value={supplierDraft[key]} onChange={(value) => setSupplierDraft((state) => ({ ...state, [key]: value }))} /> })}
          </div>
          <Button className="mt-4" onClick={saveSupplier}>Guardar proveedor</Button>
          <List items={suppliers.map((supplier) => supplier.name)} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel rounded-lg p-5">
          <h3 className="font-display text-xl font-bold">Categorias editables</h3>
          <textarea value={categoryText} onChange={(e) => setCategoryText(e.target.value)} className="input-dark mt-4 min-h-24" />
          <p className="mt-2 text-sm text-white/45">Separadas por coma. Se aplican en el proximo producto registrado.</p>
          <Button className="mt-4" onClick={() => { try { updateCategories(categoryText.split(',')); toast.success('Categorias guardadas.') } catch (error) { toast.error(error.message) } }}>Guardar categorias</Button>
        </div>
        <div className="panel rounded-lg p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><ShieldCheck className="text-emerald-300" /> Secuencias fiscales</h3>
          <div className="space-y-2">
            {taxSequences.map((sequence) => (
              <div key={sequence.id} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-2 md:grid-cols-5">
                <p className="font-bold">{sequence.id}</p>
                <input type="number" value={sequence.next} onChange={(e) => updateTaxSequence({ type: sequence.id, next: Number(e.target.value) })} className="input-dark" />
                <input type="number" value={sequence.limit} onChange={(e) => updateTaxSequence({ type: sequence.id, limit: Number(e.target.value) })} className="input-dark" />
                <input type="date" value={sequence.expiresAt} onChange={(e) => updateTaxSequence({ type: sequence.id, expiresAt: e.target.value })} className="input-dark" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sequence.enabled} onChange={(e) => updateTaxSequence({ type: sequence.id, enabled: e.target.checked })} /> Activa</label>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <h3 className="font-display text-xl font-bold">Auditoria reciente</h3>
        <div className="mt-3 grid gap-2">{auditLogs.slice(0, 8).map((log) => <div key={log.id} className="rounded-lg bg-white/[0.035] p-3 text-sm"><p className="font-bold">{log.action} · {log.module}</p><p className="text-white/45">{log.user} · {log.date}</p></div>)}</div>
      </section>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }) {
  return <label><span className="label-dark">{label}</span><input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-dark" /></label>
}
function List({ items }) {
  return <div className="mt-4 space-y-2">{items.map((item) => <p key={item} className="rounded-lg bg-white/[0.035] p-2 text-sm text-white/60">{item}</p>)}</div>
}
