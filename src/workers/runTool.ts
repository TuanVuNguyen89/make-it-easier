import { ToolError, type ToolErrorCode, type ToolOutput } from '@/tools/types'
import type { RunWorkerRequest, RunWorkerResponse } from './protocol'

export interface RunToolOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
  names?: string[]
}

const KNOWN: ToolErrorCode[] = ['invalid-pdf', 'encrypted', 'wrong-password', 'invalid-image', 'invalid-office', 'invalid-options', 'no-reduction', 'no-text', 'no-text-layer', 'aborted']

/** Chạy công cụ trong Web Worker mới; hủy bằng cách terminate nên dừng ngay cả khi đang xử lý nặng. */
export function runTool(
  toolId: string,
  inputs: Uint8Array[],
  options: Record<string, unknown>,
  { onProgress, signal, names }: RunToolOptions = {},
): Promise<ToolOutput[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ToolError('aborted', 'Cancelled'))
    const worker = new Worker(new URL('./toolRunner.ts', import.meta.url), { type: 'module' })
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }
    const onAbort = () => {
      cleanup()
      reject(new ToolError('aborted', 'Cancelled'))
    }
    signal?.addEventListener('abort', onAbort)

    worker.onmessage = (ev: MessageEvent<RunWorkerResponse>) => {
      const msg = ev.data
      if (msg.type === 'progress') return onProgress?.(msg.value)
      cleanup()
      if (msg.type === 'done') {
        resolve(msg.outputs.map((o) => ({ name: o.name, mime: o.mime, data: new Uint8Array(o.data), warnings: o.warnings })))
      } else {
        const code = (KNOWN as string[]).includes(msg.code) ? (msg.code as ToolErrorCode) : null
        reject(code ? new ToolError(code, msg.message) : new Error(msg.message))
      }
    }
    worker.onerror = (ev) => {
      cleanup()
      reject(new Error(`${ev.message || 'Worker failed'} (${ev.filename}:${ev.lineno}:${ev.colno})`))
    }

    // Truyền bản sao để bản gốc trong bộ nhớ trang không bị tách (detached).
    const buffers = inputs.map(
      (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    )
    const req: RunWorkerRequest = { toolId, inputs: buffers, options, names }
    worker.postMessage(req, buffers)
  })
}
