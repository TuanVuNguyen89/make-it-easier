import { XMLParser } from 'fast-xml-parser'

/** Cây XML đơn giản: tên thẻ không có tiền tố không gian tên, thuộc tính, con theo đúng thứ tự, và chữ trực tiếp. */
export interface XNode {
  name: string
  attrs: Record<string, string>
  children: XNode[]
  /** Chữ nằm trực tiếp trong thẻ (nối các đoạn #text). */
  text: string
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  ignoreDeclaration: true,
})

type Raw = Record<string, unknown>

function build(items: Raw[]): XNode[] {
  const out: XNode[] = []
  for (const item of items) {
    const attrs = (item[':@'] as Record<string, string> | undefined) ?? {}
    for (const key of Object.keys(item)) {
      if (key === ':@') continue
      if (key === '#text') continue // chữ trực tiếp được gom vào `text` của thẻ cha bên dưới
      const kids = item[key] as Raw[]
      const node: XNode = { name: key.replace(/^[^:]*:/, ''), attrs: {}, children: build(kids), text: '' }
      for (const [k, v] of Object.entries(attrs)) node.attrs[k.replace(/^[^:]*:/, '')] = String(v)
      node.text = kids.filter((k) => '#text' in k).map((k) => String(k['#text'] ?? '')).join('')
      out.push(node)
    }
  }
  return out
}

export function parseXml(xml: string): XNode {
  const roots = build(parser.parse(xml) as Raw[])
  const root = roots[0]
  if (!root) throw new Error('Empty XML')
  return root
}

export const child = (n: XNode | undefined, name: string): XNode | undefined => n?.children.find((c) => c.name === name)
export const kids = (n: XNode | undefined, name: string): XNode[] => n?.children.filter((c) => c.name === name) ?? []
/** Tìm theo đường dẫn tên thẻ, ví dụ path(n, 'pPr', 'pStyle'). */
export function path(n: XNode | undefined, ...names: string[]): XNode | undefined {
  let cur = n
  for (const name of names) cur = child(cur, name)
  return cur
}
export function* walk(n: XNode): Generator<XNode> {
  yield n
  for (const c of n.children) yield* walk(c)
}

export const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
