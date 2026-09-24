/**
 * odt-parser.js - 純邏輯 ODT XML DOM 樹走訪與 Markdown 生成器
 * 依賴純介面 parser，不直接耦合特定運行環境
 */
import { escapeMarkdown } from '../../utils/dom.util.js';
import { parseOdtStyles, resolveTocLevel, applyParagraphColor } from './odt-styles.js';

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

      case 'draw:frame':
      case 'draw:image': {
        const img = tagName === 'draw:frame' ? node.getElementsByTagName('draw:image')[0] : node;
        if (img) {
          const href = img.getAttribute('xlink:href');
          if (href) {
            const imageFileName = href.split('/').pop();
            const normalizedHref = href.startsWith('/') ? href.slice(1) : href;
            imageMap[normalizedHref] = imageFileName;
            return `![${imageFileName}](Pictures/${imageFileName})`;
          }
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
 * 純邏輯：傳入 XML 字串與 DOMParser 執行個體進行解析
 * @param {string} contentXml 
 * @param {DOMParser} [parserInstance] 
 * @returns {{markdown: string, imageMap: Record<string, string>}}
 */
export function parseOdtXml(contentXml, parserInstance = null) {
  const parser = parserInstance || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
  if (!parser) {
    throw new Error('未提供 DOMParser 實例且當前環境無全域 DOMParser');
  }

  const doc = parser.parseFromString(contentXml, 'text/xml');
  const styles = parseOdtStyles(doc);
  const imageMap = {};

  const bodyNode = doc.getElementsByTagName('office:body')[0];
  let markdown = convertChildren(bodyNode, styles, imageMap);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  return { markdown, imageMap };
}
