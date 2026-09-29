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

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
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

    let cleanLine = rawLine;
    const isListItem = /^\s*([*+-]|\d+\.)\s+/.test(rawLine);
    const isBlockquote = /^\s*>/.test(rawLine);
    const isTable = /^\s*\|/.test(rawLine);
    const isHeading = /^\s*#{1,6}\s+/.test(rawLine);

    if (isHeading || isTable) {
      cleanLine = trimmedLine;
    } else if (isBlockquote) {
      cleanLine = rawLine.replace(/^\s+>/, '>');
    } else if (isListItem) {
      // 清單保留階層縮排，但清理行尾多餘空白
      cleanLine = rawLine.replace(/\s+$/, '');
    } else {
      // 普通文字段落去除首尾多餘縮排，防止誤觸縮排代碼區塊
      cleanLine = trimmedLine;
    }

    // 尾隨空白處理：若末尾剛好是 2 個空格則保留（代表軟換行），其餘移除
    const hasSoftBreak = /[^\s]  $/.test(rawLine);
    if (!hasSoftBreak && !isListItem) {
      cleanLine = cleanLine.replace(/\s+$/, '');
    }

    normalizedLines.push(cleanLine);
  }

  let text = normalizedLines.join('\n');

  // 1. 確保標題前有空行（非文件開頭）
  text = text.replace(/([^\n])\n(#{1,6}\s+[^\n]+)/g, '$1\n\n$2');

  // 2. 確保標題後有空行（除非緊接另一個標題）
  text = text.replace(/(#{1,6}\s+[^\n]+)\n([^\n#])/g, '$1\n\n$2');

  // 3. 確保水平分隔線前後有空行 (避免緊接文字被誤判為 setext heading)
  text = text.replace(/([^\n])\n(---|\*\*\*|___)(?:\n|$)/g, '$1\n\n$2\n');
  text = text.replace(/(?:\n|^)(---|\*\*\*|___)\n([^\n])/g, '\n$1\n\n$2');

  // 4. 收斂 3 個或以上連續空行
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text ? text + '\n' : '';
}

