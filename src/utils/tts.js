/**
 * Text-to-Speech — three-tier system
 *
 * 1. Kokoro TTS  — free, runs in-browser via ONNX WASM (~80 MB, cached after first load)
 *                  Used for English & Spanish (excellent quality).
 * 2. OpenAI TTS  — tts-1-hd, paid per character, excellent for all languages
 *                  Primary for FR/DE, fallback for EN/ES.
 * 3. Web Speech  — browser built-in, free, quality varies by OS. Last resort.
 */

// ─── Kokoro ────────────────────────────────────────────────────────────────────
// Available voices shipped with kokoro-js 1.x:
// EN-US female: af_heart af_alloy af_aoede af_bella af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky
// EN-US male:   am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa
// EN-GB female: bf_alice bf_emma bf_isabella bf_lily
// EN-GB male:   bm_daniel bm_fable bm_george bm_lewis
// FR female:    ff_siwis
// ES female:    ef_dora  ES male: em_alex em_santa

const KOKORO_VOICES = {
  English: { male: 'bm_george', female: 'bf_emma'  },
  Español: { male: 'em_alex',   female: 'ef_dora'  },
  Français:{ male: 'ff_siwis',  female: 'ff_siwis' }, // limited — used only when no OpenAI key
  Deutsch: null, // no DE voice — always fallback
}

// Languages where Kokoro has strong coverage
const KOKORO_GOOD_LANGS = new Set(['English', 'Español'])

let _kokoroTTS   = null
let _kokoroState = 'idle' // 'idle' | 'loading' | 'ready' | 'error'
let _kokoroQueue = []

/**
 * Pre-warm Kokoro model (downloads ~80 MB on first use, then cached).
 * Call early (game mount) so the model is ready when the student speaks.
 * @param {(pct: number) => void} onProgress  — 0..100
 */
export async function initKokoro(onProgress) {
  if (_kokoroState === 'ready')   { onProgress?.(100); return true  }
  if (_kokoroState === 'error')   { return false }
  if (_kokoroState === 'loading') {
    return new Promise(resolve => _kokoroQueue.push(resolve))
  }
  _kokoroState = 'loading'
  onProgress?.(0)
  try {
    const { KokoroTTS } = await import('kokoro-js')
    _kokoroTTS = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (info) => {
        if (info.status === 'progress' && info.total) {
          onProgress?.(Math.round((info.loaded / info.total) * 100))
        }
      },
    })
    _kokoroState = 'ready'
    onProgress?.(100)
    _kokoroQueue.forEach(r => r(true)); _kokoroQueue = []
    return true
  } catch (err) {
    console.warn('Kokoro init failed:', err)
    _kokoroState = 'error'
    _kokoroQueue.forEach(r => r(false)); _kokoroQueue = []
    return false
  }
}

export function isKokoroReady()   { return _kokoroState === 'ready'   }
export function isKokoroLoading() { return _kokoroState === 'loading' }

function pickKokoroVoice(language, opts) {
  if (opts.kokoroVoice) return opts.kokoroVoice
  const map = KOKORO_VOICES[language]
  if (!map) return null
  return opts.gender === 'female' ? map.female : map.male
}

let _currentKokoroAudio = null

async function speakKokoro(text, language, opts) {
  if (_kokoroState !== 'ready' || !_kokoroTTS) return false
  const voice = pickKokoroVoice(language, opts)
  if (!voice) return false
  stopKokoro()
  try {
    const audio = await _kokoroTTS.generate(text, { voice, speed: opts.rate ?? 1.0 })
    // audio.toBlob() → WAV Blob (audio.audio = Float32Array, audio.sampling_rate = 24000)
    const blob = audio.toBlob()
    const url  = URL.createObjectURL(blob)
    return new Promise((resolve) => {
      const a = new Audio(url)
      _currentKokoroAudio = a
      a.onended  = () => { URL.revokeObjectURL(url); _currentKokoroAudio = null; resolve(true)  }
      a.onerror  = () => { URL.revokeObjectURL(url); _currentKokoroAudio = null; resolve(false) }
      a.play()
    })
  } catch (err) {
    console.warn('Kokoro generate failed:', err)
    return false
  }
}

function stopKokoro() {
  if (_currentKokoroAudio) { _currentKokoroAudio.pause(); _currentKokoroAudio = null }
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

let _currentOpenAIAudio = null

async function speakOpenAI(text, language, opts, openaiKey) {
  stopOpenAI()
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
  const blob = await resp.blob()
  const url  = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const a = new Audio(url)
    _currentOpenAIAudio = a
    a.onended  = () => { URL.revokeObjectURL(url); _currentOpenAIAudio = null; resolve(true)  }
    a.onerror  = () => { URL.revokeObjectURL(url); _currentOpenAIAudio = null; resolve(false) }
    a.play()
  })
}

function stopOpenAI() {
  if (_currentOpenAIAudio) { _currentOpenAIAudio.pause(); _currentOpenAIAudio = null }
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
export function stopSpeaking() {
  stopKokoro(); stopOpenAI(); stopWebSpeech()
}

export function isSpeaking() {
  return !!_currentKokoroAudio || !!_currentOpenAIAudio || (window.speechSynthesis?.speaking ?? false)
}

/**
 * Speak text using the best available engine.
 *
 * English / Español  → Kokoro (if ready) → OpenAI → WebSpeech
 * Français / Deutsch → OpenAI (if key)   → Kokoro (FR only, limited) → WebSpeech
 */
export async function speak(text, language, opts = {}, openaiKey = null) {
  if (!text) return false
  const kokoroFirst = KOKORO_GOOD_LANGS.has(language)

  if (kokoroFirst) {
    if (_kokoroState === 'ready') {
      const ok = await speakKokoro(text, language, opts)
      if (ok) return true
    }
    if (openaiKey) {
      try { return await speakOpenAI(text, language, opts, openaiKey) } catch (e) { console.warn('OpenAI TTS:', e) }
    }
  } else {
    if (openaiKey) {
      try { return await speakOpenAI(text, language, opts, openaiKey) } catch (e) { console.warn('OpenAI TTS:', e) }
    }
    if (_kokoroState === 'ready' && language === 'Français') {
      const ok = await speakKokoro(text, language, opts)
      if (ok) return true
    }
  }
  return speakWebSpeech(text, language, opts)
}
