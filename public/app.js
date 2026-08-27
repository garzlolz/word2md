// 全域狀態
let currentMarkdown = '';
let currentFolder = '';
let currentFolderPath = '';
let selectedFile = null;

// DOM 元素
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

// 初始化 Lucide Icons
lucide.createIcons();

// 初始化加載歷史記錄
loadHistory();

// 監聽 Tab 切換
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tabName = btn.getAttribute('data-tab');
    
    // 更新按鈕樣式
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // 更新內容顯示
    if (tabName === 'rendered') {
      tabRendered.style.display = 'flex';
      tabRaw.style.display = 'none';
    } else {
      tabRendered.style.display = 'none';
      tabRaw.style.display = 'flex';
    }
  });
});

// Toast 提示
function showToast(message, isError = false) {
  toastMessage.textContent = message;
  const icon = toast.querySelector('.toast-icon');
  if (isError) {
    icon.setAttribute('data-lucide', 'alert-circle');
    toast.style.borderColor = 'hsla(0, 80%, 60%, 0.4)';
    icon.style.color = 'hsl(0, 80%, 60%)';
  } else {
    icon.setAttribute('data-lucide', 'check-circle-2');
    toast.style.borderColor = 'var(--border-color)';
    icon.style.color = 'var(--success-color)';
  }
  lucide.createIcons();
  
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// 點擊上傳區域觸發 input
dropZone.addEventListener('click', () => {
  fileInput.click();
});

// 檔案選擇變更
fileInput.addEventListener('change', (e) => {
  handleFileSelect(e.target.files[0]);
});

// 拖曳事件處理
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const file = dt.files[0];
  handleFileSelect(file);
});

// 處理選定的檔案
function handleFileSelect(file) {
  if (!file) return;
  
  // 檢查是否為 .odt, .pdf, .html, .htm 或 .zip 檔
  const fileNameLower = file.name.toLowerCase();
  const isOdt = fileNameLower.endsWith('.odt');
  const isPdf = fileNameLower.endsWith('.pdf');
  const isHtml = fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
  const isZip = fileNameLower.endsWith('.zip');
  if (!isOdt && !isPdf && !isHtml && !isZip) {
    showToast('請上傳 .odt, .pdf, .html 或 .zip 格式的檔案', true);
    return;
  }
  
  selectedFile = file;
  displayFileName.textContent = file.name;
  displayFileSize.textContent = formatBytes(file.size);
  selectedFileInfo.style.display = 'flex';
  
  // 自動滾動到轉換按鈕
  btnConvert.scrollIntoView({ behavior: 'smooth' });
}

// 檔案大小格式化
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 開始轉換
btnConvert.addEventListener('click', async () => {
  const uploadFile = selectedFile || (fileInput.files && fileInput.files[0]);
  
  if (!uploadFile) {
    showToast('請先選擇檔案', true);
    return;
  }
  
  const formData = new FormData();
  formData.append('file', uploadFile);
  
  // 更新 UI 狀態為載入中
  welcomeScreen.style.display = 'none';
  tabRendered.style.display = 'none';
  tabRaw.style.display = 'none';
  outputInfoBar.style.display = 'none';
  loader.style.display = 'flex';
  
  btnConvert.disabled = true;
  btnCopy.disabled = true;
  btnDownloadZip.disabled = true;
  btnDownloadMd.disabled = true;
  
  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      currentMarkdown = result.markdown;
      currentFolder = result.folderName;
      currentFolderPath = result.outputPath;
      
      // 更新預覽
      markdownRaw.value = currentMarkdown;
      markdownRendered.innerHTML = renderMarkdown(currentMarkdown);
      markdownRendered.scrollTop = 0;
      
      // 顯示統計資料
      infoPath.textContent = `output/${result.folderName}/`;
      infoImages.textContent = `${result.imageCount} 張`;
      
      // 切換 UI
      loader.style.display = 'none';
      outputInfoBar.style.display = 'grid';
      
      // 依據當前選取的 tab 決定顯示哪一個
      const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
      if (activeTab === 'rendered') {
        tabRendered.style.display = 'flex';
      } else {
        tabRaw.style.display = 'flex';
      }
      
      // 啟用功能按鈕
      btnCopy.disabled = false;
      btnDownloadZip.disabled = false;
      btnDownloadMd.disabled = false;
      
      showToast('轉換成功！已寫入時間戳資料夾');
      loadHistory(); // 重新整理歷史記錄
    } else {
      throw new Error(result.error || '轉換失敗');
    }
  } catch (error) {
    loader.style.display = 'none';
    welcomeScreen.style.display = 'flex';
    showToast(error.message, true);
  } finally {
    btnConvert.disabled = false;
  }
});

// 複製 Markdown
btnCopy.addEventListener('click', () => {
  if (!currentMarkdown) return;
  navigator.clipboard.writeText(currentMarkdown)
    .then(() => {
      showToast('Markdown 內容已複製至剪貼簿！');
    })
    .catch(err => {
      showToast('複製失敗：' + err, true);
    });
});

// 下載 ZIP 壓縮包
btnDownloadZip.addEventListener('click', () => {
  if (!currentFolder) return;
  downloadZip(currentFolder);
});

// 下載 Markdown 檔案
btnDownloadMd.addEventListener('click', () => {
  if (!currentFolder) return;
  downloadMd(currentFolder);
});

function downloadZip(folderName) {
  const link = document.createElement('a');
  link.href = `/api/download/zip/${encodeURIComponent(folderName)}`;
  link.download = `${folderName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('開始下載 ZIP 壓縮包...');
}

function downloadMd(folderName) {
  const link = document.createElement('a');
  link.href = `/api/download/md/${encodeURIComponent(folderName)}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('開始下載 Markdown 檔案...');
}

// 綁定清理失效記錄按鈕
if (btnCleanHistory) {
  btnCleanHistory.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/history/clean', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        showToast(`已清理 ${result.removedCount} 筆失效歷史紀錄`);
        loadHistory();
      }
    } catch (err) {
      showToast('清理失敗：' + err.message, true);
    }
  });
}

// 載入歷史記錄
async function loadHistory() {
  try {
    const response = await fetch('/api/history');
    const history = await response.json();
    
    if (history.length === 0) {
      if (btnCleanHistory) btnCleanHistory.style.display = 'none';
      historyList.innerHTML = `
        <div class="empty-history">
          <i data-lucide="inbox"></i>
          <p>尚無轉換記錄</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    
    // 檢查是否有失效的項目，決定是否顯示「清理失效」按鈕
    const hasMissing = history.some(item => item.exists === false);
    if (btnCleanHistory) {
      btnCleanHistory.style.display = hasMissing ? 'inline-flex' : 'none';
    }
    
    historyList.innerHTML = history.map(item => {
      const isMissing = item.exists === false;
      return `
        <div class="history-item ${isMissing ? 'is-missing' : ''}" 
             data-id="${item.id}"
             data-folder="${item.folderName}" 
             data-path="${item.outputPath || ''}" 
             data-file="${item.mdFile || ''}" 
             data-exists="${!isMissing}">
          <div class="history-item-details">
            <span class="history-item-name" title="${item.fileName}">${item.fileName}</span>
            <div class="history-item-time-row">
              <span class="history-item-time">${item.timestamp}</span>
              ${isMissing ? '<span class="history-badge-missing">檔案已清理</span>' : ''}
            </div>
          </div>
          <div class="history-item-actions">
            ${!isMissing ? `
              <button class="btn-icon-only btn-history-download" title="下載 ZIP 壓縮檔">
                <i data-lucide="download"></i>
              </button>
            ` : ''}
            <button class="btn-icon-only btn-history-delete" title="刪除此紀錄">
              <i data-lucide="x"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    lucide.createIcons();
    
    // 綁定歷史記錄點擊事件
    document.querySelectorAll('.history-item').forEach(el => {
      const id = el.getAttribute('data-id');
      const folderName = el.getAttribute('data-folder');
      const mdFile = el.getAttribute('data-file');
      const folderPath = el.getAttribute('data-path');
      const exists = el.getAttribute('data-exists') === 'true';

      // 點擊整項載入預覽
      el.addEventListener('click', async (e) => {
        // 點擊了刪除此筆記錄
        if (e.target.closest('.btn-history-delete')) {
          e.stopPropagation();
          try {
            const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
            if (res.ok) {
              showToast('已刪除該筆歷史紀錄');
              loadHistory();
            }
          } catch (err) {
            showToast('刪除失敗：' + err.message, true);
          }
          return;
        }

        // 點擊了下載 ZIP 按鈕
        if (e.target.closest('.btn-history-download')) {
          e.stopPropagation();
          downloadZip(folderName);
          return;
        }

        if (!exists) {
          showToast('該紀錄對應的實體檔案已不存在', true);
          return;
        }
        
        // 讀取該歷史紀錄的 markdown 檔案 (透過伺服器靜態資源載入)
        try {
          const response = await fetch(`/output/${folderName}/${mdFile}`);
          if (response.ok) {
            const mdText = await response.text();
            currentMarkdown = mdText;
            currentFolder = folderName;
            currentFolderPath = folderPath;
            
            // 更新 UI
            welcomeScreen.style.display = 'none';
            markdownRaw.value = currentMarkdown;
            markdownRendered.innerHTML = renderMarkdown(currentMarkdown);
            
            // 顯示統計資料
            infoPath.textContent = `output/${folderName}/`;
            infoImages.textContent = `查看資料夾`;
            
            outputInfoBar.style.display = 'grid';
            
            const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
            if (activeTab === 'rendered') {
              tabRendered.style.display = 'flex';
              tabRaw.style.display = 'none';
            } else {
              tabRendered.style.display = 'none';
              tabRaw.style.display = 'flex';
            }
            
            btnCopy.disabled = false;
            btnDownloadZip.disabled = false;
            btnDownloadMd.disabled = false;
            
            showToast('已載入歷史轉換預覽');
          } else {
            showToast('無法讀取歷史 Markdown 檔案', true);
          }
        } catch (err) {
          showToast('讀取失敗：' + err.message, true);
        }
      });
    });
    
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

// 簡易 Markdown 轉 HTML 預覽渲染器
function renderMarkdown(md) {
  if (!md) return '';
  
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // 還原 <u> 和 </u> 標籤，因為後端會輸出 <u> 標籤來表示底線格式
  html = html.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');

  // 還原 <span style="color:..."> 標籤，因為後端會輸出此標籤來表示文字顏色
  html = html.replace(/&lt;span style="color:(#[0-9A-Fa-f]{3,6})"&gt;/g, '<span style="color:$1">').replace(/&lt;\/span&gt;/g, '</span>');

  // 解析表格
  const lines = html.split('\n');
  let inTable = false;
  let tableRows = [];
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      // 略過 |---|---| 這種表格對齊列
      if (!line.match(/^\|?\s*:?-+:?\s*\|/)) {
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        tableRows.push(cells);
      }
    } else {
      if (inTable) {
        processedLines.push(generateTableHtml(tableRows));
        inTable = false;
      }
      processedLines.push(lines[i]);
    }
  }
  if (inTable) {
    processedLines.push(generateTableHtml(tableRows));
  }

  html = processedLines.join('\n');

  // 解析標題
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 行內元素解析輔助函數
  function parseInlineElements(text) {
    return text
      // 粗體 **bold**
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // 斜體 *italic*
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // 刪除線 ~~strike~~
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      // 圖片 ![alt](url) -> 自動導向到伺服器靜態資源路徑
      .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
        const realSrc = src.startsWith('http') || src.startsWith('/') ? src : `/output/${currentFolder}/${src}`;
        return `<img src="${realSrc}" alt="${alt}" class="preview-img" onerror="this.style.display='none'" />`;
      })
      // 連結 [text](url)
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
  }

  // 生成表格 HTML 輔助函數
  function generateTableHtml(rows) {
    if (rows.length === 0) return '';
    let tHtml = '<table>';
    // 標題列
    tHtml += '<thead><tr>' + rows[0].map(c => `<th>${parseInlineElements(c)}</th>`).join('') + '</tr></thead>';
    // 內容列
    if (rows.length > 1) {
      tHtml += '<tbody>';
      for (let r = 1; r < rows.length; r++) {
        tHtml += '<tr>' + rows[r].map(c => `<td>${parseInlineElements(c)}</td>`).join('') + '</tr>';
      }
      tHtml += '</tbody>';
    }
    tHtml += '</table>';
    return tHtml;
  }

  // 處理清單 (簡單處理無序清單 - 與有序清單 1. 轉為 <li>)
  // 這部分在行處理中配合 parseInlineElements
  const finalLines = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // 如果是 HTML 標籤就不需要 wrap 成 <p>
    if (trimmed.startsWith('<h') || trimmed.startsWith('</h') || trimmed.startsWith('<table') || trimmed.startsWith('</table') || trimmed.startsWith('<tr') || trimmed.startsWith('</tr') || trimmed.startsWith('<td') || trimmed.startsWith('<th') || trimmed.startsWith('<thead') || trimmed.startsWith('<tbody') || trimmed.startsWith('<u>') || trimmed.startsWith('<img>')) {
      return line;
    }

    // 依原始行首縮排空白計算巢狀層級 (後端以每層 2 個空白產生縮排，例如目錄大綱層級)
    const leadingSpaces = line.length - line.trimStart().length;
    const indentPx = 20 + Math.floor(leadingSpaces / 2) * 20;

    // 無序清單
    if (trimmed.startsWith('- ')) {
      // 簡單的 list-item 轉換
      const listContent = trimmed.substring(2);
      return `<li style="list-style-type: disc; margin-left: ${indentPx}px;">${parseInlineElements(listContent)}</li>`;
    }

    // 有序清單
    const numListMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numListMatch) {
      return `<li style="list-style-type: decimal; margin-left: ${indentPx}px;">${parseInlineElements(numListMatch[2])}</li>`;
    }

    return `<p>${parseInlineElements(line)}</p>`;
  });

  return finalLines.join('\n');
}
