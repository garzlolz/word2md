/**
 * notion-rules.js - Notion HTML 匯出專屬清洗與語意化規則
 */

/**
 * 清除網頁匯出中常見的導覽、返回頁面等非內文雜訊
 * @param {string} markdownText 
 * @returns {string}
 */
export function cleanNavigationNoise(markdownText) {
  if (!markdownText) return '';
  const lines = markdownText.split('\n');
  const resultLines = [];
  let isCleaning = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes('返回') && (trimmed.includes('頁') || trimmed.includes('步') || trimmed.includes('回到'))) {
      isCleaning = true;
      continue;
    }

    if (isCleaning) {
      if (trimmed === '' || trimmed === '---' || trimmed.startsWith('[') || trimmed.startsWith('返回') || trimmed.startsWith('導覽')) {
        continue;
      } else {
        isCleaning = false;
      }
    }

    resultLines.push(line);
  }

  return resultLines.join('\n');
}

/**
 * 預處理 Notion DOM：待辦清單 (To-do)、項目清單 (Bulleted)、表格
 * @param {Document} doc 
 */
export function preprocessNotionDom(doc) {
  // 1. 移除無用腳本與樣式
  doc.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());

  // 2. Notion 待辦清單 Checkbox 轉 GFM
  doc.querySelectorAll('div.notion-to_do-block').forEach(block => {
    const isChecked = block.querySelector('input[type="checkbox"]:checked') !== null ||
                      block.querySelector('.checked') !== null;
    const textNode = block.querySelector('.notion-table-cell-text, [contenteditable]') || block;
    const text = textNode.textContent.trim();
    if (text) {
      const p = doc.createElement('p');
      p.textContent = `${isChecked ? '- [x]' : '- [ ]'} ${text}`;
      block.replaceWith(p);
    }
  });

  // 3. Notion 項目符號清單轉標準無序清單
  doc.querySelectorAll('div.notion-bulleted_list-block').forEach(block => {
    const textNode = block.querySelector('.notion-table-cell-text, [contenteditable]') || block;
    let text = textNode.textContent.trim();
    text = text.replace(/^[\u2022\u25E6\u25AA\u25AB\s]+/, '').trim();
    if (text) {
      const p = doc.createElement('p');
      p.textContent = `- ${text}`;
      block.replaceWith(p);
    }
  });

  // 4. 表格標題列正規化與單元格內容緊湊化
  doc.querySelectorAll('table').forEach(table => {
    // 解套單元格內部的段落標籤，避免 Turndown 產生內部換行破壞 GFM 表格結構
    table.querySelectorAll('th, td').forEach(cell => {
      const paragraphs = Array.from(cell.querySelectorAll('p'));
      if (paragraphs.length > 0) {
        paragraphs.forEach((p, idx) => {
          if (idx > 0) {
            cell.insertBefore(doc.createElement('br'), p);
          }
          while (p.firstChild) {
            cell.insertBefore(p.firstChild, p);
          }
          p.remove();
        });
      }
    });

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length > 0 && !table.querySelector('thead')) {
      const firstRow = rows[0];
      const thead = doc.createElement('thead');
      const tr = doc.createElement('tr');
      firstRow.querySelectorAll('td, th').forEach(cell => {
        const th = doc.createElement('th');
        th.innerHTML = cell.innerHTML.trim() || '&nbsp;';
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.insertBefore(thead, table.firstChild);
      firstRow.remove();
    }
  });
}
