/**
 * odt-styles.js - ODT 樣式解析與層級推導純邏輯
 */

/**
 * 解析 ODT DOM 中的自動樣式
 * @param {Document} doc 
 * @returns {Record<string, {bold: boolean, italic: boolean, underline: boolean, strike: boolean, color: string|null, parent: string|null}>}
 */
export function parseOdtStyles(doc) {
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
  if (style && style.color && style.color.toUpperCase() !== '#000000') {
    return `<span style="color:${style.color}">${content}</span>`;
  }
  return content;
}
