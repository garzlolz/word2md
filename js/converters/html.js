/**
 * html.js - 純前端 HTML 及 ZIP 網頁包轉 Markdown 模組
 * 依賴全域 TurndownService, turndownPluginGfm, 以及 zip-handler.js
 */
import { loadZip, readZipText, readZipBlob } from '../zip-handler.js';

// Base64 Data URL 轉為 Blob 物件
function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// 清理導覽與裝飾性雜訊
function cleanNavigationNoise(markdownText) {
  const lines = markdownText.split('\n');
  const resultLines = [];
  let isCleaning = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes('返回') && (trimmed.includes('頁面') || trimmed.includes('上一步') || trimmed.includes('回到'))) {
      isCleaning = true;
      continue;
    }

    if (isCleaning) {
      if (trimmed === '' || trimmed === '---' || trimmed.startsWith('[') || trimmed.startsWith('返回') || trimmed.startsWith('導覽')) {
        continue;
      } else {
        isCleaning = false;
      }
    }

    resultLines.push(line);
  }

  return resultLines.join('\n');
}

/**
 * 建立並配置 Turndown 實例
 */
function createTurndownService() {
  if (typeof TurndownService === 'undefined') {
    throw new Error('TurndownService 尚未載入，請確認 CDN 連線。');
  }

  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
  });

  if (typeof turndownPluginGfm !== 'undefined') {
    service.use(turndownPluginGfm.gfm);
  }

  // 自訂底線規則
  service.addRule('underline', {
    filter: ['u', 'ins'],
    replacement: function (content) {
      return `<u>${content}</u>`;
    }
  });

  // 自訂換行規則
  service.addRule('lineBreak', {
    filter: 'br',
    replacement: function () {
      return '  \n';
    }
  });

  return service;
}

/**
 * 核心：純前端轉換 HTML 字串
 * @param {string} htmlContent 
 * @param {Map<string, Blob>} [localImagesMap] 本機資源圖片對照表 (用於 ZIP 網頁包)
 * @returns {{markdown: string, images: Array<{fileName: string, blob: Blob, objectUrl: string}>}}
 */
export function convertHtmlContent(htmlContent, localImagesMap = new Map()) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // 1. 移除無用腳本與樣式
  doc.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());

  const extractedImages = [];
  let imageCounter = 1;

  // 2. 處理圖片：Base64 抽取與相對路徑正規化
  doc.querySelectorAll('img').forEach(img => {
    let src = img.getAttribute('src');
    if (!src) return;

    src = src.trim();
    const alt = img.getAttribute('alt') || `image_${imageCounter}`;

    if (src.startsWith('data:image/')) {
      // Base64 圖片
      try {
        const extMatch = src.match(/^data:image\/([a-zA-Z0-9\+\-\.]+);base64,/);
        let ext = 'png';
        if (extMatch && extMatch[1]) {
          ext = extMatch[1].toLowerCase().replace('jpeg', 'jpg');
        }
        const fileName = `image_${imageCounter}.${ext}`;
        const blob = dataURLtoBlob(src);
        
        extractedImages.push({
          fileName,
          blob,
          objectUrl: URL.createObjectURL(blob)
        });

        img.setAttribute('src', `Pictures/${fileName}`);
        imageCounter++;
      } catch (e) {
        console.warn('Base64 圖片解析失敗', e);
      }
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      // 外部網路圖片：保留原始 URL
    } else {
      // 本地相對路徑圖片 (例如 Notion 匯出的 _files/xxx.png)
      let matchedBlob = null;
      let matchedFileName = '';

      // 在 localImagesMap 中尋找對應的 Blob
      const decodedSrc = decodeURIComponent(src).replace(/\\/g, '/');
      const baseName = decodedSrc.split('/').pop();

      for (const [pathKey, blob] of localImagesMap.entries()) {
        const normalizedKey = pathKey.replace(/\\/g, '/');
        if (normalizedKey.endsWith(decodedSrc) || normalizedKey.endsWith(baseName) || normalizedKey === decodedSrc) {
          matchedBlob = blob;
          matchedFileName = baseName;
          break;
        }
      }

      if (matchedBlob) {
        extractedImages.push({
          fileName: matchedFileName,
          blob: matchedBlob,
          objectUrl: URL.createObjectURL(matchedBlob)
        });
        img.setAttribute('src', `Pictures/${matchedFileName}`);
      } else {
        // 圖片遺失：保留缺漏標記供使用者後續補齊
        const missingText = `[🖼️ 缺漏圖片: ${alt || baseName}](Pictures/${baseName})`;
        const span = doc.createElement('span');
        span.textContent = missingText;
        img.replaceWith(span);
      }
    }
  });

  // 3. Notion 特殊結構語意化轉換
  // (A) Checkbox / To-do list
  doc.querySelectorAll('div.notion-to_do-block').forEach(block => {
    const isChecked = block.querySelector('input[type="checkbox"]:checked') !== null ||
                      block.querySelector('.checked') !== null;
    const textNode = block.querySelector('.notion-table-cell-text, [contenteditable]') || block;
    const text = textNode.textContent.trim();
    if (text) {
      const p = doc.createElement('p');
      p.textContent = `${isChecked ? '- [x]' : '- [ ]'} ${text}`;
      block.replaceWith(p);
    }
  });

  // (B) Bulleted list
  doc.querySelectorAll('div.notion-bulleted_list-block').forEach(block => {
    const textNode = block.querySelector('.notion-table-cell-text, [contenteditable]') || block;
    let text = textNode.textContent.trim();
    text = text.replace(/^[\u2022\u25E6\u25AA\u25AB\s]+/, '').trim();
    if (text) {
      const p = doc.createElement('p');
      p.textContent = `- ${text}`;
      block.replaceWith(p);
    }
  });

  // (C) Notion 表格標題列正規化
  doc.querySelectorAll('table').forEach(table => {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length > 0 && !table.querySelector('thead')) {
      const firstRow = rows[0];
      const thead = doc.createElement('thead');
      const tr = doc.createElement('tr');
      firstRow.querySelectorAll('td, th').forEach(cell => {
        const th = doc.createElement('th');
        th.innerHTML = cell.innerHTML.trim() || '&nbsp;';
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.insertBefore(thead, table.firstChild);
      firstRow.remove();
    }
  });

  // 4. 執行 Turndown 轉換
  const turndown = createTurndownService();
  let markdown = turndown.turndown(doc.body.innerHTML);

  // 5. 後處理美化
  markdown = cleanNavigationNoise(markdown);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  return {
    markdown,
    images: extractedImages
  };
}

/**
 * 處理上傳的 HTML 檔案
 * @param {File} file 
 * @returns {Promise<{markdown: string, images: Array<{fileName: string, blob: Blob, objectUrl: string}>}>}
 */
export async function convertHtmlFile(file) {
  const htmlContent = await file.text();
  return convertHtmlContent(htmlContent);
}

/**
 * 處理上傳的 ZIP 網頁包 (例如 Notion 匯出的 HTML + 圖片包)
 * @param {File} file 
 * @returns {Promise<{markdown: string, images: Array<{fileName: string, blob: Blob, objectUrl: string}>}>}
 */
export async function convertZipWebPackage(file) {
  const zip = await loadZip(file);

  // 尋找主 HTML 檔案
  let mainHtmlEntry = null;
  const imageEntries = new Map();

  for (const [relativePath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lowerPath = relativePath.toLowerCase();

    if (!mainHtmlEntry && (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm'))) {
      mainHtmlEntry = entry;
    } else if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(lowerPath)) {
      const blob = await entry.async('blob');
      imageEntries.set(relativePath, blob);
    }
  }

  if (!mainHtmlEntry) {
    throw new Error('ZIP 檔案內未找到任何 .html 網頁文件！');
  }

  const htmlContent = await mainHtmlEntry.async('string');
  return convertHtmlContent(htmlContent, imageEntries);
}
