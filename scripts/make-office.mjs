// Tạo fixture PPTX bằng pptxgenjs: node scripts/make-office.mjs <thư mục đích>
import PptxGenJS from 'pptxgenjs'
import { join } from 'node:path'

const out = process.argv[2]
const pres = new PptxGenJS()
pres.layout = 'LAYOUT_16x9' // 10in x 5.625in
pres.title = 'Bài thuyết trình thử'

const s1 = pres.addSlide()
s1.addText('Báo cáo tổng kết năm', { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 32, bold: true })
s1.addText('Công ty Make it easier — Nguyễn Văn An', { x: 0.5, y: 1.6, w: 9, h: 0.6, fontSize: 18 })

const s2 = pres.addSlide()
s2.addText('Điểm chính', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true })
s2.addText(
  [
    { text: 'Doanh thu tăng mười hai phần trăm', options: { bullet: true, breakLine: true } },
    { text: 'Chi phí giảm ba phần trăm', options: { bullet: true } },
  ],
  { x: 0.5, y: 1.3, w: 5, h: 2, fontSize: 18 },
)
s2.addImage({ path: 'tests/fixtures/image-red.png', x: 6, y: 1.3, w: 3, h: 2.25 })

const s3 = pres.addSlide()
s3.addText('Cảm ơn', { x: 3, y: 2, w: 4, h: 1, fontSize: 36, align: 'center' })

await pres.writeFile({ fileName: join(out, 'deck.pptx') })
