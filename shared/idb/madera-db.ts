// IndexedDB adapter — db: madera, version 6, 8 stores.
// Stores match the spec: projects, designState, designUpdates, designSeq,
// projectEditorState, designUndoCheckpoints, designUndoState, publishPreviewVideo.

const DB_NAME = 'madera'
const DB_VERSION = 6

export const STORES = {
  projects: 'projects',
  designState: 'designState',
  designUpdates: 'designUpdates',
  designSeq: 'designSeq',
  projectEditorState: 'projectEditorState',
  designUndoCheckpoints: 'designUndoCheckpoints',
  designUndoState: 'designUndoState',
  publishPreviewVideo: 'publishPreviewVideo',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.projects))
        db.createObjectStore(STORES.projects, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORES.designState))
        db.createObjectStore(STORES.designState, { keyPath: 'projectId' })
      if (!db.objectStoreNames.contains(STORES.designUpdates)) {
        db.createObjectStore(STORES.designUpdates, { keyPath: ['projectId', 'seq'] }).createIndex('byProject', 'projectId')
      }
      else {
        const store = req.transaction?.objectStore(STORES.designUpdates)
        if (store && !store.indexNames.contains('byProject')) store.createIndex('byProject', 'projectId')
      }
      if (!db.objectStoreNames.contains(STORES.designSeq))
        db.createObjectStore(STORES.designSeq, { keyPath: 'projectId' })

      if (db.objectStoreNames.contains(STORES.projectEditorState)) {
        const store = req.transaction?.objectStore(STORES.projectEditorState)
        if (store?.keyPath !== 'projectId') db.deleteObjectStore(STORES.projectEditorState)
      }
      if (!db.objectStoreNames.contains(STORES.projectEditorState))
        db.createObjectStore(STORES.projectEditorState, { keyPath: 'projectId' })

      if (db.objectStoreNames.contains(STORES.designUndoCheckpoints)) {
        const store = req.transaction?.objectStore(STORES.designUndoCheckpoints)
        const keyPath = Array.isArray(store?.keyPath) ? store.keyPath.join('.') : store?.keyPath
        if (keyPath !== 'projectId.seq') db.deleteObjectStore(STORES.designUndoCheckpoints)
      }
      if (!db.objectStoreNames.contains(STORES.designUndoCheckpoints))
        db.createObjectStore(STORES.designUndoCheckpoints, { keyPath: ['projectId', 'seq'] }).createIndex('byProject', 'projectId')
      else {
        const store = req.transaction?.objectStore(STORES.designUndoCheckpoints)
        if (store && !store.indexNames.contains('byProject')) store.createIndex('byProject', 'projectId')
      }
      if (!db.objectStoreNames.contains(STORES.designUndoState))
        db.createObjectStore(STORES.designUndoState, { keyPath: 'projectId' })
      if (!db.objectStoreNames.contains(STORES.publishPreviewVideo))
        db.createObjectStore(STORES.publishPreviewVideo, { keyPath: 'projectId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function tx(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode) {
  return db.transaction(store, mode).objectStore(store)
}

function wrap<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T = unknown>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await open()
  return wrap<T>(tx(db, store, 'readonly').get(key) as IDBRequest<T>) as Promise<T | undefined>
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await open()
  await wrap(tx(db, store, 'readwrite').put(value as object))
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await open()
  await wrap(tx(db, store, 'readwrite').delete(key))
}

export async function idbGetAll<T = unknown>(store: StoreName): Promise<T[]> {
  const db = await open()
  return wrap<T[]>(tx(db, store, 'readonly').getAll() as IDBRequest<T[]>)
}

export async function idbBoundedRange<T = unknown>(
  store: StoreName,
  range: IDBKeyRange,
): Promise<T[]> {
  const db = await open()
  return wrap<T[]>(tx(db, store, 'readonly').getAll(range) as IDBRequest<T[]>)
}

export async function idbClearForProject(projectId: string): Promise<void> {
  const db = await open()
  const stores: StoreName[] = [
    STORES.designState,
    STORES.designSeq,
    STORES.projectEditorState,
    STORES.designUndoState,
    STORES.publishPreviewVideo,
  ]
  await Promise.all(stores.map(s => wrap(tx(db, s, 'readwrite').delete(projectId))))
  // Range-delete updates and checkpoints
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([STORES.designUpdates, STORES.designUndoCheckpoints], 'readwrite')
    const range = IDBKeyRange.bound([projectId, -Infinity], [projectId, Infinity])
    t.objectStore(STORES.designUpdates).delete(range)
    t.objectStore(STORES.designUndoCheckpoints).delete(range)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}
