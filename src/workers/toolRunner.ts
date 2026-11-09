/// <reference lib="webworker" />
import { loadRunner } from '@/tools/runners'
import { ToolError } from '@/tools/types'
import type { RunWorkerRequest, RunWorkerResponse } from './protocol'

// Hủy được thực hiện bằng cách client gọi worker.terminate(), nên tín hiệu ở đây không bao giờ bị hủy.
const signal = new AbortController().signal

function post(msg: RunWorkerResponse, transfer: Transferable[] = []) {
  ;(self as DedicatedWorkerGlobalScope).postMessage(msg, transfer)
}

self.onmessage = async (ev: MessageEvent<RunWorkerRequest>) => {
  const { toolId, inputs, options, names } = ev.data
  try {
    const runner = await loadRunner(toolId)
    const outputs = await runner(inputs.map((b) => new Uint8Array(b)) as never, options as never, {
      progress: (value) => post({ type: 'progress', value }),
      signal,
      names,
    })
    const wire = outputs.map((o) => {
      const data = o.data.buffer.slice(o.data.byteOffset, o.data.byteOffset + o.data.byteLength) as ArrayBuffer
      return { name: o.name, mime: o.mime, data, warnings: o.warnings }
    })
    post({ type: 'done', outputs: wire }, wire.map((o) => o.data))
  } catch (e) {
    post({
      type: 'error',
      code: e instanceof ToolError ? e.code : 'unknown',
      // Lỗi không phải ToolError: giữ tên + thông điệp + vị trí để chẩn đoán (UI chỉ hiện thông báo chung).
      message: e instanceof Error ? `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(0, 4).join('\n')}` : ''}` : String(e),
    })
  }
}
