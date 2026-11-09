export type FontWeight = 'regular' | 'bold' | 'italic'

const overrides: Partial<Record<FontWeight, Uint8Array>> = {}

/** Chỉ dùng trong test (Node không fetch được URL của Vite). */
export function setUnicodeFontBytes(bytes: Uint8Array, weight: FontWeight = 'regular'): void {
  overrides[weight] = bytes
}

const loaders: Record<FontWeight, () => Promise<{ default: string }>> = {
  regular: () => import('dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'),
  bold: () => import('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url'),
  italic: () => import('dejavu-fonts-ttf/ttf/DejaVuSans-Oblique.ttf?url'),
}

/** Phông Unicode (DejaVu Sans, có đủ tiếng Việt) cho chữ không nằm trong bộ phông chuẩn của PDF. Nạp lười. */
export async function loadUnicodeFont(weight: FontWeight = 'regular'): Promise<Uint8Array> {
  const o = overrides[weight]
  if (o) return o
  const res = await fetch((await loaders[weight]()).default)
  if (!res.ok) throw new Error('Cannot load font')
  return new Uint8Array(await res.arrayBuffer())
}

export type FamilyKey = 'sans' | 'serif' | 'mono'
export type FaceStyle = 'regular' | 'bold' | 'italic' | 'bolditalic'

const familyOverrides = new Map<string, Uint8Array>()

/** Chỉ dùng trong test. */
export function setFamilyFontBytes(family: FamilyKey, style: FaceStyle, bytes: Uint8Array): void {
  familyOverrides.set(`${family}-${style}`, bytes)
}

export const faceStyle = (bold: boolean, italic: boolean): FaceStyle => (bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular')

/** URL của tệp phông (do `npm run assets` chép vào public/fonts), dùng cho cả xem trước (@font-face) lẫn khi xuất. */
export const familyFontUrl = (family: FamilyKey, style: FaceStyle) => `${import.meta.env.BASE_URL}fonts/${family}-${style}.ttf`

/**
 * Phông tương đương số đo với phông gốc, có đủ tiếng Việt (Liberation): sans = Liberation Sans (như Arial/Helvetica),
 * serif = Liberation Serif (như Times New Roman), mono = Liberation Mono (như Courier New). Nạp lười từng biến thể khi cần.
 */
export async function loadFamilyFont(family: FamilyKey, bold: boolean, italic: boolean): Promise<Uint8Array> {
  const style = faceStyle(bold, italic)
  const o = familyOverrides.get(`${family}-${style}`)
  if (o) return o
  const res = await fetch(familyFontUrl(family, style))
  if (!res.ok) throw new Error('Cannot load font')
  return new Uint8Array(await res.arrayBuffer())
}
