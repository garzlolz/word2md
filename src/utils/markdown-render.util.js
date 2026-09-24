/**
 * markdown-render.util.js - 前端 Markdown 預覽渲染引擎
 * 支援 GFM 表格水平滾動容器、Task List、樣式渲染與圖片對照
 */
import { escapeHtml } from './dom.util.js';

export function renderMarkdownPreview(markdown, images = []) {
  if (!markdown) return '';

  // 建立圖片快速查找表
  const imageMap = new Map();
  images.forEach(img => {
    if (img.fileName && (img.objectUrl || img.dataUrl)) {
      const url = img.objectUrl || img.dataUrl;
      imageMap.set(img.fileName, url);
      imageMap.set(`Pictures/${img.fileName}`, url);
    }
  });

  const lines = markdown.split('\n');
  const htmlOut = [];
  let inCodeBlock = false;
  let codeBlockBuffer = [];
  let inTable = false;
  let tableRows = [];

  function parseInline(text) {
    return escapeHtml(text)
      // 復原安全的 HTML 標籤
      .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>')
      .replace(/&lt;span style="(.*?)"&gt;(.*?)&lt;\/span&gt;/g, '<span style="$1">$2</span>')
      // 缺漏圖片標記高亮
      .replace(/\[🖼️ 缺漏圖片: (.*?)\]\((.*?)\)/g, '<span class="missing-image-badge" title="$2">🖼️ 缺漏圖片: $1</span>')
      // Markdown 圖片解析
      .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
        const decodedSrc = decodeURIComponent(src);
        const fileName = decodedSrc.split('/').pop();
        const objectUrl = imageMap.get(src) || imageMap.get(decodedSrc) || imageMap.get(fileName);
        if (objectUrl) {
          return `<div class="preview-image-wrapper"><img src="${objectUrl}" alt="${alt}" loading="lazy"><span class="preview-image-caption">${alt || fileName}</span></div>`;
        }
        return `<span class="missing-image-badge" title="${src}">🖼️ 圖片: ${alt || src}</span>`;
      })
      // 粗體 / 斜體 / 刪除線 / 程式碼 / 連結
      .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
      .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function flushTable() {
    if (tableRows.length === 0) return '';
    let tHtml = '<div class="table-container"><table>';
    tHtml += '<thead><tr>' + tableRows[0].map(c => `<th>${parseInline(c)}</th>`).join('') + '</tr></thead>';
    if (tableRows.length > 1) {
      tHtml += '<tbody>';
      for (let i = 1; i < tableRows.length; i++) {
        tHtml += '<tr>' + tableRows[i].map(c => `<td>${parseInline(c)}</td>`).join('') + '</tr>';
      }
      tHtml += '</tbody>';
    }
    tHtml += '</table></div>';
    tableRows = [];
    inTable = false;
    return tHtml;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 程式碼區塊
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        htmlOut.push(`<pre><code>${codeBlockBuffer.join('\n')}</code></pre>`);
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        if (inTable) htmlOut.push(flushTable());
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(escapeHtml(line));
      continue;
    }

    // 表格列
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        continue;
      }
      inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      htmlOut.push(flushTable());
    }

    if (!trimmed) continue;

    // 標題
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      htmlOut.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // GFM 待辦清單 Checkbox
    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const isChecked = taskMatch[2].toLowerCase() === 'x';
      const taskText = parseInline(taskMatch[3]);
      htmlOut.push(`<div class="task-list-item"><input type="checkbox" ${isChecked ? 'checked' : ''} disabled><span class="${isChecked ? 'task-done' : ''}">${taskText}</span></div>`);
      continue;
    }

    // 普通清單
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      htmlOut.push(`<div class="list-item"><span class="list-bullet">•</span><span>${parseInline(listMatch[3])}</span></div>`);
      continue;
    }

    // 水平分隔線
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      htmlOut.push('<hr>');
      continue;
    }

    htmlOut.push(`<p>${parseInline(line)}</p>`);
  }

  if (inTable) {
    htmlOut.push(flushTable());
  }

  return htmlOut.join('\n');
}
