import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { parseOdtXml } from './src/domain/odt/odt-parser.js';
import { sanitizeFileName } from './src/utils/dom.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const inputFileName = args[0] || 'test.odt';
  const inputFilePath = path.isAbsolute(inputFileName) 
    ? inputFileName 
    : path.join(__dirname, inputFileName);

  if (!fs.existsSync(inputFilePath)) {
    console.error(`錯誤：找不到輸入檔案 ${inputFilePath}`);
    process.exit(1);
  }

  console.log(`開始轉換：${path.basename(inputFilePath)}`);
  const fileBuffer = fs.readFileSync(inputFilePath);

  const zip = new AdmZip(fileBuffer);
  const contentXmlEntry = zip.getEntry('content.xml');
  if (!contentXmlEntry) {
    console.error('錯誤：無效的 ODT 檔案，找不到 content.xml');
    process.exit(1);
  }

  const contentXmlText = contentXmlEntry.getData().toString('utf8');
  const parser = new DOMParser();
  const { markdown, imageMap } = parseOdtXml(contentXmlText, parser);

  // 決定輸出目錄（產出於與輸入檔案相同目錄）
  const baseName = path.parse(inputFilePath).name;
  const sanitizedName = sanitizeFileName(baseName);
  const targetDir = path.dirname(inputFilePath);

  // 提取圖片
  const imageKeys = Object.keys(imageMap);
  let imageCount = 0;
  if (imageKeys.length > 0) {
    const picturesDir = path.join(targetDir, 'Pictures');
    fs.mkdirSync(picturesDir, { recursive: true });

    for (const [zipPath, imgName] of Object.entries(imageMap)) {
      const zipEntry = zip.getEntry(zipPath);
      if (zipEntry) {
        const destPath = path.join(picturesDir, imgName);
        fs.writeFileSync(destPath, zipEntry.getData());
        imageCount++;
      }
    }
  }

  // 寫入 Markdown
  const mdFilePath = path.join(targetDir, `${sanitizedName}.md`);
  fs.writeFileSync(mdFilePath, markdown, 'utf8');

  console.log('\n轉換完成！');
  console.log(`Markdown 檔案：${mdFilePath}`);
  console.log(`擷取圖片數：${imageCount} 張`);
}

main().catch(err => {
  console.error('發生未預期錯誤：', err);
});
