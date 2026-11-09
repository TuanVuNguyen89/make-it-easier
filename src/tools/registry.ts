import type { ToolGroup, ToolKind, ToolMeta } from './types'

const modules = import.meta.glob<{ meta: ToolMeta }>('./*/meta.ts', { eager: true })

export const tools: ToolMeta[] = Object.values(modules)
  .map((m) => m.meta)
  .sort((a, b) => a.id.localeCompare(b.id))

/** Thứ tự nhóm hiển thị ở danh mục, theo loại công cụ. */
export const groupsByKind: Record<ToolKind, ToolGroup[]> = {
  pdf: ['organize', 'markup', 'secure', 'convert'],
  image: ['optimize', 'modify', 'imgconvert'],
}

export const toolsOfKind = (kind: ToolKind): ToolMeta[] => tools.filter((t) => (t.kind ?? 'pdf') === kind)

export function getTool(id: string): ToolMeta | undefined {
  return tools.find((t) => t.id === id)
}
