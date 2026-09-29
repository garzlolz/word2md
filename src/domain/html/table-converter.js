/**
 * table-converter.js - 強固型 HTML 表格轉 GFM Markdown 轉換器
 * 解決真實 Word DOCX 與網頁表格常出現的破版問題：
 * 1. 合併儲存格 (colspan) 導致欄位長短不齊
 * 2. 單元格內含清單 (ul/ol/li) 或多段落導致換行撕裂表格
 * 3. 單元格內含未轉義管道符號 (|)
 * 4. 表格缺少標題列或各列長度不對齊
 */

function toArray(nodeList) {
  if (!nodeList) return [];
  return Array.prototype.slice.call(nodeList);
}

/**
 * 將 HTML table DOM 節點轉換為嚴格合規的 GFM Markdown 表格
 * @param {Element} tableNode 
 * @param {Object} [turndownInstance] 可選的 Turndown 實例，用於解析單元格內部的行內樣式
 * @returns {string} GFM Markdown 表格字串
 */
export function convertTableNodeToGfm(tableNode, turndownInstance = null) {
  const rows = [];
  const trElements = toArray(tableNode.querySelectorAll('tr'));

  for (let r = 0; r < trElements.length; r++) {
    const tr = trElements[r];
    const currentRow = [];
    const cells = toArray(tr.querySelectorAll('th, td'));

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
      const doc = cell.ownerDocument || (typeof document !== 'undefined' ? document : null);

      if (doc) {
        // 1. 處理清單：將 li 轉為 • 文字<br>
        const lists = toArray(cell.querySelectorAll('ul, ol'));
        lists.forEach(list => {
          const lis = toArray(list.querySelectorAll('li'));
          const frag = doc.createDocumentFragment();
          lis.forEach(li => {
            const text = li.textContent.trim();
            if (text) {
              frag.appendChild(doc.createTextNode(`• ${text}`));
              frag.appendChild(doc.createElement('br'));
            }
          });
          list.replaceWith(frag);
        });

        // 2. 處理段落：段落間加上 <br>
        const paragraphs = toArray(cell.querySelectorAll('p, div'));
        if (paragraphs.length > 0) {
          paragraphs.forEach((p, idx) => {
            if (idx > 0 && p.parentNode) {
              p.parentNode.insertBefore(doc.createElement('br'), p);
            }
            while (p.firstChild && p.parentNode) {
              p.parentNode.insertBefore(p.firstChild, p);
            }
            p.remove();
          });
        }

        // 3. 將 <br> 暫時替換為標記，避免被 turndown 轉為實際換行字元 \n
        const brs = toArray(cell.querySelectorAll('br'));
        brs.forEach(br => {
          br.replaceWith(doc.createTextNode('@@BR@@'));
        });
      }

      // 4. 透過 turndown 轉換單元格內部的行內標籤 (粗體, 斜體, 連結, 圖片等)
      let cellText = turndownInstance 
        ? turndownInstance.turndown(cell.innerHTML) 
        : cell.textContent;

      // 將標記轉回 <br>，保留單元格內換行效果
      cellText = cellText.replace(/(?:\\@|@){2}BR(?:\\@|@){2}/g, '<br>');
      // 移除單元格結尾多餘的 <br>
      cellText = cellText.replace(/(?:<br>\s*)+$/i, '');
      // 移除單元格內部的真實換行，換成空格
      cellText = cellText.replace(/\r?\n+/g, ' ');
      // 轉義單元格內部的未轉義 pipe |
      cellText = cellText.replace(/(?<!\\)\|/g, '\\|');
      // 將連續多餘空白壓平
      cellText = cellText.replace(/\s{2,}/g, ' ').trim();

      currentRow.push(cellText);

      // 若有 colspan，補齊後續的空欄位保證欄數對齊
      for (let s = 1; s < colspan; s++) {
        currentRow.push('');
      }
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return '';

  // 補齊每列長度至相同最大欄位數，保證矩陣嚴格對齊
  const colCount = Math.max(...rows.map(r => r.length));
  const normalizedRows = rows.map(r => {
    while (r.length < colCount) r.push('');
    return r;
  });

  let md = '\n\n';
  // 第一列 Header
  md += `| ${normalizedRows[0].join(' | ')} |\n`;
  // 分隔線
  md += `| ${Array(colCount).fill('---').join(' | ')} |\n`;
  // 資料列
  for (let i = 1; i < normalizedRows.length; i++) {
    md += `| ${normalizedRows[i].join(' | ')} |\n`;
  }
  md += '\n';
  return md;
}
