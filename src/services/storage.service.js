/**
 * storage.service.js - 本地歷史紀錄持久化服務
 * 符合 nodebestpractices: 封裝 Data Access 邊界
 */
import { STORAGE_CONFIG } from '../config/storage.config.js';
import { formatTimestamp } from '../utils/format.util.js';

export class StorageService {
  /**
   * 取得所有歷史紀錄
   * @returns {Array<Object>}
   */
  static getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_CONFIG.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('讀取歷史紀錄失敗', e);
      return [];
    }
  }

  /**
   * 新增一筆轉換紀錄
   * @param {Object} item 
   * @returns {Object|null}
   */
  static add(item) {
    try {
      const history = this.getAll();
      const newItem = {
        id: Date.now().toString(),
        fileName: item.fileName,
        baseName: item.baseName,
        timestamp: formatTimestamp(),
        imageCount: item.imageCount || 0,
        markdown: item.markdown || '',
        ...item
      };

      const updated = [newItem, ...history.filter(h => h.id !== newItem.id)].slice(0, STORAGE_CONFIG.MAX_HISTORY_ITEMS);
      localStorage.setItem(STORAGE_CONFIG.KEY, JSON.stringify(updated));
      return newItem;
    } catch (e) {
      console.warn('寫入歷史紀錄失敗 (可能已達儲存空間上限)', e);
      return null;
    }
  }

  /**
   * 依 ID 刪除單筆紀錄
   * @param {string} id 
   */
  static remove(id) {
    try {
      const history = this.getAll();
      const updated = history.filter(h => h.id !== id);
      localStorage.setItem(STORAGE_CONFIG.KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('刪除歷史紀錄失敗', e);
    }
  }

  /**
   * 清空所有歷史紀錄
   */
  static clear() {
    try {
      localStorage.removeItem(STORAGE_CONFIG.KEY);
    } catch (e) {
      console.error('清空歷史紀錄失敗', e);
    }
  }
}
