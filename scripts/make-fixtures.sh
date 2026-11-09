#!/usr/bin/env bash
# Tạo lại tests/fixtures. Cần: node, ghostscript (gs), python3 + Pillow.
set -euo pipefail
cd "$(dirname "$0")/.."
F=tests/fixtures
mkdir -p "$F"
node scripts/make-pdfs.mjs "$F"
# PDF có mật khẩu mở: "secret"
gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -sOwnerPassword=owner -sUserPassword=secret \
  -sOutputFile="$F/encrypted-secret.pdf" "$F/sample-1p.pdf"
# PDF hỏng: cắt bớt nửa cuối
head -c 400 "$F/sample-10p.pdf" > "$F/corrupt.pdf"
printf 'Not a pdf\n' > "$F/not-a-pdf.pdf"
python3 - <<'PY'
from PIL import Image, ImageDraw
for name, fmt, color, size in [("image-red.png","PNG",(200,60,60),(320,240)),("image-blue.jpg","JPEG",(40,90,190),(320,240)),("image-wide.png","PNG",(60,160,90),(640,240)),("image-tall.jpg","JPEG",(190,150,40),(200,400))]:
    im = Image.new("RGB",size,color)
    ImageDraw.Draw(im).rectangle((10,10,size[0]-10,size[1]-10),outline=(255,255,255),width=4)
    im.save("tests/fixtures/"+name,fmt)
PY
printf 'Xin chao\nHello world\nDong thu ba\n' > "$F/sample.txt"
printf 'Tiếng Việt có dấu: Ặ ẩ ữ Đ đ\nDòng thứ hai\n\n\tThụt đầu dòng\n' > "$F/vietnamese.txt"
ls -l "$F"
# Office: report.docx và table.xlsx do LibreOffice tạo từ tests/fixtures/src (chạy tay: cần soffice); deck.pptx do pptxgenjs tạo
node scripts/make-office.mjs "$F"
