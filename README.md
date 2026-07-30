# word2md

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Framework](https://img.shields.io/badge/Express-5.x-darkgreen.svg)](https://expressjs.com/)

**word2md** is a fast, lightweight, and modern multi-format document-to-Markdown converter. It seamlessly transforms **ODT (OpenDocument Text)**, **PDF**, and **HTML** files into structured Markdown documents, automatically extracting embedded images and organizing output into timestamped folders.

---

## Features

- **Modern Web UI**:
  - Premium dark theme featuring sleek glassmorphism, HSL-tailored color schemes, vibrant gradients, and smooth micro-animations.
  - Interactive **Drag & Drop** file uploader with glowing hover effects.
  - **Live Rendered Preview & Raw Code View**: Split-pane interface allowing real-time inspection and instant copy-to-clipboard functionality.
  - **One-Click Folder Opener**: Open the output directory directly in your operating system's file manager with a single click.

- **Multi-Format Processing**:
  - **ODT Converter**: Parses XML structure, inline styles (bold, italic, strikethrough, underline), nested lists, GFM tables, and extracts embedded document images.
  - **PDF Parser**: Automatically detects font scaling and spatial positioning to reconstruct headings and paragraph hierarchy.
  - **HTML Engine**: Utilizes Turndown with GFM extensions to convert web pages, cleans unwanted `<script>` and `<style>` blocks, and decodes Base64 embedded images.

- **Automated Image Extraction**:
  - Automatically extracts all embedded images and Base64 Data URLs into an isolated `Pictures/` subdirectory within the output folder.
  - Fixes all Markdown image references automatically to normalized relative paths (e.g., `![alt](Pictures/image_1.png)`).

- **Timestamp Archiving & History Tracking**:
  - Organizes every conversion run into an isolated timestamped folder (`output/YYYY-MM-DD_HHmmss/`).
  - Keeps a history log allowing instant reloading of past conversions and output folders.

- **Dual Operating Modes**:
  - Supports both interactive **Web UI** and lightweight **CLI script** execution.

---

## Supported Formats Overview

| Format | File Extensions | Features & Capabilities |
| :--- | :--- | :--- |
| **ODT** | `.odt` | Headings (`#`-`######`), bold (`**`), italic (`*`), strikethrough (`~~`), underline (`<u>`), GFM tables, nested lists, image zip extraction |
| **PDF** | `.pdf` | Font hierarchy detection, heading levels, structured text paragraphs |
| **HTML** | `.html`, `.htm` | GFM tables, lists, Base64 image extraction & decoding, `<style>` / `<script>` filtering |

---

## Tech Stack

- **Backend**: Node.js, Express 5, Multer, Adm-Zip, `@xmldom/xmldom`, `@opendocsg/pdf2md`, Turndown, `turndown-plugin-gfm`
- **Frontend**: Vanilla HTML5, Vanilla CSS3 (HSL Design System), ES6+ JavaScript, Lucide Icons, Google Fonts (Outfit & Inter)

---

## Repository Structure

```text
word2md/
├── public/                 # Web UI static assets
│   ├── index.html          # Main HTML entry point & UI layout
│   ├── style.css           # Glassmorphism & dark design system styles
│   └── app.js              # Client-side state, drag-and-drop & API integration
├── output/                 # Generated Markdown files & extracted image folders
├── generate-test-odt.js    # Utility script to generate a sample test ODT file
├── run-convert.js          # Standalone CLI conversion tool
├── server.js               # Express server & API endpoints
├── package.json            # Dependencies and scripts
└── README.md               # Documentation
```

---

## Quick Start

### 1. Prerequisites

Ensure you have **Node.js (>= 18.0.0)** installed on your machine.

### 2. Installation

Clone the repository and install dependencies using `npm` or `pnpm`:

```bash
# Clone the repository
git clone https://github.com/garzlolz/word2md.git
cd word2md

# Install dependencies
npm install
# or
pnpm install
```

### 3. Launching the Web UI

Start the development server. The server will run on `http://localhost:3000` and automatically open your default web browser:

```bash
npm run dev
# or
pnpm dev
```

Drag and drop your `.odt`, `.pdf`, or `.html` file onto the dropzone to start converting!

---

## CLI Usage

If you prefer converting files via command line without running the Web UI:

```bash
# Convert the default sample file
npm run convert

# Or specify a custom document file path
node run-convert.js "path/to/your/document.odt"
```

---

## API Endpoints

### `POST /api/convert`
Accepts a single uploaded file and returns the generated Markdown string and output directory info.

- **Content-Type**: `multipart/form-data`
- **Body**: `file` (Binary File: `.odt`, `.pdf`, `.html`, `.htm`)
- **Response**:
  ```json
  {
    "success": true,
    "markdown": "# Document Title\n\nConverted text content...",
    "outputPath": "D:\\path\\to\\word2md\\output\\2026-07-30_160000",
    "mdFile": "document.md",
    "folderName": "2026-07-30_160000",
    "imageCount": 2
  }
  ```

### `POST /api/open-folder`
Triggers native OS process (File Explorer / Finder) to open the specified output folder.

- **Body**: `{ "folderPath": "D:\\path\\to\\output\\folder" }`

### `GET /api/history`
Returns the recent conversion history items.

---

## License

This project is open source and available under the [ISC License](LICENSE).
