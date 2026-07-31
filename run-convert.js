const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { DOMParser } = require('@xmldom/xmldom');

// ODT 解析與轉換邏輯 (與 server.js 保持一致)
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

// 清除檔名中在 Windows/macOS/Linux 檔案系統皆不合法的字元
function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function escapeMarkdown(text) {
  // 避免過度轉義中文字元間的星號 * 或底線 _，以提供更清爽的中文排版讀寫體驗
  return text
    // 移除私有區塊字元 (如 Word 目錄項目符號慣用的 Wingdings/Symbol 字型佔位符) 與物件取代字元，脫離原字型後沒有意義
    .replace(/[\uE000-\uF8FF\uFFFC]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function parseStyles(doc) {
  const styles = {};
  const styleNodes = doc.getElementsByTagName('style:style');
  for (let i = 0; i < styleNodes.length; i++) {
    const node = styleNodes[i];
    const name = node.getAttribute('style:name');
    const family = node.getAttribute('style:family');
    
    if (family === 'text' || family === 'paragraph') {
      const textProps = node.getElementsByTagName('style:text-properties')[0];
      styles[name] = {
        bold: textProps ? textProps.getAttribute('fo:font-weight') === 'bold' : false,
        italic: textProps ? textProps.getAttribute('fo:font-style') === 'italic' : false,
        underline: textProps ? !!textProps.getAttribute('style:text-underline-style') : false,
        strike: textProps ? !!textProps.getAttribute('style:text-line-through-style') : false,
        color: textProps ? textProps.getAttribute('fo:color') : null,
        parent: node.getAttribute('style:parent-style-name') || null,
      };
    }
  }
  return styles;
}

// 依樣式繼承鏈 (style:parent-style-name) 查找該樣式最終對應的目錄大綱層級
function resolveTocLevel(styleName, styles, templateLevelByStyle) {
  let name = styleName;
  let depth = 0;
  while (name && depth < 10) {
    if (templateLevelByStyle[name]) return templateLevelByStyle[name];
    name = styles[name] ? styles[name].parent : null;
    depth++;
  }
  return 1;
}

function applyParagraphColor(node, styles, content) {
  if (!content || !content.trim()) return content;
  const style = styles[node.getAttribute('text:style-name')];
  if (style && style.color && style.color.toUpperCase() !== '#000000') {
    return `<span style="color:${style.color}">${content}</span>`;
  }
  return content;
}

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

function convertElement(node, styles, imageMap, listState = { level: 0, ordered: false }) {
  if (!node) return '';

  if (node.nodeType === 3) {
    return escapeMarkdown(node.nodeValue);
  }

  if (node.nodeType === 1) {
    const tagName = node.tagName || node.nodeName;

    switch (tagName) {
      case 'text:h': {
        const level = parseInt(node.getAttribute('text:outline-level') || '1', 10);
        const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6));
        const content = applyParagraphColor(node, styles, convertChildren(node, styles, imageMap, listState).trim());
        return `\n\n${hashes} ${content}\n\n`;
      }

      case 'text:p': {
        const content = applyParagraphColor(node, styles, convertChildren(node, styles, imageMap, listState));
        if (listState.level > 0) {
          return content;
        }
        return `\n\n${content}\n\n`;
      }

      case 'text:span': {
        const styleName = node.getAttribute('text:style-name');
        let content = convertChildren(node, styles, imageMap, listState);
        if (!content || !content.trim()) return content;
        
        const style = styles[styleName];
        if (style) {
          const skipBold = isInsideHeader(node);
          if (style.bold && !skipBold) content = `**${content}**`;
          if (style.italic) content = `*${content}*`;
          if (style.strike) content = `~~${content}~~`;
          if (style.underline) content = `<u>${content}</u>`;
          if (style.color && style.color.toUpperCase() !== '#000000') content = `<span style="color:${style.color}">${content}</span>`;
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

      case 'text:tab': {
        return ' ';
      }

      case 'text:line-break': {
        return '  \n';
      }

      case 'text:table-of-content': {
        // 目錄：依 text:table-of-content-source 定義的大綱層級樣式對照表，將每行轉為對應縮排的巢狀清單
        const templateLevelByStyle = {};
        const sourceNode = node.getElementsByTagName('text:table-of-content-source')[0];
        if (sourceNode) {
          const templates = sourceNode.getElementsByTagName('text:table-of-content-entry-template');
          for (let i = 0; i < templates.length; i++) {
            const templateStyleName = templates[i].getAttribute('text:style-name');
            const level = parseInt(templates[i].getAttribute('text:outline-level') || '1', 10);
            if (templateStyleName) templateLevelByStyle[templateStyleName] = level;
          }
        }

        const indexBody = node.getElementsByTagName('text:index-body')[0];
        if (!indexBody) return '';

        const lines = [];
        const bodyChildren = indexBody.childNodes;
        for (let i = 0; i < bodyChildren.length; i++) {
          const child = bodyChildren[i];
          const childTag = child.tagName || child.nodeName;
          if (childTag !== 'text:p' && childTag !== 'text:h') continue;

          const level = resolveTocLevel(child.getAttribute('text:style-name'), styles, templateLevelByStyle);
          const content = convertChildren(child, styles, imageMap, listState).trim();
          if (!content) continue;
          lines.push(`${'  '.repeat(level - 1)}- ${content}`);
        }

        return `\n\n${lines.join('\n')}\n\n`;
      }

      case 'text:list': {
        const styleName = node.getAttribute('text:style-name') || '';
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

// 主執行邏輯
async function main() {
  const args = process.argv.slice(2);
  const inputFileName = args[0] || 'PRD - 圖文選單 v1.1.odt';
  const inputFilePath = path.join(__dirname, inputFileName);

  if (!fs.existsSync(inputFilePath)) {
    console.error(`錯誤：找不到輸入檔案 ${inputFilePath}`);
    process.exit(1);
  }

  console.log(`開始轉換：${inputFileName}`);
  const fileBuffer = fs.readFileSync(inputFilePath);

  const zip = new AdmZip(fileBuffer);
  const contentXmlEntry = zip.getEntry('content.xml');
  if (!contentXmlEntry) {
    console.error('錯誤：無效的 ODT 檔案，找不到 content.xml');
    process.exit(1);
  }

  const contentXmlText = contentXmlEntry.getData().toString('utf8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(contentXmlText, 'text/xml');

  // 解析樣式
  const styles = parseStyles(doc);

  // 解析內容
  const imageMap = {};
  let markdown = convertChildren(doc.getElementsByTagName('office:body')[0], styles, imageMap);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  // 建立輸出資料夾：時間戳_檔案名稱
  const baseName = path.parse(inputFileName).name;
  const outputFolderName = `${getTimestampFolder()}_${sanitizeFileName(baseName)}`;
  const outputDir = path.join(__dirname, 'output', outputFolderName);
  fs.mkdirSync(outputDir, { recursive: true });

  // 提取圖片
  const imageKeys = Object.keys(imageMap);
  let imageCount = 0;
  if (imageKeys.length > 0) {
    const picturesDir = path.join(outputDir, 'Pictures');
    fs.mkdirSync(picturesDir, { recursive: true });

    for (const imagePath of imageKeys) {
      const zipEntry = zip.getEntry(imagePath);
      if (zipEntry) {
        const imageFileName = path.basename(imagePath);
        const destPath = path.join(picturesDir, imageFileName);
        fs.writeFileSync(destPath, zipEntry.getData());
        imageCount++;
      }
    }
  }

  // 寫入 Markdown
  const mdFilePath = path.join(outputDir, `${baseName}.md`);
  fs.writeFileSync(mdFilePath, markdown, 'utf8');

  // 更新 history.json
  const historyFile = path.join(__dirname, 'history.json');
  let history = [];
  if (fs.existsSync(historyFile)) {
    try {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    } catch (e) {
      history = [];
    }
  }
  
  history.unshift({
    id: Date.now().toString(),
    fileName: inputFileName,
    folderName: outputFolderName,
    outputPath: outputDir,
    mdFile: `${baseName}.md`,
    timestamp: new Date().toLocaleString('zh-TW'),
    imageCount: imageCount
  });
  fs.writeFileSync(historyFile, JSON.stringify(history.slice(0, 50), null, 2), 'utf8');

  console.log('\n轉換完成！');
  console.log(`產出資料夾：${outputDir}`);
  console.log(`Markdown 檔案：${baseName}.md`);
  console.log(`共提取圖片數：${imageCount} 張`);
}

main().catch(err => {
  console.error('發生非預期錯誤：', err);
});
