/**
 * preview.component.js - 成果預覽、原始碼對照與下載控制元件
 */
import { renderMarkdownPreview } from '../utils/markdown-render.util.js';
import { ZipService } from '../services/zip.service.js';

export class PreviewComponent {
  constructor({ onToast }) {
    this.loader = document.getElementById('loader');
    this.welcomeScreen = document.getElementById('welcome-screen');
    this.outputInfoBar = document.getElementById('output-info-bar');
    this.infoPath = document.getElementById('info-path');
    this.infoImages = document.getElementById('info-images');

    this.tabRendered = document.getElementById('tab-rendered');
    this.tabRaw = document.getElementById('tab-raw');
    this.markdownRendered = document.getElementById('markdown-rendered');
    this.markdownRaw = document.getElementById('markdown-raw');

    this.btnCopy = document.getElementById('btn-copy');
    this.btnDownloadZip = document.getElementById('btn-download-zip');
    this.btnDownloadMd = document.getElementById('btn-download-md');

    this.onToast = onToast;
    this.currentData = null;

    this.bindEvents();
  }

  bindEvents() {
    // Tab 切換
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (tabName === 'rendered') {
          this.tabRendered.style.display = 'flex';
          this.tabRaw.style.display = 'none';
        } else {
          this.tabRendered.style.display = 'none';
          this.tabRaw.style.display = 'flex';
        }
      });
    });

    // 複製 Markdown
    this.btnCopy?.addEventListener('click', async () => {
      if (!this.currentData?.markdown) return;
      try {
        await navigator.clipboard.writeText(this.currentData.markdown);
        this.onToast?.('已複製 Markdown 內容至剪貼簿！');
      } catch (err) {
        this.onToast?.('複製失敗，請手動選取複製', true);
      }
    });

    // 下載 ZIP
    this.btnDownloadZip?.addEventListener('click', async () => {
      if (!this.currentData?.markdown) return;
      try {
        this.onToast?.('正在封裝下載 ZIP 包...');
        await ZipService.downloadZipPackage(
          this.currentData.baseName,
          this.currentData.markdown,
          this.currentData.images || []
        );
        this.onToast?.('ZIP 檔案下載成功！');
      } catch (err) {
        this.onToast?.(`封裝下載失敗：${err.message}`, true);
      }
    });

    // 下載 .md
    this.btnDownloadMd?.addEventListener('click', () => {
      if (!this.currentData?.markdown) return;
      try {
        const blob = new Blob([this.currentData.markdown], { type: 'text/markdown;charset=utf-8' });
        ZipService.saveBlob(blob, `${this.currentData.baseName}.md`);
        this.onToast?.('Markdown 檔案下載成功！');
      } catch (err) {
        this.onToast?.(`下載失敗：${err.message}`, true);
      }
    });
  }

  showLoading() {
    this.loader.style.display = 'flex';
    this.welcomeScreen.style.display = 'none';
    this.outputInfoBar.style.display = 'none';
    this.tabRendered.style.display = 'none';
    this.tabRaw.style.display = 'none';

    if (this.btnCopy) this.btnCopy.disabled = true;
    if (this.btnDownloadZip) this.btnDownloadZip.disabled = true;
    if (this.btnDownloadMd) this.btnDownloadMd.disabled = true;
  }

  hideLoading() {
    this.loader.style.display = 'none';
  }

  renderResult(data) {
    this.currentData = data;
    this.hideLoading();
    this.welcomeScreen.style.display = 'none';

    // 資訊欄更新
    if (this.infoPath) this.infoPath.textContent = `${data.baseName}.md`;
    if (this.infoImages) this.infoImages.textContent = `${data.images?.length || 0} 張`;
    if (this.outputInfoBar) this.outputInfoBar.style.display = 'flex';

    // 啟用操作按鈕
    if (this.btnCopy) this.btnCopy.disabled = false;
    if (this.btnDownloadZip) this.btnDownloadZip.disabled = false;
    if (this.btnDownloadMd) this.btnDownloadMd.disabled = false;

    // 渲染預覽
    if (this.markdownRaw) this.markdownRaw.value = data.markdown;
    if (this.markdownRendered) {
      this.markdownRendered.innerHTML = renderMarkdownPreview(data.markdown, data.images || []);
    }

    // 預設切換至排版預覽
    this.tabRendered.style.display = 'flex';
    this.tabRaw.style.display = 'none';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="rendered"]')?.classList.add('active');

    // 重新整理 Lucide 圖標
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  showWelcome() {
    this.hideLoading();
    this.welcomeScreen.style.display = 'flex';
    this.outputInfoBar.style.display = 'none';
    this.tabRendered.style.display = 'none';
    this.tabRaw.style.display = 'none';
  }
}
