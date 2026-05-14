import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
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
let unsubscribeRemote = null
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
    useERPStore.setState({ syncStatus: 'error', syncError: describeSyncError(error) })
  })

  return stopErpRealtimeSync
}

export function stopErpRealtimeSync() {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = null
  unsubscribeRemote?.()
  unsubscribeRemote = null
  unsubscribeStore?.()
  unsubscribeStore = null
  activeUid = ''
  syncReady = false
  applyingRemote = false
  previousState = null
}

async function initializeUserSync(user) {
  const ref = stateDocRef(user.uid)
  const snapshot = await getDoc(ref).catch((error) => {
    throw withSyncPath(error, stateDocPath(user.uid))
  })

  if (snapshot.exists()) {
    applyRemoteState(snapshot.data()?.state || {})
  } else {
    await writeRemoteState(user.uid, useERPStore.getState())
  }

  unsubscribeRemote = onSnapshot(ref, (remoteSnapshot) => {
    if (!remoteSnapshot.exists()) return
    applyRemoteState(remoteSnapshot.data()?.state || {})
  }, (error) => handleSyncError(withSyncPath(error, stateDocPath(user.uid))))

  previousState = pickSyncState(useERPStore.getState())
  syncReady = true
  useERPStore.setState({ syncStatus: 'synced', syncHydrated: true, syncError: '' })

  unsubscribeStore = useERPStore.subscribe((state) => {
    if (!syncReady || applyingRemote || !activeUid) return
    scheduleLocalSync(state)
  })
}

function applyRemoteState(remoteState) {
  const patch = pickSyncState({ ...useERPStore.getState(), ...remoteState })
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

function scheduleLocalSync(state) {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    persistLocalState(state).catch(handleSyncError)
  }, SYNC_DEBOUNCE_MS)
}

async function persistLocalState(state) {
  if (!activeUid || !previousState) return
  const current = pickSyncState(state)
  if (stableStringify(previousState) === stableStringify(current)) return

  useERPStore.setState({ syncStatus: 'syncing' })
  await writeRemoteState(activeUid, current)
  previousState = pickSyncState(useERPStore.getState())
  useERPStore.setState({ syncStatus: 'synced', syncError: '' })
}

async function writeRemoteState(uid, state) {
  const path = stateDocPath(uid)
  await setDoc(stateDocRef(uid), {
    state: sanitizeForFirestore(pickSyncState(state)),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((error) => {
    throw withSyncPath(error, path)
  })
}

async function handleSyncError(error) {
  console.error('Error de sincronizacion Firestore:', error)
  useERPStore.setState({ syncStatus: 'error', syncError: describeSyncError(error) })
}

function stateDocRef(uid) {
  return doc(db, 'accounts', uid, 'erp', 'state')
}

function stateDocPath(uid) {
  return `accounts/${uid}/erp/state`
}

function pickSyncState(state) {
  const picked = {}
  COLLECTION_SLICES.forEach((name) => {
    picked[name] = Array.isArray(state[name]) ? dedupeById(state[name]) : []
  })
  SINGLETON_SLICES.forEach((name) => {
    picked[name] = state[name]
  })
  return picked
}

function dedupeById(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item?.id) return false
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function withSyncPath(error, path) {
  error.syncPath = path
  return error
}

function describeSyncError(error) {
  const message = error?.message || 'Error de sincronizacion'
  return error?.syncPath ? `${message} (${error.syncPath})` : message
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
