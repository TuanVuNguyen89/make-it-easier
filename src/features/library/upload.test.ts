import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { openLibraryDb } from '@/storage/db'
import { createRepository, type Repository } from '@/storage/repository'
import { uploadFiles } from './upload'

let repo: Repository
let n = 0
beforeEach(async () => {
  repo = createRepository(await openLibraryDb(`up-${n++}-${Math.random()}`))
})

const file = (name: string, type = '') => new File([readFileSync(`tests/fixtures/${name}`)], name, { type })

describe('uploadFiles', () => {
  it('thêm nhiều tệp, đọc số trang PDF, nhận loại theo phần mở rộng', async () => {
    const res = await uploadFiles(repo, [file('sample-10p.pdf'), file('image-red.png'), file('sample.txt')], null)
    expect(res).toEqual({ added: 3, images: 1, failed: [] })
    const docs = await repo.listDocuments({ view: 'all' })
    const by = Object.fromEntries(docs.map((d) => [d.name, d]))
    expect(by['sample-10p.pdf']).toMatchObject({ mime: 'application/pdf', pageCount: 10 })
    expect(by['image-red.png']!.mime).toBe('image/png')
    expect(by['sample.txt']!.mime).toBe('text/plain')
  })

  it('nhận PDF có mật khẩu (cần cho công cụ mở khóa)', async () => {
    const res = await uploadFiles(repo, [file('encrypted-secret.pdf')], null)
    expect(res.added).toBe(1)
  })

  it('PDF hỏng bị từ chối riêng, không ảnh hưởng tệp khác', async () => {
    const res = await uploadFiles(repo, [file('corrupt.pdf'), file('sample-1p.pdf'), file('not-a-pdf.pdf')], null)
    expect(res.added).toBe(1)
    expect(res.failed).toEqual([
      { name: 'corrupt.pdf', reason: 'invalid-pdf' },
      { name: 'not-a-pdf.pdf', reason: 'invalid-pdf' },
    ])
    expect(await repo.listDocuments({ view: 'all' })).toHaveLength(1)
  })

  it('báo tiến trình theo từng tệp', async () => {
    const seen: number[] = []
    await uploadFiles(repo, [file('sample.txt'), file('sample.txt')], null, (d) => seen.push(d))
    expect(seen).toEqual([1, 2])
  })
})
