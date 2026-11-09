import type { RunFn } from './types'

// Mỗi công cụ là một thư mục src/tools/<id>/ có run.ts; nạp lười để không kéo mã nặng vào bundle chính.
const loaders = import.meta.glob<{ run: RunFn<never> }>('./*/run.ts')

export async function loadRunner(toolId: string): Promise<RunFn<never>> {
  const loader = loaders[`./${toolId}/run.ts`]
  if (!loader) throw new Error(`Unknown tool: ${toolId}`)
  return (await loader()).run
}
