/**
 * html-parser.js - HTML 與 Notion 轉 Markdown 核心轉換器
 */
import { cleanNavigationNoise, preprocessNotionDom } from './notion-rules.js';

// Base64 Data URL 轉為 Blob 物件
export function dataUrlToBlob(dataurl) {
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

/**
 * 建立並配置 Turndown 實例
 * @param {Object} [TurndownClass] 可選自訂 TurndownService 類別 (用於測試相容)
 * @param {Object} [gfmPlugin] 可選 GFM 外掛 (用於測試相容)
 */
export function createTurndownInstance(TurndownClass = null, gfmPlugin = null) {
  const Service = TurndownClass || (typeof TurndownService !== 'undefined' ? TurndownService : null);
  if (!Service) {
    throw new Error('未提供 TurndownService 且當前環境無全域 TurndownService');
  }

  const service = new Service({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
  });

  const gfm = gfmPlugin || (typeof turndownPluginGfm !== 'undefined' ? turndownPluginGfm.gfm : null);
  if (gfm) {
    service.use(gfm);
  }

  // 底線規則
  service.addRule('underline', {
    filter: ['u', 'ins'],
    replacement: function (content) {
      return `<u>${content}</u>`;
    }
  });

  // 換行規則
  service.addRule('lineBreak', {
    filter: 'br',
    replacement: function () {
      return '  \n';
    }
  });

  return service;
}

/**
 * 解析 HTML 字串並產生 Markdown 與抽取圖片列表
 * @param {string} htmlContent 
 * @param {Map<string, Blob>} [localImagesMap] 
 * @param {Object} [options] 
 * @returns {{markdown: string, images: Array<{fileName: string, blob: Blob, objectUrl?: string}>}}
 */
export function parseHtmlContent(htmlContent, localImagesMap = new Map(), options = {}) {
  const parser = options.parserInstance || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
  if (!parser) {
    throw new Error('未提供 DOMParser 實例且當前環境無全域 DOMParser');
  }

  const doc = parser.parseFromString(htmlContent, 'text/html');

  // 1. 預處理 Notion DOM
  preprocessNotionDom(doc);

  const extractedImages = [];
  let imageCounter = 1;

  // 2. 處理圖片：Base64 抽取與相對路徑正規化
  doc.querySelectorAll('img').forEach(img => {
    let src = img.getAttribute('src');
    if (!src) return;

    src = src.trim();
    const alt = img.getAttribute('alt') || `image_${imageCounter}`;

    if (src.startsWith('data:image/')) {
      try {
        const extMatch = src.match(/^data:image\/([a-zA-Z0-9\+\-\.]+);base64,/);
        let ext = 'png';
        if (extMatch && extMatch[1]) {
          ext = extMatch[1].toLowerCase().replace('jpeg', 'jpg');
        }
        const fileName = `image_${imageCounter}.${ext}`;
        const blob = dataUrlToBlob(src);

        extractedImages.push({
          fileName,
          blob,
          objectUrl: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : ''
        });

        img.setAttribute('src', `Pictures/${fileName}`);
        imageCounter++;
      } catch (e) {
        console.warn('Base64 圖片抽取失敗', e);
      }
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      // 外部圖片維持原樣
    } else {
      // 相對路徑圖片比對
      let matchedBlob = null;
      let matchedFileName = '';
      const decodedSrc = decodeURIComponent(src).replace(/\\/g, '/');
      const baseName = decodedSrc.split('/').pop();

      if (localImagesMap && localImagesMap.size > 0) {
        for (const [pathKey, blob] of localImagesMap.entries()) {
          const normalizedKey = pathKey.replace(/\\/g, '/');
          if (normalizedKey.endsWith(decodedSrc) || normalizedKey.endsWith(baseName) || normalizedKey === decodedSrc) {
            matchedBlob = blob;
            matchedFileName = baseName;
            break;
          }
        }
      }

      if (matchedBlob) {
        extractedImages.push({
          fileName: matchedFileName,
          blob: matchedBlob,
          objectUrl: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(matchedBlob) : ''
        });
        img.setAttribute('src', `Pictures/${matchedFileName}`);
      } else {
        // 缺漏圖片標記
        const missingText = `[🖼️ 缺漏圖片: ${alt || baseName}](Pictures/${baseName})`;
        const span = doc.createElement('span');
        span.textContent = missingText;
        img.replaceWith(span);
      }
    }
  });

  // 3. 執行 Turndown 轉換
  const turndown = createTurndownInstance(options.turndownClass, options.gfmPlugin);
  let markdown = turndown.turndown(doc.body.innerHTML);

  // 4. 後處理清理
  markdown = cleanNavigationNoise(markdown);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  return {
    markdown,
    images: extractedImages
  };
}
