import { useMemo, useState } from 'react'
import { Barcode, Boxes, CheckCircle2, Download, Eye, ImagePlus, Loader2, PackagePlus, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Bar } from 'react-chartjs-2'
import { DataTable } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useConfirm } from '../../hooks/useConfirm'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { currency } from '../../lib/formatters'

const emptyProduct = {
  name: '',
  sku: '',
  barcode: '',
  category: 'Celulares',
  brand: '',
  model: '',
  color: '',
  capacity: '',
  cost: 0,
  price: 0,
  wholesalePrice: 0,
  technicianPrice: 0,
  specialPrice: 0,
  usdPrice: 0,
  taxStatus: 'taxed',
  unit: 'Unidad',
  stock: 0,
  initialStock: 0,
  stockMin: 1,
  stockMax: 0,
  location: '',
  supplierId: 'no-supplier',
  warrantyMonths: 0,
  requiresSerial: false,
  serialsText: '',
  description: '',
  status: 'Activo',
  image: '',
}

export function Inventory() {
  const toast = useToast()
  const { confirmState, ask, close } = useConfirm()
  const products = useERPStore((state) => state.products)
  const categories = useERPStore((state) => state.categories)
  const suppliers = useERPStore((state) => state.suppliers)
  const movements = useERPStore((state) => state.inventoryMovements)
  const upsertProduct = useERPStore((state) => state.upsertProduct)
  const deleteProduct = useERPStore((state) => state.deleteProduct)
  const restoreProduct = useERPStore((state) => state.restoreProduct)
  const adjustInventory = useERPStore((state) => state.adjustInventory)
  const updateCategories = useERPStore((state) => state.updateCategories)
  const [filters, setFilters] = useState({ query: '', category: 'all', brand: 'all', tax: 'all', status: 'active', low: false })
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [saving, setSaving] = useState(false)
  const [adjust, setAdjust] = useState({ type: 'incremento', quantity: 1, reason: 'Conteo fisico', note: '' })
  const brands = [...new Set(products.map((item) => item.brand).filter(Boolean))]
  const activeProducts = products.filter((item) => !item.deletedAt && item.status !== 'Eliminado')
  const deletedProducts = products.filter((item) => item.deletedAt || item.status === 'Eliminado')
  const inventoryValue = activeProducts.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.stock || 0), 0)
  const lowStock = activeProducts.filter((item) => Number(item.stock || 0) <= Number(item.stockMin || 0))

  const filtered = useMemo(() => products.filter((item) => {
    const q = filters.query.trim().toLowerCase()
    const text = `${item.name} ${item.sku} ${item.barcode} ${item.model} ${item.brand} ${item.color} ${(item.serials || []).join(' ')}`.toLowerCase()
    const isDeleted = Boolean(item.deletedAt) || item.status === 'Eliminado'
    return (!q || text.includes(q))
      && (filters.category === 'all' || item.category === filters.category)
      && (filters.brand === 'all' || item.brand === filters.brand)
      && (filters.tax === 'all' || item.taxStatus === filters.tax)
      && (filters.status === 'all' || (filters.status === 'active' ? !isDeleted : isDeleted))
      && (!filters.low || Number(item.stock || 0) <= Number(item.stockMin || 0))
  }), [filters, products])

  async function saveProduct(product) {
    const validation = validateProduct(product)
    if (validation) {
      toast.error(validation)
      return
    }
    setSaving(true)
    try {
      if (product.category && !categories.includes(product.category)) updateCategories([...categories, product.category])
      const saved = upsertProduct(product)
      toast.success(saved.id === product.id ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.')
      setEditing(null)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeProduct(product) {
    const ok = await ask({
      title: `Eliminar producto ${product.sku || ''}`,
      description: 'El producto se ocultara del inventario activo, pero queda en auditoria para recuperar historial.',
      body: `${product.name} quedara marcado como eliminado. Las facturas y movimientos asociados no se destruyen.`,
      danger: true,
    })
    if (!ok) return
    try {
      deleteProduct(product.id, 'Soft delete desde inventario')
      toast.success('Producto eliminado del inventario activo.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function restore(product) {
    try {
      restoreProduct(product.id)
      toast.success('Producto restaurado correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function saveAdjust() {
    try {
      adjustInventory({ productId: adjusting.id, ...adjust, reason: `${adjust.reason}: ${adjust.note || adjust.reason}` })
      toast.success('Ajuste registrado correctamente.')
      setAdjusting(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function exportInventory() {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(filtered), 'Inventario')
    XLSX.writeFile(book, 'trifusion-inventario.xlsx')
  }

  const columns = [
    { header: 'Producto', cell: ({ row }) => <ProductIdentity product={row.original} /> },
    { header: 'Categoria', accessorKey: 'category' },
    { header: 'Marca / Modelo', cell: ({ row }) => `${row.original.brand || '-'} ${row.original.model || ''}` },
    { header: 'Precio', cell: ({ row }) => currency.format(row.original.price) },
    { header: 'Stock', cell: ({ row }) => <StockBadge product={row.original} /> },
    { header: 'ITBIS', cell: ({ row }) => row.original.taxStatus === 'taxed' ? '18%' : row.original.taxStatus },
    { header: 'Estado', cell: ({ row }) => <StatusBadge product={row.original} /> },
    { header: 'Acciones', cell: ({ row }) => <ProductActions product={row.original} onView={setViewing} onEdit={setEditing} onAdjust={setAdjusting} onDelete={removeProduct} onRestore={restore} /> },
  ]

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InventoryMetric title="Productos activos" value={activeProducts.length} detail={`${deletedProducts.length} eliminados recuperables`} />
        <InventoryMetric title="Valor inventario" value={currency.format(inventoryValue)} detail="Costo x stock disponible" />
        <InventoryMetric title="Stock bajo" value={lowStock.length} detail="Productos que requieren reposicion" tone="danger" />
        <InventoryMetric title="Serializados" value={activeProducts.filter((item) => item.requiresSerial).length} detail="IMEI / serial controlado" />
      </section>

      <section className="module-surface p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-blue-200/80"><Boxes size={14} /> Inventario avanzado</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Productos, stock, seriales e IMEI</h2>
            <p className="mt-1 max-w-3xl text-sm text-white/45">Crear, editar, eliminar, restaurar y auditar productos sin romper ventas ni movimientos existentes.</p>
          </div>
          <div className="toolbar-grid w-full 2xl:max-w-6xl">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <Search size={16} className="text-white/35" />
              <input value={filters.query} onChange={(e) => setFilters((s) => ({ ...s, query: e.target.value }))} placeholder="Nombre, SKU, codigo, IMEI, serial, marca" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <select value={filters.category} onChange={(e) => setFilters((s) => ({ ...s, category: e.target.value }))} className="input-dark"><option value="all">Todas las categorias</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={filters.brand} onChange={(e) => setFilters((s) => ({ ...s, brand: e.target.value }))} className="input-dark"><option value="all">Todas las marcas</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
            <select value={filters.tax} onChange={(e) => setFilters((s) => ({ ...s, tax: e.target.value }))} className="input-dark"><option value="all">ITBIS todos</option><option value="taxed">Con ITBIS</option><option value="no_tax">Sin ITBIS</option><option value="exempt">Exento</option></select>
            <select value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))} className="input-dark"><option value="active">Activos</option><option value="deleted">Eliminados</option><option value="all">Todos</option></select>
            <Button variant={filters.low ? 'danger' : 'ghost'} onClick={() => setFilters((s) => ({ ...s, low: !s.low }))}>Stock bajo</Button>
            <Button icon={Download} variant="ghost" onClick={exportInventory}>Excel</Button>
            <Button icon={Plus} onClick={() => setEditing({ ...emptyProduct })}>Nuevo producto</Button>
          </div>
        </div>
        <DataTable data={filtered} columns={columns} emptyText="No hay productos con esos filtros." />
      </section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Editar producto' : 'Crear producto'} description="Formulario organizado por secciones, con validacion visible y stock inicial." size="full">
        {editing ? <ProductForm product={editing} categories={categories} suppliers={suppliers} onSave={saveProduct} saving={saving} /> : null}
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Detalle de producto" size="xl">
        {viewing ? <ProductDetail product={viewing} movements={movements.filter((item) => item.productId === viewing.id)} /> : null}
      </Modal>

      <Modal open={Boolean(adjusting)} onClose={() => setAdjusting(null)} title={`Ajustar stock: ${adjusting?.name || ''}`} size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdjusting(null)}>Cancelar</Button><Button variant="success" onClick={saveAdjust}>Guardar ajuste</Button></div>}>
        <div className="grid gap-3 md:grid-cols-2">
          <label><span className="label-dark">Tipo</span><select value={adjust.type} onChange={(e) => setAdjust((s) => ({ ...s, type: e.target.value }))} className="input-dark"><option value="incremento">Incremento</option><option value="decremento">Decremento</option></select></label>
          <label><span className="label-dark">Cantidad</span><input type="number" min="1" value={adjust.quantity} onChange={(e) => setAdjust((s) => ({ ...s, quantity: Number(e.target.value) }))} className="input-dark" /></label>
          <label><span className="label-dark">Motivo</span><select value={adjust.reason} onChange={(e) => setAdjust((s) => ({ ...s, reason: e.target.value }))} className="input-dark"><option>Conteo fisico</option><option>Merma</option><option>Daño</option><option>Robo</option><option>Error administrativo</option><option>Otro</option></select></label>
          <label><span className="label-dark">Nota</span><input value={adjust.note} onChange={(e) => setAdjust((s) => ({ ...s, note: e.target.value }))} className="input-dark" /></label>
        </div>
      </Modal>
      <ConfirmDialog state={confirmState} onClose={close} />
    </div>
  )
}

function ProductForm({ product, categories, suppliers, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({
    ...emptyProduct,
    ...product,
    initialStock: product.id ? Number(product.stock || 0) : Number(product.initialStock || product.stock || 0),
    serialsText: product.serialsText || (product.serials || []).join('\n'),
  }))
  const [touched, setTouched] = useState(false)
  const errors = getProductErrors(draft)
  const margin = Number(draft.price) ? ((Number(draft.price) - Number(draft.cost || 0)) / Number(draft.price)) * 100 : 0
  const set = (key, value) => setDraft((state) => ({ ...state, [key]: value }))
  const submit = () => {
    setTouched(true)
    if (Object.keys(errors).length) return
    onSave({ ...draft, stock: draft.id ? draft.stock : draft.initialStock })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <FormSection title="Informacion basica" detail="Nombre, descripcion, categoria y marca del producto.">
          <Field label="Nombre *" error={touched && errors.name}><input value={draft.name} onChange={(e) => set('name', e.target.value)} className="input-dark" placeholder="Ej. iPhone 15 Pro 256GB" /></Field>
          <Field label="Categoria *" error={touched && errors.category}>
            <input list="category-options" value={draft.category} onChange={(e) => set('category', e.target.value)} className="input-dark" placeholder="Categoria" />
            <datalist id="category-options">{categories.map((item) => <option key={item} value={item} />)}</datalist>
          </Field>
          <Field label="Marca"><input value={draft.brand} onChange={(e) => set('brand', e.target.value)} className="input-dark" placeholder="Apple, Samsung, Lenovo..." /></Field>
          <Field label="Modelo"><input value={draft.model} onChange={(e) => set('model', e.target.value)} className="input-dark" /></Field>
          <Field label="Descripcion" wide><textarea value={draft.description} onChange={(e) => set('description', e.target.value)} className="input-dark min-h-24" /></Field>
        </FormSection>

        <FormSection title="Codigos e identificacion" detail="SKU, codigo de barra, variantes y ubicacion fisica.">
          <Field label="SKU / Codigo interno"><input value={draft.sku} onChange={(e) => set('sku', e.target.value)} className="input-dark" placeholder="Autogenerado si lo dejas vacio" /></Field>
          <Field label="Codigo de barras"><input value={draft.barcode} onChange={(e) => set('barcode', e.target.value)} className="input-dark" /></Field>
          <Field label="Color"><input value={draft.color} onChange={(e) => set('color', e.target.value)} className="input-dark" /></Field>
          <Field label="Capacidad / talla"><input value={draft.capacity} onChange={(e) => set('capacity', e.target.value)} className="input-dark" /></Field>
          <Field label="Ubicacion"><input value={draft.location} onChange={(e) => set('location', e.target.value)} className="input-dark" placeholder="A1, vitrina, almacen..." /></Field>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-white/45"><Barcode size={14} /> Vista codigo</p>
            <p className="mt-2 rounded bg-white px-3 py-2 font-mono text-sm font-bold tracking-wide text-black">{draft.barcode || draft.sku || 'SIN-CODIGO'}</p>
          </div>
        </FormSection>

        <FormSection title={`Precios y margen ${Number.isFinite(margin) ? margin.toFixed(1) : '0.0'}%`} detail="Costo, precio de venta y listas comerciales.">
          <Field label="Costo compra *" error={touched && errors.cost}><NumberInput value={draft.cost} onChange={(value) => set('cost', value)} /></Field>
          <Field label="Precio venta *" error={touched && errors.price}><NumberInput value={draft.price} onChange={(value) => set('price', value)} /></Field>
          <Field label="Precio mayor"><NumberInput value={draft.wholesalePrice} onChange={(value) => set('wholesalePrice', value)} /></Field>
          <Field label="Precio tecnico"><NumberInput value={draft.technicianPrice} onChange={(value) => set('technicianPrice', value)} /></Field>
          <Field label="Precio especial"><NumberInput value={draft.specialPrice} onChange={(value) => set('specialPrice', value)} /></Field>
          <Field label="Precio USD"><NumberInput value={draft.usdPrice} onChange={(value) => set('usdPrice', value)} /></Field>
        </FormSection>

        <FormSection title="Inventario, seriales e IMEI" detail="Stock inicial, alertas, unidad y control serializado.">
          <Field label={draft.id ? 'Stock actual' : 'Stock inicial'}><NumberInput value={draft.id ? draft.stock : draft.initialStock} onChange={(value) => draft.id ? set('stock', value) : set('initialStock', value)} /></Field>
          <Field label="Stock minimo"><NumberInput value={draft.stockMin} onChange={(value) => set('stockMin', value)} /></Field>
          <Field label="Stock maximo"><NumberInput value={draft.stockMax} onChange={(value) => set('stockMax', value)} /></Field>
          <Field label="Unidad"><select value={draft.unit} onChange={(e) => set('unit', e.target.value)} className="input-dark"><option>Unidad</option><option>Caja</option><option>Kit</option><option>Par</option><option>Yarda</option><option>Metro</option></select></Field>
          <Field label="ITBIS"><select value={draft.taxStatus} onChange={(e) => set('taxStatus', e.target.value)} className="input-dark"><option value="taxed">Con ITBIS</option><option value="no_tax">Sin ITBIS</option><option value="exempt">Exento</option></select></Field>
          <Field label="Proveedor"><select value={draft.supplierId} onChange={(e) => set('supplierId', e.target.value)} className="input-dark">{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm font-bold text-white/70">
            <input type="checkbox" checked={draft.requiresSerial} onChange={(e) => set('requiresSerial', e.target.checked)} />
            Maneja serial / IMEI
          </label>
          <Field label="Seriales / IMEI" wide error={touched && errors.serialsText}><textarea value={draft.serialsText} onChange={(e) => set('serialsText', e.target.value)} className="input-dark min-h-28" placeholder="Uno por linea o separado por coma" /></Field>
        </FormSection>
      </div>

      <aside className="panel h-fit rounded-lg p-4 xl:sticky xl:top-24">
        <div className="grid h-36 place-items-center rounded-lg border border-dashed border-white/15 bg-white/[0.025] text-center text-white/45">
          <div>
            <ImagePlus className="mx-auto mb-2" />
            <p className="text-sm font-bold">Foto del producto</p>
            <p className="text-xs">Campo preparado para imagen/URL</p>
          </div>
        </div>
        <Field label="URL imagen"><input value={draft.image || ''} onChange={(e) => set('image', e.target.value)} className="input-dark" /></Field>
        <div className="mt-4 space-y-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm">
          <PreviewLine label="SKU" value={draft.sku || 'Autogenerado'} />
          <PreviewLine label="Precio" value={currency.format(Number(draft.price || 0))} />
          <PreviewLine label="Costo" value={currency.format(Number(draft.cost || 0))} />
          <PreviewLine label="Stock" value={draft.id ? draft.stock : draft.initialStock} />
          <PreviewLine label="Margen" value={`${Number.isFinite(margin) ? margin.toFixed(1) : '0.0'}%`} />
        </div>
        {touched && Object.keys(errors).length ? (
          <div className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
            {Object.values(errors).map((error) => <p key={error}>{error}</p>)}
          </div>
        ) : (
          <div className="mt-4 flex gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            <CheckCircle2 size={18} className="shrink-0" />
            <p>Completa nombre y precio de venta para guardar. El SKU puede autogenerarse.</p>
          </div>
        )}
        <Button className="mt-4 w-full py-3" icon={saving ? Loader2 : PackagePlus} disabled={saving} onClick={submit}>
          {saving ? 'Guardando...' : draft.id ? 'Actualizar producto' : 'Crear producto'}
        </Button>
      </aside>
    </div>
  )
}

function ProductDetail({ product, movements }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <div className="space-y-3 text-sm">
        <ProductIdentity product={product} large />
        <p className={product.stock <= product.stockMin ? 'rounded-lg bg-red-500/10 p-3 text-red-200' : 'rounded-lg bg-emerald-500/10 p-3 text-emerald-200'}>Stock actual: {product.stock}</p>
        {['sku', 'barcode', 'category', 'brand', 'model', 'location', 'unit', 'taxStatus', 'status'].map((key) => <p key={key} className="rounded-lg bg-white/[0.035] p-2"><b>{key}:</b> {String(product[key] || '-')}</p>)}
      </div>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SerialBox title="Disponibles" items={product.serials || []} />
          <SerialBox title="Vendidos" items={(product.soldSerials || []).map((s) => s.serial || s)} />
          <SerialBox title="Dañados" items={product.damagedSerials || []} />
        </div>
        <div className="h-52 rounded-lg border border-white/10 p-3">
          <Bar data={{ labels: movements.slice(0, 12).map((m) => m.date), datasets: [{ label: 'Movimientos', data: movements.slice(0, 12).map((m) => m.quantity), backgroundColor: '#3B82F6' }] }} options={{ maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }} />
        </div>
      </div>
    </div>
  )
}

function ProductIdentity({ product, large }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`${large ? 'h-16 w-16' : 'h-11 w-11'} grid shrink-0 place-items-center rounded-lg bg-blue-500/15 text-blue-100`}>
        {product.image ? <img src={product.image} alt="" className="h-full w-full rounded-lg object-cover" /> : <Boxes size={large ? 28 : 20} />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold text-white">{product.name}</p>
        <p className="truncate text-xs text-white/45">{product.sku || 'Sin SKU'} · {product.barcode || 'Sin barcode'}</p>
      </div>
    </div>
  )
}

function ProductActions({ product, onView, onEdit, onAdjust, onDelete, onRestore }) {
  const deleted = Boolean(product.deletedAt) || product.status === 'Eliminado'
  return (
    <div className="action-cluster">
      <Icon icon={Eye} label="Ver" onClick={() => onView(product)} />
      {!deleted ? <Icon icon={Pencil} label="Editar" onClick={() => onEdit(product)} /> : null}
      {!deleted ? <Icon icon={SlidersHorizontal} label="Stock" onClick={() => onAdjust(product)} /> : null}
      {deleted ? <Icon icon={RotateCcw} label="Restaurar" onClick={() => onRestore(product)} /> : <Icon icon={Trash2} label="Eliminar" danger onClick={() => onDelete(product)} />}
    </div>
  )
}

function InventoryMetric({ title, value, detail, tone }) {
  return <div className={`rounded-lg border p-4 ${tone === 'danger' ? 'border-red-400/20 bg-red-500/10' : 'border-white/10 bg-white/[0.04]'}`}><p className="text-xs font-extrabold uppercase text-white/40">{title}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-white/45">{detail}</p></div>
}
function StockBadge({ product }) {
  const low = Number(product.stock || 0) <= Number(product.stockMin || 0)
  if (Number(product.stock || 0) <= 0) return <span className="rounded bg-white/10 px-2 py-1 font-bold text-white/45">Sin stock</span>
  return <span className={low ? 'rounded bg-red-500/15 px-2 py-1 font-bold text-red-200' : 'rounded bg-emerald-500/15 px-2 py-1 font-bold text-emerald-200'}>{product.stock}</span>
}
function StatusBadge({ product }) {
  const deleted = Boolean(product.deletedAt) || product.status === 'Eliminado'
  return <span className={deleted ? 'rounded bg-red-500/15 px-2 py-1 text-xs font-bold text-red-200' : 'rounded bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-200'}>{deleted ? 'Eliminado' : product.status || 'Activo'}</span>
}
function FormSection({ title, detail, children }) {
  return <section className="rounded-lg border border-white/10 bg-white/[0.025] p-4"><div className="mb-4"><h3 className="font-display text-lg font-bold">{title}</h3><p className="text-sm text-white/45">{detail}</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div></section>
}
function Field({ label, children, error, wide }) {
  return <label className={wide ? 'md:col-span-2 xl:col-span-3' : ''}><span className="label-dark">{label}</span>{children}{error ? <span className="mt-1 block text-xs font-bold text-red-300">{error}</span> : null}</label>
}
function NumberInput({ value, onChange }) {
  return <input type="number" min="0" step="0.01" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value))} className="input-dark" />
}
function PreviewLine({ label, value }) {
  return <div className="flex justify-between gap-3"><span className="text-white/45">{label}</span><b className="text-white">{value}</b></div>
}
function Icon({ icon: IconSvg, onClick, label, danger }) {
  return <button type="button" title={label} onClick={onClick} className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border p-2 ${danger ? 'border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/20' : 'border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/[0.08]'}`}><IconSvg size={15} /></button>
}
function SerialBox({ title, items }) {
  return <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3"><p className="font-bold">{title}</p><div className="premium-scroll mt-2 max-h-32 overflow-auto text-xs text-white/50">{items.length ? items.map((item, index) => <p key={`${item}-${index}`}>{item}</p>) : 'Sin registros'}</div></div>
}
function validateProduct(product) {
  const errors = getProductErrors(product)
  return Object.values(errors)[0] || ''
}
function getProductErrors(product) {
  const errors = {}
  const stock = Number(product.id ? product.stock : product.initialStock)
  const serials = String(product.serialsText || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
  if (!product.name?.trim() || product.name.trim().length < 2) errors.name = 'El nombre debe tener minimo 2 caracteres.'
  if (!product.category?.trim()) errors.category = 'La categoria es obligatoria.'
  if (Number(product.cost || 0) < 0) errors.cost = 'El costo no puede ser negativo.'
  if (Number(product.price || 0) <= 0) errors.price = 'El precio de venta debe ser mayor que cero.'
  if (product.requiresSerial && stock > 0 && serials.length !== stock) errors.serialsText = `Registra ${stock} serial(es)/IMEI o cambia el stock.`
  return errors
}
