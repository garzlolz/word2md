# word2md

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Deploy to GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Ready-brightgreen.svg)](https://pages.github.com/)
[![Architecture: Clean Code](https://img.shields.io/badge/Architecture-Node%20Best%20Practices-blueviolet.svg)](https://github.com/goldbergyoni/nodebestpractices)

**word2md** 是一個在瀏覽器端運作的**多格式文件轉 Markdown 工具**。

專案遵循 [goldbergyoni/nodebestpractices](https://github.com/goldbergyoni/nodebestpractices) 分層架構，所有解析（ODT、HTML、ZIP 網頁包）與圖片擷取均直接在瀏覽器本機記憶體完成，檔案不會上傳到任何伺服器。支援直接部署於 **GitHub Pages** 或各類靜態主機。

---

## 主要特色 (Features)

- **純前端運作，檔案不上傳**:
  - 瀏覽器內解析：使用原生 `DOMParser` 與 `JSZip` 處理檔案，不經任何後端伺服器，保障隱私。
  - 免打包流程：使用原生 ES Modules，修改後重新整理即可測試。
  - 支援靜態託管：可直接部署於 GitHub Pages 等靜態網站服務。

- **預覽與編輯輔助**:
  - **排版預覽與原始碼切換**：可切換檢視渲染後的排版或 Markdown 原始碼，並提供快速複製功能。
  - **寬表格自適應水平捲動**：避免多欄位表格撐破版面，提供獨立水平捲動條。
  - **待辦清單 (GFM Task List)**：支援轉換待辦核取方塊與完成線。

- **多格式支援**:
  - **ODT 轉換**：支援標題階層、文字樣式（粗體、斜體、底線、刪除線）、清單、表格與目錄。
  - **HTML 轉換**：整合 Turndown 與 GFM，處理 Notion 匯出格式、過濾雜訊標籤並擷取內嵌圖片。
  - **ZIP 網頁包解壓**：自動讀取 HTML 與圖片資料夾，將 Markdown 圖片路徑轉換為相對目錄。
  - **缺漏圖片標記**：匯出若缺少圖片，會標記為 `[🖼️ 缺漏圖片: 名稱](Pictures/檔名)`，方便後續補齊。

- **下載與儲存**:
  - **下載 .md 檔**：直接儲存 Markdown 純文字檔案。
  - **打包下載 ZIP**：將 Markdown 與擷取的 `Pictures/` 圖片打包為 ZIP 檔案下載。
  - **本機歷史紀錄**：在 `localStorage` 保留最近 50 筆轉換紀錄，點選即可重新載入。

---

## 支援格式一覽 (Supported Formats)

| 格式 | 副檔名 | 支援項目 |
| :--- | :--- | :--- |
| **ODT** | `.odt` | 大綱標題 (`#`-`######`)、文字樣式、GFM 表格、清單、目錄 (TOC)、圖片擷取 |
| **HTML** | `.html`, `.htm` | GFM 表格、清單、Notion 待辦清單 (`- [ ]`)、Base64 圖片擷取、清理非必要標籤 |
| **ZIP 網頁包** | `.zip` | 包含主 HTML 與圖片資料夾的完整網頁封裝包，自動關聯圖片並轉為相對路徑 |

---

## 專案結構 (Repository Structure)

遵循 [goldbergyoni/nodebestpractices](https://github.com/goldbergyoni/nodebestpractices) 規範之清晰分層架構（Clean Code）：

```text
word2md/
├── index.html                      # 網頁入口（透過 CDN 載入 JSZip、Turndown 與 Lucide）
├── assets/                         # 靜態資源目錄
│   └── css/
│       └── style.css               # 介面樣式與表格捲動設定
├── src/                            # 核心原始程式碼 (Source Root)
│   ├── index.js                    # 應用程式啟動入口
│   ├── config/                     # 設定常數層
│   │   ├── app.config.js           # 支援副檔名、檔案大小限制
│   │   └── storage.config.js       # LocalStorage 鍵值與歷史上限
│   ├── components/                 # UI 元件層
│   │   ├── uploader.component.js   # 拖曳與檔案選取元件
│   │   ├── preview.component.js    # 預覽與下載控制元件
│   │   ├── history.component.js    # 歷史紀錄列表元件
│   │   └── toast.component.js      # 通知提示元件
│   ├── services/                   # 服務層
│   │   ├── conversion.service.js   # 轉換流程調度
│   │   ├── storage.service.js      # 歷史紀錄本機儲存
│   │   └── zip.service.js          # ZIP 解壓縮與打包服務
│   ├── domain/                     # 核心轉換邏輯層（純邏輯）
│   │   ├── odt/
│   │   │   ├── odt-parser.js       # ODT XML 節點解析與轉換
│   │   │   └── odt-styles.js       # ODT 樣式與標題層級推導
│   │   └── html/
│   │       ├── html-parser.js      # HTML 轉換與圖片擷取
│   │       └── notion-rules.js     # Notion 專用規則（核取方塊、清單、表格）
│   └── utils/                      # 共用工具函式庫
│       ├── dom.util.js             # DOM 操作與檔名清理
│       ├── format.util.js          # 檔案大小與時間格式化
│       └── markdown-render.util.js # Markdown 轉 HTML 預覽渲染
├── run-convert.js                  # CLI 轉換指令稿（共用 src/domain 邏輯）
├── generate-test-odt.js            # 測試用 ODT 檔案產生器
├── package.json                    # 專案設定檔
└── README.md                       # 說明文件
```

---

## 快速開始與部署 (Quick Start & Deployment)

### 部署到 GitHub Pages

本專案為純靜態網站，無需建置步驟，推送到 GitHub 即可啟用：

1. 將程式碼推送到 GitHub：
   ```bash
   git push origin main
   ```
2. 進入儲存庫的 **Settings > Pages**。
3. 在 **Build and deployment > Source** 選擇 **Deploy from a branch**。
4. 分支選擇 `main`，路徑選擇 `/ (root)`，儲存設定。
5. 稍候片刻即可透過 `https://<使用者名稱>.github.io/<儲存庫名稱>/` 瀏覽。

---

### 本機執行 (Local Development)

本專案使用原生 ES Modules，請使用靜態 HTTP 伺服器開啟（不支援直接以 `file://` 開啟）：

#### 使用 npm / npx
```bash
npm run dev
# 或
npx serve .
```

#### 使用 VS Code Live Server
在 `index.html` 按右鍵選擇 **Open with Live Server**。

#### 使用 Python
```bash
python -m http.server 8000
```
開啟瀏覽器前往 `http://localhost:8000` 即可使用。
