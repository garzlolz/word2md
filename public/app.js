// 全域狀態
let currentMarkdown = '';
let currentFolder = '';
let currentFolderPath = '';

// DOM 元素
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const selectedFileInfo = document.getElementById('selected-file-info');
const displayFileName = document.getElementById('display-file-name');
const displayFileSize = document.getElementById('display-file-size');
const btnConvert = document.getElementById('btn-convert');
const btnCopy = document.getElementById('btn-copy');
const btnOpenFolder = document.getElementById('btn-open-folder');
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
  const file = fileInput.files[0] || (dropZone.files && dropZone.files[0]);
  
  // 如果是拖曳產生的檔案
  let uploadFile = file;
  if (!uploadFile && fileInput.files.length === 0) {
    // 嘗試從 input 屬性或 drop 緩存取得
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
  btnOpenFolder.disabled = true;
  
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
      btnOpenFolder.disabled = false;
      
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

// 開啟輸出資料夾 (兼具複製路徑後備方案)
btnOpenFolder.addEventListener('click', () => {
  if (!currentFolderPath) return;
  
  // 先嘗試複製絕對路徑到剪貼簿
  navigator.clipboard.writeText(currentFolderPath)
    .then(() => {
      openFolder(currentFolderPath, true);
    })
    .catch(() => {
      openFolder(currentFolderPath, false);
    });
});

async function openFolder(folderPath, pathCopied = false) {
  try {
    const response = await fetch('/api/open-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ folderPath })
    });
    const result = await response.json();
    if (result.success) {
      const msg = pathCopied 
        ? '已嘗試開啟資料夾（絕對路徑已複製到剪貼簿，可直接貼上）' 
        : '已在檔案總管中開啟輸出資料夾';
      showToast(msg);
    } else {
      showToast('無法開啟資料夾：' + result.error, true);
    }
  } catch (error) {
    showToast('通訊錯誤：' + error.message, true);
  }
}

// 載入歷史記錄
async function loadHistory() {
  try {
    const response = await fetch('/api/history');
    const history = await response.json();
    
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-history">
          <i data-lucide="inbox"></i>
          <p>尚無轉換記錄</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    
    historyList.innerHTML = history.map(item => `
      <div class="history-item" data-folder="${item.folderName}" data-path="${item.outputPath}" data-file="${item.mdFile}">
        <div class="history-item-details">
          <span class="history-item-name" title="${item.fileName}">${item.fileName}</span>
          <span class="history-item-time">${item.timestamp}</span>
        </div>
        <div class="history-item-actions">
          <button class="btn-icon-only btn-history-open" title="開啟產出資料夾">
            <i data-lucide="folder"></i>
          </button>
        </div>
      </div>
    `).join('');
    
    lucide.createIcons();
    
    // 綁定歷史記錄點擊事件
    document.querySelectorAll('.history-item').forEach(el => {
      // 點擊整項載入預覽
      el.addEventListener('click', async (e) => {
        // 如果是點擊了開啟資料夾按鈕，不觸發載入預覽
        if (e.target.closest('.btn-history-open')) {
          e.stopPropagation();
          const folderPath = el.getAttribute('data-path');
          navigator.clipboard.writeText(folderPath)
            .then(() => openFolder(folderPath, true))
            .catch(() => openFolder(folderPath, false));
          return;
        }
        
        const folderName = el.getAttribute('data-folder');
        const mdFile = el.getAttribute('data-file');
        const folderPath = el.getAttribute('data-path');
        
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
            btnOpenFolder.disabled = false;
            
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
        return `<img src="${realSrc}" alt="${alt}" class="preview-img" />`;
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
    
    // 無序清單
    if (trimmed.startsWith('- ')) {
      // 簡單的 list-item 轉換
      const listContent = trimmed.substring(2);
      return `<li style="list-style-type: disc; margin-left: 20px;">${parseInlineElements(listContent)}</li>`;
    }
    
    // 有序清單
    const numListMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numListMatch) {
      return `<li style="list-style-type: decimal; margin-left: 20px;">${parseInlineElements(numListMatch[2])}</li>`;
    }

    return `<p>${parseInlineElements(line)}</p>`;
  });

  return finalLines.join('\n');
}
