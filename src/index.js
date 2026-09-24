/**
 * index.js - 前端應用主入口 (Application Bootstrapper)
 * 符合 nodebestpractices: 裝配並啟動各組件，清晰劃分職責
 */
import { ToastComponent } from './components/toast.component.js';
import { PreviewComponent } from './components/preview.component.js';
import { HistoryComponent } from './components/history.component.js';
import { UploaderComponent } from './components/uploader.component.js';
import { ConversionService } from './services/conversion.service.js';
import { StorageService } from './services/storage.service.js';

class App {
  constructor() {
    this.toast = new ToastComponent();

    this.preview = new PreviewComponent({
      onToast: (msg, isErr) => this.toast.show(msg, isErr)
    });

    this.history = new HistoryComponent({
      onSelectHistory: (item) => this.handleSelectHistory(item),
      onToast: (msg, isErr) => this.toast.show(msg, isErr)
    });

    this.uploader = new UploaderComponent({
      onFileSelected: (file) => this.handleConvert(file)
    });
  }

  async handleConvert(file) {
    this.preview.showLoading();

    try {
      const result = await ConversionService.convert(file);

      // 持久化儲存
      StorageService.add({
        fileName: result.fileName,
        baseName: result.baseName,
        imageCount: result.images.length,
        markdown: result.markdown
      });

      // 渲染至介面
      this.preview.renderResult(result);
      this.history.render();
      this.toast.success(`轉換成功！共提取 ${result.images.length} 張圖片`);
    } catch (err) {
      console.error('文檔轉換失敗：', err);
      this.preview.showWelcome();
      this.toast.error(`轉換失敗：${err.message}`);
    }
  }

  handleSelectHistory(item) {
    this.preview.renderResult({
      fileName: item.fileName,
      baseName: item.baseName || item.fileName.replace(/\.[^/.]+$/, ''),
      markdown: item.markdown,
      images: []
    });
    this.toast.success(`已載入「${item.fileName}」歷史紀錄`);
  }
}

// 應用程式初始化
document.addEventListener('DOMContentLoaded', () => {
  new App();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});
