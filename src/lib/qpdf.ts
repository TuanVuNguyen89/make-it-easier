import { ToolError } from '@/tools/types'

let wasmBinaryOverride: Uint8Array | undefined

/** Chỉ dùng trong test (Node không fetch được URL wasm của Vite). */
export function setQpdfWasmBinary(bytes: Uint8Array): void {
  wasmBinaryOverride = bytes
}

interface QpdfApi {
  callMain(args: string[]): number
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array }
}

export interface QpdfResult {
  code: number
  output: Uint8Array | null
  stderr: string
}

/**
 * Chạy qpdf với một tệp vào và một tệp ra. Mỗi lần gọi tạo instance mới nên hệ tệp ảo luôn sạch.
 * qpdf: 0 = thành công, 3 = thành công kèm cảnh báo, 2 = lỗi.
 * Nạp lười: wasm 1,3 MB chỉ tải khi chạy công cụ (constitution IV).
 */
export async function runQpdf(args: string[], input: Uint8Array, opts: { noOutput?: boolean } = {}): Promise<QpdfResult> {
  const { default: createModule } = await import('@neslinesli93/qpdf-wasm')
  let wasmUrl: string | undefined
  if (!wasmBinaryOverride) wasmUrl = (await import('@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url')).default

  let stderr = ''
  const options = {
    noInitialRun: true,
    ...(wasmBinaryOverride ? { wasmBinary: wasmBinaryOverride } : { locateFile: () => wasmUrl! }),
    print: () => {},
    printErr: (s: string) => {
      stderr += `${s}\n`
    },
  }
  const qpdf = await (createModule as unknown as (o: typeof options) => Promise<QpdfApi>)(options)
  qpdf.FS.writeFile('/in.pdf', input)
  const code = qpdf.callMain(opts.noOutput ? [...args, '/in.pdf'] : [...args, '/in.pdf', '/out.pdf'])
  let output: Uint8Array | null = null
  if (!opts.noOutput && (code === 0 || code === 3)) {
    try {
      output = qpdf.FS.readFile('/out.pdf')
    } catch {
      output = null
    }
  }
  return { code, output, stderr }
}

/**
 * Đổi lỗi của qpdf thành mã lỗi công cụ. Không đưa mật khẩu vào thông báo.
 * Không dựa vào văn bản stderr (trên Node qpdf in thẳng ra tiến trình): hỏi pdf-lib xem file có mã hóa không.
 */
export async function qpdfError(input: Uint8Array, stderr: string, hadPassword: boolean): Promise<ToolError> {
  if (/invalid password/i.test(stderr) || (await isEncrypted(input))) {
    return new ToolError(hadPassword ? 'wrong-password' : 'encrypted')
  }
  return new ToolError('invalid-pdf', 'qpdf could not process this file')
}

async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  const { PDFDocument } = await import('pdf-lib')
  try {
    await PDFDocument.load(bytes)
    return false
  } catch (e) {
    return /encrypt/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e))
  }
}
