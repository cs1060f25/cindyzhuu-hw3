// Whimsy - Minimal Journal MVP
// Privacy-first, offline-capable, IndexedDB storage

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Lazy loader for optional libs via <script type="text/plain" data-src="...">
function loadScriptFromData(id) {
  const placeholder = document.getElementById(id);
  if (!placeholder) return Promise.reject(new Error(`script placeholder ${id} not found`));
  const src = placeholder.getAttribute('data-src');
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

// IndexedDB helpers
const DB_NAME = 'whimsy-db';
const DB_VERSION = 1;
const STORE = 'entries';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('type', 'type');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    const result = tx.objectStore(STORE).add(entry);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

// UI and features
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let useModel = null; // Universal Sentence Encoder model when loaded

function formatDate(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return '' }
}

function render(entries) {
  const entriesEl = $('#entries');
  const empty = $('#emptyState');
  entriesEl.innerHTML = '';
  if (!entries || entries.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  for (const e of entries) {
    const card = document.createElement('div');
    card.className = 'card';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<span>${e.type === 'audio' ? '🎙️' : '📝'} ${formatDate(e.createdAt)}</span>`;
    card.appendChild(meta);

    if (e.type === 'text') {
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = e.text;
      card.appendChild(text);
    } else if (e.type === 'audio') {
      const audio = document.createElement('audio');
      audio.controls = true;
      const blob = new Blob([e.audioData], { type: e.mimeType || 'audio/webm' });
      audio.src = URL.createObjectURL(blob);
      card.appendChild(audio);
      if (e.transcript) {
        const t = document.createElement('div');
        t.className = 'text';
        t.textContent = e.transcript;
        card.appendChild(t);
      }
    }

    entriesEl.appendChild(card);
  }
}

async function refresh() {
  const all = await dbGetAll();
  const query = $('#searchInput').value.trim();
  const mode = $('#searchMode').value;
  if (!query) {
    render(all);
    return;
  }

  if (mode === 'exact') {
    const q = query.toLowerCase();
    const filtered = all.filter(e => {
      const text = (e.text || e.transcript || '').toLowerCase();
      return text.includes(q);
    });
    render(filtered);
  } else {
    // semantic
    const enabled = $('#semanticToggle').checked;
    if (!enabled) {
      render(all);
      return;
    }
    await ensureUSE();
    const enc = await embedText(query);
    // compute cosine similarity
    const withVecs = await Promise.all(all.map(async e => {
      const baseText = e.text || e.transcript || '';
      if (!baseText) return { e, score: -1 };
      if (!e.embedding) {
        e.embedding = await embedText(baseText);
        await dbAddOrPut(e);
      }
      const score = cosine(enc, e.embedding);
      return { e, score };
    }));
    const ranked = withVecs
      .filter(x => x.score >= 0)
      .sort((a,b) => b.score - a.score)
      .map(x => x.e);
    render(ranked);
  }
}

async function dbAddOrPut(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

async function ensureUSE() {
  if (useModel) return;
  await loadScriptFromData('tfjs-cdn');
  await loadScriptFromData('use-cdn');
  useModel = await window.use.load();
}

async function embedText(text) {
  const t = await useModel.embed([text]);
  const arr = await t.array();
  t.dispose && t.dispose();
  return arr[0];
}

// Save text note
async function saveText() {
  const val = $('#noteInput').value.trim();
  if (!val) return;
  const entry = { type: 'text', text: val, createdAt: Date.now() };
  await dbAdd(entry);
  $('#noteInput').value = '';
  await refresh();
}

// Audio recording
async function toggleRecord() {
  if (!isRecording) {
    // start
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = onRecordingStop;
    mediaRecorder.start();
    isRecording = true;
    $('#recordStatus').textContent = 'Recording… tap to stop';
    $('#recordBtn').textContent = '■ Stop';
  } else {
    // stop
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    isRecording = false;
    $('#recordStatus').textContent = 'Processing…';
    $('#recordBtn').textContent = '● Record';
  }
}

async function onRecordingStop() {
  const blob = new Blob(recordedChunks, { type: 'audio/webm' });
  const arrayBuf = await blob.arrayBuffer();
  const entry = { type: 'audio', createdAt: Date.now(), audioData: arrayBuf, mimeType: blob.type };
  const shouldTranscribe = $('#transcriptionToggle').checked && 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  if (shouldTranscribe) {
    try {
      // Attempt basic transcription using Web Speech API via live recognition while playing back
      // Note: Web Speech API typically works with live mic, not with blobs. For MVP we skip blob transcription.
      entry.transcript = '';
    } catch {}
  }
  await dbAdd(entry);
  $('#recordStatus').textContent = 'Saved';
  await refresh();
}

// Export
async function exportAll() {
  await loadScriptFromData('jszip-cdn');
  const JSZip = window.JSZip;
  const zip = new JSZip();
  const data = await dbGetAll();
  const meta = [];
  for (const e of data) {
    const id = e.id || `t${e.createdAt}`;
    if (e.type === 'text') {
      const file = `notes/${id}.txt`;
      zip.file(file, e.text);
      meta.push({ id, type: 'text', createdAt: e.createdAt, file });
    } else if (e.type === 'audio') {
      const ext = (e.mimeType || 'audio/webm').split('/')[1];
      const file = `audio/${id}.${ext}`;
      zip.file(file, e.audioData);
      meta.push({ id, type: 'audio', createdAt: e.createdAt, file, transcript: e.transcript || '' });
    }
  }
  zip.file('manifest.json', JSON.stringify({ exportedAt: Date.now(), count: data.length, entries: meta }, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'whimsy-export.zip';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Settings dialog
function openSettings() { $('#settingsDialog').showModal(); }

// Event wiring
$('#saveTextBtn').addEventListener('click', saveText);
$('#noteInput').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveText(); }
});
$('#recordBtn').addEventListener('click', toggleRecord);
$('#exportBtn').addEventListener('click', exportAll);
$('#settingsBtn').addEventListener('click', openSettings);
$('#clearSearch').addEventListener('click', () => { $('#searchInput').value=''; refresh(); });
$('#searchInput').addEventListener('input', refresh);
$('#searchMode').addEventListener('change', refresh);
$('#semanticToggle').addEventListener('change', refresh);

// Initial load
refresh();
