import { Shuffle } from 'lucide-react'
import type { ToolMeta } from '../types'

// Trang gợi ý định dạng đích: có tuyến riêng (/tools/convert) và không có run.ts, chỉ xuất hiện trong danh mục.
export const meta: ToolMeta = {
  id: 'convert',
  group: 'convert',
  icon: Shuffle,
  inputs: { extensions: [], mimes: [], min: 1, max: 1, ordered: false },
  params: [],
}
