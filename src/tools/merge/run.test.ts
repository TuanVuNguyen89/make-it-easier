import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { run } from './run'

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`))
const ctx = () => ({ progress: () => {}, signal: new AbortController().signal })
const pages = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount()

describe('merge', () => {
  it('gộp theo đúng thứ tự và tổng số trang', async () => {
    const [out] = await run([fixture('sample-1p.pdf'), fixture('sample-10p.pdf')], {}, ctx())
    expect(out!.mime).toBe('application/pdf')
    expect(await pages(out!.data)).toBe(11)
    const [rev] = await run([fixture('sample-10p.pdf'), fixture('sample-1p.pdf')], {}, ctx())
    expect(await pages(rev!.data)).toBe(11)
  })

  it('báo tiến trình tăng dần đến 1', async () => {
    const seen: number[] = []
    await run([fixture('sample-1p.pdf'), fixture('sample-1p.pdf')], {}, {
      progress: (f) => seen.push(f),
      signal: new AbortController().signal,
    })
    expect(seen).toEqual([0.5, 1])
  })

  it('PDF có mật khẩu: lỗi encrypted, không xuất file', async () => {
    await expect(
      run([fixture('sample-1p.pdf'), fixture('encrypted-secret.pdf')], {}, ctx()),
    ).rejects.toMatchObject({ code: 'encrypted' })
  })

  it('file không phải PDF hoặc hỏng: lỗi invalid-pdf', async () => {
    await expect(
      run([fixture('sample-1p.pdf'), fixture('not-a-pdf.pdf')], {}, ctx()),
    ).rejects.toMatchObject({ code: 'invalid-pdf' })
    await expect(
      run([fixture('sample-1p.pdf'), fixture('corrupt.pdf')], {}, ctx()),
    ).rejects.toMatchObject({ code: 'invalid-pdf' })
  })

  it('hủy giữa chừng thì dừng với lỗi aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      run([fixture('sample-1p.pdf'), fixture('sample-1p.pdf')], {}, { progress: () => {}, signal: ac.signal }),
    ).rejects.toMatchObject({ code: 'aborted' })
  })
})
