import * as Y from 'yjs'
import { DESIGN_SCHEMA_VERSION, ASSEMBLY_COMPILER_VERSION, TECHNICAL_RENDERER_VERSION } from '~~/shared/domain/types'
import { ensureInitialized } from './doc'

export const MORTI_FORMAT_VERSION = 1
export const MORTI_MAX_BYTES = 32 * 1024 * 1024

export interface MortiEnvelope {
  formatVersion: number
  designSchemaVersion: number
  assemblyCompilerVersion: number
  technicalRendererVersion: number
  exportedAt: string
  yjsUpdateBase64: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function exportDoc(doc: Y.Doc): Blob {
  const update = Y.encodeStateAsUpdate(doc)
  const env: MortiEnvelope = {
    formatVersion: MORTI_FORMAT_VERSION,
    designSchemaVersion: DESIGN_SCHEMA_VERSION,
    assemblyCompilerVersion: ASSEMBLY_COMPILER_VERSION,
    technicalRendererVersion: TECHNICAL_RENDERER_VERSION,
    exportedAt: new Date().toISOString(),
    yjsUpdateBase64: bytesToBase64(update),
  }
  return new Blob([JSON.stringify(env)], { type: 'application/json' })
}

export async function importDocFromBlob(blob: Blob): Promise<Y.Doc> {
  if (blob.size > MORTI_MAX_BYTES) throw new Error('File too large.')
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const doc = new Y.Doc()
  // Try JSON envelope first
  try {
    const text = new TextDecoder().decode(bytes)
    const env = JSON.parse(text) as MortiEnvelope
    if (env && typeof env.yjsUpdateBase64 === 'string') {
      Y.applyUpdate(doc, base64ToBytes(env.yjsUpdateBase64))
      ensureInitialized(doc)
      return doc
    }
  }
  catch {
    // fall through to raw v1 update
  }
  Y.applyUpdate(doc, bytes)
  ensureInitialized(doc)
  return doc
}
