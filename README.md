# word2md

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Deploy to GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Ready-brightgreen.svg)](https://pages.github.com/)
[![Architecture: Pure Client-Side](https://img.shields.io/badge/Architecture-Pure%20ESM%20%2B%20CDN-purple.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

**word2md** 是一個極速、輕量且注重隱私的**純前端多格式文檔轉 Markdown 工具**。

專案採用 **零打包、純靜態 ESM + CDN 架構**，所有文件解析（ODT、HTML、ZIP 網頁包）與圖片抽取**100% 在使用者瀏覽器的本地記憶體中完成，完全不將檔案上傳到任何外部伺服器**。支援直接託管於 **GitHub Pages** 或任何靜態主機。

---

## 核心特色 (Features)

- **100% 本地純前端架構 (Zero Server & High Privacy)**:
  - 檔案**零上傳**：完全在瀏覽器記憶體內使用原生 `DOMParser` 與 `JSZip` 進行解析，保護機密文件與 PRD 商業隱私。
  - 無打包步驟 (No Build Step)：採用純原生 ES Modules，改完即測，直接部署。
  - 一鍵支援 **GitHub Pages** 預設靜態部署（根目錄即站台）。

- **現代化視覺與預覽介面 (Modern Web UI)**:
  - 質感深色玻璃擬態風格（Glassmorphism）、平滑微動畫與醒目拖曳上傳卡片。
  - **即時排版預覽與源碼對照**：雙頁籤自由切換，即時檢視轉換結果與一鍵複製 Markdown。
  - **寬表格自適應水平滾動條**：徹底解決多欄位寬表格（如 Notion PRD）將版面撐開的問題，提供滑順獨立的滾動條。
  - **GFM 待辦清單 (Task List)**：自動將 Notion 待辦事項轉換並渲染為勾選方塊與完成刪除線。

- **多格式處理能力 (Multi-Format)**:
  - **ODT 轉換**：解析 XML 結構、大綱標題階層、粗體/斜體/底線/刪除線/色彩、巢狀清單、複雜表格與目錄大綱。
  - **HTML 轉換**：使用 Turndown + GFM 外掛，深度優化 Notion 匯出語法，自動清洗導覽雜訊與抽取 Base64 圖片。
  - **ZIP 網頁包解析**：自動解壓網頁匯出包，抽取圖片至記憶體並將 Markdown 引用自動修正為 `Pictures/圖片檔名`。
  - **缺漏圖片安全標記**：當圖片因匯出缺失時，自動保留 `[🖼️ 缺漏圖片: 名稱](Pictures/檔名)` 徽章供後續手動補齊。

- **前端記憶體打包與下載**:
  - **一鍵下載 .md**：直接以 Blob 觸發下載 Markdown 純文字檔。
  - **一鍵下載 ZIP 包**：在前端記憶體中將 `.md` 與 `Pictures/` 圖片資料夾自動打包成 ZIP 檔下載。

- **瀏覽器本地歷史紀錄 (Local Storage)**:
  - 自動於瀏覽器 `localStorage` 保存最近 50 筆轉換紀錄，重新整理不遺失，點擊可立即重載檢視。

---

## 支援格式一覽 (Supported Formats)

| 格式 | 副檔名 | 特色與支援項目 |
| :--- | :--- | :--- |
| **ODT** | `.odt` | 大綱標題 (`#`-`######`)、樣式 (`**`, `*`, `~~`, `<u>`, 顏色)、GFM 表格、巢狀清單、目錄 (TOC)、圖片抽取 |
| **HTML** | `.html`, `.htm` | GFM 表格、清單、Notion 待辦清單 (`- [ ]`)、Base64 圖片抽取、`<style>` / `<script>` 清理 |
| **ZIP 網頁包** | `.zip` | 包含主 HTML 與 `_files` 圖片資料夾的完整網頁封裝包，自動關聯圖片並轉化為相對路徑 |

---

## 技術棧 (Tech Stack)

- **前端核心**：純原生 ES Modules (JavaScript ES2022+)
- **外掛依賴 (CDN)**：
  - [JSZip 3.10.1](https://stuk.github.io/jszip/)（純前端 ZIP/ODT 解壓縮與打包）
  - [Turndown 7.2.0](https://github.com/mixmark-io/turndown) + [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm)（HTML 轉 Markdown）
  - [Lucide Icons](https://lucide.dev/)（極簡現代圖標集）
- **樣式系統**：Vanilla CSS3（HSL Design Tokens、自適應 Grid 佈局、Glassmorphism）
- **資料儲存**：瀏覽器原生 `localStorage`（歷史紀錄）

---

## 專案結構 (Repository Structure)

```text
word2md/
├── index.html            # 主頁面入口，CDN 引入 JSZip、Turndown 與 Lucide
├── style.css             # Glassmorphism 設計系統與自適應樣式
├── js/                   # 純前端 ESM 模組目錄
│   ├── main.js           # 主控制器 (UI 事件、拖曳上傳、預覽渲染)
│   ├── zip-handler.js    # JSZip 本地解包與記憶體打包下載
│   ├── storage.js        # localStorage 歷史紀錄管理器
│   └── converters/
│       ├── odt.js        # 原生 DOMParser ODT 轉換模組
│       └── html.js       # Turndown + Notion HTML 轉換模組
├── run-convert.js        # 可選的本機 Node.js CLI 工具
├── package.json          # 開發用輔助配置 (可選)
└── README.md             # 專案文件
```

---

## 快速開始與部署 (Quick Start & Deployment)

### 部署到 GitHub Pages (推薦)

本專案為**零建置純靜態網站**，直接推送至 GitHub 即可在 1 分鐘內完成部署：

1. 將代碼推送至您的 GitHub 儲存庫：
   ```bash
   git push origin main
   ```
2. 前往 GitHub 儲存庫的 **Settings > Pages**。
3. 在 **Build and deployment > Source** 選擇 **Deploy from a branch**。
4. Branch 選擇 `main`，資料夾選擇 `/ (root)`，點擊 **Save**。
5. 等待數十秒，即可透過 `https://<使用者名稱>.github.io/<儲存庫名稱>/` 直接訪問！

---

### 本機開發與執行 (Local Development)

由於使用了瀏覽器原生 ES Modules，請勿直接以 `file://` 開啟，需透過簡易本機靜態伺服器：

#### 方法 A：使用 VS Code Live Server (最簡單)
1. 在 VS Code 安裝擴充套件「Live Server」。
2. 對著 `index.html` 按右鍵，選擇 **Open with Live Server**。

#### 方法 B：使用 npm / npx
```bash
npm run dev
# 或直接執行
npx serve .
```

#### 方法 C：使用 Python
```bash
python -m http.server 8000
```
在瀏覽器打開 `http://localhost:8000` 即可使用。
