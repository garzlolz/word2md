/**
 * storage.js - 本地歷史紀錄管理器 (使用 localStorage)
 */
const STORAGE_KEY = 'word2md_history';
const MAX_HISTORY_ITEMS = 50;

/**
 * 取得所有歷史紀錄
 * @returns {Array<Object>}
 */
export function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('讀取歷史紀錄失敗', e);
    return [];
  }
}

/**
 * 新增一筆轉換紀錄
 * @param {Object} item 
 */
export function addHistoryItem(item) {
  try {
    const history = getHistory();
    const newItem = {
      id: Date.now().toString(),
      fileName: item.fileName,
      timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
      imageCount: item.imageCount || 0,
      markdown: item.markdown || '',
      ...item
    };

    // 最多保留 50 筆
    const updated = [newItem, ...history.filter(h => h.id !== newItem.id)].slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newItem;
  } catch (e) {
    console.warn('寫入歷史紀錄失敗 (可能已達儲存空間上限)', e);
    return null;
  }
}

/**
 * 刪除單筆紀錄
 * @param {string} id 
 */
export function removeHistoryItem(id) {
  try {
    const history = getHistory();
    const updated = history.filter(h => h.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('刪除歷史紀錄失敗', e);
  }
}

/**
 * 清除所有歷史紀錄
 */
export function clearAllHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('清空歷史紀錄失敗', e);
  }
}
