import { addDoc, collection, doc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export const collections = [
  'users',
  'products',
  'product_serials',
  'customers',
  'suppliers',
  'invoices',
  'invoice_items',
  'quotes',
  'payments',
  'expenses',
  'purchases',
  'purchase_items',
  'inventory_movements',
  'cash_registers',
  'cash_movements',
  'service_orders',
  'warranties',
  'settings',
  'branches',
  'audit_logs',
  'notifications',
  'reports',
  'tax_sequences',
]

export async function listCollection(name, pageSize = 50) {
  const q = query(collection(db, name), orderBy('createdAt', 'desc'), limit(pageSize))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function saveDocument(name, id, payload) {
  const ref = id ? doc(db, name, id) : doc(collection(db, name))
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true })
  return ref.id
}

export async function appendAuditLog(payload) {
  return addDoc(collection(db, 'audit_logs'), {
    ...payload,
    createdAt: serverTimestamp(),
  })
}

export async function createFiscalInvoiceTransaction({ invoice, movements, sequenceId }) {
  return runTransaction(db, async (transaction) => {
    const invoiceRef = doc(collection(db, 'invoices'))
    transaction.set(invoiceRef, { ...invoice, createdAt: serverTimestamp() })
    movements.forEach((movement) => transaction.set(doc(collection(db, 'inventory_movements')), movement))
    if (sequenceId) {
      const sequenceRef = doc(db, 'tax_sequences', sequenceId)
      transaction.update(sequenceRef, { next: invoice.sequenceNext })
    }
    return invoiceRef.id
  })
}
