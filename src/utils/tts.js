/**
 * Text-to-Speech — three-tier system
 *
 * 1. Kokoro TTS  — free, runs in-browser via ONNX WASM (~80 MB, cached after first load)
 *                  Used for English (best quality). Also attempted for FR if no OpenAI key.
 * 2. OpenAI TTS  — tts-1-hd, paid per character, excellent for all languages
 *                  Used for FR / ES / DE as primary, and EN as fallback if Kokoro fails.
 * 3. Web Speech  — browser built-in, free, quality varies by OS
 *                  Last resort fallback.
 */

// ─── Kokoro ────────────────────────────────────────────────────────────────────

// Voices available in Kokoro 82M v1.0
// EN-US: af_heart af_alloy af_aoede af_bella af_jessica af_kore af_nicole af_nova
//        af_river af_sarah af_sky am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa
// EN-GB: bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis bm_liam
// FR:    ff_siwis
// ES:    ef_dora em_alex em_santa
// ZH/JA/KO/HI: various

const KOKORO_VOICES = {
  English: {
    male:    ['bm_george', 'bm_lewis', 'am_michael', 'am_echo'],
    female:  ['bf_emma',   'af_sarah',  'af_nicole',  'af_heart'],
    neutral: 'am_puck',
  },
  Français: {
    male:    ['ff_siwis'],   // no male FR voice in v1.0 — will fallback to OpenAI
    female:  ['ff_siwis'],
    neutral: 'ff_siwis',
  },
  Español: {
    male:    ['em_alex'],
    female:  ['ef_dora'],
    neutral: 'ef_dora',
  },
  Deutsch: null,  // no DE voice in v1.0 — always use OpenAI/WebSpeech
}

// Languages where Kokoro has good quality coverage
const KOKORO_GOOD_LANGS = new Set(['English', 'Español'])

let _kokoroTTS   = null   // KokoroTTS instance once loaded
let _kokoroState = 'idle' // 'idle' | 'loading' | 'ready' | 'error'
let _kokoroQueue = []     // pending init promises

/**
 * Kick off Kokoro model download & initialisation.
 * Call this early (e.g. on game mount) to pre-warm the model.
 * @param {(pct: number, status: string) => void} onProgress
 */
export async function initKokoro(onProgress) {
  if (_kokoroState === 'ready') { onProgress?.(100, 'ready'); return true }
  if (_kokoroState === 'error') return false
  if (_kokoroState === 'loading') {
    // Already loading — wait for it
    return new Promise(resolve => _kokoroQueue.push(resolve))
  }

  _kokoroState = 'loading'
  onProgress?.(0, 'loading')

  try {
    const { KokoroTTS } = await import('kokoro-js')
    _kokoroTTS = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0', {
      dtype: 'q8',
      progress_callback: (info) => {
        if (info.status === 'progress' && info.total) {
          const pct = Math.round((info.loaded / info.total) * 100)
          onProgress?.(pct, 'loading')
        }
      },
    })
    _kokoroState = 'ready'
    onProgress?.(100, 'ready')
    _kokoroQueue.forEach(resolve => resolve(true))
    _kokoroQueue = []
    return true
  } catch (err) {
    console.warn('Kokoro init failed:', err)
    _kokoroState = 'error'
    _kokoroQueue.forEach(resolve => resolve(false))
    _kokoroQueue = []
    return false
  }
}

/** Pick best Kokoro voice for this language + gender + optional override */
function pickKokoroVoice(language, opts) {
  if (opts.kokoroVoice) return opts.kokoroVoice
  const map = KOKORO_VOICES[language]
  if (!map) return null
  if (opts.gender === 'male')   return map.male?.[0]   ?? map.neutral
  if (opts.gender === 'female') return map.female?.[0] ?? map.neutral
  return map.neutral
}

/** Convert Float32Array PCM → playable AudioBuffer */
async function playPCM(samples, sampleRate) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const buffer = ctx.createBuffer(1, samples.length, sampleRate)
  buffer.copyToChannel(samples, 0)
  return new Promise((resolve) => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.onended = () => { ctx.close(); resolve(true) }
    src.start()
    _currentKokoroSrc = src
    _currentKokoroCtx = ctx
  })
}

let _currentKokoroSrc = null
let _currentKokoroCtx = null

async function speakKokoro(text, language, opts) {
  if (_kokoroState !== 'ready' || !_kokoroTTS) return false
  const voice = pickKokoroVoice(language, opts)
  if (!voice) return false

  stopKokoro()
  try {
    const audio = await _kokoroTTS.generate(text, { voice, speed: opts.rate ?? 1.0 })
    // audio.audio = Float32Array, audio.sampling_rate = number
    return await playPCM(audio.audio, audio.sampling_rate)
  } catch (err) {
    console.warn('Kokoro generate failed:', err)
    return false
  }
}

function stopKokoro() {
  try { _currentKokoroSrc?.stop() } catch {}
  try { _currentKokoroCtx?.close() } catch {}
  _currentKokoroSrc = null
  _currentKokoroCtx = null
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
  const url = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const audio = new Audio(url)
    _currentOpenAIAudio = audio
    audio.onended  = () => { URL.revokeObjectURL(url); _currentOpenAIAudio = null; resolve(true)  }
    audio.onerror  = () => { URL.revokeObjectURL(url); _currentOpenAIAudio = null; resolve(false) }
    audio.play()
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
    u.lang   = langMap[language] || 'en-GB'
    u.rate   = opts.rate  ?? 0.9
    u.pitch  = opts.pitch ?? 1.0
    const assignAndSpeak = () => {
      const voices = (window.speechSynthesis.getVoices() || []).filter(v => v.lang.startsWith(u.lang.slice(0,2)))
      const names = opts.gender === 'female' ? FEMALE_NAMES : MALE_NAMES
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
    if (window.speechSynthesis.getVoices().length > 0) assignAndSpeak()
    else window.speechSynthesis.onvoiceschanged = assignAndSpeak
  })
}

function stopWebSpeech() {
  if (window.speechSynthesis) { clearInterval(_wsTimer); window.speechSynthesis.cancel() }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function stopSpeaking() {
  stopKokoro()
  stopOpenAI()
  stopWebSpeech()
}

export function isSpeaking() {
  return !!_currentKokoroSrc || !!_currentOpenAIAudio || (window.speechSynthesis?.speaking ?? false)
}

export function isKokoroReady() { return _kokoroState === 'ready' }
export function isKokoroLoading() { return _kokoroState === 'loading' }

/**
 * Speak text using the best available engine.
 *
 * Priority:
 *   - English + Español  → Kokoro (if ready) → OpenAI → WebSpeech
 *   - Français + Deutsch → OpenAI (if key)   → Kokoro (FR only) → WebSpeech
 *
 * @param {string} text
 * @param {string} language  'Français' | 'English' | 'Español' | 'Deutsch'
 * @param {{ rate?:number, pitch?:number, gender?:'male'|'female', openaiVoice?:string, kokoroVoice?:string }} opts
 * @param {string|null} openaiKey
 */
export async function speak(text, language, opts = {}, openaiKey = null) {
  if (!text) return false

  const useKokoroFirst = KOKORO_GOOD_LANGS.has(language)

  if (useKokoroFirst) {
    // 1. Try Kokoro
    if (_kokoroState === 'ready') {
      const ok = await speakKokoro(text, language, opts)
      if (ok) return true
    }
    // 2. Try OpenAI
    if (openaiKey) {
      try { return await speakOpenAI(text, language, opts, openaiKey) }
      catch (e) { console.warn('OpenAI TTS failed:', e) }
    }
  } else {
    // 1. Try OpenAI
    if (openaiKey) {
      try { return await speakOpenAI(text, language, opts, openaiKey) }
      catch (e) { console.warn('OpenAI TTS failed:', e) }
    }
    // 2. Try Kokoro (FR only, limited)
    if (_kokoroState === 'ready' && language === 'Français') {
      const ok = await speakKokoro(text, language, opts)
      if (ok) return true
    }
  }

  // 3. Web Speech fallback
  return speakWebSpeech(text, language, opts)
}
