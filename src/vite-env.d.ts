/// <reference types="vite/client" />
declare module '*.mjs?url' {
  const url: string
  export default url
}
declare module '*.wasm?url' {
  const url: string
  export default url
}
declare module '*.ttf?url' {
  const url: string
  export default url
}
declare module '@jsquash/avif/codec/enc/avif_enc.wasm?url' {
  const url: string
  export default url
}
declare module '@jsquash/avif/codec/enc/avif_enc.js' {
  const factory: unknown
  export default factory
}
declare module '@jsquash/avif/meta.js' {
  export const defaultOptions: Record<string, unknown>
}
