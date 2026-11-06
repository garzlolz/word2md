/**
 * odt-styles.js - ODT 樣式解析與層級推導純邏輯
 */

// 忽略預設黑字、純白字（避免白底隱形）與近似黑字
const IGNORED_TEXT_COLORS = new Set(['#000000', '#FFFFFF', '#1D1C1D', 'AUTO', 'TRANSPARENT']);

/**
 * 判斷文字顏色是否需要保留標籤渲染
 * @param {string|null} color 
 * @returns {boolean}
 */
export function isMeaningfulColor(color) {
  if (!color) return false;
  return !IGNORED_TEXT_COLORS.has(color.trim().toUpperCase());
}

/**
 * 解析 ODT DOM 中的自動樣式與清單樣式
 * @param {Document} doc 
 * @returns {Record<string, any>}
 */
export function parseOdtStyles(doc) {
  const styles = {
    __listStyles: {}
  };
  const styleNodes = doc.getElementsByTagName('style:style');

  for (let i = 0; i < styleNodes.length; i++) {
    const node = styleNodes[i];
    const name = node.getAttribute('style:name');
    const family = node.getAttribute('style:family');

    if (family === 'text' || family === 'paragraph') {
      const textProps = node.getElementsByTagName('style:text-properties')[0];
      const underlineAttr = textProps ? textProps.getAttribute('style:text-underline-style') : null;
      const strikeAttr = textProps ? textProps.getAttribute('style:text-line-through-style') : null;
      const rawColor = textProps ? textProps.getAttribute('fo:color') : null;

      styles[name] = {
        bold: textProps ? textProps.getAttribute('fo:font-weight') === 'bold' : false,
        italic: textProps ? textProps.getAttribute('fo:font-style') === 'italic' : false,
        underline: Boolean(underlineAttr && underlineAttr !== 'none'),
        strike: Boolean(strikeAttr && strikeAttr !== 'none'),
        color: isMeaningfulColor(rawColor) ? rawColor : null,
        parent: node.getAttribute('style:parent-style-name') || null,
        listStyleName: node.getAttribute('style:list-style-name') || null,
      };
    }
  }

  // 解析 <text:list-style> 判斷各層級為有序編號或項目符號
  const listStyleNodes = doc.getElementsByTagName('text:list-style');
  for (let i = 0; i < listStyleNodes.length; i++) {
    const listNode = listStyleNodes[i];
    const listName = listNode.getAttribute('style:name');
    if (!listName) continue;

    const levelMap = {};
    const children = listNode.childNodes;
    for (let c = 0; c < children.length; c++) {
      const child = children[c];
      if (child.nodeType !== 1) continue;
      const tag = child.tagName || child.nodeName;
      const lvl = parseInt(child.getAttribute('text:level') || '1', 10);
      if (tag === 'text:list-level-style-number') {
        const numFormat = child.getAttribute('style:num-format');
        levelMap[lvl] = (numFormat && numFormat !== '') ? 'ordered' : 'bullet';
      } else if (tag === 'text:list-level-style-bullet') {
        levelMap[lvl] = 'bullet';
      }
    }
    styles.__listStyles[listName] = levelMap;
  }

  return styles;
}

/**
 * 依樣式繼承鏈遞迴查找對應的大綱層級
 * @param {string} styleName 
 * @param {Object} styles 
 * @param {Object} templateLevelByStyle 
 * @returns {number}
 */
export function resolveTocLevel(styleName, styles, templateLevelByStyle) {
  let name = styleName;
  let depth = 0;
  while (name && depth < 10) {
    if (templateLevelByStyle[name]) return templateLevelByStyle[name];
    name = styles[name] ? styles[name].parent : null;
    depth++;
  }
  return 1;
}

/**
 * 段落色彩樣式套用
 * @param {Element} node 
 * @param {Object} styles 
 * @param {string} content 
 * @returns {string}
 */
export function applyParagraphColor(node, styles, content) {
  if (!content || !content.trim()) return content;
  const style = styles[node.getAttribute('text:style-name')];
  if (style && isMeaningfulColor(style.color)) {
    return `<span style="color:${style.color}">${content}</span>`;
  }
  return content;
}
