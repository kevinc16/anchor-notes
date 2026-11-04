# PDF.js 6.5.438

Source: https://github.com/mozilla/pdf.js/releases/download/v6.5.438/pdfjs-6.5.438-legacy-dist.zip

SHA-256: 55138aa33b5f1f6f68809895338b947f395f344eb6381d424b2420d6daa6a844

Apache-2.0; see LICENSE and resource-specific notices. Maps and sample PDFs omitted.
Bootstrap defaults patched: empty defaultUrl, enableScripting=false, disablePreferences=true.
Reproduce with: node scripts/vendor-pdfjs.mjs /path/to/release.zip
Official compatibility (legacy) build supports Firefox ESR; do not replace with the latest-browser-only build.
Viewer integration and extension-origin restrictions live in entrypoints/pdf.
