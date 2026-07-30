# word2md - 多格式轉 Markdown 轉換器 📄➡️✍️

這是一個**方便輕量、具備現代化 UI** 的多格式 (ODT / PDF / HTML) 轉 Markdown 轉換工具。
它能精準解析 ODT、PDF 與 HTML 文件，保留既有的排版格式，提取嵌入圖片，並自動歸檔至以「當日日期 + 時間戳」命名的資料夾中。

---

## ✨ 功能特點

- **🎨 Modern Web UI**：
  - 融入深色模式、玻璃擬態 (Glassmorphism)、漸變背景與平滑微動畫。
  - 支援 **拖曳檔案 (Drag & Drop)** 上傳，並有流光發光特效。
  - **即時排版預覽** 與 **Markdown 原始碼** 雙分頁對照，支持複製內容。
  - **一鍵開啟輸出資料夾**：轉換完成後，可直接在網頁上點擊按鈕，系統會自動在檔案總管中開啟該產出目錄。
- **📦 圖片自動提取與路徑對齊**：
  - 自動提取文件中嵌入的圖片（包含嵌入 Base64 圖片）並儲存在產出目錄下的 `Pictures/` 資料夾。
  - Markdown 檔案中的圖片連結統一轉換為對齊的相對路徑 `![alt](Pictures/imageX.png)`，保證排版不丟失。
- **⏱️ 時間戳自動歸檔**：
  - 每次轉換都會建立如 `output/YYYY-MM-DD_HHmmss/` 的獨立資料夾。
- **📂 歷史記錄管理**：
  - 網頁端會顯示先前的轉換歷史，點擊歷史項目即可直接重新預覽或開啟對應的本地資料夾。
- **💻 雙模式支援**：
  - 提供 **Web UI 介面** 與 **CLI 命令行** 兩種使用方式，極其輕量。

---

## 🛠️ 技術棧

- **後端 (Server-side)**：Node.js, Express, Multer, Adm-Zip, @xmldom/xmldom, @opendocsg/pdf2md, Turndown, Turndown-plugin-gfm
- **前端 (Client-side)**：Vanilla HTML, Vanilla CSS (HSL 色彩系統), Vanilla JS, Lucide Icons

---

## 📁 專案目錄結構

```text
word2md/
├── public/                 # 前端靜態資源
│   ├── index.html          # Modern UI 結構
│   ├── style.css           # 玻璃擬態與暗色樣式表
│   └── app.js              # 拖曳上傳與即時預覽控制
├── output/                 # 轉換產出目錄（按日期時間戳歸檔）
├── generate-test-odt.js    # 用於產生測試 ODT 檔案的腳本
├── run-convert.js          # CLI 轉換主要入口
├── server.js               # Web 服務器與 API 入口
├── package.json            # 專案配置與啟動腳本
└── README.md               # 專案說明文件
```

---

## 🚀 快速開始

本專案支援使用 `npm` 或 `pnpm` 進行包管理。

### 1. 安裝依賴項

在專案根目錄下執行：

```bash
pnpm install
# 或者
npm install
```

### 2. 啟動 Web UI 服務

啟動後，伺服器預設會監聽 `3000` 連接埠，並**自動為您開啟瀏覽器**：

```bash
pnpm dev
# 或者
npm run dev
```
開啟瀏覽器後，即可將您的 `.odt` 檔案拖入上傳區域進行轉換與即時預覽。

### 3. 使用 CLI 命令行直接轉換

如果您不想啟動 Web 服務，也可以在終端直接轉換 ODT 檔案：

```bash
# 預設轉換專案目錄下的 "PRD - 圖文選單 v1.1.odt"
pnpm convert
# 或者
npm run convert

# 或是手動指定其他 ODT 檔案路徑
node run-convert.js "您的文件名稱.odt"
```

---

## 📝 轉換效果驗證

本專案支援將以下 ODT 格式完整轉換至 Markdown：
1. **標題等級**：自動將標題轉換為 `#` 到 `######`。
2. **文字樣式**：精準對應粗體 (`**`)、斜體 (`*`)、刪除線 (`~~`) 與底線 (`<u>`)。
3. **清單列表**：無序清單與有序清單的多層級嵌套。
4. **表格 (Table)**：自動將 ODT 表格轉換為標準 Markdown `|---|` 表格格式。
5. **圖片嵌入**：將圖片提取為實體 PNG 檔案，並在 Markdown 中以相對路徑正確關聯。
