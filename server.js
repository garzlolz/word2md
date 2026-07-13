const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { DOMParser } = require('@xmldom/xmldom');
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_DIR));

// 確保輸出目錄與歷史記錄檔案存在
const OUTPUT_DIR = path.join(__dirname, 'output');
const HISTORY_FILE = path.join(__dirname, 'history.json');

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
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
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
          if (style.bold) content = `**${content}**`;
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

// 核心轉換 ODT API
app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const originalName = req.file.originalname;
    const baseName = path.parse(originalName).name;
    const fileBuffer = req.file.buffer;

    // 用 adm-zip 解壓
    let zip;
    try {
      zip = new AdmZip(fileBuffer);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid zip/odt file' });
    }

    const contentXmlEntry = zip.getEntry('content.xml');
    if (!contentXmlEntry) {
      return res.status(400).json({ error: 'Invalid ODT format: content.xml missing' });
    }

    const contentXmlText = contentXmlEntry.getData().toString('utf8');

    // 解析 XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(contentXmlText, 'text/xml');

    // 解析樣式
    const styles = parseStyles(doc);

    // 解析內容並收集圖片
    const imageMap = {};
    let markdown = convertChildren(doc.getElementsByTagName('office:body')[0], styles, imageMap);

    // 清理多餘換行
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    // 建立輸出目錄：以當日日期+時間戳命名
    const timestampFolder = getTimestampFolder();
    const runOutputDir = path.join(OUTPUT_DIR, timestampFolder);
    fs.mkdirSync(runOutputDir, { recursive: true });

    // 提取並儲存圖片
    const extractedImages = [];
    const imageKeys = Object.keys(imageMap);
    if (imageKeys.length > 0) {
      const picturesDir = path.join(runOutputDir, 'Pictures');
      fs.mkdirSync(picturesDir, { recursive: true });

      for (const imagePath of imageKeys) {
        // ODT 中的圖片通常存在於 Pictures/ 中
        const zipEntry = zip.getEntry(imagePath);
        if (zipEntry) {
          const imageFileName = path.basename(imagePath);
          const destPath = path.join(picturesDir, imageFileName);
          fs.writeFileSync(destPath, zipEntry.getData());
          extractedImages.push(imageFileName);
        }
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
  if (!folderPath || !fs.existsSync(folderPath)) {
    return res.status(400).json({ error: '資料夾路徑不存在' });
  }

  // 根據不同作業系統執行開啟資料夾指令
  let command = '';
  if (process.platform === 'win32') {
    command = `explorer.exe "${folderPath}"`;
  } else if (process.platform === 'darwin') {
    command = `open "${folderPath}"`;
  } else {
    command = `xdg-open "${folderPath}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '無法開啟資料夾' });
    }
    res.json({ success: true });
  });
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
