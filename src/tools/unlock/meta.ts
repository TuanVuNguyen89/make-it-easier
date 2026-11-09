import { LockOpen } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'unlock',
  group: 'secure',
  icon: LockOpen,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [{ key: 'password', type: 'password', labelKey: 'params.password.label', hintKey: 'params.password.unlockHint', required: true }],
}
