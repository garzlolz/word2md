import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetOdtPath = path.join(__dirname, 'test.odt');

console.log('正在產生測試 ODT 檔案...');

const zip = new AdmZip();

// 1. 寫入 mimetype
zip.addFile('mimetype', Buffer.from('application/vnd.oasis.opendocument.text', 'utf-8'));

// 2. 寫入 META-INF/manifest.xml
const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="Pictures/test.png" manifest:media-type="image/png"/>
</manifest:manifest>`;
zip.addFile('META-INF/', Buffer.alloc(0)); // 建立資料夾
zip.addFile('META-INF/manifest.xml', Buffer.from(manifestXml, 'utf-8'));

// 3. 寫入 content.xml
const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content 
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" 
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" 
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" 
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" 
    xmlns:xlink="http://www.w3.org/1999/xlink" 
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
    xmlns:svg="http://www.w3.org/2000/svg"
    office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="T1" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="T2" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
    <style:style style:name="T3" style:family="text">
      <style:text-properties style:text-line-through-style="solid"/>
    </style:style>
    <style:style style:name="T4" style:family="text">
      <style:text-properties style:text-underline-style="solid"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      <text:h text:outline-level="1">主標題：測試文件</text:h>
      <text:p>這是一段一般的段落文字，用來測試基礎排版是否正常。</text:p>
      
      <text:h text:outline-level="2">次標題：格式化文字測試</text:h>
      <text:p>
        這裡包含 <text:span text:style-name="T1">粗體文字</text:span>、
        <text:span text:style-name="T2">斜體文字</text:span>、
        <text:span text:style-name="T3">刪除線文字</text:span>，以及
        <text:span text:style-name="T4">底線文字</text:span>。
      </text:p>

      <text:h text:outline-level="2">次標題：超連結測試</text:h>
      <text:p>請造訪我們的官方網站：<text:a xlink:href="https://github.com">GitHub 首頁</text:a>。</text:p>

      <text:h text:outline-level="2">次標題：清單測試</text:h>
      <text:list>
        <text:list-item><text:p>無序清單項目 1</text:p></text:list-item>
        <text:list-item><text:p>無序清單項目 2</text:p></text:list-item>
        <text:list-item><text:p>無序清單項目 3</text:p></text:list-item>
      </text:list>

      <text:h text:outline-level="2">次標題：表格測試</text:h>
      <table:table>
        <table:table-row>
          <table:table-cell><text:p>欄位 1</text:p></table:table-cell>
          <table:table-cell><text:p>欄位 2</text:p></table:table-cell>
          <table:table-cell><text:p>欄位 3</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell><text:p>資料 A</text:p></table:table-cell>
          <table:table-cell><text:p>資料 B</text:p></table:table-cell>
          <table:table-cell><text:p>資料 C</text:p></table:table-cell>
        </table:table-row>
      </table:table>

      <text:h text:outline-level="2">次標題：圖片測試</text:h>
      <text:p>
        下面應該有一張圖片：
        <draw:frame svg:width="100pt" svg:height="100pt">
          <draw:image xlink:href="Pictures/test.png" />
        </draw:frame>
      </text:p>
    </office:text>
  </office:body>
</office:document-content>`;
zip.addFile('content.xml', Buffer.from(contentXml, 'utf-8'));

// 4. 寫入一張假圖片 (1x1 transparent PNG)
const dummyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
zip.addFile('Pictures/', Buffer.alloc(0));
zip.addFile('Pictures/test.png', Buffer.from(dummyPngBase64, 'base64'));

// 5. 輸出 .odt 檔案
zip.writeZip(targetOdtPath);
console.log(`測試檔案產生完成：${targetOdtPath}`);
