import type { ParamDef } from './types'

export const rangesParam = (key = 'ranges', hintKey = 'params.ranges.hint', labelKey = 'params.ranges.label'): ParamDef => ({
  key,
  type: 'pageRanges',
  labelKey,
  hintKey,
})
