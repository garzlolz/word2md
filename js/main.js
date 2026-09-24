/**
 * main.js - 純前端轉換應用程式主入口模組 (ESM)
 */
import { convertOdt } from './converters/odt.js';
import { convertHtmlFile, convertZipWebPackage } from './converters/html.js';
import { downloadResultZip, saveBlob } from './zip-handler.js';
import { getHistory, addHistoryItem, clearAllHistory } from './storage.js';

// DOM 元素選取
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const selectedFileInfo = document.getElementById('selected-file-info');
const displayFileName = document.getElementById('display-file-name');
const displayFileSize = document.getElementById('display-file-size');
const btnConvert = document.getElementById('btn-convert');
const btnCopy = document.getElementById('btn-copy');
const btnDownloadZip = document.getElementById('btn-download-zip');
const btnDownloadMd = document.getElementById('btn-download-md');
const btnCleanHistory = document.getElementById('btn-clean-history');

const loader = document.getElementById('loader');
const welcomeScreen = document.getElementById('welcome-screen');
const outputInfoBar = document.getElementById('output-info-bar');
const infoPath = document.getElementById('info-path');
const infoImages = document.getElementById('info-images');

const tabRendered = document.getElementById('tab-rendered');
const tabRaw = document.getElementById('tab-raw');
const markdownRendered = document.getElementById('markdown-rendered');
const markdownRaw = document.getElementById('markdown-raw');
const historyList = document.getElementById('history-list');

const toast = document.getElementById('toast');
const toastMessage = document.querySelector('.toast-message');

// 當前檔案與成果狀態
let selectedFile = null;
let currentResult = {
  fileName: '',
  baseName: '',
  markdown: '',
  images: [] // Array<{fileName: string, blob: Blob, objectUrl: string}>
};

// 格式化檔案大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupEventListeners();
  renderHistory();
});

function initIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function setupEventListeners() {
  // 監聽 Tab 切換
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (tabName === 'rendered') {
        tabRendered.style.display = 'flex';
        tabRaw.style.display = 'none';
      } else {
        tabRendered.style.display = 'none';
        tabRaw.style.display = 'flex';
      }
    });
  });

  // 拖曳上傳
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-active');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileSelected(files[0]);
    }
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
      fileInput.value = '';
    }
  });

  // 點擊「開始轉換」按鈕
  btnConvert.addEventListener('click', () => {
    if (selectedFile) {
      processConversion(selectedFile);
    }
  });

  // 複製 Markdown
  btnCopy.addEventListener('click', async () => {
    if (!currentResult.markdown) return;
    try {
      await navigator.clipboard.writeText(currentResult.markdown);
      showToast('已複製 Markdown 內容至剪貼簿！');
    } catch (err) {
      showToast('複製失敗，請手動複製', true);
    }
  });

  // 下載 ZIP
  btnDownloadZip.addEventListener('click', async () => {
    if (!currentResult.markdown) return;
    try {
      showToast('正在封裝下載 ZIP 包...');
      await downloadResultZip(currentResult.baseName, currentResult.markdown, currentResult.images);
      showToast('ZIP 檔案下載成功！');
    } catch (err) {
      showToast(`封裝下載失敗：${err.message}`, true);
    }
  });

  // 下載 .md
  btnDownloadMd.addEventListener('click', () => {
    if (!currentResult.markdown) return;
    try {
      const blob = new Blob([currentResult.markdown], { type: 'text/markdown;charset=utf-8' });
      saveBlob(blob, `${currentResult.baseName}.md`);
      showToast('Markdown 檔案下載成功！');
    } catch (err) {
      showToast(`下載失敗：${err.message}`, true);
    }
  });

  // 清空歷史紀錄
  btnCleanHistory.addEventListener('click', () => {
    if (confirm('確定要清空所有的歷史轉換紀錄嗎？')) {
      clearAllHistory();
      renderHistory();
      showToast('已清空歷史紀錄');
    }
  });
}

function onFileSelected(file) {
  if (!file) return;

  const fileNameLower = file.name.toLowerCase();
  const isOdt = fileNameLower.endsWith('.odt');
  const isHtml = fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
  const isZip = fileNameLower.endsWith('.zip');

  if (!isOdt && !isHtml && !isZip) {
    showToast('請上傳 .odt, .html 或 .zip 格式的檔案', true);
    return;
  }

  selectedFile = file;
  displayFileName.textContent = file.name;
  displayFileSize.textContent = formatFileSize(file.size);
  selectedFileInfo.style.display = 'flex';

  // 自動直接開始轉換以提供最佳體驗
  processConversion(file);
}

async function processConversion(file) {
  loader.style.display = 'flex';
  welcomeScreen.style.display = 'none';
  outputInfoBar.style.display = 'none';
  tabRendered.style.display = 'none';
  tabRaw.style.display = 'none';

  btnCopy.disabled = true;
  btnDownloadZip.disabled = true;
  btnDownloadMd.disabled = true;

  try {
    let result = null;
    const fileNameLower = file.name.toLowerCase();
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

    if (fileNameLower.endsWith('.odt')) {
      result = await convertOdt(file);
    } else if (fileNameLower.endsWith('.zip')) {
      result = await convertZipWebPackage(file);
    } else {
      result = await convertHtmlFile(file);
    }

    if (!result || !result.markdown) {
      throw new Error('轉換完成但未產生有效的 Markdown 內容');
    }

    currentResult = {
      fileName: file.name,
      baseName: baseName,
      markdown: result.markdown,
      images: result.images || []
    };

    // 加入本地歷史紀錄
    addHistoryItem({
      fileName: file.name,
      baseName: baseName,
      imageCount: currentResult.images.length,
      markdown: currentResult.markdown
    });

    // 呈現在 UI
    renderResultToUI(currentResult);
    renderHistory();
    showToast(`轉換成功！共提取 ${currentResult.images.length} 張圖片`);
  } catch (error) {
    console.error('轉換過程發生錯誤：', error);
    loader.style.display = 'none';
    welcomeScreen.style.display = 'flex';
    showToast(`轉換失敗：${error.message}`, true);
  }
}

function renderResultToUI(result) {
  loader.style.display = 'none';
  welcomeScreen.style.display = 'none';

  // 資訊欄
  infoPath.textContent = `${result.baseName}.md`;
  infoImages.textContent = `${result.images.length} 張`;
  outputInfoBar.style.display = 'flex';

  // 啟用按鈕
  btnCopy.disabled = false;
  btnDownloadZip.disabled = false;
  btnDownloadMd.disabled = false;

  // 預覽與源碼
  markdownRaw.value = result.markdown;
  markdownRendered.innerHTML = renderMarkdownToHtml(result.markdown, result.images);

  tabRendered.style.display = 'flex';
  tabRaw.style.display = 'none';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="rendered"]').classList.add('active');

  initIcons();
}

/**
 * 客戶端 Markdown 渲染器 (支援 GFM 寬表格水平滾動容器、Task List、代碼、樣式)
 */
function renderMarkdownToHtml(md, images = []) {
  if (!md) return '';

  const imageMap = new Map();
  images.forEach(img => {
    if (img.fileName && img.objectUrl) {
      imageMap.set(img.fileName, img.objectUrl);
      imageMap.set(`Pictures/${img.fileName}`, img.objectUrl);
    }
  });

  const lines = md.split('\n');
  const htmlOut = [];
  let inCodeBlock = false;
  let codeBlockBuffer = [];
  let inTable = false;
  let tableRows = [];

  function parseInline(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>')
      .replace(/&lt;span style="(.*?)"&gt;(.*?)&lt;\/span&gt;/g, '<span style="$1">$2</span>')
      .replace(/\[🖼️ 缺漏圖片: (.*?)\]\((.*?)\)/g, '<span class="missing-image-badge" title="$2">🖼️ 缺漏圖片: $1</span>')
      .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
        const decodedSrc = decodeURIComponent(src);
        const fileName = decodedSrc.split('/').pop();
        const objectUrl = imageMap.get(src) || imageMap.get(decodedSrc) || imageMap.get(fileName);
        if (objectUrl) {
          return `<div class="preview-image-wrapper"><img src="${objectUrl}" alt="${alt}" loading="lazy"><span class="preview-image-caption">${alt || fileName}</span></div>`;
        }
        return `<span class="missing-image-badge" title="${src}">🖼️ 圖片: ${alt || src}</span>`;
      })
      .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
      .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function flushTable() {
    if (tableRows.length === 0) return '';
    let tHtml = '<div class="table-container"><table>';
    tHtml += '<thead><tr>' + tableRows[0].map(c => `<th>${parseInline(c)}</th>`).join('') + '</tr></thead>';
    if (tableRows.length > 1) {
      tHtml += '<tbody>';
      for (let i = 1; i < tableRows.length; i++) {
        tHtml += '<tr>' + tableRows[i].map(c => `<td>${parseInline(c)}</td>`).join('') + '</tr>';
      }
      tHtml += '</tbody>';
    }
    tHtml += '</table></div>';
    tableRows = [];
    inTable = false;
    return tHtml;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        htmlOut.push(`<pre><code>${codeBlockBuffer.join('\n')}</code></pre>`);
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        if (inTable) htmlOut.push(flushTable());
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        continue;
      }
      inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      htmlOut.push(flushTable());
    }

    if (!trimmed) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      htmlOut.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const isChecked = taskMatch[2].toLowerCase() === 'x';
      const taskText = parseInline(taskMatch[3]);
      htmlOut.push(`<div class="task-list-item"><input type="checkbox" ${isChecked ? 'checked' : ''} disabled><span class="${isChecked ? 'task-done' : ''}">${taskText}</span></div>`);
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      htmlOut.push(`<div class="list-item"><span class="list-bullet">•</span><span>${parseInline(listMatch[3])}</span></div>`);
      continue;
    }

    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      htmlOut.push('<hr>');
      continue;
    }

    htmlOut.push(`<p>${parseInline(line)}</p>`);
  }

  if (inTable) {
    htmlOut.push(flushTable());
  }

  return htmlOut.join('\n');
}

function renderHistory() {
  const history = getHistory();
  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="empty-history">
        <i data-lucide="inbox"></i>
        <p>尚無轉換記錄</p>
      </div>`;
    btnCleanHistory.style.display = 'none';
    initIcons();
    return;
  }

  btnCleanHistory.style.display = 'inline-flex';
  historyList.innerHTML = history.map(item => `
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

  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const target = history.find(h => h.id === id);
      if (target) {
        currentResult = {
          fileName: target.fileName,
          baseName: target.baseName || target.fileName.replace(/\.[^/.]+$/, ''),
          markdown: target.markdown,
          images: []
        };
        renderResultToUI(currentResult);
        showToast(`已載入「${target.fileName}」歷史紀錄`);
      }
    });
  });

  initIcons();
}

function showToast(message, isError = false) {
  toastMessage.textContent = message;
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}
