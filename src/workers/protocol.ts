export interface RunWorkerRequest {
  toolId: string
  inputs: ArrayBuffer[]
  options: Record<string, unknown>
  names?: string[]
}

export interface WireOutput {
  name: string
  mime: string
  data: ArrayBuffer
  warnings?: string[]
}

export type RunWorkerResponse =
  | { type: 'progress'; value: number }
  | { type: 'done'; outputs: WireOutput[] }
  | { type: 'error'; code: string; message: string }
