import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useERPStore } from '../store/useERPStore'

const COLLECTION_SLICES = [
  'branches',
  'stores',
  'users',
  'products',
  'productEntries',
  'inventoryMovements',
  'customers',
  'suppliers',
  'invoices',
  'quotes',
  'receivables',
  'payments',
  'expenses',
  'serviceOrders',
  'taxSequences',
  'auditLogs',
]

const SINGLETON_SLICES = ['company', 'settings', 'cashRegister', 'categories', 'selectedBranch']
const SYNC_DEBOUNCE_MS = 700

let activeUid = ''
let unsubscribers = []
let unsubscribeStore = null
let applyingRemote = false
let syncReady = false
let syncTimer = null
let previousState = null

export function startErpRealtimeSync(user) {
  stopErpRealtimeSync()
  if (!user?.uid) {
    useERPStore.setState({ syncStatus: 'offline', syncUserId: null, syncHydrated: false })
    return stopErpRealtimeSync
  }

  activeUid = user.uid
  previousState = pickSyncState(useERPStore.getState())
  useERPStore.setState({
    currentUser: {
      id: user.uid,
      name: user.displayName || user.email || 'Usuario',
      email: user.email || '',
      role: 'Admin',
    },
    syncStatus: 'connecting',
    syncUserId: user.uid,
    syncHydrated: false,
    syncError: '',
  })

  initializeUserSync(user).catch((error) => {
    console.error('No se pudo iniciar la sincronizacion Firestore:', error)
    useERPStore.setState({ syncStatus: 'error', syncError: error.message || 'Error de sincronizacion' })
  })

  return stopErpRealtimeSync
}

export function stopErpRealtimeSync() {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = null
  unsubscribers.forEach((unsubscribe) => unsubscribe())
  unsubscribers = []
  unsubscribeStore?.()
  unsubscribeStore = null
  activeUid = ''
  syncReady = false
  applyingRemote = false
  previousState = null
}

async function initializeUserSync(user) {
  const hasRemoteData = await remoteHasData(user.uid)
  if (!hasRemoteData) {
    await seedRemoteFromLocal(user.uid, useERPStore.getState())
  }

  subscribeRemote(user.uid)
  previousState = pickSyncState(useERPStore.getState())
  syncReady = true
  useERPStore.setState({ syncStatus: 'synced', syncHydrated: true, syncError: '' })

  unsubscribeStore = useERPStore.subscribe((state) => {
    if (!syncReady || applyingRemote || !activeUid) return
    scheduleLocalDiff(state)
  })
}

async function remoteHasData(uid) {
  for (const name of COLLECTION_SLICES) {
    const snapshot = await getDocs(collection(db, 'accounts', uid, name))
    if (!snapshot.empty) return true
  }
  const meta = await getDocs(collection(db, 'accounts', uid, 'meta'))
  return !meta.empty
}

async function seedRemoteFromLocal(uid, state) {
  useERPStore.setState({ syncStatus: 'uploading' })
  for (const name of COLLECTION_SLICES) {
    const items = Array.isArray(state[name]) ? state[name] : []
    await commitItems(uid, name, items)
  }
  await commitSingletons(uid, state)
}

function subscribeRemote(uid) {
  COLLECTION_SLICES.forEach((name) => {
    const unsubscribe = onSnapshot(collection(db, 'accounts', uid, name), (snapshot) => {
      const items = snapshot.docs.map((item) => normalizeRemoteDoc(item.id, item.data()))
      applyRemotePatch({ [name]: items })
    }, handleSyncError)
    unsubscribers.push(unsubscribe)
  })

  const unsubscribeMeta = onSnapshot(collection(db, 'accounts', uid, 'meta'), (snapshot) => {
    const patch = {}
    snapshot.docs.forEach((item) => {
      patch[item.id] = item.data()?.value
    })
    applyRemotePatch(patch)
  }, handleSyncError)
  unsubscribers.push(unsubscribeMeta)
}

function applyRemotePatch(patch) {
  applyingRemote = true
  useERPStore.setState((state) => ({
    ...state,
    ...patch,
    syncStatus: 'synced',
    syncHydrated: true,
    syncError: '',
  }))
  previousState = pickSyncState(useERPStore.getState())
  applyingRemote = false
}

function scheduleLocalDiff(state) {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    persistLocalDiff(state).catch(handleSyncError)
  }, SYNC_DEBOUNCE_MS)
}

async function persistLocalDiff(state) {
  if (!activeUid || !previousState) return
  useERPStore.setState({ syncStatus: 'syncing' })
  const current = pickSyncState(state)
  const previous = previousState

  for (const name of COLLECTION_SLICES) {
    await commitCollectionDiff(activeUid, name, previous[name] || [], current[name] || [])
  }

  for (const name of SINGLETON_SLICES) {
    if (stableStringify(previous[name]) !== stableStringify(current[name])) {
      await setDoc(doc(db, 'accounts', activeUid, 'meta', name), { value: sanitizeForFirestore(current[name]) })
    }
  }

  previousState = pickSyncState(useERPStore.getState())
  useERPStore.setState({ syncStatus: 'synced', syncError: '' })
}

async function commitCollectionDiff(uid, name, previousItems, currentItems) {
  const previousById = new Map(previousItems.filter((item) => item?.id).map((item) => [item.id, item]))
  const currentById = new Map(currentItems.filter((item) => item?.id).map((item) => [item.id, item]))
  const writes = []

  currentById.forEach((item, itemId) => {
    if (stableStringify(previousById.get(itemId)) !== stableStringify(item)) {
      writes.push({ type: 'set', path: doc(db, 'accounts', uid, name, itemId), data: sanitizeForFirestore(item) })
    }
  })

  previousById.forEach((_, itemId) => {
    if (!currentById.has(itemId)) writes.push({ type: 'delete', path: doc(db, 'accounts', uid, name, itemId) })
  })

  await commitWrites(writes)
}

async function commitItems(uid, name, items) {
  const writes = items
    .filter((item) => item?.id)
    .map((item) => ({ type: 'set', path: doc(db, 'accounts', uid, name, item.id), data: sanitizeForFirestore(item) }))
  await commitWrites(writes)
}

async function commitSingletons(uid, state) {
  const writes = SINGLETON_SLICES.map((name) => ({
    type: 'set',
    path: doc(db, 'accounts', uid, 'meta', name),
    data: { value: sanitizeForFirestore(state[name]) },
  }))
  await commitWrites(writes)
}

async function commitWrites(writes) {
  for (let index = 0; index < writes.length; index += 450) {
    const batch = writeBatch(db)
    writes.slice(index, index + 450).forEach((write) => {
      if (write.type === 'delete') batch.delete(write.path)
      else batch.set(write.path, write.data, { merge: true })
    })
    await batch.commit()
  }
}

async function handleSyncError(error) {
  console.error('Error de sincronizacion Firestore:', error)
  useERPStore.setState({ syncStatus: 'error', syncError: error.message || 'Error de sincronizacion' })
}

function pickSyncState(state) {
  const picked = {}
  COLLECTION_SLICES.forEach((name) => {
    picked[name] = Array.isArray(state[name]) ? state[name] : []
  })
  SINGLETON_SLICES.forEach((name) => {
    picked[name] = state[name]
  })
  return picked
}

function normalizeRemoteDoc(id, data) {
  return { ...data, id: data?.id || id }
}

function sanitizeForFirestore(value) {
  if (value === undefined) return null
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sanitizeForFirestore)
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => typeof entry !== 'function' && entry !== undefined)
      .map(([key, entry]) => [key, sanitizeForFirestore(entry)]),
  )
}

function stableStringify(value) {
  return JSON.stringify(value ?? null)
}
