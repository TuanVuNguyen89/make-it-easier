const BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i).toLowerCase() : ''
}

/** Ưu tiên phần mở rộng (trình duyệt hay để trống type), sau đó mới đến file.type. */
export function detectMime(name: string, declared = ''): string {
  return BY_EXT[extOf(name)] ?? (declared || 'application/octet-stream')
}

export const isPdf = (mime: string) => mime === 'application/pdf'
