# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# 靜態本地伺服器
npm run dev                 # 透過 npx serve 啟動本地靜態伺服器

# CLI 工具（可選的本地命令列 ODT 轉換）
npm run convert             # 執行 run-convert.js 進行 ODT 轉換
node run-convert.js "path/to/file.odt"
npm run gen-test            # 重新生成 sample test.odt 測試檔
```

This project has **no build step, no bundler, and zero backend server dependencies** for the Web UI. It runs as pure vanilla ESM in modern browsers and is structured according to **Node.js Best Practices & Clean Code**.

---

## Architecture: Clean Code & Component Layering

The application executes **100% inside the user's browser memory (Client-Side)** with clear separation of concerns:

### Directory Structure

```text
word2md/
├── index.html                      # Entry point for GitHub Pages (CDN imports)
├── assets/                         # Static assets
│   └── css/
│       └── style.css               # Glassmorphism dark UI with responsive tables
├── src/                            # Source root
│   ├── index.js                    # Application Bootstrapper
│   ├── config/                     # Configuration constants (1.4 Separate config)
│   │   ├── app.config.js           # Extensions whitelist, size limits, defaults
│   │   └── storage.config.js       # LocalStorage keys & retention limit
│   ├── components/                 # Presentation layer (UI components)
│   │   ├── uploader.component.js   # Drag & drop and file picker component
│   │   ├── preview.component.js    # Markdown preview, tabs and download triggers
│   │   ├── history.component.js    # LocalStorage history listing & loader
│   │   └── toast.component.js      # Global notifications
│   ├── services/                   # Application service layer
│   │   ├── conversion.service.js   # Conversion orchestrator & dispatcher
│   │   ├── storage.service.js      # Repository pattern for LocalStorage
│   │   └── zip.service.js          # JSZip wrapper for decompress & packaging
│   ├── domain/                     # Core domain logic (Pure functions, no DOM coupling)
│   │   ├── odt/
│   │   │   ├── odt-parser.js       # ODT XML AST walker
│   │   │   └── odt-styles.js       # ODT automatic styles & TOC hierarchy
│   │   └── html/
│   │       ├── html-parser.js      # Turndown engine & image extraction
│   │       └── notion-rules.js     # Notion-specific block converters & noise filter
│   └── utils/                      # Shared utility functions
│       ├── dom.util.js             # String escaping & filename sanitization
│       ├── format.util.js          # File size & timestamp formatters
│       └── markdown-render.util.js # Client-side preview renderer (GFM tables, tasks)
├── run-convert.js                  # Standalone CLI tool
├── generate-test-odt.js            # Test fixture generator
└── package.json
```

### Architectural Principles

1. **Structure by Components / Clean Layers**: UI (`components/`) handles events; `services/` orchestrates pipelines; `domain/` contains pure parsing algorithms independent of DOM UI.
2. **Configuration Separation**: Formats, limits, and keys live in `src/config/`.
3. **DRY CLI Reusability**: `run-convert.js` imports directly from `src/domain/odt/odt-parser.js`.
