const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { DOMParser } = require('@xmldom/xmldom');
const pdf2md = require('@opendocsg/pdf2md');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// 使用記憶體儲存上傳的檔案，避免在硬碟產生垃圾檔案
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 限制 50MB
});

// 確保輸出目錄與歷史記錄檔案存在
const OUTPUT_DIR = path.join(__dirname, 'output');
const HISTORY_FILE = path.join(__dirname, 'history.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_DIR));

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 取得歷史記錄
function getHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

// 儲存歷史記錄
function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

// 取得時間戳資料夾名稱 (YYYY-MM-DD_HHmmss)
function getTimestampFolder() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${date}_${hours}${minutes}${seconds}`;
}

// 轉義 Markdown 特殊字元
function escapeMarkdown(text) {
  // 避免過度轉義中文字元間的星號 * 或底線 _，以提供更清爽的中文排版讀寫體驗
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

// 解析 ODT 中的 styles.xml 與 content.xml 中的自動樣式
function parseStyles(doc) {
  const styles = {};
  const styleNodes = doc.getElementsByTagName('style:style');
  for (let i = 0; i < styleNodes.length; i++) {
    const node = styleNodes[i];
    const name = node.getAttribute('style:name');
    const family = node.getAttribute('style:family');
    
    if (family === 'text') {
      const textProps = node.getElementsByTagName('style:text-properties')[0];
      if (textProps) {
        styles[name] = {
          bold: textProps.getAttribute('fo:font-weight') === 'bold',
          italic: textProps.getAttribute('fo:font-style') === 'italic',
          underline: !!textProps.getAttribute('style:text-underline-style'),
          strike: !!textProps.getAttribute('style:text-line-through-style'),
        };
      }
    }
  }
  return styles;
}

// 檢查節點是否位於標題 (text:h) 內部
function isInsideHeader(node) {
  let parent = node.parentNode;
  while (parent) {
    if (parent.tagName === 'text:h' || parent.nodeName === 'text:h') {
      return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

// 遞迴遍歷 XML DOM 節點並生成 Markdown
function convertElement(node, styles, imageMap, listState = { level: 0, ordered: false }) {
  if (!node) return '';

  // TEXT_NODE (3)
  if (node.nodeType === 3) {
    return escapeMarkdown(node.nodeValue);
  }

  // ELEMENT_NODE (1)
  if (node.nodeType === 1) {
    const tagName = node.tagName || node.nodeName;

    switch (tagName) {
      case 'text:h': {
        const level = parseInt(node.getAttribute('text:outline-level') || '1', 10);
        const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6));
        const content = convertChildren(node, styles, imageMap, listState).trim();
        return `\n\n${hashes} ${content}\n\n`;
      }

      case 'text:p': {
        const content = convertChildren(node, styles, imageMap, listState);
        // 如果在列表中，段落不需要額外的雙換行
        if (listState.level > 0) {
          return content;
        }
        return `\n\n${content}\n\n`;
      }

      case 'text:span': {
        const styleName = node.getAttribute('text:style-name');
        let content = convertChildren(node, styles, imageMap, listState);
        if (!content || !content.trim()) return content; // 保留空格，但若無內容則不處理
        
        const style = styles[styleName];
        if (style) {
          // 如果本身已在標題內，則忽略加粗標記，因為 Markdown 標題本身就是粗體
          const skipBold = isInsideHeader(node);
          if (style.bold && !skipBold) content = `**${content}**`;
          if (style.italic) content = `*${content}*`;
          if (style.strike) content = `~~${content}~~`;
          if (style.underline) content = `<u>${content}</u>`;
        }
        return content;
      }

      case 'text:a': {
        const href = node.getAttribute('xlink:href');
        const content = convertChildren(node, styles, imageMap, listState).trim();
        return `[${content}](${href})`;
      }

      case 'text:s': {
        const count = parseInt(node.getAttribute('text:c') || '1', 10);
        return ' '.repeat(count);
      }

      case 'text:line-break': {
        return '  \n';
      }

      case 'text:list': {
        const styleName = node.getAttribute('text:style-name') || '';
        // 簡單判斷是否為有序列表：如果樣式名包含 Numbering 或 L 等，或者子節點有特定的有序特徵
        const isOrdered = styleName.toLowerCase().includes('num') || styleName.toLowerCase().includes('ord') || styleName.toLowerCase().includes('list');
        
        listState.level++;
        const prevOrdered = listState.ordered;
        const prevIndex = listState.itemIndex;
        
        listState.ordered = isOrdered;
        listState.itemIndex = 0;

        const content = convertChildren(node, styles, imageMap, listState);
        
        listState.level--;
        listState.ordered = prevOrdered;
        listState.itemIndex = prevIndex;
        return `\n${content}\n`;
      }

      case 'text:list-item': {
        const indent = '  '.repeat(listState.level - 1);
        listState.itemIndex = (listState.itemIndex || 0) + 1;
        const prefix = listState.ordered ? `${listState.itemIndex}. ` : '- ';
        const content = convertChildren(node, styles, imageMap, listState).trim();
        return `${indent}${prefix}${content}\n`;
      }

      case 'table:table': {
        const rows = [];
        const children = node.childNodes;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.tagName === 'table:table-row' || child.nodeName === 'table:table-row') {
            const cells = [];
            const cellChildren = child.childNodes;
            for (let j = 0; j < cellChildren.length; j++) {
              const cell = cellChildren[j];
              if (cell.tagName === 'table:table-cell' || cell.nodeName === 'table:table-cell') {
                const cellContent = convertChildren(cell, styles, imageMap, listState).trim().replace(/\r?\n/g, ' ');
                cells.push(cellContent);
              }
            }
            if (cells.length > 0) {
              rows.push(cells);
            }
          }
        }

        if (rows.length === 0) return '';

        let tableMd = '\n\n';
        const header = rows[0];
        tableMd += `| ${header.join(' | ')} |\n`;
        const separator = header.map(() => '---');
        tableMd += `| ${separator.join(' | ')} |\n`;
        for (let i = 1; i < rows.length; i++) {
          tableMd += `| ${rows[i].join(' | ')} |\n`;
        }
        tableMd += '\n';
        return tableMd;
      }

      case 'draw:frame': {
        const imageNodes = node.getElementsByTagName('draw:image');
        if (imageNodes.length > 0) {
          const imageNode = imageNodes[0];
          const href = imageNode.getAttribute('xlink:href');
          if (href) {
            const alt = node.getAttribute('draw:name') || 'image';
            imageMap[href] = true;
            // 統一將圖片相對路徑指向 Pictures/ 目錄
            const fileName = path.basename(href);
            return `![${alt}](Pictures/${fileName})`;
          }
        }
        return convertChildren(node, styles, imageMap, listState);
      }

      default:
        return convertChildren(node, styles, imageMap, listState);
    }
  }

  return '';
}

function convertChildren(node, styles, imageMap, listState) {
  let result = '';
  const children = node.childNodes;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      result += convertElement(children[i], styles, imageMap, listState);
    }
  }
  return result;
}

// 統一 HTML 轉 Markdown 核心邏輯 (包含強效雜訊/側邊欄清理與主體內容精準提取)
function convertHtmlContent(htmlContent, runOutputDir, zipInstance = null) {
  // 1. 移除無效或干擾腳本與樣式
  let cleanHtml = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

  // 2. 移除 1x1 gif 佔位符圖片 (例如 Notion emoji 佔位符 gif)
  cleanHtml = cleanHtml.replace(/<img[^>]*data:image\/gif;base64,R0lGODlhAQABAIA[^>]*>/gi, '');

  // 3. 強效清理頁面側邊欄、導覽列與邊角無關 DOM (Notion / Confluence / 常見網頁導覽)
  cleanHtml = cleanHtml
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<div[^>]*class="[^"]*notion-sidebar[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*notion-topbar[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*id="skip-to-content"[^>]*>[\s\S]*?<\/div>/gi, '');

  // 4. 安全提取 Notion / 網頁文章主內容區塊 (.notion-page-scroller / .notion-frame / article)
  const scrollerMatch = cleanHtml.match(/<div[^>]*class="[^"]*(?:notion-page-scroller|notion-frame)[^"]*"[^>]*>[\s\S]*$/i);
  if (scrollerMatch) {
    cleanHtml = scrollerMatch[0];
  }

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });
  turndownService.use(gfm);

  // 忽略網頁導覽與無關空連結
  turndownService.addRule('ignoreNavLinks', {
    filter: function (node) {
      const text = (node.textContent || '').trim();
      const href = node.getAttribute('href') || '';
      if (text === '跳至內容' || href.includes('#main')) return true;
      if (text === '網訊電通股份有限公司' || text === '訪客') return true;
      return false;
    },
    replacement: function () {
      return '';
    }
  });

  const extractedImages = [];
  let imgCounter = 0;

  turndownService.addRule('extractHtmlImages', {
    filter: 'img',
    replacement: function (content, node) {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || 'image';

      if (!src || src.includes('data:image/gif;base64,R0lGODlhAQABAIA')) return '';

      // 忽略 Notion 側邊欄大頭貼與無用 Icon 圖片
      if (src.includes('googleusercontent') && src.includes('photo.jpg')) return '';

      // 1. 處理 Base64 編碼圖片
      if (src.startsWith('data:image/')) {
        const match = src.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (match) {
          const imgExt = match[1] === 'jpeg' ? 'jpg' : match[1];
          const base64Data = match[2];
          const imgBuffer = Buffer.from(base64Data, 'base64');
          imgCounter++;
          const imgFileName = `image_${imgCounter}.${imgExt}`;
          const picturesDir = path.join(runOutputDir, 'Pictures');
          if (!fs.existsSync(picturesDir)) {
            fs.mkdirSync(picturesDir, { recursive: true });
          }
          const destPath = path.join(picturesDir, imgFileName);
          fs.writeFileSync(destPath, imgBuffer);
          extractedImages.push(imgFileName);

          return `![${alt}](Pictures/${imgFileName})`;
        }
      }

      const validImgExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];

      // 2. 若有 ZIP 壓縮檔實例，尋找 zip 內相對應的圖片檔案條目 (包含 _files 資料夾)
      if (zipInstance && !src.startsWith('http://') && !src.startsWith('https://')) {
        const decodedSrc = decodeURIComponent(src).replace(/\\/g, '/');
        const targetFileName = path.basename(decodedSrc);
        const ext = path.extname(targetFileName).toLowerCase();

        // 若副檔名不是合法圖片格式，忽略此標籤 (防止 tag, txt 等非圖片檔導致破圖)
        if (!validImgExts.includes(ext)) {
          return '';
        }

        const entries = zipInstance.getEntries();

        let matchedEntry = entries.find(e => !e.isDirectory && (e.entryName.endsWith(decodedSrc) || e.entryName === decodedSrc));
        if (!matchedEntry) {
          matchedEntry = entries.find(e => !e.isDirectory && path.basename(e.entryName) === targetFileName);
        }

        if (matchedEntry) {
          const picturesDir = path.join(runOutputDir, 'Pictures');
          if (!fs.existsSync(picturesDir)) {
            fs.mkdirSync(picturesDir, { recursive: true });
          }
          imgCounter++;
          const imgFileName = `image_${imgCounter}${ext}`;
          const destPath = path.join(picturesDir, imgFileName);
          fs.writeFileSync(destPath, matchedEntry.getData());
          extractedImages.push(imgFileName);
          return `![${alt}](Pictures/${imgFileName})`;
        }
      }

      // 3. 一般非遠端圖片路徑
      if (!src.startsWith('http://') && !src.startsWith('https://')) {
        const fileNameOnly = path.basename(src.split('?')[0]);
        const ext = path.extname(fileNameOnly).toLowerCase();
        if (!validImgExts.includes(ext)) {
          return '';
        }
        imgCounter++;
        const imgFileName = `image_${imgCounter}${ext}`;
        return `![${alt}](Pictures/${imgFileName})`;
      }

      // 4. 遠端圖片連結處理
      if (src.startsWith('http://') || src.startsWith('https://')) {
        const fileNameOnly = path.basename(src.split('?')[0]);
        const ext = path.extname(fileNameOnly).toLowerCase();
        if (validImgExts.includes(ext)) {
          return `![${alt}](${src})`;
        }
        return '';
      }

      return '';
    }
  });

  let markdown = turndownService.turndown(cleanHtml);

  // 5. 雙重後處理防護：徹底過濾任何未成功提取實體檔案或無效圖片副檔名之破圖標記
  const validImgExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  markdown = markdown.replace(/!\[.*?\]\(Pictures\/[^\)]*\)/g, (match) => {
    const matchFile = match.match(/Pictures\/([^\)]+)/);
    if (matchFile) {
      const fileName = matchFile[1];
      const ext = path.extname(fileName).toLowerCase();
      if (!validImgExts.includes(ext)) {
        return '';
      }
      const pictureFilePath = path.join(runOutputDir, 'Pictures', fileName);
      if (!fs.existsSync(pictureFilePath)) {
        return ''; // 若實體檔案不存在，拋棄此破圖語法
      }
    }
    return match;
  });

  // 6. 忠實還原原始版面結構，僅清理外圍頁首頁尾導覽雜訊
  markdown = cleanNavigationNoise(markdown);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  return { markdown, extractedImages };
}

// 忠實保留原始版面結構，僅清理外圍頁首頁尾導覽雜訊
function cleanNavigationNoise(markdownText) {
  let lines = markdownText.split('\n');
  let resultLines = [];
  let started = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 在找到真正的文章標題或主內容之前，過濾頁首與導覽區塊雜項
    if (!started) {
      if (trimmed.startsWith('#') || trimmed.startsWith('##') || trimmed === 'Assign To' || trimmed.includes('需求目的')) {
        started = true;
      } else {
        if (
          trimmed === '跳至內容' ||
          trimmed === '網訊電通股份有限公司' ||
          trimmed === '訪客' ||
          trimmed === '首頁' ||
          trimmed === '99+收件匣' ||
          trimmed === '共用' ||
          trimmed === 'TE PBI' ||
          trimmed === 'P1 Sprint schedule' ||
          trimmed === 'IVR Asterisk 開發文件' ||
          trimmed.includes('NLP與B/C端對接文件') ||
          trimmed === '2024 PBI' ||
          trimmed === '媒體櫃' ||
          trimmed === '說明' ||
          trimmed === '新' ||
          trimmed === '99+' ||
          trimmed.includes('| Notion')
        ) {
          continue;
        }
      }
    }

    resultLines.push(lines[i]);
  }

  return resultLines.join('\n');
}

// 核心轉換 API (支援 ODT, PDF, HTML 及 ZIP 網頁包)
app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 修正 Multer 檔名中文字亂碼的經典問題 (將 latin1 重新以 utf8 解讀)
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    console.log(`\n[API Convert Request] 收到上傳檔案: ${originalName}`);
    const baseName = path.parse(originalName).name;
    const fileBuffer = req.file.buffer;
    const ext = path.extname(originalName).toLowerCase();
    const isPdf = ext === '.pdf';
    const isHtml = ext === '.html' || ext === '.htm';

    // 建立輸出目錄：以當日日期+時間戳命名
    const timestampFolder = getTimestampFolder();
    const runOutputDir = path.join(OUTPUT_DIR, timestampFolder);
    fs.mkdirSync(runOutputDir, { recursive: true });

    let markdown = '';
    let extractedImages = [];

    if (isPdf) {
      try {
        markdown = await pdf2md(fileBuffer);
      } catch (e) {
        return res.status(400).json({ error: '解析 PDF 檔案失敗：' + e.message });
      }
    } else if (isHtml) {
      try {
        const htmlContent = fileBuffer.toString('utf8');
        const converted = convertHtmlContent(htmlContent, runOutputDir);
        markdown = converted.markdown;
        extractedImages = converted.extractedImages;
      } catch (e) {
        return res.status(400).json({ error: '解析 HTML 檔案失敗：' + e.message });
      }
    } else {
      // 處理 ZIP / ODT 檔案
      let zip;
      try {
        zip = new AdmZip(fileBuffer);
      } catch (e) {
        return res.status(400).json({ error: '無效的 zip/odt 檔案' });
      }

      const contentXmlEntry = zip.getEntry('content.xml');

      if (contentXmlEntry) {
        // --- 1. ODT 解析流程 ---
        const contentXmlText = contentXmlEntry.getData().toString('utf8');
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentXmlText, 'text/xml');
        const styles = parseStyles(doc);

        const imageMap = {};
        markdown = convertChildren(doc.getElementsByTagName('office:body')[0], styles, imageMap);
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

        const imageKeys = Object.keys(imageMap);
        if (imageKeys.length > 0) {
          const picturesDir = path.join(runOutputDir, 'Pictures');
          fs.mkdirSync(picturesDir, { recursive: true });

          for (const imagePath of imageKeys) {
            const zipEntry = zip.getEntry(imagePath);
            if (zipEntry) {
              const imageFileName = path.basename(imagePath);
              const destPath = path.join(picturesDir, imageFileName);
              fs.writeFileSync(destPath, zipEntry.getData());
              extractedImages.push(imageFileName);
            }
          }
        }
      } else {
        // --- 2. ZIP 內含網頁檔 (.html / .htm) 解析流程 ---
        const entries = zip.getEntries();
        // 優先排除 _files 附屬資料夾與小工具 HTML 檔案，搜尋主文章網頁檔
        const htmlEntries = entries.filter(e => {
          if (e.isDirectory) return false;
          const name = e.entryName.toLowerCase().replace(/\\/g, '/');
          return (name.endsWith('.html') || name.endsWith('.htm')) && !name.includes('_files') && !name.includes('__macosx');
        });

        let htmlEntry = null;
        if (htmlEntries.length > 0) {
          // 若有多個，選擇檔案容量最大的主網頁檔
          htmlEntries.sort((a, b) => (b.header ? b.header.size : 0) - (a.header ? a.header.size : 0));
          htmlEntry = htmlEntries[0];
        } else {
          const allHtml = entries.filter(e => !e.isDirectory && (e.entryName.toLowerCase().endsWith('.html') || e.entryName.toLowerCase().endsWith('.htm')));
          if (allHtml.length > 0) {
            allHtml.sort((a, b) => (b.header ? b.header.size : 0) - (a.header ? a.header.size : 0));
            htmlEntry = allHtml[0];
          }
        }

        if (!htmlEntry) {
          return res.status(400).json({ error: '無效的檔案格式：ZIP 檔案內找不到 .html 網頁檔或 content.xml (ODT)' });
        }

        console.log(`[ZIP Converter] 成功選取主文章 HTML: ${htmlEntry.entryName} (Size: ${htmlEntry.header ? htmlEntry.header.size : 0} bytes)`);

        const htmlContent = htmlEntry.getData().toString('utf8');
        const converted = convertHtmlContent(htmlContent, runOutputDir, zip);
        markdown = converted.markdown;
        extractedImages = converted.extractedImages;
      }
    }

    // 儲存 Markdown 檔案
    const mdFileName = `${baseName}.md`;
    const mdFilePath = path.join(runOutputDir, mdFileName);
    fs.writeFileSync(mdFilePath, markdown, 'utf8');

    // 更新歷史記錄
    const history = getHistory();
    const historyItem = {
      id: Date.now().toString(),
      fileName: originalName,
      folderName: timestampFolder,
      outputPath: runOutputDir,
      mdFile: mdFileName,
      timestamp: new Date().toLocaleString('zh-TW'),
      imageCount: extractedImages.length
    };
    history.unshift(historyItem);
    saveHistory(history.slice(0, 50)); // 只保留前 50 筆記錄

    res.json({
      success: true,
      markdown: markdown,
      outputPath: runOutputDir,
      mdFile: mdFileName,
      folderName: timestampFolder,
      imageCount: extractedImages.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '轉換過程發生錯誤：' + error.message });
  }
});

// 開啟資料夾 API
app.post('/api/open-folder', (req, res) => {
  const { folderPath } = req.body;
  console.log(`[Open Folder] 請求開啟路徑: ${folderPath}`);
  
  if (!folderPath) {
    return res.status(400).json({ error: '未提供路徑' });
  }

  // 標準化為操作系統原生路徑格式（在 Windows 上為反斜線）
  const normalizedPath = path.resolve(folderPath);
  console.log(`[Open Folder] 標準化原生路徑: ${normalizedPath}`);

  if (!fs.existsSync(normalizedPath)) {
    console.error(`[Open Folder] 資料夾不存在: ${normalizedPath}`);
    return res.status(400).json({ error: `資料夾路徑不存在: ${normalizedPath}` });
  }

  try {
    const { spawn } = require('child_process');
    if (process.platform === 'win32') {
      // 使用 cmd.exe 的 start 指令來開啟資料夾，這是 Windows 下最穩定、最不容易出錯的 Shell 方式
      // 這能完美避免 explorer.exe 直啟時的參數解析 Bug，並能在使用者互動 Session 下 100% 彈出檔案總管
      const child = spawn('cmd.exe', ['/c', 'start', '', normalizedPath], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else if (process.platform === 'darwin') {
      const child = spawn('open', [normalizedPath], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else {
      const child = spawn('xdg-open', [normalizedPath], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
    
    console.log(`[Open Folder] 已成功調用系統進程開啟資料夾`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[Open Folder] 啟動進程失敗:`, err);
    res.status(500).json({ error: `無法開啟資料夾：${err.message}` });
  }
});

// 取得歷史記錄 API
app.get('/api/history', (req, res) => {
  res.json(getHistory());
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  
  // 自動開啟瀏覽器
  const url = `http://localhost:${PORT}`;
  let openCmd = '';
  if (process.platform === 'win32') {
    openCmd = `start ${url}`;
  } else if (process.platform === 'darwin') {
    openCmd = `open ${url}`;
  } else {
    openCmd = `xdg-open ${url}`;
  }
  
  exec(openCmd, (err) => {
    if (err) {
      console.log(`Please manually open browser and navigate to ${url}`);
    }
  });
});
