/**
 * zip.service.js - ZIP / ODT 檔案解壓縮與記憶體打包下載服務
 * 依賴全域 JSZip (CDN)
 */
import { APP_CONFIG } from '../config/app.config.js';

export class ZipService {
  /**
   * 載入 ZIP 或 ODT 檔案
   * @param {File|Blob} file 
   * @returns {Promise<JSZip>}
   */
  static async load(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 程式庫未載入，請確認網路連線或 CDN 設定。');
    }
    return await JSZip.loadAsync(file);
  }

  /**
   * 從 ZIP 中讀取文字
   * @param {JSZip} zip 
   * @param {string} relativePath 
   * @returns {Promise<string>}
   */
  static async readText(zip, relativePath) {
    const entry = zip.file(relativePath);
    if (!entry) {
      throw new Error(`ZIP 檔案中找不到路徑：${relativePath}`);
    }
    return await entry.async('string');
  }

  /**
   * 從 ZIP 中讀取二進位圖片 Blob
   * @param {JSZip} zip 
   * @param {string} relativePath 
   * @returns {Promise<Blob>}
   */
  static async readBlob(zip, relativePath) {
    const entry = zip.file(relativePath);
    if (!entry) {
      throw new Error(`ZIP 檔案中找不到路徑：${relativePath}`);
    }
    return await entry.async('blob');
  }

  /**
   * 在記憶體中建立包含 Markdown 與 Pictures/ 的 ZIP 並觸發下載
   * @param {string} baseName 
   * @param {string} markdown 
   * @param {Array<{fileName: string, blob: Blob}>} images 
   */
  static async downloadZipPackage(baseName, markdown, images = []) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 程式庫未載入');
    }

    const zip = new JSZip();
    zip.file(`${baseName}.md`, markdown);

    if (images && images.length > 0) {
      const picturesFolder = zip.folder(APP_CONFIG.OUTPUT.PICTURES_DIR_NAME);
      for (const img of images) {
        if (img.blob) {
          picturesFolder.file(img.fileName, img.blob);
        }
      }
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: APP_CONFIG.OUTPUT.COMPRESSION_LEVEL }
    });

    this.saveBlob(zipBlob, `${baseName}.zip`);
  }

  /**
   * 觸發瀏覽器下載 Blob 物件
   * @param {Blob} blob 
   * @param {string} filename 
   */
  static saveBlob(blob, filename) {
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
}
