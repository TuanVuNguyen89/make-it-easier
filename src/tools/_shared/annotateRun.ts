import { applyAnnotationsDetailed, type Annotation } from '@/lib/annotations'
import type { RunFn } from '../types'

/** Dùng chung cho Chú thích, Chỉnh sửa và Ký: áp dụng danh sách thành phần lên PDF, xuất tệp mới (kèm cảnh báo nếu có). */
export const annotateRun =
  (outName: string): RunFn<{ annotations: Annotation[] }> =>
  async (inputs, options, ctx) => {
    const { bytes, warnings } = await applyAnnotationsDetailed(inputs[0]!, options.annotations, ctx.signal, ctx.progress)
    return [{ name: outName, mime: 'application/pdf', data: bytes, ...(warnings.length && { warnings }) }]
  }
