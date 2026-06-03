/**
 * TTS — three-tier system (all non-blocking)
 *
 * 1. Kokoro   — free, ONNX WASM in a Web Worker (never blocks main thread)
 *               Primary for English & Spanish.
 * 2. OpenAI   — tts-1-hd, excellent for all languages, paid per character
 *               Primary for Français & Deutsch; fallback for EN/ES.
 * 3. Web Speech — browser built-in, free, last resort.
 */

// ─── Kokoro Web Worker ─────────────────────────────────────────────────────────

const KOKORO_GOOD_LANGS = new Set(['English', 'Español'])

const KOKORO_VOICES = {
  English: { male: 'bm_george', female: 'bf_emma'  },
  Español: { male: 'em_alex',   female: 'ef_dora'  },
  Français:{ male: 'ff_siwis',  female: 'ff_siwis' },
  Deutsch: null,
}

let _worker        = null
let _workerState   = 'idle'  // idle | loading | ready | error
let _initResolvers = []
let _progressCb    = null
let _pending       = new Map() // id → {resolve, reject}
let _genId         = 0

function ensureWorker() {
  if (_worker) return _worker
  _worker = new Worker(new URL('../workers/kokoro.worker.js', import.meta.url), { type: 'module' })
  _worker.onmessage = ({ data }) => {
    switch (data.type) {
      case 'progress':
        _progressCb?.(data.pct)
        break
      case 'ready':
        _workerState = 'ready'
        _progressCb?.(100)
        _initResolvers.forEach(r => r(true)); _initResolvers = []
        break
      case 'error':
        _workerState = 'error'
        console.warn('Kokoro worker error:', data.message)
        _initResolvers.forEach(r => r(false)); _initResolvers = []
        break
      case 'generated': {
        const p = _pending.get(data.id)
        if (p) { _pending.delete(data.id); p.resolve(data.blob) }
        break
      }
      case 'gen_error': {
        const p = _pending.get(data.id)
        if (p) { _pending.delete(data.id); p.reject(new Error(data.message)) }
        break
      }
    }
  }
  return _worker
}

export async function initKokoro(onProgress) {
  if (_workerState === 'ready')   { onProgress?.(100); return true }
  if (_workerState === 'error')   return false
  if (_workerState === 'loading') return new Promise(r => _initResolvers.push(r))
  _workerState = 'loading'
  _progressCb = onProgress
  onProgress?.(0)
  ensureWorker().postMessage({ type: 'init' })
  return new Promise(r => _initResolvers.push(r))
}

export function isKokoroReady()   { return _workerState === 'ready'   }
export function isKokoroLoading() { return _workerState === 'loading' }

function pickKokoroVoice(language, opts) {
  if (opts.kokoroVoice) return opts.kokoroVoice
  const map = KOKORO_VOICES[language]
  if (!map) return null
  return opts.gender === 'female' ? map.female : map.male
}

async function generateKokoroBlob(text, language, opts) {
  if (_workerState !== 'ready') return null
  const voice = pickKokoroVoice(language, opts)
  if (!voice) return null
  const id = ++_genId
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject })
    ensureWorker().postMessage({ type: 'generate', id, text, voice, speed: opts.rate ?? 1.0 })
    setTimeout(() => {
      if (_pending.has(id)) { _pending.delete(id); reject(new Error('Kokoro timeout')) }
    }, 30000)
  })
}

// ─── OpenAI TTS ────────────────────────────────────────────────────────────────

const OPENAI_VOICES = {
  Français: { male: 'onyx',  female: 'nova'    },
  English:  { male: 'echo',  female: 'shimmer' },
  Español:  { male: 'fable', female: 'nova'    },
  Deutsch:  { male: 'onyx',  female: 'shimmer' },
}

function pickOpenAIVoice(language, opts) {
  if (opts.openaiVoice) return opts.openaiVoice
  const map = OPENAI_VOICES[language] || OPENAI_VOICES.English
  return opts.gender === 'female' ? map.female : map.male
}

async function generateOpenAIBlob(text, language, opts, openaiKey) {
  const voice = pickOpenAIVoice(language, opts)
  const speed = Math.min(4.0, Math.max(0.25, opts.rate ?? 1.0))
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1-hd', input: text, voice, speed }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI TTS ${resp.status}`)
  }
  return resp.blob()
}

// ─── Shared playback ───────────────────────────────────────────────────────────

let _currentAudio = null

export function playBlob(blob) {
  stopCurrent()
  const url = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const a = new Audio(url)
    _currentAudio = a
    a.onended  = () => { URL.revokeObjectURL(url); _currentAudio = null; resolve(true)  }
    a.onerror  = () => { URL.revokeObjectURL(url); _currentAudio = null; resolve(false) }
    a.play().catch(() => { URL.revokeObjectURL(url); _currentAudio = null; resolve(false) })
  })
}

function stopCurrent() {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null }
}

// ─── Web Speech fallback ───────────────────────────────────────────────────────

let _wsTimer = null
const FEMALE_NAMES = ['marie','amélie','alice','julie','sarah','karen','moira','tessa','fiona','veena']
const MALE_NAMES   = ['thomas','nicolas','pierre','daniel','fred','jorge','markus','hans']

function speakWebSpeech(text, language, opts) {
  if (!window.speechSynthesis || !text) return Promise.resolve(false)
  stopWebSpeech()
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const langMap = { Français:'fr-FR', English:'en-GB', Español:'es-ES', Deutsch:'de-DE' }
    u.lang  = langMap[language] || 'en-GB'
    u.rate  = opts.rate  ?? 0.9
    u.pitch = opts.pitch ?? 1.0
    const go = () => {
      const voices = (window.speechSynthesis.getVoices() || []).filter(v => v.lang.startsWith(u.lang.slice(0,2)))
      const names  = opts.gender === 'female' ? FEMALE_NAMES : MALE_NAMES
      const v = voices.find(v => names.some(n => v.name.toLowerCase().includes(n))) || voices[0]
      if (v) u.voice = v
      clearInterval(_wsTimer)
      _wsTimer = setInterval(() => {
        if (!window.speechSynthesis.speaking) { clearInterval(_wsTimer); return }
        window.speechSynthesis.pause(); window.speechSynthesis.resume()
      }, 10000)
      u.onend   = () => { clearInterval(_wsTimer); resolve(true)  }
      u.onerror = () => { clearInterval(_wsTimer); resolve(false) }
      window.speechSynthesis.speak(u)
    }
    if (window.speechSynthesis.getVoices().length > 0) go()
    else window.speechSynthesis.onvoiceschanged = go
  })
}

function stopWebSpeech() {
  if (window.speechSynthesis) { clearInterval(_wsTimer); window.speechSynthesis.cancel() }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function stopSpeaking() { stopCurrent(); stopWebSpeech() }

export function isSpeaking() {
  return !!_currentAudio || (window.speechSynthesis?.speaking ?? false)
}

/**
 * Generate an audio Blob for text without playing it.
 * Returns null if both Kokoro and OpenAI are unavailable.
 */
export async function generateAudioBlob(text, language, opts = {}, openaiKey = null) {
  if (!text) return null
  const kokoroFirst = KOKORO_GOOD_LANGS.has(language)

  if (kokoroFirst) {
    try { const b = await generateKokoroBlob(text, language, opts); if (b) return b } catch {}
    if (openaiKey) { try { return await generateOpenAIBlob(text, language, opts, openaiKey) } catch (e) { console.warn('OpenAI:', e) } }
  } else {
    if (openaiKey) { try { return await generateOpenAIBlob(text, language, opts, openaiKey) } catch (e) { console.warn('OpenAI:', e) } }
    if (language === 'Français') { try { const b = await generateKokoroBlob(text, language, opts); if (b) return b } catch {} }
  }
  return null
}

/**
 * Speak text — generates blob then plays it; falls back to Web Speech.
 * Non-blocking: Kokoro runs in a Web Worker.
 */
export async function speak(text, language, opts = {}, openaiKey = null) {
  if (!text) return false
  const blob = await generateAudioBlob(text, language, opts, openaiKey)
  if (blob) return playBlob(blob)
  return speakWebSpeech(text, language, opts)
}

// ─── Sentence streaming (reduces perceived latency) ───────────────────────────

/**
 * Split text into sentences for streaming TTS.
 * Splits on .!? followed by space + uppercase, avoiding abbreviations.
 */
export function splitSentences(text) {
  if (!text) return []
  // Split on sentence-ending punctuation before uppercase letter or opening quote
  const parts = text.split(/(?<=[.!?…])\s+(?=[A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ«"'])/u)
  const result = parts.map(s => s.trim()).filter(s => s.length > 2)
  return result.length > 0 ? result : [text.trim()]
}

/**
 * Speak text sentence by sentence: play sentence N while sentence N+1 generates.
 * Dramatically reduces time-to-first-audio for long responses.
 */
export async function speakStreaming(text, language, opts = {}, openaiKey = null) {
  if (!text) return
  stopSpeaking()
  const sentences = splitSentences(text)
  if (sentences.length <= 1) {
    // Single sentence — use regular speak()
    const blob = await generateAudioBlob(text, language, opts, openaiKey)
    if (blob) return playBlob(blob)
    return speakWebSpeech(text, language, opts)
  }

  // Pipeline: generate[n+1] runs while play[n] is happening
  let nextBlobPromise = generateAudioBlob(sentences[0], language, opts, openaiKey)

  for (let i = 0; i < sentences.length; i++) {
    const blob = await nextBlobPromise
    // Start generating next sentence immediately (don't await)
    if (i + 1 < sentences.length) {
      nextBlobPromise = generateAudioBlob(sentences[i + 1], language, opts, openaiKey)
    }
    // Play current sentence (awaited so we stay in sync)
    if (blob) await playBlob(blob)
    else await speakWebSpeech(sentences[i], language, opts)
  }
}
