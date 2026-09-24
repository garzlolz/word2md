/**
 * history.component.js - 轉換歷程列表與管理元件
 */
import { StorageService } from '../services/storage.service.js';

export class HistoryComponent {
  constructor({ onSelectHistory, onToast }) {
    this.historyList = document.getElementById('history-list');
    this.btnCleanHistory = document.getElementById('btn-clean-history');
    this.onSelectHistory = onSelectHistory;
    this.onToast = onToast;

    this.bindEvents();
    this.render();
  }

  bindEvents() {
    this.btnCleanHistory?.addEventListener('click', () => {
      if (confirm('確定要清空所有的歷史轉換紀錄嗎？')) {
        StorageService.clear();
        this.render();
        this.onToast?.('已清空歷史紀錄');
      }
    });
  }

  render() {
    if (!this.historyList) return;

    const history = StorageService.getAll();
    if (history.length === 0) {
      this.historyList.innerHTML = `
        <div class="empty-history">
          <i data-lucide="inbox"></i>
          <p>尚無轉換記錄</p>
        </div>`;
      if (this.btnCleanHistory) this.btnCleanHistory.style.display = 'none';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    if (this.btnCleanHistory) this.btnCleanHistory.style.display = 'inline-flex';

    this.historyList.innerHTML = history.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-item-icon">
          <i data-lucide="file-text"></i>
        </div>
        <div class="history-item-info">
          <div class="history-item-name" title="${item.fileName}">${item.fileName}</div>
          <div class="history-item-meta">${item.timestamp} · ${item.imageCount || 0} 張圖片</div>
        </div>
      </div>
    `).join('');

    this.historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const target = history.find(h => h.id === id);
        if (target && this.onSelectHistory) {
          this.onSelectHistory(target);
        }
      });
    });

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}
