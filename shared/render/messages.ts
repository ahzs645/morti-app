// Render lifecycle constants — must match the values used in the postMessage protocol.
export const RENDER_MESSAGES = {
  READY: 'madera-render-ready',
  PROGRESS: 'madera-render-progress',
  DONE: 'madera-render-done',
  ERROR: 'madera-render-error',
} as const

export type RenderMessageType = (typeof RENDER_MESSAGES)[keyof typeof RENDER_MESSAGES]

export interface RenderReadyMessage { type: typeof RENDER_MESSAGES.READY }
export interface RenderProgressMessage { type: typeof RENDER_MESSAGES.PROGRESS, progress: number }
export interface RenderDoneMessage { type: typeof RENDER_MESSAGES.DONE, buffer: ArrayBuffer }
export interface RenderErrorMessage { type: typeof RENDER_MESSAGES.ERROR, message: string }

export type RenderMessage =
  | RenderReadyMessage
  | RenderProgressMessage
  | RenderDoneMessage
  | RenderErrorMessage

export function isRenderMessage(value: unknown): value is RenderMessage {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.type !== 'string') return false
  switch (v.type) {
    case RENDER_MESSAGES.READY:
      return true
    case RENDER_MESSAGES.PROGRESS:
      return typeof v.progress === 'number'
    case RENDER_MESSAGES.DONE:
      return v.buffer instanceof ArrayBuffer
    case RENDER_MESSAGES.ERROR:
      return typeof v.message === 'string'
    default:
      return false
  }
}
