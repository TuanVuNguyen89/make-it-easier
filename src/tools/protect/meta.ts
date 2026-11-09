import { Lock } from 'lucide-react'
import type { ToolMeta } from '../types'

export const meta: ToolMeta = {
  id: 'protect',
  group: 'secure',
  icon: Lock,
  inputs: { extensions: ['.pdf'], mimes: ['application/pdf'], min: 1, max: 1, ordered: false },
  params: [
    { key: 'password', type: 'password', labelKey: 'params.password.label', hintKey: 'params.password.protectHint', required: true },
    { key: 'confirm', type: 'password', labelKey: 'params.password.confirm', required: true, mustMatch: 'password' },
  ],
}
