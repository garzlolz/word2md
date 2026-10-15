import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 產生標準符合規格的測試用 PDF 1.4 文件
 * 包含多級標題、段落、粗體文字與項目清單
 * @param {string} [outputPath] 輸出路徑
 * @returns {string} 產生的檔案路徑
 */
export function generateTestPdf(outputPath) {
  const objects = [];

  // 1 0 obj: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2 0 obj: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3 0 obj: Page
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n');

  // Page 1 Stream Content
  // F1: Helvetica (24pt 標題一, 16pt 標題二, 12pt 正文)
  // F2: Helvetica-Bold
  const streamContent = `
BT
/F1 24 Tf
72 710 Td
(PDF Document Test Title) Tj
ET

BT
/F1 16 Tf
72 660 Td
(Section 1: Basic Formatting) Tj
ET

BT
/F1 12 Tf
72 625 Td
(This is a standard body paragraph extracted from a PDF document.) Tj
ET

BT
/F2 12 Tf
72 590 Td
(Notice for Readers) Tj
ET

BT
/F1 12 Tf
72 555 Td
(- Feature item A: Client-side parsing) Tj
ET

BT
/F1 12 Tf
72 535 Td
(- Feature item B: Fast and secure) Tj
ET

BT
/F1 12 Tf
72 515 Td
(- Feature item C: Zero server upload) Tj
ET

BT
/F1 16 Tf
72 465 Td
(Section 2: Concluding Thoughts) Tj
ET

BT
/F1 12 Tf
72 430 Td
(PDF to Markdown conversion helps migrate documents cleanly.) Tj
ET
`.trim();

  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  // 4 0 obj: Contents Stream
  objects.push(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`);

  // 5 0 obj: Font F1 (Helvetica)
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  // 6 0 obj: Font F2 (Helvetica-Bold)
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  const header = '%PDF-1.4\n';
  let body = '';
  const xrefOffsets = [0];

  let currentOffset = Buffer.byteLength(header, 'utf8');

  for (const obj of objects) {
    xrefOffsets.push(currentOffset);
    body += obj;
    currentOffset += Buffer.byteLength(obj, 'utf8');
  }

  const xrefStart = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(xrefOffsets[i]).padStart(10, '0');
    xref += `${offsetStr} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const fullPdf = header + body + xref + trailer;
  const targetPath = outputPath || path.join(__dirname, 'test.pdf');
  fs.writeFileSync(targetPath, Buffer.from(fullPdf, 'utf8'));
  console.log(`測試 PDF 產生完成：${targetPath}`);
  return targetPath;
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  generateTestPdf();
}

