/**
 * odt.js - 純前端 ODT 檔案轉換模組
 * 依賴瀏覽器原生 DOMParser 與 zip-handler.js
 */
import { loadZip, readZipText, readZipBlob } from '../zip-handler.js';

// 清除檔名中不合法的字元
export function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function escapeMarkdown(text) {
  return text
    // 移除私有區塊字元 (Word/ODT 目錄項目符號等) 與物件取代字元
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
        const content = convertChildren(node, styles, imageMap);
        return `\n\n${hashes} ${content.trim()}\n\n`;
      }

      case 'text:p': {
        const content = convertChildren(node, styles, imageMap);
        if (!content.trim()) return '';

        // 如果在標題或清單內，直接返回內容
        if (isInsideHeader(node)) {
          return content;
        }

        const isInsideListItem = (function hasListItemParent(n) {
          let p = n.parentNode;
          while (p) {
            if (p.tagName === 'text:list-item' || p.nodeName === 'text:list-item') return true;
            p = p.parentNode;
          }
          return false;
        })(node);

        if (isInsideListItem) {
          return applyParagraphColor(node, styles, content);
        }

        const coloredContent = applyParagraphColor(node, styles, content);
        return `\n\n${coloredContent}\n\n`;
      }

      case 'text:span': {
        const styleName = node.getAttribute('text:style-name');
        const style = styles[styleName];
        let content = convertChildren(node, styles, imageMap);

        if (!content.trim()) return content;

        if (style) {
          if (style.bold) content = `**${content}**`;
          if (style.italic) content = `*${content}*`;
          if (style.strike) content = `~~${content}~~`;
          if (style.underline) content = `<u>${content}</u>`;
          if (style.color && style.color.toUpperCase() !== '#000000') {
            content = `<span style="color:${style.color}">${content}</span>`;
          }
        }
        return content;
      }

      case 'text:a': {
        const href = node.getAttribute('xlink:href') || '#';
        const linkText = convertChildren(node, styles, imageMap).trim();
        return `[${linkText}](${href})`;
      }

      case 'text:list': {
        const isOrdered = node.getAttribute('text:style-name')?.includes('Number') ||
                          node.getAttribute('text:style-name')?.includes('Ordered') ||
                          false;
        const currentLevel = listState.level;
        let listMarkdown = '\n';

        const childNodes = node.childNodes;
        let itemIndex = 1;
        for (let i = 0; i < childNodes.length; i++) {
          const child = childNodes[i];
          const childTag = child.tagName || child.nodeName;
          if (childTag === 'text:list-item') {
            const indent = '  '.repeat(currentLevel);
            const prefix = isOrdered ? `${itemIndex}. ` : '- ';
            const itemContent = convertChildren(child, styles, imageMap, { level: currentLevel + 1, ordered: isOrdered });
            listMarkdown += `${indent}${prefix}${itemContent.trim()}\n`;
            itemIndex++;
          }
        }
        return listMarkdown + '\n';
      }

      case 'table:table': {
        return parseTable(node, styles, imageMap);
      }

      case 'draw:frame': {
        const imageNode = node.getElementsByTagName('draw:image')[0];
        if (imageNode) {
          const href = imageNode.getAttribute('xlink:href');
          if (href) {
            const imageFileName = href.split('/').pop();
            const normalizedHref = href.startsWith('/') ? href.slice(1) : href;
            imageMap[normalizedHref] = imageFileName;
            return `![${imageFileName}](Pictures/${imageFileName})`;
          }
        }
        return '';
      }

      case 'draw:image': {
        const href = node.getAttribute('xlink:href');
        if (href) {
          const imageFileName = href.split('/').pop();
          const normalizedHref = href.startsWith('/') ? href.slice(1) : href;
          imageMap[normalizedHref] = imageFileName;
          return `![${imageFileName}](Pictures/${imageFileName})`;
        }
        return '';
      }

      case 'text:table-of-content': {
        const templateLevelByStyle = {};
        const templateNodes = node.getElementsByTagName('text:table-of-content-entry-template');
        for (let t = 0; t < templateNodes.length; t++) {
          const tmpl = templateNodes[t];
          const lvl = parseInt(tmpl.getAttribute('text:outline-level') || '1', 10);
          const style = tmpl.getAttribute('text:style-name');
          if (style) templateLevelByStyle[style] = lvl;
        }

        const indexBody = node.getElementsByTagName('text:index-body')[0];
        if (!indexBody) return '';

        let tocMarkdown = '\n\n';
        const children = indexBody.childNodes;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const childTag = child.tagName || child.nodeName;

          if (childTag === 'text:index-title') {
            const titleP = child.getElementsByTagName('text:p')[0];
            const titleText = titleP ? convertChildren(titleP, styles, imageMap).trim() : '目錄';
            tocMarkdown += `## ${titleText}\n\n`;
          } else if (childTag === 'text:p') {
            const pStyleName = child.getAttribute('text:style-name');
            const level = resolveTocLevel(pStyleName, styles, templateLevelByStyle);
            const indent = '  '.repeat(Math.max(0, level - 1));

            const links = child.getElementsByTagName('text:a');
            let itemText = '';
            let targetRef = '';

            if (links.length > 0) {
              const a = links[0];
              targetRef = a.getAttribute('xlink:href') || '';
              itemText = convertChildren(a, styles, imageMap).trim();
            } else {
              itemText = convertChildren(child, styles, imageMap).trim();
            }

            // 清理頁碼與定位點點
            itemText = itemText.replace(/\t+/g, ' ').replace(/\s+\d+\s*$/, '').trim();

            if (itemText) {
              const mdAnchor = targetRef ? `(#${targetRef.replace(/^#/, '')})` : '';
              tocMarkdown += `${indent}- [${itemText}]${mdAnchor || `(#${encodeURIComponent(itemText)})`}\n`;
            }
          }
        }
        return tocMarkdown + '\n';
      }

      default:
        return convertChildren(node, styles, imageMap, listState);
    }
  }

  return '';
}

function convertChildren(parent, styles, imageMap, listState) {
  if (!parent || !parent.childNodes) return '';
  let result = '';
  const childNodes = parent.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    result += convertElement(childNodes[i], styles, imageMap, listState);
  }
  return result;
}

function parseTable(tableNode, styles, imageMap) {
  const rows = [];
  const rowNodes = tableNode.getElementsByTagName('table:table-row');

  for (let r = 0; r < rowNodes.length; r++) {
    const rowNode = rowNodes[r];
    const currentRow = [];
    const cellNodes = rowNode.childNodes;

    for (let c = 0; c < cellNodes.length; c++) {
      const cell = cellNodes[c];
      const cellTag = cell.tagName || cell.nodeName;

      if (cellTag === 'table:table-cell') {
        const repeat = parseInt(cell.getAttribute('table:number-columns-repeated') || '1', 10);
        let cellText = convertChildren(cell, styles, imageMap).trim().replace(/\n+/g, ' ');
        cellText = cellText.replace(/\|/g, '\\|');

        for (let rep = 0; rep < Math.min(repeat, 20); rep++) {
          currentRow.push(cellText);
        }
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map(r => r.length));
  const normalizedRows = rows.map(r => {
    while (r.length < colCount) r.push('');
    return r;
  });

  let tableMarkdown = '\n\n';
  tableMarkdown += `| ${normalizedRows[0].join(' | ')} |\n`;
  tableMarkdown += `| ${Array(colCount).fill('---').join(' | ')} |\n`;

  for (let i = 1; i < normalizedRows.length; i++) {
    tableMarkdown += `| ${normalizedRows[i].join(' | ')} |\n`;
  }

  return tableMarkdown + '\n\n';
}

/**
 * 核心：純前端解析 ODT 檔案
 * @param {File|Blob} file 
 * @returns {Promise<{markdown: string, images: Array<{fileName: string, blob: Blob, dataUrl?: string}>}>}
 */
export async function convertOdt(file) {
  const zip = await loadZip(file);
  const contentXml = await readZipText(zip, 'content.xml');

  const parser = new DOMParser();
  const doc = parser.parseFromString(contentXml, 'text/xml');

  const styles = parseStyles(doc);
  const imageMap = {};

  const bodyNode = doc.getElementsByTagName('office:body')[0];
  let markdown = convertChildren(bodyNode, styles, imageMap);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  // 提取圖片
  const imageKeys = Object.keys(imageMap);
  const images = [];

  for (const imagePath of imageKeys) {
    try {
      const blob = await readZipBlob(zip, imagePath);
      const fileName = imageMap[imagePath] || imagePath.split('/').pop();
      images.push({
        fileName: fileName,
        blob: blob,
        objectUrl: URL.createObjectURL(blob)
      });
    } catch (e) {
      console.warn(`ODT 圖片提取跳過：${imagePath}`, e);
    }
  }

  return {
    markdown,
    images
  };
}
