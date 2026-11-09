import { Droplets } from 'lucide-react'
import type { ToolMeta } from '../types'
import { rangesParam } from '../_ranges-meta'

export const meta: ToolMeta = {
  id: 'watermark',
  group: 'organize',
  icon: Droplets,
  // Tệp PDF (bắt buộc) và, tùy chọn, một ảnh PNG/JPG làm hình mờ; nếu không có ảnh thì dùng chữ.
  inputs: {
    extensions: ['.pdf', '.png', '.jpg', '.jpeg'],
    mimes: ['application/pdf', 'image/png', 'image/jpeg'],
    min: 1,
    max: 2,
    ordered: false,
  },
  params: [
    { key: 'text', type: 'text', labelKey: 'params.watermark.text', hintKey: 'params.watermark.textHint', default: '' },
    { key: 'size', type: 'number', labelKey: 'params.fontSize', default: 48, min: 8, max: 200 },
    { key: 'scale', type: 'number', labelKey: 'params.watermark.scale', default: 50, min: 5, max: 100 },
    { key: 'opacity', type: 'number', labelKey: 'params.watermark.opacity', default: 30, min: 5, max: 100 },
    { key: 'angle', type: 'number', labelKey: 'params.watermark.angle', default: 45, min: -180, max: 180 },
    rangesParam('ranges', 'params.ranges.allWatermarkHint'),
  ],
}
