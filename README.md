# Whimsy — Tiny Journal for Fleeting Thoughts (MVP)

Whimsy is a minimal, private-first journaling app for people who are afraid of forgetting their thoughts and ideas but don’t want the heaviness of traditional tools. It emphasizes a joyful, low-friction capture flow and a playful archive (like a memory box) where you can revisit old notes.

- Fast capture: jot text or record audio in seconds.
- Playful archive: browse your “Memory Box” of notes and snippets.
- Powerful search: exact search built-in, optional on-device semantic search.
- Optional transcription: toggle on if your device supports it.
- Export anytime: your data, your device. No ads, no analytics.

## Philosophy

- Privacy: No analytics, no tracking. Everything runs locally in your browser.
- Reliability: Offline-first storage using IndexedDB, designed to keep your notes available.
- Portability: Easy export to a portable ZIP containing raw text/audio and a manifest.
- Sustainability: Monetization via subscriptions (no ads), outside the scope of this MVP.

## Features

- 📝 Text capture with Cmd/Ctrl+Enter to save fast
- 🎙️ Audio capture using your device microphone
- 🔍 Search modes:
  - Exact keyword search (default)
  - Semantic search (beta): runs locally using TensorFlow.js + Universal Sentence Encoder
- 🧳 Export all notes and audio to a ZIP
- ⚙️ Settings to toggle transcription and semantic search

## How It Works (Architecture)

- Frontend-only web app: `index.html`, `styles.css`, `app.js`
- Storage: IndexedDB (`whimsy-db` / `entries` store). Each entry includes `type`, `createdAt`, and content (text or audio bytes). Semantic embeddings are cached per entry when enabled.
- Audio: `MediaRecorder` API records to WebM and stores raw bytes in IndexedDB.
- Transcription (optional): Uses Web Speech API if available; this MVP does not perform blob transcription post-recording.
- Search:
  - Exact: case-insensitive substring match over text/transcripts
  - Semantic: lazy-loads TensorFlow.js and Universal Sentence Encoder, computes cosine similarity on-device
- Export: Lazy-loads JSZip from CDN, bundles text and audio into a ZIP with `manifest.json` metadata.

## Run Locally

Because microphone permissions and some APIs behave better over http(s), a local server is recommended.

```bash
# From the project root
python -m http.server 8000
# or
npx http-server -p 8000
```

Open: http://localhost:8000

When prompted by your browser, allow microphone access to use audio recording.

## File Structure

```
.
├── index.html   # App layout and optional CDN placeholders
├── styles.css   # Playful memory-box aesthetic
├── app.js       # IndexedDB, recording, search, export
└── README.md
```

## Privacy & Data

- Your notes live in your browser’s IndexedDB. Clearing site data will remove them, so export regularly if needed.
- Semantic search downloads a model to your browser cache; text never leaves your device.
- There are no trackers or analytics.

## Roadmap

- Offline-first service worker and versioned migrations
- Better transcription UX (live captioning, language options)
- Pin/favorite notes and lightweight tagging
- Share/export subsets; import from ZIP
- Theming and accessibility polish

## Compatibility

- Tested on modern Chromium-based browsers and Safari. Microphone and MediaRecorder support may vary.

