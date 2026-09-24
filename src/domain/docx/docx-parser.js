/**
 * docx-parser.js - 純邏輯 DOCX 轉 HTML/Markdown 解析器
 * 依賴 Mammoth.js 進行語意 HTML 轉換，並接入專案標準 HTML 解析管道抽取圖片與產出 Markdown
 */
import { parseHtmlContent } from '../html/html-parser.js';

/**
 * 解析 DOCX 檔案為 Markdown 與抽取圖片清單
 * @param {ArrayBuffer|Buffer} arrayBuffer 
 * @param {Object} [options]
 * @param {Object} [options.mammoth] 可選的 Mammoth 實例（用於 Node.js CLI 或測試環境注入）
 * @param {DOMParser} [options.parserInstance] 可選的 DOMParser 實例
 * @param {Object} [options.turndownClass] 可選的 Turndown 類別
 * @param {Object} [options.gfmPlugin] 可選的 GFM 外掛
 * @returns {Promise<{markdown: string, images: Array<{fileName: string, blob: Blob, objectUrl?: string}>}>}
 */
export async function parseDocx(arrayBuffer, options = {}) {
  const mammothInstance = options.mammoth || (typeof mammoth !== 'undefined' ? mammoth : null);
  if (!mammothInstance) {
    throw new Error('未提供 mammoth 實例且當前環境無全域 mammoth 物件');
  }

  const input = {};
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(arrayBuffer)) {
    input.buffer = arrayBuffer;
    input.arrayBuffer = arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength);
  } else if (arrayBuffer instanceof ArrayBuffer) {
    input.arrayBuffer = arrayBuffer;
    if (typeof Buffer !== 'undefined') {
      input.buffer = Buffer.from(arrayBuffer);
    }
  } else {
    input.arrayBuffer = arrayBuffer;
  }

  // Mammoth 將 DOCX 轉換為語意化 HTML，內嵌圖片預設自動轉為 Base64 Data URI
  const conversionResult = await mammothInstance.convertToHtml(input);
  const htmlContent = conversionResult.value;

  // 接入成熟的 parseHtmlContent 解析 DOM、抽取 Base64 圖片為 Blob 並渲染為 GFM Markdown
  return parseHtmlContent(htmlContent, new Map(), options);
}
