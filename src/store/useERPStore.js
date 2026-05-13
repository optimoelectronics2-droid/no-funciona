import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { calculateInvoice, invoiceModes, nextNcf } from '../lib/taxEngine'
import { assertOpenCashRegister, assertUniqueSerials } from '../lib/validators'

const today = () => new Date().toISOString().slice(0, 10)
const now = () => new Date().toISOString()
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`
const toNumber = (value) => Number(value || 0)

const emptyCompany = {
  name: '',
  rnc: '',
  address: '',
  city: '',
  province: '',
  phone: '',
  whatsapp: '',
  email: '',
  logoUrl: '',
  signatureUrl: '',
  warrantyText: 'Garantia segun politicas de la empresa.',
  invoiceTerms: 'Gracias por su compra.',
  requireOpenRegister: true,
  defaultCurrency: 'DOP',
  exchangeRate: 58.5,
  maxDiscountPercent: 10,
  taxRate: 18,
}

const emptyCashRegister = {
  id: null,
  branchId: null,
  name: 'Caja principal',
  status: 'closed',
  openedAt: null,
  closedAt: null,
  openedBy: null,
  openingAmount: 0,
  expected: 0,
  counted: 0,
  movements: [],
}

const defaultSequences = [
  { id: 'B01', prefix: 'B01', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'B02', prefix: 'B02', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'B04', prefix: 'B04', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'B14', prefix: 'B14', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'B15', prefix: 'B15', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'B16', prefix: 'B16', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'E31', prefix: 'E31', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'E32', prefix: 'E32', next: 1, limit: 0, expiresAt: '', enabled: false },
  { id: 'E34', prefix: 'E34', next: 1, limit: 0, expiresAt: '', enabled: false },
]

const defaultCategories = ['Celulares', 'Laptops', 'Tablets', 'Accesorios', 'Servicios', 'Impresoras', 'Monitores', 'UPS']
const defaultSuppliers = [{ id: 'no-supplier', name: 'Sin proveedor', rnc: '', phone: '', email: '', active: true }]

export const useERPStore = create(
  persist(
    (set, get) => ({
      company: emptyCompany,
      settings: emptyCompany,
      branches: [],
      stores: [],
      users: [],
      products: [],
      productEntries: [],
      inventoryMovements: [],
      customers: [],
      suppliers: defaultSuppliers,
      invoices: [],
      quotes: [],
      receivables: [],
      payments: [],
      expenses: [],
      cashRegister: emptyCashRegister,
      serviceOrders: [],
      taxSequences: defaultSequences,
      auditLogs: [],
      categories: defaultCategories,
      commandOpen: false,
      collapsed: false,
      selectedBranch: null,
      currentUser: { id: 'local-admin', name: 'Administrador', role: 'Admin' },
      syncStatus: 'local-first',

      toggleSidebar: () => set((state) => ({ collapsed: !state.collapsed })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),

      addAudit(action, module, before = null, after = null) {
        const user = get().currentUser
        const log = {
          id: id('log'),
          user: user?.name || 'Sistema',
          action,
          module,
          date: now(),
          before,
          after,
          ip: 'local',
          device: navigator.userAgent,
        }
        set((state) => ({ auditLogs: [log, ...state.auditLogs] }))
        return log
      },

      updateSettings(partialSettings) {
        set((state) => ({
          company: { ...state.company, ...partialSettings },
          settings: { ...state.settings, ...partialSettings },
        }))
        get().addAudit('settings.update', 'Configuracion', null, partialSettings)
      },

      updateExchangeRate(rate) {
        if (toNumber(rate) <= 0) throw new Error('La tasa de cambio debe ser mayor que cero.')
        get().updateSettings({ exchangeRate: toNumber(rate) })
      },

      updateCategories(categories) {
        const clean = categories.map((item) => item.trim()).filter(Boolean)
        if (!clean.length) throw new Error('Debe existir al menos una categoria.')
        set({ categories: [...new Set(clean)] })
        get().addAudit('categories.update', 'Configuracion', null, clean)
      },

      updateTaxSequence({ type, next, limit, expiresAt, enabled }) {
        set((state) => ({
          taxSequences: state.taxSequences.map((sequence) =>
            sequence.id === type
              ? {
                  ...sequence,
                  next: next === undefined ? sequence.next : toNumber(next),
                  limit: limit === undefined ? sequence.limit : toNumber(limit),
                  expiresAt: expiresAt === undefined ? sequence.expiresAt : expiresAt,
                  enabled: enabled === undefined ? sequence.enabled : Boolean(enabled),
                }
              : sequence,
          ),
        }))
        get().addAudit('tax_sequence.update', 'Fiscal', type, { next, limit, expiresAt, enabled })
      },

      upsertBranch(branch) {
        const payload = { ...branch, id: branch.id || id('branch'), updatedAt: now() }
        const exists = get().branches.some((item) => item.id === payload.id)
        set((state) => ({
          branches: exists ? state.branches.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...state.branches],
          selectedBranch: state.selectedBranch || payload.id,
        }))
        get().addAudit(exists ? 'branch.update' : 'branch.create', 'Sucursales', exists ? payload.id : null, payload)
        return payload
      },

      upsertSupplier(supplier) {
        const payload = { ...supplier, id: supplier.id || id('supplier'), active: supplier.active ?? true, updatedAt: now() }
        const exists = get().suppliers.some((item) => item.id === payload.id)
        set((state) => ({
          suppliers: exists ? state.suppliers.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...state.suppliers],
        }))
        get().addAudit(exists ? 'supplier.update' : 'supplier.create', 'Proveedores', exists ? payload.id : null, payload)
        return payload
      },

      upsertProduct(product) {
        const products = get().products
        const sku = product.sku?.trim() || buildSku(product.name)
        if (!product.name?.trim()) throw new Error('El nombre del producto es obligatorio.')
        if (products.some((item) => item.sku?.toLowerCase() === sku.toLowerCase() && item.id !== product.id)) {
          throw new Error(`El SKU ${sku} ya existe. Use otro SKU.`)
        }
        if (toNumber(product.cost) < 0) throw new Error('El costo no puede ser negativo.')
        if (toNumber(product.price) <= 0) throw new Error('El precio de venta al detal debe ser mayor que cero.')
        const existing = products.find((item) => item.id === product.id)
        const incomingStock = product.stock === undefined ? product.initialStock : product.stock
        const nextStock = existing ? toNumber(existing.stock) : toNumber(incomingStock)
        const incomingSerials = Array.isArray(product.serials)
          ? product.serials.map((serial) => String(serial).trim()).filter(Boolean)
          : String(product.serialsText || '').split(/\r?\n|,/).map((serial) => serial.trim()).filter(Boolean)
        if (product.requiresSerial && incomingSerials.length && incomingSerials.length !== nextStock) {
          throw new Error(`Este producto requiere serial/IMEI. Debe registrar ${nextStock} serial(es) o dejar el stock inicial en 0.`)
        }
        const payload = {
          ...existing,
          ...product,
          id: product.id || id('product'),
          sku,
          cost: toNumber(product.cost),
          price: toNumber(product.price),
          wholesalePrice: toNumber(product.wholesalePrice),
          technicianPrice: toNumber(product.technicianPrice),
          specialPrice: toNumber(product.specialPrice),
          usdPrice: toNumber(product.usdPrice),
          stock: nextStock,
          stockMin: toNumber(product.stockMin),
          stockMax: toNumber(product.stockMax),
          serials: existing ? (existing.serials || []) : incomingSerials,
          soldSerials: existing?.soldSerials || [],
          damagedSerials: existing?.damagedSerials || [],
          status: product.status || 'Activo',
          deletedAt: product.deletedAt || null,
          taxable: product.taxStatus ? product.taxStatus === 'taxed' : Boolean(product.taxable),
          taxStatus: product.taxStatus || (product.taxable ? 'taxed' : 'exempt'),
          updatedAt: now(),
          createdAt: existing?.createdAt || now(),
        }
        set((state) => ({
          products: existing ? state.products.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...state.products],
          inventoryMovements: !existing && nextStock > 0
            ? [{
                id: id('mov'),
                productId: payload.id,
                productName: payload.name,
                type: 'stock_inicial',
                reason: 'Creacion de producto',
                quantity: nextStock,
                cost: payload.cost,
                total: nextStock * payload.cost,
                serials: incomingSerials,
                date: today(),
                createdAt: now(),
              }, ...state.inventoryMovements]
            : state.inventoryMovements,
        }))
        get().addAudit(existing ? 'product.update' : 'product.create', 'Inventario', existing || null, payload)
        return payload
      },

      deleteProduct(productId, reason = 'Eliminacion manual') {
        const product = get().products.find((item) => item.id === productId)
        if (!product) throw new Error('El producto no existe.')
        const deleted = { ...product, status: 'Eliminado', deletedAt: now(), deleteReason: reason, updatedAt: now() }
        set((state) => ({ products: state.products.map((item) => (item.id === productId ? deleted : item)) }))
        get().addAudit('product.soft_delete', 'Inventario', product, deleted)
      },

      restoreProduct(productId) {
        const product = get().products.find((item) => item.id === productId)
        if (!product) throw new Error('El producto no existe.')
        const restored = { ...product, status: 'Activo', deletedAt: null, deleteReason: '', updatedAt: now() }
        set((state) => ({ products: state.products.map((item) => (item.id === productId ? restored : item)) }))
        get().addAudit('product.restore', 'Inventario', product, restored)
      },

      adjustInventory({ productId, quantity, type, reason }) {
        const amount = toNumber(quantity)
        if (amount <= 0) throw new Error('La cantidad del ajuste debe ser mayor que cero.')
        if (!reason?.trim()) throw new Error('El motivo del ajuste es obligatorio.')
        const product = get().products.find((item) => item.id === productId)
        if (!product) throw new Error('Seleccione un producto valido.')
        const sign = type === 'decremento' ? -1 : 1
        const nextStock = toNumber(product.stock) + sign * amount
        if (nextStock < 0) throw new Error('El ajuste deja el stock en negativo.')
        const movement = {
          id: id('mov'),
          productId,
          productName: product.name,
          type: sign > 0 ? 'ajuste_positivo' : 'ajuste_negativo',
          reason,
          quantity: amount,
          cost: product.cost,
          total: amount * product.cost,
          date: today(),
          createdAt: now(),
        }
        set((state) => ({
          products: state.products.map((item) => (item.id === productId ? { ...item, stock: nextStock, updatedAt: now() } : item)),
          inventoryMovements: [movement, ...state.inventoryMovements],
        }))
        get().addAudit('inventory.adjust', 'Inventario', { productId, stock: product.stock }, { stock: nextStock, reason })
        return movement
      },

      receiveProducts({ supplierId = 'no-supplier', reference = '', supplierInvoice = '', date = today(), items = [], type = 'Nueva mercancia' }) {
        if (!items.length) throw new Error('Agregue al menos un producto a la entrada.')
        const products = get().products
        const allExistingSerials = products.flatMap((product) => [...(product.serials || []), ...(product.soldSerials || []), ...(product.damagedSerials || [])])
        const incomingSerials = items.flatMap((item) => item.serials || []).map((serial) => serial.trim()).filter(Boolean)
        assertUniqueSerials(incomingSerials, allExistingSerials)

        const entryItems = items.map((item) => {
          const product = products.find((productItem) => productItem.id === item.productId)
          if (!product) throw new Error('Uno de los productos de la entrada no existe.')
          const quantity = toNumber(item.quantity)
          const cost = toNumber(item.cost)
          if (quantity <= 0) throw new Error(`La cantidad para ${product.name} debe ser mayor que cero.`)
          if (cost <= 0) throw new Error(`El costo para ${product.name} debe ser mayor que cero.`)
          const serials = (item.serials || []).map((serial) => serial.trim()).filter(Boolean)
          if (product.requiresSerial && serials.length !== quantity) {
            throw new Error(`${product.name} requiere ${quantity} serial(es), recibidos ${serials.length}.`)
          }
          return { productId: product.id, productName: product.name, quantity, cost, serials, subtotal: quantity * cost }
        })

        const entry = {
          id: id('entry'),
          supplierId,
          supplierName: get().suppliers.find((supplier) => supplier.id === supplierId)?.name || 'Sin proveedor',
          reference,
          supplierInvoice,
          date,
          type,
          items: entryItems,
          total: entryItems.reduce((sum, item) => sum + item.subtotal, 0),
          createdAt: now(),
        }

        const movements = entryItems.map((item) => ({
          id: id('mov'),
          entryId: entry.id,
          productId: item.productId,
          productName: item.productName,
          type: 'entrada',
          reason: type,
          quantity: item.quantity,
          cost: item.cost,
          total: item.subtotal,
          serials: item.serials,
          date,
          createdAt: now(),
        }))

        set((state) => ({
          products: state.products.map((product) => {
            const line = entryItems.find((item) => item.productId === product.id)
            if (!line) return product
            const currentStock = toNumber(product.stock)
            const newStock = currentStock + line.quantity
            const averageCost = newStock === 0 ? line.cost : (currentStock * toNumber(product.cost) + line.quantity * line.cost) / newStock
            return {
              ...product,
              stock: newStock,
              cost: Math.round(averageCost * 100) / 100,
              serials: [...(product.serials || []), ...line.serials],
              updatedAt: now(),
            }
          }),
          productEntries: [entry, ...state.productEntries],
          inventoryMovements: [...movements, ...state.inventoryMovements],
          expenses: supplierInvoice
            ? [
                {
                  id: id('payable'),
                  entryId: entry.id,
                  type: 'account_payable',
                  supplierId,
                  supplierName: entry.supplierName,
                  reference: supplierInvoice,
                  amount: entry.total,
                  balance: entry.total,
                  status: 'pending',
                  date,
                  createdAt: now(),
                },
                ...state.expenses,
              ]
            : state.expenses,
        }))
        get().addAudit('inventory.receive', 'Inventario', null, entry)
        return entry
      },

      deleteProductEntry(entryId, reason = 'Eliminacion de entrada') {
        const entry = get().productEntries.find((item) => item.id === entryId)
        if (!entry) throw new Error('La entrada no existe.')
        entry.items.forEach((line) => {
          const product = get().products.find((item) => item.id === line.productId)
          if (!product) throw new Error(`El producto ${line.productName} no existe.`)
          if (toNumber(product.stock) < toNumber(line.quantity)) throw new Error(`${product.name} no tiene stock suficiente para revertir esta entrada.`)
          const unavailableSerial = (line.serials || []).find((serial) => !(product.serials || []).includes(serial))
          if (unavailableSerial) throw new Error(`El serial ${unavailableSerial} ya no esta disponible; no se puede eliminar la entrada.`)
        })
        const reversalMovements = entry.items.map((line) => ({
          id: id('mov'),
          entryId,
          productId: line.productId,
          productName: line.productName,
          type: 'entrada_revertida',
          reason,
          quantity: toNumber(line.quantity),
          cost: toNumber(line.cost),
          total: toNumber(line.quantity) * toNumber(line.cost),
          serials: line.serials || [],
          date: today(),
          createdAt: now(),
        }))
        set((state) => ({
          products: state.products.map((product) => {
            const line = entry.items.find((item) => item.productId === product.id)
            if (!line) return product
            return {
              ...product,
              stock: toNumber(product.stock) - toNumber(line.quantity),
              serials: (product.serials || []).filter((serial) => !(line.serials || []).includes(serial)),
              updatedAt: now(),
            }
          }),
          productEntries: state.productEntries.filter((item) => item.id !== entryId),
          inventoryMovements: [...reversalMovements, ...state.inventoryMovements],
          expenses: state.expenses.map((item) => (item.entryId === entryId ? { ...item, status: 'cancelled', balance: 0, cancelledAt: now(), cancelReason: reason } : item)),
        }))
        get().addAudit('inventory.entry.delete', 'Inventario', entry, reason)
      },

      updateProductEntry(entryId, payload) {
        const entry = get().productEntries.find((item) => item.id === entryId)
        if (!entry) throw new Error('La entrada no existe.')
        get().deleteProductEntry(entryId, 'Reverso automatico por edicion de entrada')
        const updated = get().receiveProducts(payload)
        get().addAudit('inventory.entry.update', 'Inventario', entry, updated)
        return updated
      },

      upsertCustomer(customer) {
        if (!customer.name?.trim()) throw new Error('El nombre o razon social del cliente es obligatorio.')
        const payload = {
          ...customer,
          id: customer.id || id('customer'),
          status: customer.status || 'Activo',
          creditLimit: toNumber(customer.creditLimit),
          balance: toNumber(customer.balance),
          tags: customer.tags || [],
          notes: customer.notes || [],
          updatedAt: now(),
          createdAt: customer.createdAt || now(),
        }
        const exists = get().customers.some((item) => item.id === payload.id)
        set((state) => ({ customers: exists ? state.customers.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...state.customers] }))
        get().addAudit(exists ? 'customer.update' : 'customer.create', 'Clientes', exists ? payload.id : null, payload)
        return payload
      },

      deleteCustomer(customerId) {
        const customer = get().customers.find((item) => item.id === customerId)
        if (!customer) throw new Error('El cliente no existe.')
        const hasInvoices = get().invoices.some((invoice) => invoice.customerId === customerId)
        const hasReceivables = get().receivables.some((item) => item.customerId === customerId && item.balance > 0)
        if (hasReceivables) throw new Error('El cliente tiene cuentas pendientes. No se puede eliminar.')
        if (hasInvoices) {
          set((state) => ({ customers: state.customers.map((item) => (item.id === customerId ? { ...item, status: 'Inactivo' } : item)) }))
          get().addAudit('customer.deactivate', 'Clientes', customer, { ...customer, status: 'Inactivo' })
          return
        }
        set((state) => ({ customers: state.customers.filter((item) => item.id !== customerId) }))
        get().addAudit('customer.delete', 'Clientes', customer, null)
      },

      saveInvoiceDraft(invoiceData) {
        const items = applyGlobalDiscount(invoiceData)
        const totals = calculateInvoice(items, invoiceData.mode || invoiceModes.TAXED)
        const draft = {
          ...invoiceData,
          items,
          id: invoiceData.id || id('draft'),
          number: invoiceData.number || `BOR-${String(get().invoices.length + 1).padStart(6, '0')}`,
          ncf: '',
          status: 'draft',
          totals,
          createdAt: invoiceData.createdAt || now(),
          updatedAt: now(),
        }
        const exists = get().invoices.some((invoice) => invoice.id === draft.id)
        set((state) => ({ invoices: exists ? state.invoices.map((invoice) => (invoice.id === draft.id ? draft : invoice)) : [draft, ...state.invoices] }))
        get().addAudit(exists ? 'invoice_draft.update' : 'invoice_draft.create', 'Facturacion', exists ? draft.id : null, draft)
        return draft
      },

      updateInvoiceDraft(idValue, data) {
        const invoice = get().invoices.find((item) => item.id === idValue)
        if (!invoice) throw new Error('La factura borrador no existe.')
        if (invoice.status !== 'draft') throw new Error('Solo se pueden editar facturas en borrador.')
        return get().saveInvoiceDraft({ ...invoice, ...data, id: idValue })
      },

      createInvoice(invoiceData) {
        assertOpenCashRegister(get().cashRegister, get().settings)
        if (!invoiceData.customerId) throw new Error('Seleccione un cliente antes de emitir la factura.')
        if (!invoiceData.items?.length) throw new Error('Agregue al menos un producto o servicio.')
        const maxDiscount = Math.min(Number(get().settings.maxDiscountPercent || 10), 10)
        if (toNumber(invoiceData.globalDiscount) > maxDiscount) throw new Error(`El descuento global supera el maximo permitido de ${maxDiscount}%.`)
        const items = applyGlobalDiscount(invoiceData)
        const totals = calculateInvoice(items, invoiceData.mode || invoiceModes.TAXED)
        const paymentTotal = (invoiceData.payments || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0)
        if (Math.abs(paymentTotal - totals.total) > 0.01) throw new Error(`Los pagos no cuadran. Faltan o sobran RD$${Math.abs(totals.total - paymentTotal).toFixed(2)}.`)
        items.forEach((item) => {
          const product = get().products.find((productItem) => productItem.id === item.productId)
          if (!product) throw new Error(`El producto ${item.name || item.productId} no existe.`)
          if (product.status === 'Inactivo' || product.status === 'Eliminado' || product.deletedAt) throw new Error(`${product.name} no esta disponible para facturar.`)
          if (product.category !== 'Servicios' && toNumber(product.stock) < toNumber(item.quantity)) throw new Error(`${product.name} no tiene stock suficiente. Disponible: ${product.stock || 0}.`)
          if (toNumber(item.discount) > maxDiscount) throw new Error(`${product.name} supera el descuento maximo permitido de ${maxDiscount}%.`)
          const minimumPrice = Math.max(toNumber(product.cost), toNumber(item.registeredPrice || product.price) * 0.9)
          if (toNumber(item.price) < minimumPrice) throw new Error(`${product.name} no puede venderse por debajo del costo ni con rebaja mayor al 10%.`)
        })
        const selectedSerials = items.flatMap((item) => item.serials || (item.serial ? [item.serial] : [])).filter(Boolean)
        const soldSerials = get().products.flatMap((product) => product.soldSerials || [])
        assertUniqueSerials(selectedSerials, soldSerials)

        const mode = invoiceData.mode || invoiceModes.TAXED
        const sequence = invoiceData.ncfType && invoiceData.ncfType !== 'NO_FISCAL' ? get().taxSequences.find((item) => item.id === invoiceData.ncfType) : null
        if (sequence && !sequence.enabled) throw new Error(`La secuencia ${sequence.id} no esta habilitada en configuracion fiscal.`)
        const fiscalNumber = sequence ? nextNcf(sequence) : `FAC-${String(get().invoices.filter((item) => item.ncfType === 'NO_FISCAL' || !item.ncf).length + 1).padStart(6, '0')}`
        const issuedAt = now()
        const existingInvoices = get().invoices
        const authenticationSerial = buildInvoiceSerial(existingInvoices, issuedAt)
        const verificationToken = buildVerificationToken(existingInvoices)
        const invoice = {
          ...invoiceData,
          items,
          id: invoiceData.id || id('invoice'),
          number: fiscalNumber,
          ncf: sequence ? fiscalNumber : '',
          ncfType: sequence?.id || invoiceData.ncfType || 'NO_FISCAL',
          authenticationSerial,
          verificationToken,
          mode,
          status: invoiceData.payments?.some((payment) => payment.method === 'Credito') ? 'credit' : 'paid',
          totals,
          createdAt: invoiceData.createdAt || now(),
          issuedAt,
          updatedAt: now(),
        }

        const movements = invoice.items.map((item) => ({
          id: id('mov'),
          invoiceId: invoice.id,
          productId: item.productId,
          productName: item.name,
          type: 'salida',
          reason: 'Factura emitida',
          quantity: toNumber(item.quantity),
          cost: toNumber(item.cost),
          total: toNumber(item.cost) * toNumber(item.quantity),
          serials: item.serials || (item.serial ? [item.serial] : []),
          date: invoice.issueDate || today(),
          createdAt: now(),
        }))

        const creditAmount = (invoice.payments || []).filter((payment) => payment.method === 'Credito').reduce((sum, payment) => sum + toNumber(payment.amount), 0)
        const customer = get().customers.find((item) => item.id === invoice.customerId)
        const receivable = creditAmount > 0 ? buildReceivable(invoice, customer, creditAmount) : null

        set((state) => ({
          invoices: [invoice, ...state.invoices.filter((item) => item.id !== invoice.id)],
          products: state.products.map((product) => {
            const soldLines = invoice.items.filter((item) => item.productId === product.id)
            if (!soldLines.length || product.category === 'Servicios') return product
            const qty = soldLines.reduce((sum, item) => sum + toNumber(item.quantity), 0)
            const lineSerials = soldLines.flatMap((item) => item.serials || (item.serial ? [item.serial] : []))
            return {
              ...product,
              stock: toNumber(product.stock) - qty,
              serials: (product.serials || []).filter((serial) => !lineSerials.includes(serial)),
              soldSerials: [...(product.soldSerials || []), ...lineSerials.map((serial) => ({ serial, invoiceId: invoice.id, invoiceNumber: invoice.number, customerId: invoice.customerId, soldAt: now() }))],
              updatedAt: now(),
            }
          }),
          taxSequences: sequence ? state.taxSequences.map((item) => (item.id === sequence.id ? { ...item, next: toNumber(item.next) + 1 } : item)) : state.taxSequences,
          inventoryMovements: [...movements, ...state.inventoryMovements],
          receivables: receivable ? [receivable, ...state.receivables] : state.receivables,
          customers: receivable ? state.customers.map((item) => (item.id === invoice.customerId ? { ...item, balance: toNumber(item.balance) + creditAmount } : item)) : state.customers,
          cashRegister: {
            ...state.cashRegister,
            expected: state.cashRegister.expected + invoice.payments.filter((payment) => payment.method !== 'Credito').reduce((sum, payment) => sum + toNumber(payment.amount), 0),
            movements: [
              ...invoice.payments.filter((payment) => payment.method !== 'Credito').map((payment) => ({
                id: id('cashmov'),
                type: 'income',
                amount: toNumber(payment.amount),
                method: payment.method,
                concept: `Factura ${invoice.number}`,
                reference: payment.reference || '',
                createdAt: now(),
              })),
              ...state.cashRegister.movements,
            ],
          },
        }))
        get().addAudit('invoice.issue', 'Facturacion', invoiceData.id || null, invoice)
        return invoice
      },

      voidInvoice(invoiceId, reason) {
        if (!reason?.trim() || reason.trim().length < 10) throw new Error('La anulacion requiere un motivo obligatorio de al menos 10 caracteres.')
        const invoice = get().invoices.find((item) => item.id === invoiceId)
        if (!invoice) throw new Error('La factura no existe.')
        if (invoice.status === 'voided' || invoice.status === 'anulada') throw new Error('La factura ya esta anulada.')
        set((state) => ({
          invoices: state.invoices.map((item) => (item.id === invoiceId ? { ...item, status: 'voided', voidReason: reason, voidedAt: now() } : item)),
          products: state.products.map((product) => {
            const lines = invoice.items.filter((item) => item.productId === product.id)
            if (!lines.length || product.category === 'Servicios') return product
            const qty = lines.reduce((sum, line) => sum + toNumber(line.quantity), 0)
            const serials = lines.flatMap((line) => line.serials || (line.serial ? [line.serial] : []))
            return {
              ...product,
              stock: toNumber(product.stock) + qty,
              serials: [...(product.serials || []), ...serials],
              soldSerials: (product.soldSerials || []).filter((item) => !serials.includes(item.serial)),
            }
          }),
          receivables: state.receivables.map((item) => (item.invoiceId === invoiceId ? { ...item, status: 'cancelled', balance: 0 } : item)),
        }))
        get().addAudit('invoice.void', 'Fiscal', invoice.number, reason)
      },

      deleteInvoice(invoiceId, reason = '') {
        const invoice = get().invoices.find((item) => item.id === invoiceId)
        if (!invoice) throw new Error('La factura no existe.')
        const canDelete = invoice.status === 'draft' || invoice.ncfType === 'NO_FISCAL' || !invoice.ncf
        if (!canDelete) throw new Error('Las facturas fiscales emitidas se anulan, no se eliminan. Use anulacion con motivo.')
        if (invoice.status !== 'draft' && (!reason?.trim() || reason.trim().length < 10)) throw new Error('La eliminacion requiere un motivo de al menos 10 caracteres.')
        set((state) => ({
          invoices: state.invoices.filter((item) => item.id !== invoiceId),
        }))
        get().addAudit('invoice.delete', 'Facturacion', invoice, reason || 'Borrador eliminado')
      },

      duplicateInvoice(invoiceId) {
        const invoice = get().invoices.find((item) => item.id === invoiceId)
        if (!invoice) throw new Error('La factura no existe.')
        const draft = {
          ...invoice,
          id: id('draft'),
          number: `BOR-${String(get().invoices.length + 1).padStart(6, '0')}`,
          ncf: '',
          authenticationSerial: '',
          verificationToken: '',
          status: 'draft',
          issueDate: today(),
          createdAt: now(),
          updatedAt: now(),
        }
        set((state) => ({ invoices: [draft, ...state.invoices] }))
        get().addAudit('invoice.duplicate', 'Facturacion', invoice.number, draft.number)
        return draft
      },

      upsertQuote(quote) {
        const totals = calculateInvoice(quote.items || [], quote.mode || invoiceModes.TAXED)
        const existing = get().quotes.find((item) => item.id === quote.id)
        const payload = {
          ...quote,
          id: quote.id || id('quote'),
          number: quote.number || `COT-${String(get().quotes.length + 1).padStart(6, '0')}`,
          version: quote.version || existing?.version || 1,
          status: quote.status || 'Borrador',
          validUntil: quote.validUntil || addDays(today(), 15),
          totals,
          createdAt: quote.createdAt || now(),
          updatedAt: now(),
          versions: quote.versions || existing?.versions || [],
        }
        set((state) => ({ quotes: existing ? state.quotes.map((item) => (item.id === payload.id ? payload : item)) : [payload, ...state.quotes] }))
        get().addAudit(existing ? 'quote.update' : 'quote.create', 'Cotizaciones', existing || null, payload)
        return payload
      },

      deleteQuote(quoteId) {
        const quote = get().quotes.find((item) => item.id === quoteId)
        if (!quote) throw new Error('La cotizacion no existe.')
        set((state) => ({ quotes: state.quotes.filter((item) => item.id !== quoteId) }))
        get().addAudit('quote.delete', 'Cotizaciones', quote, null)
      },

      newQuoteVersion(quoteId) {
        const quote = get().quotes.find((item) => item.id === quoteId)
        if (!quote) throw new Error('La cotizacion no existe.')
        const versioned = { ...quote, version: toNumber(quote.version) + 1, status: 'Borrador', versions: [...(quote.versions || []), { ...quote, archivedAt: now() }], updatedAt: now() }
        set((state) => ({ quotes: state.quotes.map((item) => (item.id === quoteId ? versioned : item)) }))
        get().addAudit('quote.version', 'Cotizaciones', quote.version, versioned.version)
        return versioned
      },

      convertQuoteToInvoice(quoteId, ncfType) {
        const quote = get().quotes.find((item) => item.id === quoteId)
        if (!quote) throw new Error('La cotizacion no existe.')
        const draft = get().saveInvoiceDraft({
          customerId: quote.customerId,
          customerName: quote.customerName,
          mode: quote.mode,
          ncfType,
          items: quote.items,
          issueDate: today(),
          dueDate: quote.dueDate,
          seller: quote.seller,
          notesCustomer: quote.notesCustomer,
          payments: [],
        })
        set((state) => ({ quotes: state.quotes.map((item) => (item.id === quoteId ? { ...item, status: 'Convertida', invoiceId: draft.id } : item)) }))
        get().addAudit('quote.convert', 'Cotizaciones', quote.number, draft.number)
        return draft
      },

      registerPayment({ invoiceId, amount, method, reference, date = today() }) {
        const paymentAmount = toNumber(amount)
        if (paymentAmount <= 0) throw new Error('El monto del pago debe ser mayor que cero.')
        const receivable = get().receivables.find((item) => item.invoiceId === invoiceId)
        if (!receivable) throw new Error('La cuenta por cobrar no existe.')
        if (paymentAmount > receivable.balance) throw new Error(`El pago excede el balance pendiente de RD$${receivable.balance.toFixed(2)}.`)
        const payment = { id: id('payment'), invoiceId, amount: paymentAmount, method, reference, date, createdAt: now() }
        const nextBalance = receivable.balance - paymentAmount
        set((state) => ({
          payments: [payment, ...state.payments],
          receivables: state.receivables.map((item) =>
            item.invoiceId === invoiceId
              ? { ...item, paid: item.paid + paymentAmount, balance: nextBalance, status: nextBalance <= 0 ? 'paid' : item.status, payments: [payment, ...(item.payments || [])] }
              : item,
          ),
          invoices: state.invoices.map((invoice) => (invoice.id === invoiceId && nextBalance <= 0 ? { ...invoice, status: 'paid' } : invoice)),
          customers: state.customers.map((customer) => (customer.id === receivable.customerId ? { ...customer, balance: Math.max(toNumber(customer.balance) - paymentAmount, 0) } : customer)),
        }))
        get().registerCashMovement({ type: 'income', amount: paymentAmount, method, concept: `Pago ${receivable.invoiceNumber}`, reference })
        get().addAudit('receivable.payment', 'Cuentas por cobrar', receivable.balance, nextBalance)
        return payment
      },

      registerCashMovement({ type, amount, method, concept, reference = '' }) {
        const value = toNumber(amount)
        if (value <= 0) throw new Error('El monto del movimiento debe ser mayor que cero.')
        const movement = { id: id('cashmov'), type, amount: value, method, concept, reference, createdAt: now() }
        set((state) => ({
          cashRegister: {
            ...state.cashRegister,
            expected: state.cashRegister.expected + (type === 'expense' ? -value : value),
            movements: [movement, ...state.cashRegister.movements],
          },
        }))
        get().addAudit('cash.movement', 'Caja', null, movement)
        return movement
      },

      openCashRegister(amount) {
        const value = toNumber(amount)
        if (value < 0) throw new Error('El monto de apertura no puede ser negativo.')
        const opened = {
          ...emptyCashRegister,
          id: id('cash'),
          status: 'open',
          openedAt: now(),
          openingAmount: value,
          expected: value,
          counted: value,
          movements: [{ id: id('cashmov'), type: 'opening', amount: value, method: 'Efectivo', concept: 'Apertura de caja', createdAt: now() }],
        }
        set({ cashRegister: opened })
        get().addAudit('cash.open', 'Caja', 'closed', opened)
      },

      closeCashRegister(counted) {
        const current = get().cashRegister
        if (current.status !== 'open') throw new Error('No hay una caja abierta para cerrar.')
        const closed = { ...current, status: 'closed', closedAt: now(), counted: toNumber(counted) }
        set({ cashRegister: closed })
        get().addAudit('cash.close', 'Caja', current, { counted: toNumber(counted), difference: toNumber(counted) - current.expected })
      },
    }),
    {
      name: 'trifusion-erp-state-v2',
      storage: createJSONStorage(() => localStorage),
      version: 2,
    },
  ),
)

function buildReceivable(invoice, customer, amount) {
  return {
    id: id('recv'),
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    customerId: invoice.customerId,
    customerName: invoice.customerName || customer?.name || 'Cliente',
    total: amount,
    paid: 0,
    balance: amount,
    dueDate: invoice.dueDate || addDays(today(), 30),
    status: 'open',
    payments: [],
    createdAt: now(),
  }
}

function addDays(dateText, days) {
  const date = new Date(dateText)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildSku(name = 'PRODUCTO') {
  const prefix = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18)
    .toUpperCase() || 'PRODUCTO'
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}`
}

function applyGlobalDiscount(invoiceData) {
  const globalDiscount = toNumber(invoiceData.globalDiscount)
  return (invoiceData.items || []).map((item) => ({ ...item, discount: toNumber(item.discount) + globalDiscount }))
}

function buildInvoiceSerial(existingInvoices = [], date = now()) {
  const year = new Date(date).getFullYear()
  const existing = new Set(existingInvoices.map((invoice) => invoice.authenticationSerial).filter(Boolean))
  let serial
  do {
    serial = `TFT-${year}-${randomCode(6)}`
  } while (existing.has(serial))
  return serial
}

function buildVerificationToken(existingInvoices = []) {
  const existing = new Set(existingInvoices.map((invoice) => invoice.verificationToken).filter(Boolean))
  let token
  do {
    token = `AUTH-${randomCode(4)}-${randomCode(4)}`
  } while (existing.has(token))
  return token
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('')
}
