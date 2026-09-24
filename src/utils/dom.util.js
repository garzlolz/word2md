/**
 * dom.util.js - 字串處理與安全 DOM 工具函式
 */

/**
 * 清除檔名中在各作業系統皆不合法的字元
 * @param {string} name 
 * @returns {string}
 */
export function sanitizeFileName(name) {
  if (!name) return 'document';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * 脫逸 Markdown 特殊語意字元並移除私有區塊字元
 * @param {string} text 
 * @returns {string}
 */
export function escapeMarkdown(text) {
  if (!text) return '';
  return text
    // 移除私有區塊字元 (Word/ODT 目錄項目符號等) 與物件取代字元
    .replace(/[\uE000-\uF8FF\uFFFC]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * HTML 特殊字元跳脫
 * @param {string} text 
 * @returns {string}
 */
export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
