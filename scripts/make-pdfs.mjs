// Tạo PDF mẫu bằng pdf-lib: node scripts/make-pdfs.mjs <thư mục đích>
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const out = process.argv[2]
async function make(pages, label) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`${label} - page ${i}/${pages}`, { x: 60, y: 760, size: 24, font, color: rgb(0.1, 0.1, 0.1) })
  }
  return doc.save()
}
await writeFile(join(out, 'sample-1p.pdf'), await make(1, 'Sample'))
await writeFile(join(out, 'sample-10p.pdf'), await make(10, 'Sample'))

// PDF nặng chữ, chưa tối ưu cấu trúc: dùng để kiểm thử nén
{
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 20; i++) {
    const p = doc.addPage()
    for (let l = 0; l < 40; l++) {
      p.drawText(`Line ${l} of page ${i}: the quick brown fox jumps over the lazy dog`, { x: 40, y: 800 - l * 17, size: 10, font })
    }
  }
  await writeFile(join(out, 'heavy-20p.pdf'), await doc.save({ useObjectStreams: false }))
}

// PDF hỏng cấu trúc (bảng xref cổ điển): nội dung còn nguyên nhưng trình đọc nghiêm ngặt như qpdf không mở được
{
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 10; i++) {
    doc.addPage([595, 842]).drawText(`Sample - page ${i}/10`, { x: 60, y: 760, size: 24, font, color: rgb(0.1, 0.1, 0.1) })
  }
  const good = Buffer.from(await doc.save({ useObjectStreams: false })).toString('latin1')
  const xrefAt = good.indexOf('\nxref\n') + 1
  const variants = {
    'damaged-startxref.pdf': good.replace(/startxref\s+\d+/, 'startxref\n987654'), // startxref trỏ ra ngoài tệp
    'damaged-offsets.pdf': good.replace(/(\d{10}) 00000 n/g, (_, n) => `${String(Number(n) + 7).padStart(10, '0')} 00000 n`), // offset các object lệch
    'damaged-notrailer.pdf': good.slice(0, xrefAt), // tệp bị cắt trước bảng xref và trailer
  }
  for (const [name, text] of Object.entries(variants)) await writeFile(join(out, name), Buffer.from(text, 'latin1'))
}
