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
