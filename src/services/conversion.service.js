/**
 * conversion.service.js - 文件轉換調度服務
 * 整合 ODT、HTML、ZIP、DOCX 領域解析器並處理圖片二進位流
 */
import { APP_CONFIG } from '../config/app.config.js';
import { sanitizeFileName } from '../utils/dom.util.js';
import { ZipService } from './zip.service.js';
import { parseOdtXml } from '../domain/odt/odt-parser.js';
import { parseHtmlContent } from '../domain/html/html-parser.js';
import { parseDocx } from '../domain/docx/docx-parser.js';

export class ConversionService {
  /**
   * 驗證檔案是否符合規範
   * @param {File} file 
   */
  static validateFile(file) {
    if (!file) {
      throw new Error('未提供任何檔案');
    }

    const lowerName = file.name.toLowerCase();
    const isSupported = APP_CONFIG.SUPPORTED_EXTENSIONS.some(ext => lowerName.endsWith(ext));

    if (!isSupported) {
      throw new Error(`不支援的檔案格式！僅支援：${APP_CONFIG.SUPPORTED_EXTENSIONS.join(', ')}`);
    }

    if (file.size > APP_CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error(`檔案大小超出限制 (最大支援 50MB)`);
    }
  }

  /**
   * 執行文件轉換
   * @param {File} file 
   * @returns {Promise<{fileName: string, baseName: string, markdown: string, images: Array<{fileName: string, blob: Blob, objectUrl: string}>}>}
   */
  static async convert(file) {
    this.validateFile(file);

    const fileName = file.name;
    const rawBaseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    const baseName = sanitizeFileName(rawBaseName);
    const lowerName = fileName.toLowerCase();

    let result = null;

    if (lowerName.endsWith('.docx')) {
      result = await this.convertDocx(file);
    } else if (lowerName.endsWith('.odt')) {
      result = await this.convertOdt(file);
    } else if (lowerName.endsWith('.zip')) {
      result = await this.convertZipWebPackage(file);
    } else {
      result = await this.convertHtml(file);
    }

    return {
      fileName,
      baseName,
      markdown: result.markdown,
      images: result.images || []
    };
  }

  /**
   * 轉換 DOCX
   */
  static async convertDocx(file) {
    const arrayBuffer = await file.arrayBuffer();
    return parseDocx(arrayBuffer);
  }

  /**
   * 轉換 ODT
   */
  static async convertOdt(file) {
    const zip = await ZipService.load(file);
    const contentXml = await ZipService.readText(zip, 'content.xml');

    const { markdown, imageMap } = parseOdtXml(contentXml);
    const images = [];

    for (const [imagePath, fileName] of Object.entries(imageMap)) {
      try {
        const blob = await ZipService.readBlob(zip, imagePath);
        images.push({
          fileName,
          blob,
          objectUrl: URL.createObjectURL(blob)
        });
      } catch (e) {
        console.warn(`ODT 圖片讀取跳過：${imagePath}`, e);
      }
    }

    return { markdown, images };
  }

  /**
   * 轉換 HTML 檔案
   */
  static async convertHtml(file) {
    const htmlContent = await file.text();
    return parseHtmlContent(htmlContent);
  }

  /**
   * 轉換 ZIP 網頁包 (包含 HTML 與圖片資料夾)
   */
  static async convertZipWebPackage(file) {
    const zip = await ZipService.load(file);

    let mainHtmlEntry = null;
    const localImagesMap = new Map();

    for (const [relativePath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const lowerPath = relativePath.toLowerCase();

      if (!mainHtmlEntry && (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm'))) {
        mainHtmlEntry = entry;
      } else if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(lowerPath)) {
        const blob = await entry.async('blob');
        localImagesMap.set(relativePath, blob);
      }
    }

    if (!mainHtmlEntry) {
      throw new Error('ZIP 檔案內未找到任何 .html 網頁文件！');
    }

    const htmlContent = await mainHtmlEntry.async('string');
    return parseHtmlContent(htmlContent, localImagesMap);
  }
}
