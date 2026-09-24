/**
 * zip-handler.js - 處理 ZIP/ODT 本地解包與記憶體打包下載
 * 依賴全域 JSZip (由 CDN 載入)
 */

/**
 * 載入並讀取 ZIP 或 ODT 檔案
 * @param {File|Blob} file 
 * @returns {Promise<JSZip>}
 */
export async function loadZip(file) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip 程式庫未載入，請確認網路連線或 CDN 設定。');
  }
  return await JSZip.loadAsync(file);
}

/**
 * 從 ZIP 實例中以文字方式讀取檔案
 * @param {JSZip} zip 
 * @param {string} relativePath 
 * @returns {Promise<string>}
 */
export async function readZipText(zip, relativePath) {
  const entry = zip.file(relativePath);
  if (!entry) {
    throw new Error(`ZIP 檔案中找不到路徑：${relativePath}`);
  }
  return await entry.async('string');
}

/**
 * 從 ZIP 實例中以 Blob 方式讀取二進位檔案 (例如圖片)
 * @param {JSZip} zip 
 * @param {string} relativePath 
 * @param {string} mimeType 
 * @returns {Promise<Blob>}
 */
export async function readZipBlob(zip, relativePath, mimeType = 'image/png') {
  const entry = zip.file(relativePath);
  if (!entry) {
    throw new Error(`ZIP 檔案中找不到路徑：${relativePath}`);
  }
  return await entry.async('blob');
}

/**
 * 在記憶體中建立包含 Markdown 與 Pictures/ 的 ZIP 並觸發瀏覽器下載
 * @param {string} baseName 基礎檔名 (不含副檔名)
 * @param {string} markdown Markdown 文字內容
 * @param {Array<{fileName: string, blob: Blob}>} images 圖片清單
 */
export async function downloadResultZip(baseName, markdown, images = []) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip 程式庫未載入');
  }

  const zip = new JSZip();
  // 放入 Markdown 檔案
  zip.file(`${baseName}.md`, markdown);

  // 如果有圖片，放入 Pictures/ 資料夾
  if (images && images.length > 0) {
    const picturesFolder = zip.folder('Pictures');
    for (const img of images) {
      if (img.blob) {
        picturesFolder.file(img.fileName, img.blob);
      }
    }
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  saveBlob(zipBlob, `${baseName}.zip`);
}

/**
 * 觸發瀏覽器下載 Blob 物件
 * @param {Blob} blob 
 * @param {string} filename 
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
