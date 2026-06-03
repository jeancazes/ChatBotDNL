/**
 * Speech-to-text — two-tier system (both non-blocking)
 *
 * 1. Browser Whisper — ONNX WASM in a Web Worker, free, cached after first load
 * 2. OpenAI Whisper  — API fallback (only if openaiKey provided)
 */

// ─── Whisper Web Worker ────────────────────────────────────────────────────────

let _worker        = null
let _workerState   = 'idle'   // idle | loading | ready | error
let _initResolvers = []
let _progressCb    = null
let _pending       = new Map()
let _transId       = 0

function ensureWorker() {
  if (_worker) return _worker
  _worker = new Worker(new URL('../workers/whisper.worker.js', import.meta.url), { type: 'module' })
  _worker.onmessage = ({ data }) => {
    switch (data.type) {
      case 'progress': _progressCb?.(data.pct); break
      case 'ready':
        _workerState = 'ready'; _progressCb?.(100)
        _initResolvers.forEach(r => r(true)); _initResolvers = []
        break
      case 'error':
        _workerState = 'error'
        console.warn('Whisper worker error:', data.message)
        _initResolvers.forEach(r => r(false)); _initResolvers = []
        break
      case 'transcribed': {
        const p = _pending.get(data.id)
        if (p) { _pending.delete(data.id); p.resolve(data.text) }
        break
      }
      case 'trans_error': {
        const p = _pending.get(data.id)
        if (p) { _pending.delete(data.id); p.reject(new Error(data.message)) }
        break
      }
    }
  }
  return _worker
}

export async function initWhisper(onProgress) {
  if (_workerState === 'ready')   { onProgress?.(100); return true }
  if (_workerState === 'error')   return false
  if (_workerState === 'loading') return new Promise(r => _initResolvers.push(r))
  _workerState = 'loading'; _progressCb = onProgress
  onProgress?.(0)
  ensureWorker().postMessage({ type: 'init' })
  return new Promise(r => _initResolvers.push(r))
}

export function isWhisperReady()   { return _workerState === 'ready'   }
export function isWhisperLoading() { return _workerState === 'loading' }

// ─── Audio decoding (main thread — needs AudioContext) ─────────────────────────

const WHISPER_LANG = { Français:'french', English:'english', Español:'spanish', Deutsch:'german' }

async function decodeAudioToFloat32(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  // Step 1: decode at native sample rate
  const tmpCtx = new AudioContext()
  let decoded
  try { decoded = await tmpCtx.decodeAudioData(arrayBuffer) }
  finally { tmpCtx.close() }
  // Step 2: resample to 16 kHz (required by Whisper)
  if (decoded.sampleRate === 16000) return decoded.getChannelData(0)
  const numSamples = Math.ceil(decoded.duration * 16000)
  const offline = new OfflineAudioContext(1, numSamples, 16000)
  const src = offline.createBufferSource()
  src.buffer = decoded; src.connect(offline.destination); src.start()
  const resampled = await offline.startRendering()
  return resampled.getChannelData(0)
}

async function transcribeBrowser(audioBlob, language) {
  const float32    = await decodeAudioToFloat32(audioBlob)
  const transferBuf = float32.buffer.slice(0)  // copy → transferable
  const id = ++_transId
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject })
    ensureWorker().postMessage(
      { type: 'transcribe', id, audioBuffer: transferBuf, language: WHISPER_LANG[language] || 'english' },
      [transferBuf]
    )
    setTimeout(() => {
      if (_pending.has(id)) { _pending.delete(id); reject(new Error('Whisper timeout (60 s)')) }
    }, 60000)
  })
}

// ─── OpenAI fallback ──────────────────────────────────────────────────────────

const OPENAI_LANG = { Français:'fr', English:'en', Español:'es', Deutsch:'de' }

async function transcribeOpenAI(openaiKey, audioBlob, language) {
  const form = new FormData()
  form.append('file', audioBlob, 'audio.webm')
  form.append('model', 'whisper-1')
  const lang = OPENAI_LANG[language]
  if (lang) form.append('language', lang)
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI STT ${resp.status}`)
  }
  return (await resp.json()).text || ''
}

// ─── Recording helpers ─────────────────────────────────────────────────────────

export async function checkMicrophoneAvailable() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    s.getTracks().forEach(t => t.stop()); return true
  } catch { return false }
}

export async function startRecording() {
  const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks   = []
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
  recorder.start()
  return {
    stop: () => new Promise((resolve, reject) => {
      recorder.onstop  = () => { stream.getTracks().forEach(t => t.stop()); resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })) }
      recorder.onerror = e => reject(e.error)
      recorder.stop()
    }),
    cancel: () => { recorder.stop(); stream.getTracks().forEach(t => t.stop()) }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Transcribe audio to text.
 * Priority: Browser Whisper (if ready) → OpenAI API (if key given) → error
 *
 * @param {string|null} openaiKey  — optional, used only as fallback
 * @param {Blob}        audioBlob
 * @param {string}      language   'Français' | 'English' | 'Español' | 'Deutsch'
 */
export async function transcribeAudio(openaiKey, audioBlob, language) {
  if (_workerState === 'ready') {
    try { return await transcribeBrowser(audioBlob, language) }
    catch (e) { console.warn('Browser Whisper failed, trying OpenAI:', e) }
  }
  if (openaiKey) return transcribeOpenAI(openaiKey, audioBlob, language)
  const waiting = _workerState === 'loading'
  throw new Error(waiting
    ? 'Whisper est encore en cours de chargement — réessayez dans quelques secondes.'
    : 'Transcription non disponible. Fournissez une clé OpenAI dans les paramètres.'
  )
}
