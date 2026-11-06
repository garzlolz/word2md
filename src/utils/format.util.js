/**
 * format.util.js - 格式化共用工具純函數
 */

/**
 * 將 byte 轉為易讀的人類可讀格式 (KB, MB, GB)
 * @param {number} bytes 
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 取得格式化之本地當前時間戳字串
 * @param {Date} [date]
 * @returns {string}
 */
export function formatTimestamp(date = new Date()) {
  return date.toLocaleString('zh-TW', { hour12: false });
}

/**
 * 標準化 Markdown 排版與空行
 * 遵循 CommonMark / Markdownlint 規範：
 * 1. 統一為 \n 換行，清除純空行上的無用空白字符
 * 2. 移除一般段落前多餘的縮排空白（避免誤觸 4-space 縮排程式碼區塊），圍欄程式碼區塊內部保留
 * 3. 確保標題 (#)、分隔線 (---)、表格前後具有乾淨合規的單一空行
 * 4. 收斂連續多餘空行，文件結尾維持標準單一換行
 * 
 * @param {string} markdown 
 * @returns {string} 標準化後的 Markdown
 */
export function normalizeMarkdown(markdown) {
  if (!markdown) return '';

  // 清除異常行結束字元 (Unicode LS U+2028、PS U+2029、NEL U+0085)、私有區塊字元與零寬字元，並統一換行符號為 \n
  const sanitized = markdown
    .replace(/[\uE000-\uF8FF\uFFFC\u2028\u2029\u0085\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n');

  const lines = sanitized.split('\n');
  const normalizedLines = [];
  let inFencedCode = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();

    // 檢查圍欄程式碼區塊 (fenced code block)
    if (/^(```|~~~)/.test(trimmedLine)) {
      inFencedCode = !inFencedCode;
      normalizedLines.push(trimmedLine);
      continue;
    }

    if (inFencedCode) {
      normalizedLines.push(rawLine);
      continue;
    }

    if (trimmedLine === '') {
      normalizedLines.push('');
      continue;
    }

    // 忽略僅有 # 符號卻無任何文字內容的空白標題行 (例如 "###" 或 "####")
    if (/^#{1,6}$/.test(trimmedLine)) {
      continue;
    }

    // 修正多重疊加的清單符號 (例如 "- - 項目" 或 "- - - 項目" 轉為正確縮排階層)
    let workingLine = rawLine;
    const multiBulletMatch = workingLine.match(/^(\s*)((?:[-*+]\s+){2,})(.*)$/);
    if (multiBulletMatch) {
      const baseIndent = multiBulletMatch[1];
      const bulletCount = (multiBulletMatch[2].match(/[-*+]\s+/g) || []).length;
      const extraIndent = '  '.repeat(Math.max(0, bulletCount - 1));
      workingLine = `${baseIndent}${extraIndent}- ${multiBulletMatch[3]}`;
    }

    let cleanLine = workingLine;
    const isListItem = /^\s*([*+-]|\d+\.)\s+/.test(workingLine);
    const isBlockquote = /^\s*>/.test(workingLine);
    const isTable = /^\s*\|/.test(workingLine);
    const isHeading = /^\s*#{1,6}\s+/.test(workingLine);

    if (isHeading || isTable) {
      cleanLine = workingLine.trim();
    } else if (isBlockquote) {
      cleanLine = workingLine.replace(/^\s+>/, '>');
    } else if (isListItem) {
      // 清單保留階層縮排，但清理行尾多餘空白
      cleanLine = workingLine.replace(/\s+$/, '');
    } else {
      // 普通文字段落去除首尾多餘縮排，防止誤觸縮排代碼區塊
      cleanLine = workingLine.trim();
    }

    // 尾隨空白處理：若末尾剛好是 2 個空格則保留（代表軟換行），其餘移除
    const hasSoftBreak = /[^\s]  $/.test(workingLine);
    if (!hasSoftBreak && !isListItem) {
      cleanLine = cleanLine.replace(/\s+$/, '');
    }

    normalizedLines.push(cleanLine);
  }

  let text = normalizedLines.join('\n');

  // 1. 移除無意義或導致白底隱形的純白/純黑/近似黑字體顏色標籤
  text = text.replace(/<span style="color:\s*#(?:ffffff|fff|000000|000|1d1c1d)\s*">([\s\S]*?)<\/span>/gi, '$1');

  // 2. 合併碎片化之相鄰同色 <span>、粗體 (**)、刪除線 (~~) 與底線 (<u>) 標籤
  let prevText;
  do {
    prevText = text;
    text = text.replace(/<span style="color:(#[0-9a-fA-F]{3,6})">([^<\n]*?)<\/span>([ \t]*)<span style="color:\1">([^<\n]*?)<\/span>/gi, '<span style="color:$1">$2$3$4</span>');
    text = text.replace(/\*\*([^*\n]+)\*\*([ \t]*)\*\*([^*\n]+)\*\*/g, '**$1$2$3**');
    text = text.replace(/~~([^~\n]+)~~~~([^~\n]+)~~/g, '~~$1$2~~');
    text = text.replace(/<u>([^<\n]*?)<\/u>([ \t]*)<u>([^<\n]*?)<\/u>/g, '<u>$1$2$3</u>');
  } while (text !== prevText);

  // 3. 確保標題前有空行（非文件開頭）
  text = text.replace(/([^\n])\n(#{1,6}\s+[^\n]+)/g, '$1\n\n$2');

  // 4. 確保標題後有空行（除非緊接另一個標題）
  text = text.replace(/(#{1,6}\s+[^\n]+)\n([^\n#])/g, '$1\n\n$2');

  // 5. 確保表格區塊前後有空行
  text = text.replace(/([^\n|])\n(\|[^\n]+\|\n\|[\s:|-]+\|)/g, '$1\n\n$2');
  text = text.replace(/(\|[^\n]+\|)\n([^\n|])/g, '$1\n\n$2');

  // 6. 確保水平分隔線前後有空行 (避免緊接文字被誤判為 setext heading)
  text = text.replace(/([^\n])\n(---|\*\*\*|___)(?:\n|$)/g, '$1\n\n$2\n');
  text = text.replace(/(?:\n|^)(---|\*\*\*|___)\n([^\n])/g, '\n$1\n\n$2');

  // 7. 收斂 3 個或以上連續空行
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text ? text + '\n' : '';
}

/**
 * 將二進位 Blob 物件轉換為 Base64 Data URL
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export async function blobToDataUrl(blob) {
  if (!blob) return '';

  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Node.js / 非瀏覽器環境備援
  const arrayBuffer = await blob.arrayBuffer();
  const mime = blob.type || 'image/png';
  let base64 = '';
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(arrayBuffer).toString('base64');
  } else {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    base64 = btoa(binary);
  }
  return `data:${mime};base64,${base64}`;
}

/**
 * 將 Markdown 中的相對路徑圖片替換為 Base64 Data URL 內嵌格式（供單一 .md 下載使用）
 * @param {string} markdown 
 * @param {Array<{fileName: string, blob?: Blob, dataUrl?: string}>} [images] 
 * @returns {Promise<string>}
 */
export async function embedImagesAsBase64(markdown, images = []) {
  if (!markdown || !images || images.length === 0) {
    return markdown || '';
  }

  const dataUrlMap = new Map();
  for (const img of images) {
    if (!img || !img.fileName) continue;
    let dataUrl = img.dataUrl || '';
    if (!dataUrl && img.blob) {
      try {
        dataUrl = await blobToDataUrl(img.blob);
        img.dataUrl = dataUrl; // 快取轉換結果避免重複編碼
      } catch (e) {
        console.warn(`圖片轉 Base64 失敗：${img.fileName}`, e);
      }
    }
    if (dataUrl) {
      dataUrlMap.set(img.fileName, dataUrl);
      dataUrlMap.set(`Pictures/${img.fileName}`, dataUrl);
    }
  }

  if (dataUrlMap.size === 0) {
    return markdown;
  }

  return markdown.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
    const trimmedSrc = src.trim();
    if (trimmedSrc.startsWith('data:image/')) return match;

    let decodedSrc = trimmedSrc;
    try {
      decodedSrc = decodeURIComponent(trimmedSrc);
    } catch (_) {}

    const fileName = decodedSrc.split('/').pop();
    const dataUrl = dataUrlMap.get(trimmedSrc) || dataUrlMap.get(decodedSrc) || dataUrlMap.get(fileName);
    if (dataUrl) {
      return `![${alt}](${dataUrl})`;
    }
    return match;
  });
}


