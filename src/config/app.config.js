/**
 * app.config.js - 應用程式全域配置與常數設定
 * 符合 nodebestpractices: 1.4 Separate configuration from code
 */

export const APP_CONFIG = {
  // 支援的檔案副檔名清單
  SUPPORTED_EXTENSIONS: ['.odt', '.html', '.htm', '.zip'],

  // 單檔最大限制 (50MB)
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,

  // 格式類別定義
  FORMAT_TYPES: {
    ODT: 'odt',
    HTML: 'html',
    ZIP: 'zip'
  },

  // 輸出預設設定
  OUTPUT: {
    DEFAULT_FORMAT: 'md',
    PICTURES_DIR_NAME: 'Pictures',
    COMPRESSION_LEVEL: 6
  }
};
