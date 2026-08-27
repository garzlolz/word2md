# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start Express server on http://localhost:3000 (auto-opens browser)
npm start         # same as dev (production alias)
npm run convert   # CLI conversion via run-convert.js (ODT only, defaults to a sample filename)
node run-convert.js "path/to/file.odt"   # convert a specific ODT file via CLI
npm run gen-test  # regenerate the sample test.odt fixture via generate-test-odt.js
```

There is no real test suite (`npm test` is a stub) and no lint/build step — this is plain Node.js + vanilla frontend assets served as static files.

## Architecture

**Two independent entry points implement ODT conversion separately.** `server.js` (Express app, used by the Web UI) and `run-convert.js` (standalone CLI) both contain their own copies of the ODT XML-DOM walker (`convertElement`, `convertChildren`, `parseStyles`, `isInsideHeader`, etc.). They are **not shared via a module** — when fixing or extending ODT conversion logic, the same change must be applied in both files, or the CLI and Web UI will silently diverge. `run-convert.js` only handles `.odt`; PDF/HTML/ZIP conversion exists only in `server.js`.

**server.js is a single-file backend** containing all four format converters plus the Express routes. There is no `src/` or converter-module split:
- **ODT**: unzips via `adm-zip`, parses `content.xml` with `@xmldom/xmldom`, recursively walks the DOM (`convertElement`/`convertChildren`) mapping ODT tags (`text:h`, `text:p`, `text:span`, `text:list`, `table:table`, `draw:frame`, `text:table-of-content`, ...) to Markdown. Text styling (bold/italic/underline/strike/color) is resolved by cross-referencing `office:automatic-styles` (`parseStyles`) — color can come from either a `text:span`'s own style *or* be inherited from the enclosing `text:p`/`text:h`'s own paragraph style (`applyParagraphColor`), since Word/LibreOffice sometimes color a whole paragraph directly without wrapping it in a span. `text:table-of-content` (Word/LibreOffice TOC fields) is rebuilt as a nested Markdown list by resolving each entry's paragraph style through the `style:parent-style-name` chain (`resolveTocLevel`) against the TOC's own `text:table-of-content-entry-template` outline-level map — this generalizes across locales since it reads the outline-level mapping from the document itself rather than hardcoding style names like "TOC1"/"目錄1". `escapeMarkdown` also strips Private Use Area characters (U+E000-U+F8FF, plus the object-replacement character U+FFFC) that Word embeds as font-specific bullet/field placeholders (e.g. Wingdings bullets in TOC entries) — these are meaningless outside their original font and would otherwise leak into the Markdown as garbage glyphs.
- **PDF**: delegates entirely to `@opendocsg/pdf2md`.
- **HTML**: `convertHtmlContent()` runs `TurndownService` (+ GFM plugin) with custom rules (`extractHtmlImages`, `ignoreNavLinks`) and a large amount of regex-based pre/post cleanup specifically targeting Notion/Confluence page exports (sidebar/topbar noise, `notion-page-content` extraction, hardcoded Chinese nav-label strings in `cleanNavigationNoise`). This cleanup is brittle and site-specific — if a new source site's exports leak boilerplate, expect to add another targeted regex rather than a generic solution.
- **ZIP**: a `.zip` upload is inspected first for `content.xml` (treated as an ODT) and otherwise scanned for the largest non-`_files`/non-`__macosx` `.html`/`.htm` entry (a saved web page archive), which is then run through the HTML converter with the zip instance passed in so `extractHtmlImages` can pull images out of the archive's `_files` folder.

**Every conversion writes to a timestamped folder**: `output/YYYY-MM-DD_HHmmss_{basename}/{basename}.md` (folder name = timestamp + sanitized source filename, via `sanitizeFileName`) plus an `output/.../Pictures/` folder for extracted/decoded images (data URLs, ODT embedded images, or zip-archive image entries). Markdown image references are always rewritten to `Pictures/<file>` relative paths. A rolling `history.json` (max 50 entries, gitignored) at the repo root records past conversions for the Web UI's history panel and is written by both `server.js` and `run-convert.js`.

**Frontend (`public/`) is vanilla JS/CSS/HTML with no build step or framework.** `app.js` talks to `POST /api/convert` (multipart upload), `GET /api/download/zip/:folderName` (download ZIP archive), `GET /api/download/md/:folderName` (download MD file), `GET /api/history`, `POST /api/history/clean`, and `DELETE /api/history/:id`. Notably, the live preview does **not** use a Markdown library — `renderMarkdown()` in `app.js` is a hand-rolled regex-based Markdown-to-HTML renderer (tables, headings, bold/italic/strike, lists, images rewritten to `/output/<folder>/<path>`). Keep it in sync with whatever Markdown constructs the backend converters can emit.

**Windows-specific handling to preserve**: `multer` delivers `originalname` as latin1, so `server.js` re-decodes it as UTF-8 (`Buffer.from(req.file.originalname, 'latin1').toString('utf8')`) to avoid mojibake with Chinese filenames — don't remove this even if it looks redundant.
