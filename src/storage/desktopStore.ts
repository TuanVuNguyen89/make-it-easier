import type { LibraryStore } from './db'

/** Cầu nối do `electron/preload.cjs` đưa vào; không có khi chạy trên web. */
export interface DesktopBridge {
  platform: string
  store(method: string, args: unknown[]): Promise<{ ok: true; value: unknown } | { ok: false; name: string; message: string }>
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

export const isDesktop = () => typeof window !== 'undefined' && window.desktop !== undefined

/** Kho dữ liệu chạy trong tiến trình chính của app máy tính (SQLite + tệp thật), gọi qua IPC. */
export function desktopStore(bridge: DesktopBridge): LibraryStore {
  const call = async (method: string, ...args: unknown[]) => {
    const r = await bridge.store(method, args)
    if (!r.ok) throw Object.assign(new Error(r.message), { name: r.name })
    return r.value
  }
  return {
    get: async (s, k) => ((await call('get', s, k)) ?? undefined) as never,
    getAll: async (s) => (await call('getAll', s)) as never,
    getAllFromIndex: async (s, i, v) => (await call('getAllFromIndex', s, i, v)) as never,
    put: (s, v) => call('put', s, v),
    delete: async (s, k) => void (await call('delete', s, k)),
    putDocumentWithBlob: async (d, b) => void (await call('putDocumentWithBlob', d, b)),
    deleteDocumentWithBlob: async (d, b) => void (await call('deleteDocumentWithBlob', d, b)),
  }
}
