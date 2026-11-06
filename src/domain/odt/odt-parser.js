/**
 * odt-parser.js - 純邏輯 ODT XML DOM 樹走訪與 Markdown 生成器
 * 依賴純介面 parser，不直接耦合特定運行環境
 */
import { escapeMarkdown } from '../../utils/dom.util.js';
import { normalizeMarkdown } from '../../utils/format.util.js';
import { parseOdtStyles, resolveTocLevel, applyParagraphColor, isMeaningfulColor } from './odt-styles.js';

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

function isInsideTableCell(node) {
  let parent = node.parentNode;
  while (parent) {
    const tag = parent.tagName || parent.nodeName;
    if (tag === 'table:table-cell') return true;
    parent = parent.parentNode;
  }
  return false;
}

function convertElement(node, styles, imageMap, listState = { level: 0, ordered: false, styleName: null }) {
  if (!node) return '';

  if (node.nodeType === 3) {
    const parentTag = node.parentNode ? (node.parentNode.tagName || node.parentNode.nodeName) : '';
    const isContainer = /^(office:body|office:text|text:section|table:table|table:table-row|text:list|text:list-item)$/.test(parentTag);
    if (isContainer && /^\s*$/.test(node.nodeValue)) {
      return '';
    }
    return escapeMarkdown(node.nodeValue);
  }

  if (node.nodeType === 1) {
    const tagName = node.tagName || node.nodeName;

    switch (tagName) {
      // 忽略 ODT 註解、修訂追蹤與表單宣告等非正文節點
      case 'office:annotation':
      case 'office:annotation-end':
      case 'text:tracked-changes':
      case 'text:change':
      case 'text:change-start':
      case 'text:change-end':
      case 'office:forms':
      case 'text:sequence-decls':
      case 'text:user-field-decls':
      case 'text:variable-decls': {
        return '';
      }

      case 'text:s': {
        const count = Math.min(Math.max(parseInt(node.getAttribute('text:c') || '1', 10), 1), 20);
        return ' '.repeat(count);
      }

      case 'text:tab': {
        return '\t';
      }

      case 'text:line-break': {
        return '  \n';
      }

      case 'text:h': {
        const level = parseInt(node.getAttribute('text:outline-level') || '1', 10);
        const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6));
        const content = convertChildren(node, styles, imageMap).replace(/\t+/g, ' ').trim();
        if (!content) return '';
        return `\n\n${hashes} ${content}\n\n`;
      }

      case 'text:p': {
        let content = convertChildren(node, styles, imageMap);
        if (!content.trim()) return '';

        // 將 Tab 轉為空白，移除 XML 原始檔縮排產生的多餘換行，但保留 line-break 產生的軟換行
        content = content.replace(/\t+/g, ' ');
        content = content.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
        content = content.replace(/(?<!  )\n/g, ' ');

        if (isInsideHeader(node)) {
          return content;
        }

        const isInsideListItem = (function hasListItemParent(n) {
          let p = n.parentNode;
          while (p) {
            const pTag = p.tagName || p.nodeName;
            if (pTag === 'text:list-item' || pTag === 'text:list-header') return true;
            if (pTag === 'table:table-cell') return false;
            p = p.parentNode;
          }
          return false;
        })(node);

        if (isInsideListItem) {
          return applyParagraphColor(node, styles, content) + '\n';
        }

        const coloredContent = applyParagraphColor(node, styles, content);
        return `\n\n${coloredContent}\n\n`;
      }

      case 'text:span': {
        const styleName = node.getAttribute('text:style-name');
        const style = styles[styleName];
        let content = convertChildren(node, styles, imageMap);

        if (!content.trim()) return content;
        if (!style) return content;

        // 將前後空白移至 Markdown 語法標記外側，避免產生 "**文字 **" 無效語法
        const leadMatch = content.match(/^\s*/);
        const trailMatch = content.match(/\s*$/);
        const lead = leadMatch ? leadMatch[0] : '';
        const trail = trailMatch ? trailMatch[0] : '';
        let core = content.trim();

        // 若文字本身僅為星號 (如必填 *)，不套用粗體/斜體避免產生 ***** 破版
        const isAsteriskOnly = /^\*+$/.test(core);
        if (style.bold && !isAsteriskOnly) core = `**${core}**`;
        if (style.italic && !isAsteriskOnly) core = `*${core}*`;
        if (style.strike) core = `~~${core}~~`;
        if (style.underline) core = `<u>${core}</u>`;
        if (isMeaningfulColor(style.color)) {
          core = `<span style="color:${style.color}">${core}</span>`;
        }
        return `${lead}${core}${trail}`;
      }

      case 'text:a': {
        const href = node.getAttribute('xlink:href') || '#';
        const linkText = convertChildren(node, styles, imageMap).replace(/\t+/g, ' ').trim();
        if (!linkText) return '';
        return `[${linkText}](${href})`;
      }

      case 'text:list': {
        const ownStyleName = node.getAttribute('text:style-name');
        const effectiveStyleName = ownStyleName || listState.styleName || null;
        const currentLevel = listState.level;
        const odtLevel = currentLevel + 1;

        let isOrdered = false;
        const listStyleDef = effectiveStyleName && styles.__listStyles ? styles.__listStyles[effectiveStyleName] : null;
        if (listStyleDef && listStyleDef[odtLevel]) {
          isOrdered = listStyleDef[odtLevel] === 'ordered';
        } else if (effectiveStyleName) {
          isOrdered = effectiveStyleName.includes('Number') || effectiveStyleName.includes('Ordered');
        }

        let listLines = [];
        const childNodes = node.childNodes;
        let itemIndex = 1;

        for (let i = 0; i < childNodes.length; i++) {
          const child = childNodes[i];
          if (child.nodeType !== 1) continue;
          const childTag = child.tagName || child.nodeName;

          if (childTag === 'text:list-item' || childTag === 'text:list-header') {
            const itemParagraphs = [];
            const nestedLists = [];

            const itemChildren = child.childNodes;
            for (let j = 0; j < itemChildren.length; j++) {
              const ic = itemChildren[j];
              if (ic.nodeType !== 1) continue;
              const icTag = ic.tagName || ic.nodeName;

              if (icTag === 'text:list') {
                const subListMd = convertElement(ic, styles, imageMap, {
                  level: currentLevel + 1,
                  ordered: isOrdered,
                  styleName: effectiveStyleName
                });
                if (subListMd.trim()) {
                  nestedLists.push(subListMd.replace(/^\n+|\n+$/g, ''));
                }
              } else {
                const part = convertElement(ic, styles, imageMap, {
                  level: currentLevel + 1,
                  ordered: isOrdered,
                  styleName: effectiveStyleName
                }).trim();
                if (part) {
                  itemParagraphs.push(part);
                }
              }
            }

            // 若此 list-item 本身無文字段落，僅作為更深層 <text:list> 的包裝容器，直接展開子清單避免產生 "- - "
            if (itemParagraphs.length === 0) {
              if (nestedLists.length > 0) {
                listLines.push(...nestedLists);
              }
            } else {
              const indent = '  '.repeat(currentLevel);
              const prefix = childTag === 'text:list-header'
                ? `${indent}`
                : `${indent}${isOrdered ? `${itemIndex}. ` : '- '}`;

              listLines.push(`${prefix}${itemParagraphs[0]}`);
              for (let pIdx = 1; pIdx < itemParagraphs.length; pIdx++) {
                listLines.push(`${indent}  ${itemParagraphs[pIdx]}`);
              }
              if (nestedLists.length > 0) {
                listLines.push(...nestedLists);
              }
              if (childTag === 'text:list-item') {
                itemIndex++;
              }
            }
          }
        }

        if (listLines.length === 0) return '';
        if (currentLevel === 0) {
          return `\n\n${listLines.join('\n')}\n\n`;
        }
        return listLines.join('\n');
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
            const titleText = titleP ? convertChildren(titleP, styles, imageMap).replace(/\t+/g, ' ').trim() : '目錄';
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
              itemText = convertChildren(a, styles, imageMap);
            } else {
              itemText = convertChildren(child, styles, imageMap);
            }

            // 移除 Tab 與尾端頁碼 (例如 "一、迭代紀錄\t2" -> "一、迭代紀錄")
            itemText = itemText
              .replace(/\t+\s*\d+\s*$/, '')
              .replace(/\t+/g, ' ')
              .replace(/\s+\d+\s*$/, '')
              .trim();

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

/**
 * 僅收集屬於當前 tableNode 自身的 table:table-row（排除巢狀子表格內的列）
 * @param {Element} container 
 * @param {Array<Element>} outRows 
 */
function collectOwnTableRows(container, outRows = []) {
  if (!container || !container.childNodes) return outRows;
  const children = container.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const tag = child.tagName || child.nodeName;
    if (tag === 'table:table-row') {
      outRows.push(child);
    } else if (tag === 'table:table-header-rows' || tag === 'table:table-rows' || tag === 'table:table-row-group') {
      collectOwnTableRows(child, outRows);
    }
  }
  return outRows;
}

function parseTable(tableNode, styles, imageMap) {
  const rows = [];
  const rowNodes = collectOwnTableRows(tableNode);
  const isNested = isInsideTableCell(tableNode);

  for (let r = 0; r < rowNodes.length; r++) {
    const rowNode = rowNodes[r];
    const currentRow = [];
    const cellNodes = rowNode.childNodes;

    for (let c = 0; c < cellNodes.length; c++) {
      const cell = cellNodes[c];
      if (cell.nodeType !== 1) continue;
      const cellTag = cell.tagName || cell.nodeName;

      if (cellTag === 'table:table-cell' || cellTag === 'table:covered-table-cell') {
        const repeat = parseInt(cell.getAttribute('table:number-columns-repeated') || '1', 10);

        if (cellTag === 'table:covered-table-cell') {
          for (let rep = 0; rep < Math.min(repeat, 20); rep++) {
            currentRow.push('');
          }
          continue;
        }

        // 將儲存格內的多個段落與清單項目以 <br> 串接，保留儲存格內換行結構
        const rawCell = convertChildren(cell, styles, imageMap);
        const cellLines = rawCell
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);

        let cellText = cellLines.join('<br>');
        cellText = cellText.replace(/(?:<br>\s*)+$/i, '').replace(/^(?:\s*<br>)+/i, '');
        cellText = cellText.replace(/(?<!\\)\|/g, '\\|');

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

  // 對齊所有列至最大欄數
  let colCount = Math.max(...rows.map(r => r.length));
  const normalizedRows = rows.map(r => {
    const copy = [...r];
    while (copy.length < colCount) copy.push('');
    return copy;
  });

  // 修剪尾端完全空白的幽靈欄位（至少保留 1 欄）
  while (colCount > 1 && normalizedRows.every(r => r[colCount - 1] === '')) {
    normalizedRows.forEach(r => r.pop());
    colCount--;
  }

  // 若為儲存格內的巢狀子表格，轉為結構化行內說明（避免破壞外層 GFM 表格語法）
  if (isNested) {
    const nestedLines = normalizedRows
      .filter(r => r.some(cell => cell !== ''))
      .map((r, idx) => {
        const nonEmpty = r.filter(cell => cell !== '');
        if (idx === 0) {
          return `**[${nonEmpty.join(' / ')}]**`;
        }
        return `• ${nonEmpty.join('：')}`;
      });
    return `\n${nestedLines.join('\n')}\n`;
  }

  // 過濾完全空白的資料列（保留標題列；若全部資料列皆空則保留一列空資料列以維持表格結構）
  const headerRow = normalizedRows[0];
  let dataRows = normalizedRows.slice(1).filter(r => r.some(cell => cell !== ''));
  if (dataRows.length === 0 && normalizedRows.length > 1) {
    dataRows = [Array(colCount).fill('')];
  }

  let tableMarkdown = '\n\n';
  tableMarkdown += `| ${headerRow.join(' | ')} |\n`;
  tableMarkdown += `| ${Array(colCount).fill('---').join(' | ')} |\n`;

  for (let i = 0; i < dataRows.length; i++) {
    tableMarkdown += `| ${dataRows[i].join(' | ')} |\n`;
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
  markdown = normalizeMarkdown(markdown);

  return { markdown, imageMap };
}
