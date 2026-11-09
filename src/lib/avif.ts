import type { Bitmap } from './imageOps'

let wasmBinary: Uint8Array | undefined
/** Chỉ dùng trong test (Node không fetch được URL wasm của Vite). */
export function setAvifWasmBinary(bytes: Uint8Array): void {
  wasmBinary = bytes
}

interface AvifModule {
  encode(rgba: Uint8Array, width: number, height: number, options: Record<string, unknown>): Uint8Array | null
}
let mod: Promise<AvifModule> | undefined

/**
 * Nạp thẳng bộ mã hóa AVIF đơn luồng. Hàm init() của jsquash tự chọn bản đa luồng khi trình duyệt hỗ trợ,
 * mà bản đó cần SharedArrayBuffer (trang không bật cross-origin isolation) nên sẽ lỗi.
 */
function load(): Promise<AvifModule> {
  mod ??= (async () => {
    const [{ default: factory }, { defaultOptions }] = await Promise.all([
      import('@jsquash/avif/codec/enc/avif_enc.js'),
      import('@jsquash/avif/meta.js'),
    ])
    let locate: Record<string, unknown>
    if (wasmBinary) locate = { wasmBinary }
    else {
      const url = (await import('@jsquash/avif/codec/enc/avif_enc.wasm?url')).default
      locate = { locateFile: () => url }
    }
    const m = (await (factory as unknown as (o: Record<string, unknown>) => Promise<AvifModule>)(locate)) as AvifModule & { defaults?: unknown }
    m.defaults = defaultOptions
    return m
  })()
  return mod
}

/** quality 1..100. */
export async function encodeAvif(bm: Bitmap, quality: number): Promise<Uint8Array> {
  const m = (await load()) as AvifModule & { defaults: Record<string, unknown> }
  const out = m.encode(new Uint8Array(bm.data.buffer, bm.data.byteOffset, bm.data.byteLength), bm.width, bm.height, {
    ...m.defaults,
    quality,
    qualityAlpha: -1,
  })
  if (!out) throw new Error('AVIF encoding failed')
  return new Uint8Array(out)
}
