# PDF Tool

A small, offline-first web app for everyday PDF jobs on your phone. Installs to your home screen and works without a connection.

## Features

- Scan documents with the camera (batch mode), then crop by dragging 4 corners
- Filters: Original, Clear Scan, Black & White, Color
- Turn images into a PDF
- Merge PDFs and images into one PDF, reordering by drag and drop
- Full quality by default, with High / Medium / Small / "under X MB" options when exporting
- Exported file is named with today's date (DD-MM-YY) and can be renamed
- Works offline once installed
- Classic iOS look and feel

## Privacy

Everything happens in your browser. Your files never leave your device: nothing is uploaded, and saved documents are stored locally on the device.

## Install on your phone

Open https://radhegeneral2306.github.io/pdf-tool/ and then:

- **Android (Chrome):** menu (three dots) > **Install app**
- **iPhone (Safari):** **Share** > **Add to Home Screen**

## GitHub Pages setup (one time)

1. In the repo, go to **Settings > Pages**.
2. Set **Source** to **GitHub Actions**.

After that, every merge to `main` runs tests, builds, and deploys to
https://radhegeneral2306.github.io/pdf-tool/

## Local development

```sh
npm install     # install dependencies
npm run dev     # start the dev server
npm test        # run tests
npm run build   # production build into dist/
```

App icons are generated with `node scripts/make-icons.mjs` (uses Playwright).

## Tech stack

- React
- Vite
- pdf-lib (creating and merging PDFs)
- pdf.js (rendering PDFs)
- idb (IndexedDB storage)
- dnd-kit (drag and drop)
- Phosphor icons
- vite-plugin-pwa (offline support and install)
