const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

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
    office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="T1" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="T2" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      <text:h text:outline-level="1">這是大標題 H1</text:h>
      <text:p>這是一段普通文字，包含了 <text:span text:style-name="T1">粗體文字</text:span> 以及 <text:span text:style-name="T2">斜體文字</text:span>。</text:p>
      
      <text:h text:outline-level="2">這是次標題 H2</text:h>
      <text:p>這裡是一個列表範例：</text:p>
      <text:list text:style-name="L1">
        <text:list-item>
          <text:p>列表項目一</text:p>
        </text:list-item>
        <text:list-item>
          <text:p>列表項目二，包含 <text:a xlink:href="https://google.com">Google 連結</text:a></text:p>
        </text:list-item>
      </text:list>
      
      <text:h text:outline-level="3">表格範例</text:h>
      <table:table table:name="Table1">
        <table:table-row>
          <table:table-cell><text:p>標題 1</text:p></table:table-cell>
          <table:table-cell><text:p>標題 2</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell><text:p>單元格 A</text:p></table:table-cell>
          <table:table-cell><text:p>單元格 B</text:p></table:table-cell>
        </table:table-row>
      </table:table>
      
      <text:h text:outline-level="3">圖片範例</text:h>
      <text:p>下面會顯示一張提取出的圖片：</text:p>
      <draw:frame draw:name="測試圖片" svg:width="10cm" svg:height="5cm">
        <draw:image xlink:href="Pictures/test.png"/>
      </draw:frame>
    </office:text>
  </office:body>
</office:document-content>`;
zip.addFile('content.xml', Buffer.from(contentXml, 'utf-8'));

// 4. 寫入 1x1 紅色 PNG 圖片
const redPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(redPngBase64, 'base64');
zip.addFile('Pictures/', Buffer.alloc(0)); // 建立資料夾
zip.addFile('Pictures/test.png', pngBuffer);

// 寫入實體檔案
zip.writeZip(targetOdtPath);
console.log(`測試 ODT 檔案成功產生在：${targetOdtPath}`);
