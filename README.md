# PDF Tool

A small, offline-first web app for everyday PDF jobs on your phone. Installs to your home screen and works without a connection.

## Features

- Scan documents with the camera (batch mode). Page edges are found automatically (OpenCV) with a live outline; corners can still be dragged
- Auto edge detection downloads about 3.5 MB once, the first time the scanner opens, then works offline
- Filters: Original, Clear Scan, Black & White, Color
- Turn images into a PDF
- Split PDF: pick the pages you want and save them as a new PDF
- Extract Text (OCR): read printed English and Hindi text from photos or PDFs (tesseract.js, runs on the device). Copy, save as .txt or as a searchable PDF. The OCR engine and language files (~4 MB engine + 11 MB English + 1.4 MB Hindi) download once on first use, then work offline
- Edit PDF: open a PDF from your device, then rotate, reorder, add or remove pages and save
- Open files from outside the app: Share to PDF Tool (Android, installed app) or "Open with" (computer, installed app in Chrome/Edge). iPhone does not allow this for web apps, so use Edit PDF inside the app
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

## Supported devices

- iPhone / iPad: iOS 16.4 or newer (Safari)
- Android: recent Chrome
- Computer: recent Chrome, Edge, Safari or Firefox

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
