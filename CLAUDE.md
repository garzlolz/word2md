# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# 靜態本地伺服器（任選一種）
npm run dev                 # 透過 npx serve 啟動本地靜態伺服器
# 或使用 VS Code Live Server 開啟 index.html
# 或使用 Python: python -m http.server 8000

# CLI 工具（可選的本地命令列 ODT 轉換）
npm run convert             # 執行 run-convert.js 進行 ODT 轉換
node run-convert.js "path/to/file.odt"
npm run gen-test            # 重新生成 sample test.odt 測試檔
```

This project has **no build step, no bundler, and zero backend server dependencies** for the Web UI. It runs as pure vanilla ESM in modern browsers and can be deployed directly to GitHub Pages from the repository root.

---

## Architecture: Pure Client-Side (ESM + CDN)

The application executes **100% inside the user's browser memory (Client-Side)**. Files are never uploaded to any remote server, guaranteeing privacy and speed.

### Directory Structure

```text
word2md/
├── index.html            # Main entry point with CDN scripts (JSZip, Turndown, Lucide)
├── style.css             # Glassmorphism dark UI with responsive horizontal table scrolling
├── js/
│   ├── main.js           # UI controller, drag & drop, conversion dispatcher, preview rendering
│   ├── zip-handler.js    # Client-side zip unpacking & memory packaging via JSZip
│   ├── storage.js        # History manager using browser localStorage
│   └── converters/
│       ├── odt.js        # ODT parser via browser native DOMParser
│       └── html.js       # HTML & Notion web archive parser via Turndown + GFM plugin
├── run-convert.js        # Optional standalone Node.js CLI script for ODT
└── package.json          # Minimal scripts & devDependencies for CLI
```

### Core Conversion Engines

1. **ODT Parser (`js/converters/odt.js`)**:
   - Uses `JSZip.loadAsync()` to read ODT archives.
   - Parses `content.xml` using the browser's native `new DOMParser().parseFromString(..., 'text/xml')`.
   - Walks the DOM resolving heading levels, inline styles (bold, italic, strikethrough, underline, text color), TOC outlines (`resolveTocLevel`), nested lists, and complex tables.
   - Extracts embedded images directly as `Blob`s and creates `URL.createObjectURL(blob)` for instant visual preview.

2. **HTML & ZIP Web Archive Parser (`js/converters/html.js`)**:
   - Uses CDN `TurndownService` + `turndown-plugin-gfm`.
   - Specialized pre-processing for Notion exports:
     - Checkbox blocks (`div.notion-to_do-block`) -> `- [ ]` / `- [x]`.
     - Bulleted lists (`div.notion-bulleted_list-block`) -> `- `.
     - Wide tables normalized with `<thead>/<th>`.
     - Missing image badges preserved as `[🖼️ 缺漏圖片: alt](Pictures/filename)`.
   - ZIP web archives: extracts `_files` images to memory Blobs and links them to relative `Pictures/` paths.

3. **In-Memory Packaging & Download (`js/zip-handler.js`)**:
   - Packages Markdown and the `Pictures/` directory into a `.zip` in memory with `JSZip`.
   - Triggers browser file downloads via temporary `<a>` elements and Blob URLs.

4. **History Storage (`js/storage.js`)**:
   - Persists the latest 50 conversion snapshots in `localStorage`.
