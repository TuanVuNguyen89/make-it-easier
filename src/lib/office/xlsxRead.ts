import { ToolError } from '@/tools/types'
import { child, kids, parseXml, walk, type XNode } from './xml'
import { readText, resolvePath, unzipOffice } from './zip'

export interface Sheet {
  name: string
  /** Lưới ô; ô trống là chuỗi rỗng. Số được giữ dạng số. */
  rows: (string | number)[][]
}

/** "AB12" → chỉ số cột 27 (từ 0). */
export function colIndex(ref: string): number {
  let n = 0
  for (const ch of /^[A-Z]+/i.exec(ref)?.[0] ?? '') n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64)
  return n - 1
}

const textOf = (si: XNode): string => [...walk(si)].filter((n) => n.name === 't').map((n) => n.text).join('')

/** Đọc XLSX: các trang tính theo thứ tự, ô chuỗi (shared/inline/formula), số, logic. Không đọc định dạng. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipOffice(bytes)
  const wbXml = readText(files, 'xl/workbook.xml')
  if (!wbXml) throw new ToolError('invalid-office', 'xl/workbook.xml is missing')
  const wb = parseXml(wbXml)
  const relsXml = readText(files, 'xl/_rels/workbook.xml.rels')
  const rels = new Map<string, string>()
  if (relsXml) for (const r of kids(parseXml(relsXml), 'Relationship')) rels.set(r.attrs.Id ?? '', r.attrs.Target ?? '')

  const sstXml = readText(files, 'xl/sharedStrings.xml')
  const shared = sstXml ? kids(parseXml(sstXml), 'si').map(textOf) : []

  const sheets: Sheet[] = []
  for (const s of kids(child(wb, 'sheets'), 'sheet')) {
    const target = rels.get(s.attrs.id ?? '')
    const xml = target ? readText(files, resolvePath('xl', target)) : null
    if (!xml) continue
    const data = child(parseXml(xml), 'sheetData')
    const grid: (string | number)[][] = []
    let width = 0
    kids(data, 'row').forEach((row, ri) => {
      const r = row.attrs.r ? Number(row.attrs.r) - 1 : ri
      const cells: (string | number)[] = []
      for (const c of kids(row, 'c')) {
        const col = c.attrs.r ? colIndex(c.attrs.r) : cells.length
        const v = child(c, 'v')?.text ?? ''
        let value: string | number
        switch (c.attrs.t) {
          case 's': value = shared[Number(v)] ?? ''; break
          case 'inlineStr': value = textOf(child(c, 'is') ?? c); break
          case 'b': value = v === '1' ? 'TRUE' : 'FALSE'; break
          case 'str': case 'e': value = v; break
          default: value = v !== '' && Number.isFinite(Number(v)) ? Number(v) : v
        }
        while (cells.length < col) cells.push('')
        cells[col] = value
      }
      while (grid.length < r) grid.push([])
      grid[r] = cells
      width = Math.max(width, cells.length)
    })
    sheets.push({ name: s.attrs.name ?? `Sheet${sheets.length + 1}`, rows: grid.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) })
  }
  if (sheets.length === 0) throw new ToolError('invalid-office', 'Workbook has no readable sheets')
  return sheets
}

export const cellText = (v: string | number): string => (typeof v === 'number' ? String(Number(v.toPrecision(12))) : v)
