/**
 * pdf-parser.js - 純前端 PDF 轉 Markdown 核心解析器
 * 依賴 Mozilla PDF.js (pdfjs-dist)
 * 核心演算法：
 * 1. 空間座標聚類 (Spatial Clustering) 重組行與段落
 * 2. 統計字級眾數 (Mode Font Size) 推導 H1-H4 大綱標題
 * 3. 識別項目符號與編號清單
 * 4. 抽取 OperatorList 內嵌影像為 PNG Blob
 * 5. 透過 normalizeMarkdown 進行空行標準化
 */
import { normalizeMarkdown } from '../../utils/format.util.js';

/**
 * 統計數值陣列的眾數 (最頻繁出現的數值，取小數點一位四捨五入)
 * @param {number[]} numbers 
 * @returns {number}
 */
function calculateMode(numbers) {
  if (!numbers || numbers.length === 0) return 12;
  const counts = new Map();
  let maxCount = 0;
  let mode = numbers[0];

  for (const num of numbers) {
    const rounded = Math.round(num * 10) / 10;
    const count = (counts.get(rounded) || 0) + 1;
    counts.set(rounded, count);
    if (count > maxCount) {
      maxCount = count;
      mode = rounded;
    }
  }
  return mode;
}

/**
 * 在 Node.js 或無 Canvas 環境下，將 raw 像素陣列轉為未壓縮 BMP Buffer
 * @param {number} width 
 * @param {number} height 
 * @param {Uint8Array|Uint8ClampedArray} data 
 * @returns {Buffer}
 */
function createBmpBuffer(width, height, data) {
  if (typeof Buffer === 'undefined') return null;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize;
  const buf = Buffer.alloc(fileSize);

  // File Header (14 bytes)
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);

  // Info Header (40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // 頂部到底部
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(imageSize, 34);

  const totalPixels = width * height;
  const isRgb = data.length === totalPixels * 3;
  const isRgba = data.length === totalPixels * 4;
  const isGray = data.length === totalPixels;

  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const pxOffset = rowOffset + x * 3;
      let r = 0, g = 0, b = 0;
      if (isRgba) {
        r = data[pIdx * 4];
        g = data[pIdx * 4 + 1];
        b = data[pIdx * 4 + 2];
      } else if (isRgb) {
        r = data[pIdx * 3];
        g = data[pIdx * 3 + 1];
        b = data[pIdx * 3 + 2];
      } else if (isGray) {
        r = g = b = data[pIdx];
      }
      buf[pxOffset] = b;
      buf[pxOffset + 1] = g;
      buf[pxOffset + 2] = r;
    }
  }
  return buf;
}

/**
 * 將 PDF 頁面影像物件轉為 PNG Blob (相容 ImageBitmap、RGB、RGBA、灰階與 Node 環境)
 * @param {Object} imageObj PDF.js 影像物件
 * @returns {Promise<Blob|null>}
 */
async function convertPdfImageToBlob(imageObj) {
  if (!imageObj) return null;

  // 1. 瀏覽器 Canvas 環境
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');

    // 支援 ImageBitmap (現代瀏覽器 PDF.js 預設)
    const bitmap = imageObj.bitmap || (typeof ImageBitmap !== 'undefined' && imageObj instanceof ImageBitmap ? imageObj : null);
    if (bitmap) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
    }

    // 支援 raw 像素陣列 data
    const width = imageObj.width;
    const height = imageObj.height;
    const data = imageObj.data;
    if (!width || !height || !data) return null;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(width, height);
    const totalPixels = width * height;

    if (data.length === totalPixels * 4) {
      imgData.data.set(data);
    } else if (data.length === totalPixels * 3) {
      for (let i = 0, j = 0; i < totalPixels * 4; i += 4, j += 3) {
        imgData.data[i] = data[j];
        imgData.data[i + 1] = data[j + 1];
        imgData.data[i + 2] = data[j + 2];
        imgData.data[i + 3] = 255;
      }
    } else if (data.length === totalPixels) {
      for (let i = 0, j = 0; i < totalPixels * 4; i += 4, j += 1) {
        const val = data[j];
        imgData.data[i] = val;
        imgData.data[i + 1] = val;
        imgData.data[i + 2] = val;
        imgData.data[i + 3] = 255;
      }
    } else {
      for (let i = 0, j = 0; i < totalPixels * 4 && j < data.length; i += 4, j += 4) {
        imgData.data[i] = data[j] || 0;
        imgData.data[i + 1] = data[j + 1] || 0;
        imgData.data[i + 2] = data[j + 2] || 0;
        imgData.data[i + 3] = data[j + 3] !== undefined ? data[j + 3] : 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
  }

  // 2. Node.js CLI 環境備援：以未壓縮 BMP 轉為 Blob
  if (imageObj.data && imageObj.width && imageObj.height && typeof Blob !== 'undefined') {
    const bmpBuf = createBmpBuffer(imageObj.width, imageObj.height, imageObj.data);
    if (bmpBuf) {
      return new Blob([bmpBuf], { type: 'image/bmp' });
    }
  }

  return null;
}

// 已知 PDF.js 繪製影像的 Operation 數值常數
const KNOWN_IMAGE_OPS = new Set([83, 84, 85, 86, 87, 88, 89, 90]);

/**
 * 判斷 operator 是否為影像繪製操作
 * @param {number} fn 
 * @param {Object} [pdfjs] 
 * @returns {boolean}
 */
function isImageOp(fn, pdfjs) {
  if (KNOWN_IMAGE_OPS.has(fn)) return true;
  if (pdfjs?.OPS) {
    return (
      fn === pdfjs.OPS.paintImageXObject ||
      fn === pdfjs.OPS.paintInlineImageXObject ||
      fn === pdfjs.OPS.paintImageMaskXObject ||
      fn === pdfjs.OPS.paintImageXObjectRepeat ||
      fn === pdfjs.OPS.paintInlineImageXObjectGroup
    );
  }
  return false;
}

/**
 * 從 page.objs 或 page.commonObjs 安全非同步獲取影像物件
 * @param {Object} page 
 * @param {string} imgName 
 * @returns {Promise<Object|null>}
 */
async function resolveImageObject(page, imgName) {
  if (!imgName) return null;

  // 1. 嘗試由 page.objs 取出
  if (page.objs) {
    if (page.objs.has && page.objs.has(imgName)) {
      const obj = page.objs.get(imgName);
      if (obj) return obj;
    }
    const fromCb = await new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(null); }
      }, 1200);
      try {
        page.objs.get(imgName, res => {
          if (!done) { done = true; clearTimeout(timer); resolve(res); }
        });
      } catch (_) {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      }
    });
    if (fromCb) return fromCb;
  }

  // 2. 嘗試由 page.commonObjs 取出
  if (page.commonObjs) {
    if (page.commonObjs.has && page.commonObjs.has(imgName)) {
      const obj = page.commonObjs.get(imgName);
      if (obj) return obj;
    }
    const fromCommonCb = await new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(null); }
      }, 1200);
      try {
        page.commonObjs.get(imgName, res => {
          if (!done) { done = true; clearTimeout(timer); resolve(res); }
        });
      } catch (_) {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      }
    });
    if (fromCommonCb) return fromCommonCb;
  }

  return null;
}

/**
 * 空間網格表格識別與 Markdown 表格重構引擎
 * @param {Array} items 本頁已過濾的文字 items
 * @param {number} bodyFontSize 基準字級
 * @returns {Array<{ startY: number, endY: number, markdown: string }>}
 */
function detectAndBuildTables(items, bodyFontSize) {
  if (!items || items.length === 0) return [];

  // 1. 依 Y 座標進行行聚合 (容差 3.5 pt)
  const lineMap = new Map();
  items.forEach(it => {
    const y = Math.round(it.y);
    let target = null;
    for (const k of lineMap.keys()) {
      if (Math.abs(k - y) <= 3.5) { target = k; break; }
    }
    const ty = target !== null ? target : y;
    if (!lineMap.has(ty)) lineMap.set(ty, []);
    lineMap.get(ty).push(it);
  });

  const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
  const headerKeywords = ['項目標題', '說明', '頁籤', '版本', '修訂內容', '項次', '欄位', '檢核', '圖示', '名稱', '操作', '建立時間', '使用效期'];
  const detectedTables = [];

  for (let i = 0; i < sortedYs.length; i++) {
    const y = sortedYs[i];
    const lItems = lineMap.get(y).sort((a, b) => a.x - b.x);
    if (lItems.length < 2) continue;

    const rowText = lItems.map(it => it.str).join(' ');
    const hitCount = headerKeywords.filter(k => rowText.includes(k)).length;
    const isExplicitHeader =
      (rowText.includes('項目標題') && rowText.includes('說明')) ||
      (rowText.includes('頁籤') && rowText.includes('說明')) ||
      (rowText.includes('版本') && rowText.includes('修訂內容')) ||
      (rowText.includes('項次') && rowText.includes('說明'));

    if (hitCount >= 2 || isExplicitHeader) {
      // 聚合欄位名稱 (間隙 > 8 pt 視為不同欄)
      const headerCols = [];
      let curCol = null;
      lItems.forEach(it => {
        if (!curCol || it.x - (curCol.x + curCol.w) > 8) {
          curCol = { name: it.str, x: it.x, w: it.width };
          headerCols.push(curCol);
        } else {
          curCol.name += it.str;
          curCol.w = it.x + it.width - curCol.x;
        }
      });

      if (headerCols.length < 2) continue;

      const N = headerCols.length;
      // 計算欄位邊界
      const bounds = [];
      for (let c = 0; c < N - 1; c++) {
        const leftX = headerCols[c].x;
        const rightX = headerCols[c + 1].x;
        if (c === 0) {
          const col0Width = Math.max(headerCols[0].w, 35);
          bounds.push(Math.min(leftX + col0Width + 25, (leftX + rightX) / 2));
        } else {
          bounds.push((leftX + rightX) / 2);
        }
      }

      function getColIdx(x) {
        for (let b = 0; b < bounds.length; b++) {
          if (x < bounds[b]) return b;
        }
        return N - 1;
      }

      // 尋找表格終止 Y 座標 (遇到主標題、圖片或頁尾)
      let endY = 80;
      let nextLineIdx = i + 1;
      for (; nextLineIdx < sortedYs.length; nextLineIdx++) {
        const ny = sortedYs[nextLineIdx];
        const nItems = lineMap.get(ny).sort((a, b) => a.x - b.x);
        const nText = nItems.map(it => it.str).join(' ');
        // 遇到大綱標題 (如 二、, 2. 概要, 2.3. 列表功能 等) 終止表格，排除版本號 (如 1.0)
        const isMajorH = nItems[0].x <= 60 && (/^[一二三四五六七八九十]+、/.test(nText) || /^\d+\.\s+[\u4e00-\u9fa5]/.test(nText));
        const isSubH = nItems[0].x <= 110 && /^\d+\.[1-9]\d*\.?\s+[\u4e00-\u9fa5]/.test(nText) && !/^\d+\.0\b/.test(nText);
        if (isMajorH || isSubH) {
          endY = ny + 5;
          break;
        }
      }

      // 收集表格範圍內的資料行
      const dataYs = sortedYs.filter(dy => dy < y && dy > endY);
      if (dataYs.length === 0) continue;

      const rows = [];
      let curRow = null;

      for (const dy of dataYs) {
        const dItems = lineMap.get(dy).sort((a, b) => a.x - b.x);
        const lineCols = Array(N).fill('');
        dItems.forEach(it => {
          const c = getColIdx(it.x);
          lineCols[c] = (lineCols[c] ? lineCols[c] + ' ' : '') + it.str;
        });

        const col0 = lineCols[0].trim();

        if (col0) {
          if (curRow && !curRow[0]) {
            // 回填垂直置中的欄位名稱
            curRow[0] = col0;
            for (let c = 1; c < N; c++) {
              if (lineCols[c].trim()) {
                curRow[c] = curRow[c] ? curRow[c] + '<br>' + lineCols[c].trim() : lineCols[c].trim();
              }
            }
          } else {
            // 建立新列
            curRow = lineCols.map(c => c.trim());
            rows.push(curRow);
          }
        } else if (!curRow && lineCols.some(c => !!c.trim())) {
          curRow = lineCols.map(c => c.trim());
          rows.push(curRow);
        } else if (curRow) {
          // 接續上一列對應欄位
          for (let c = 0; c < N; c++) {
            const val = lineCols[c].trim();
            if (val) {
              curRow[c] = curRow[c] ? curRow[c] + '<br>' + val : val;
            }
          }
        }
      }

      if (rows.length > 0) {
        const cleanCell = (str) => {
          if (!str) return '';
          return str
            .replace(/''([^']+)''/g, '「$1」')
            .replace(/'([^']+)'/g, '「$1」')
            .replace(/(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})/g, '$1-$2-$3')
            .replace(/([\u4e00-\u9fa5A-Za-z0-9])\s*\/\s*([\u4e00-\u9fa5A-Za-z0-9])/g, '$1/$2')
            .replace(/【\s+/g, '【').replace(/\s+】/g, '】')
            .replace(/「\s+/g, '「').replace(/\s+」/g, '」')
            .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
            .replace(/（\s+/g, '（').replace(/\s+）/g, '）')
            .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
            .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
            .replace(/([\u4e00-\u9fa5])\s+([，。！？：；])/g, '$1$2')
            .replace(/([，。！？：；])\s+([\u4e00-\u9fa5])/g, '$1$2')
            .replace(/^[•●．・·]\s*/, '• ')
            .replace(/<br>[•●．・·]\s*/g, '<br>• ')
            .replace(/\|/g, '\\|')
            .trim();
        };

        const headers = headerCols.map(h => cleanCell(h.name));
        const headerMd = '| ' + headers.join(' | ') + ' |';
        const sepMd = '| ' + headers.map(() => ':---').join(' | ') + ' |';
        const rowsMd = rows.map(r => '| ' + r.map(c => cleanCell(c)).join(' | ') + ' |');
        const markdown = [headerMd, sepMd, ...rowsMd].join('\n');

        detectedTables.push({
          startY: y,
          endY,
          markdown
        });
      }
    }
  }

  return detectedTables;
}

/**
 * 解析 PDF 檔案並輸出 Markdown 與抽取圖片
 * @param {ArrayBuffer|Buffer|Uint8Array} arrayBuffer 
 * @param {Object} [options]
 * @param {Object} [options.pdfjsLib] 可選自訂 PDF.js 實例 (用於測試或外部注入)
 * @returns {Promise<{markdown: string, images: Array<{fileName: string, blob: Blob, objectUrl?: string}>}>}
 */
export async function parsePdf(arrayBuffer, options = {}) {
  const pdfjs = options.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
  if (!pdfjs) {
    throw new Error('未提供 PDF.js 實例且當前環境無全域 pdfjsLib，請檢查網路連線或稍後再試。');
  }

  // 萬一外部傳入的是 File 或 Blob，自動轉為 ArrayBuffer
  if (arrayBuffer && typeof arrayBuffer.arrayBuffer === 'function') {
    arrayBuffer = await arrayBuffer.arrayBuffer();
  }

  // 自動防護：若瀏覽器未預先配置 workerSrc，以同源 Blob URL 自動載入避免跨域 SecurityError
  if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      try {
        const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const workerBlob = new Blob([`importScripts("${workerUrl}");`], { type: 'application/javascript' });
        pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
      } catch (e) {
        console.warn('自動配置 PDF.js Worker Blob 失敗：', e);
      }
    }
  }

  // 確保二進位格式為純淨的 Uint8Array (避免 Node Buffer 觸發 PDF.js 類型檢查錯誤)
  let dataInput;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(arrayBuffer)) {
    dataInput = new Uint8Array(arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength));
  } else if (arrayBuffer instanceof ArrayBuffer) {
    dataInput = new Uint8Array(arrayBuffer);
  } else if (arrayBuffer instanceof Uint8Array) {
    dataInput = new Uint8Array(arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength));
  } else {
    dataInput = new Uint8Array(arrayBuffer);
  }

  // 驗證 PDF 魔法數字 (Magic Number: %PDF -> 0x25, 0x50, 0x44, 0x46)
  if (dataInput.length < 4) {
    throw new Error('檔案內容為空或長度過短，非有效 PDF 文件。');
  }

  const isPdfHeader = dataInput[0] === 0x25 && dataInput[1] === 0x50 && dataInput[2] === 0x44 && dataInput[3] === 0x46;
  if (!isPdfHeader) {
    let snippet = '';
    try {
      if (typeof TextDecoder !== 'undefined') {
        snippet = new TextDecoder('utf-8', { fatal: false }).decode(dataInput.subarray(0, 1024));
      } else if (typeof Buffer !== 'undefined') {
        snippet = Buffer.from(dataInput.subarray(0, 1024)).toString('utf8');
      }
    } catch (_) {}

    if (snippet.includes('<docdata>') || snippet.includes("can't open this") || snippet.includes('service is busy')) {
      throw new Error('此檔案並非真正的 PDF，而是雲端服務（如 Office 365 / SharePoint / OneDrive）下載失敗時傳回的 XML 錯誤通知（伺服器忙碌），請重新由雲端下載此檔案。');
    }
    if (snippet.trim().startsWith('<!DOCTYPE html') || snippet.trim().startsWith('<html') || snippet.includes('<head>') || snippet.includes('<body>')) {
      throw new Error('此檔案內容為 HTML 網頁（可能為雲端驗證頁或失敗頁面），並非標準 PDF 文件。');
    }
    if (snippet.trim().startsWith('<?xml') || snippet.trim().startsWith('<')) {
      throw new Error('此檔案內容為 XML 資料，並非標準 PDF 文件。');
    }
    throw new Error('此檔案開頭缺少 PDF 標記 (%PDF)，可能已損毀或未完整下載。');
  }

  const loadingTask = pdfjs.getDocument({
    data: dataInput,
    cMapUrl: options.cMapUrl || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: options.standardFontDataUrl || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
    verbosity: options.verbosity !== undefined ? options.verbosity : 0
  });

  let pdfDoc;
  try {
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new Error('此 PDF 檔案已設定密碼保護，目前暫不支援加密文件的轉換。');
    }
    if (err?.name === 'InvalidPDFException') {
      throw new Error('PDF 檔案結構損壞或無效，無法順利解析。');
    }
    throw err;
  }
  const numPages = pdfDoc.numPages;

  // 1. 第一階段：採樣文字項目的字級高度以統計正文基準字級 (bodyFontSize) 與高頻頁首
  const fontSizes = [];
  const pageTextData = [];
  const topTextCounts = new Map();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = [];

    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;

      // 提取字級高度與座標
      // transform: [scaleX, skewY, skewX, scaleY, tx, ty]
      const scaleX = item.transform[0];
      const scaleY = item.transform[3];
      const fontSize = Math.abs(scaleY) || Math.abs(scaleX) || 12;
      const x = item.transform[4];
      const y = item.transform[5];
      const isBold = /bold|black|heavy|bi|bd/i.test(item.fontName || '');

      fontSizes.push(fontSize);
      const strTrim = item.str.trim();

      // 統計頂端文字（Y 座標高於 85% 頁高）
      if (y >= viewport.height * 0.85 && strTrim.length <= 40) {
        topTextCounts.set(strTrim, (topTextCounts.get(strTrim) || 0) + 1);
      }

      items.push({
        str: item.str,
        x,
        y,
        width: item.width,
        height: item.height || fontSize,
        fontSize,
        isBold
      });
    }

    pageTextData.push({ page, viewport, items });
  }

  const bodyFontSize = calculateMode(fontSizes);

  // 識別出現在多頁頂端的重複頁首 (Running Headers)
  const repeatingHeaders = new Set();
  const headerThreshold = Math.max(2, Math.floor(numPages * 0.25));
  topTextCounts.forEach((count, str) => {
    if (count >= headerThreshold) {
      repeatingHeaders.add(str);
    }
  });

  // 2. 第二階段：空間幾何聚類重組各頁文字與標題
  const extractedImages = [];
  let imageCounter = 1;
  const markdownPages = [];

  for (let pIdx = 0; pIdx < pageTextData.length; pIdx++) {
    const { page, viewport, items } = pageTextData[pIdx];
    const pageHeight = viewport ? viewport.height : 842;

    // 過濾頁首與頁底純頁碼雜訊
    const filteredItems = items.filter(it => {
      const trimmed = it.str.trim();
      if (!trimmed) return false;

      // 頁底純頁碼：y 座標在底部 10% 內且為純數字或「第 X 頁」
      if (it.y <= pageHeight * 0.1 || it.y <= 90) {
        if (/^\d{1,4}$/.test(trimmed) || /^[-–—]\s*\d+\s*[-–—]$/.test(trimmed) || /^第\s*\d+\s*頁$/.test(trimmed)) {
          return false;
        }
      }

      // 頂端重複頁首 (Running Header)
      if (it.y >= pageHeight * 0.88 || it.y >= 750) {
        if (repeatingHeaders.has(trimmed)) {
          return false;
        }
      }

      return true;
    });

    // 按 y 座標從大到小（頁首到頁底）排序
    filteredItems.sort((a, b) => b.y - a.y);

    // 行聚合 (Line Clustering)
    const lines = [];
    let currentLine = null;

    for (const item of filteredItems) {
      const tolerance = Math.max(item.fontSize * 0.4, 3.5);

      if (!currentLine) {
        currentLine = {
          y: item.y,
          fontSize: item.fontSize,
          isBold: item.isBold,
          items: [item]
        };
        lines.push(currentLine);
      } else if (Math.abs(currentLine.y - item.y) <= tolerance) {
        // 同一行
        currentLine.items.push(item);
        if (item.fontSize > currentLine.fontSize) {
          currentLine.fontSize = item.fontSize;
        }
        if (item.isBold) currentLine.isBold = true;
      } else {
        // 新行
        currentLine = {
          y: item.y,
          fontSize: item.fontSize,
          isBold: item.isBold,
          items: [item]
        };
        lines.push(currentLine);
      }
    }

    // 處理同一行內部排序與拼接
    const renderedLines = [];
    for (const line of lines) {
      // 依 x 座標從左至右排序
      line.items.sort((a, b) => a.x - b.x);

      let lineText = '';
      let prevItem = null;

      for (const item of line.items) {
        if (!prevItem) {
          lineText += item.str;
        } else {
          const spaceWidth = prevItem.fontSize * 0.3;
          const distance = item.x - (prevItem.x + prevItem.width);
          if (distance > spaceWidth) {
            lineText += ' ' + item.str;
          } else {
            lineText += item.str;
          }
        }
        prevItem = item;
      }

      lineText = lineText.trim();
      if (!lineText) continue;

      // 目錄引導線點點清理 (如 三、UIUX 說明：..................... 23)
      lineText = lineText.replace(/[.．·]{3,}\s*(\d+)$/, ' *(P.$1)*');

      // 繁體中文排版美化 (修正日期、引號、符號與中文字元贅餘空格)
      lineText = lineText
        .replace(/''([^']+)''/g, '「$1」')
        .replace(/'([^']+)'/g, '「$1」')
        .replace(/(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})/g, '$1-$2-$3')
        .replace(/([\u4e00-\u9fa5A-Za-z0-9])\s*\/\s*([\u4e00-\u9fa5A-Za-z0-9])/g, '$1/$2')
        .replace(/【\s+/g, '【').replace(/\s+】/g, '】')
        .replace(/「\s+/g, '「').replace(/\s+」/g, '」')
        .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
        .replace(/（\s+/g, '（').replace(/\s+）/g, '）')
        .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
        .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
        .replace(/([\u4e00-\u9fa5])\s+([，。！？：；])/g, '$1$2')
        .replace(/([，。！？：；])\s+([\u4e00-\u9fa5])/g, '$1$2');

      renderedLines.push({
        text: lineText,
        y: line.y,
        fontSize: line.fontSize,
        isBold: line.isBold
      });
    }

    // 預先識別本頁表格
    const detectedTables = detectAndBuildTables(filteredItems, bodyFontSize);
    const emittedTableStarts = new Set();

    // 格式化為 Markdown 區塊
    const pageMarkdownBlocks = [];
    let currentParagraph = [];
    let prevY = null;
    let prevFontSize = null;
    let prevIsList = false;

    for (let l = 0; l < renderedLines.length; l++) {
      const line = renderedLines[l];
      const text = line.text;

      // 檢查當前行是否屬於已識別的表格
      const matchedTable = detectedTables.find(t => line.y <= t.startY + 4 && line.y >= t.endY - 4);
      if (matchedTable) {
        if (!emittedTableStarts.has(matchedTable.startY)) {
          if (currentParagraph.length > 0) {
            pageMarkdownBlocks.push(currentParagraph.join(' '));
            currentParagraph = [];
          }
          pageMarkdownBlocks.push(matchedTable.markdown);
          emittedTableStarts.add(matchedTable.startY);
          prevIsList = false;
        }
        prevY = line.y;
        prevFontSize = line.fontSize;
        continue;
      }

      // 1. 語義大綱標題推導
      let isHeading = false;
      let headingPrefix = '';
      let headingText = text;

      // 中文大章節標題：一、二、三... (Level 2)
      if (/^[一二三四五六七八九十]+、\s*([^\s].*)$/.test(text) && text.length < 50) {
        isHeading = true;
        headingPrefix = '## ';
      }
      // 主數字標題：1. 2. 3. (Level 3)
      else if (/^\d+\.\s*[\u4e00-\u9fa5A-Za-z].*$/.test(text) && text.length < 50) {
        isHeading = true;
        headingPrefix = '### ';
        headingText = text.replace(/^(\d+\.)\s*/, '$1 ');
      }
      // 次數字標題：1.1. 1.2. 2.1. (Level 4)
      else if (/^\d+\.\d+\.?\s*[\u4e00-\u9fa5A-Za-z].*$/.test(text) && text.length < 50) {
        isHeading = true;
        headingPrefix = '#### ';
        headingText = text.replace(/^(\d+\.\d+\.?)\s*/, '$1 ');
      }
      // 字級推導
      else if (line.fontSize >= bodyFontSize * 1.6) {
        isHeading = true;
        headingPrefix = '# ';
        headingText = text.replace(/^[#\s]+/, '');
      } else if (line.fontSize >= bodyFontSize * 1.35) {
        isHeading = true;
        headingPrefix = '## ';
        headingText = text.replace(/^[#\s]+/, '');
      } else if (line.fontSize >= bodyFontSize * 1.15) {
        isHeading = true;
        headingPrefix = '### ';
        headingText = text.replace(/^[#\s]+/, '');
      } else if (line.isBold && line.fontSize >= bodyFontSize * 1.05 && text.length < 35) {
        isHeading = true;
        headingPrefix = '#### ';
        headingText = text.replace(/^[#\s]+/, '');
      }

      // 2. 清單與序號項目推導
      let isList = false;
      let listFormatted = '';

      if (!isHeading) {
        // 多層編號項目：1.1.1. 1.1.2. 等
        const subNumMatch = text.match(/^(\d+(\.\d+){2,}\.?)\s*(.*)$/);
        if (subNumMatch) {
          isList = true;
          const num = subNumMatch[1].endsWith('.') ? subNumMatch[1] : `${subNumMatch[1]}.`;
          listFormatted = `${num} ${subNumMatch[3]}`;
        }
        // 全形點號或 bullet：．, ・, ·, •, ●
        else if (/^[•●．・·\-\*]\s*(.*)$/.test(text)) {
          const m = text.match(/^[•●．・·\-\*]\s*(.*)$/);
          isList = true;
          listFormatted = `- ${m[1]}`;
        }
        // 帶括號編號：(1), （1）, [1], ①
        else if (/^([\(（]\d+[\)）]|\[\d+\]|[①-⑩])\s*(.*)$/.test(text)) {
          const m = text.match(/^([\(（]\d+[\)）]|\[\d+\]|[①-⑩])\s*(.*)$/);
          isList = true;
          listFormatted = `  - ${m[1]} ${m[2]}`;
        }
        // 標準單層數字清單：1. 2.
        else if (/^(\d+)[\.\)]\s+(.*)$/.test(text)) {
          const m = text.match(/^(\d+)[\.\)]\s+(.*)$/);
          isList = true;
          listFormatted = `${m[1]}. ${m[2]}`;
        }
      }

      // 檢查是否為清單項目的折行接續行 (Soft wrap continuation)
      const lineSpacing = prevY !== null ? (prevY - line.y) : 0;
      if (prevIsList && !isHeading && !isList && lineSpacing < (prevFontSize || bodyFontSize) * 1.95) {
        if (pageMarkdownBlocks.length > 0) {
          const lastBlock = pageMarkdownBlocks[pageMarkdownBlocks.length - 1];
          const isPrevCjk = /[\u4e00-\u9fa5]$/.test(lastBlock);
          const isCurCjk = /^[\u4e00-\u9fa5]/.test(text);
          pageMarkdownBlocks[pageMarkdownBlocks.length - 1] += (isPrevCjk && isCurCjk ? '' : ' ') + text;
          prevY = line.y;
          prevFontSize = line.fontSize;
          continue;
        }
      }

      // 檢查是否與前一行有明顯垂直間距以觸發分段
      const isLargeGap = prevFontSize !== null && lineSpacing > prevFontSize * 1.75;

      if (isHeading || isList || isLargeGap) {
        if (currentParagraph.length > 0) {
          pageMarkdownBlocks.push(currentParagraph.join(' '));
          currentParagraph = [];
        }

        if (isHeading) {
          pageMarkdownBlocks.push(`${headingPrefix}${headingText}`);
          prevIsList = false;
        } else if (isList) {
          if (prevIsList && pageMarkdownBlocks.length > 0 && !isLargeGap) {
            pageMarkdownBlocks[pageMarkdownBlocks.length - 1] += '\n' + listFormatted;
          } else {
            pageMarkdownBlocks.push(listFormatted);
          }
          prevIsList = true;
        } else {
          currentParagraph.push(text);
          prevIsList = false;
        }
      } else {
        // 普通文字行平滑銜接 (中文之間不加多餘空格)
        if (currentParagraph.length > 0) {
          const prevStr = currentParagraph[currentParagraph.length - 1];
          const isPrevCjk = /[\u4e00-\u9fa5]$/.test(prevStr);
          const isCurCjk = /^[\u4e00-\u9fa5]/.test(text);
          if (isPrevCjk && isCurCjk) {
            currentParagraph[currentParagraph.length - 1] += text;
          } else {
            currentParagraph.push(text);
          }
        } else {
          currentParagraph.push(text);
        }
        prevIsList = false;
      }

      prevY = line.y;
      prevFontSize = line.fontSize;
    }

    if (currentParagraph.length > 0) {
      pageMarkdownBlocks.push(currentParagraph.join(' '));
    }

    // 3. 抽取本頁內嵌圖片
    try {
      const operatorList = await page.getOperatorList();
      const fnArray = operatorList.fnArray;
      const argsArray = operatorList.argsArray;

      for (let k = 0; k < fnArray.length; k++) {
        const fn = fnArray[k];
        if (isImageOp(fn, pdfjs)) {
          const imgArgs = argsArray[k];
          const imgName = Array.isArray(imgArgs) ? imgArgs[0] : imgArgs;
          try {
            const imgObj = await resolveImageObject(page, imgName);

            if (imgObj) {
              const blob = await convertPdfImageToBlob(imgObj);
              if (blob) {
                const ext = blob.type === 'image/bmp' ? 'bmp' : 'png';
                const fileName = `image_${imageCounter}.${ext}`;
                extractedImages.push({
                  fileName,
                  blob,
                  objectUrl: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : ''
                });
                pageMarkdownBlocks.push(`![${fileName}](Pictures/${fileName})`);
                imageCounter++;
              }
            }
          } catch (imgErr) {
            console.warn(`PDF 頁面 ${pIdx + 1} 圖片抽取跳過：`, imgErr);
          }
        }
      }
    } catch (opErr) {
      console.warn(`讀取頁面 ${pIdx + 1} OperatorList 失敗：`, opErr);
    }

    if (pageMarkdownBlocks.length > 0) {
      markdownPages.push(pageMarkdownBlocks.join('\n\n'));
    }
  }

  // 合併所有頁面並透過 normalizeMarkdown 標準化空行與格式
  const combinedMarkdown = markdownPages.join('\n\n');
  const normalizedMarkdown = normalizeMarkdown(combinedMarkdown);

  return {
    markdown: normalizedMarkdown,
    images: extractedImages
  };
}
