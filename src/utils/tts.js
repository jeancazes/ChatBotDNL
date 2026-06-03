/**
 * Text-to-Speech
 * Primary: OpenAI TTS API (tts-1-hd) — excellent quality, multilingual
 * Fallback: Web Speech API — free but lower quality
 */

// ── OpenAI TTS ─────────────────────────────────────────────────────────────────

const LANG_VOICES = {
  Français: { male: 'onyx',  female: 'nova'    },
  English:  { male: 'echo',  female: 'shimmer' },
  Español:  { male: 'fable', female: 'nova'    },
  Deutsch:  { male: 'onyx',  female: 'shimmer' },
}

function pickOpenAIVoice(language, opts) {
  if (opts.openaiVoice) return opts.openaiVoice
  const map = LANG_VOICES[language] || LANG_VOICES.English
  if (opts.gender === 'female') return map.female
  if (opts.gender === 'male')   return map.male
  return 'alloy'
}

let _currentAudio = null

async function speakOpenAI(text, language, opts, openaiKey) {
  stopSpeaking()
  const voice = pickOpenAIVoice(language, opts)
  // OpenAI speed range: 0.25–4.0 (default 1.0); map our rate proportionally
  const speed = Math.min(4.0, Math.max(0.25, opts.rate ?? 1.0))
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1-hd', input: text, voice, speed })
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI TTS error ${resp.status}`)
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const audio = new Audio(url)
    _currentAudio = audio
    audio.onended  = () => { URL.revokeObjectURL(url); _currentAudio = null; resolve(true)  }
    audio.onerror  = () => { URL.revokeObjectURL(url); _currentAudio = null; resolve(false) }
    audio.play()
  })
}

// ── Web Speech API fallback ────────────────────────────────────────────────────

let _wsTimer = null
const FEMALE_NAMES = ['marie','amélie','alice','julie','sarah','karen','moira','tessa','fiona','veena','isabelle','aurelie','lea']
const MALE_NAMES   = ['thomas','nicolas','pierre','daniel','fred','jorge','diego','markus','hans','jean','alexandre']

function getVoicesWS(language) {
  const prefixes = { Français:'fr', English:'en', Español:'es', Deutsch:'de' }
  const prefix = prefixes[language] || 'en'
  return (window.speechSynthesis?.getVoices() || []).filter(v => v.lang.startsWith(prefix))
}

function pickWSVoice(voices, gender) {
  if (!voices.length) return null
  if (!gender) return voices[0]
  const names = gender === 'female' ? FEMALE_NAMES : MALE_NAMES
  return (
    voices.find(v => names.some(n => v.name.toLowerCase().includes(n))) ||
    voices.find(v => v.name.toLowerCase().includes(gender === 'female' ? 'female' : 'male')) ||
    voices[0]
  )
}

function speakWebSpeech(text, language, opts) {
  if (!window.speechSynthesis || !text) return Promise.resolve(false)
  stopSpeaking()
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const langMap = { Français:'fr-FR', English:'en-GB', Español:'es-ES', Deutsch:'de-DE' }
    u.lang   = langMap[language] || 'en-GB'
    u.rate   = opts.rate   ?? 0.9
    u.pitch  = opts.pitch  ?? 1.0
    u.volume = opts.volume ?? 1.0
    const assignVoiceAndSpeak = () => {
      const voices = getVoicesWS(language)
      const v = pickWSVoice(voices, opts.gender)
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
    if (window.speechSynthesis.getVoices().length > 0) assignVoiceAndSpeak()
    else window.speechSynthesis.onvoiceschanged = assignVoiceAndSpeak
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function stopSpeaking() {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null }
  if (window.speechSynthesis) { clearInterval(_wsTimer); window.speechSynthesis.cancel() }
}

export function isSpeaking() {
  return !!_currentAudio || (window.speechSynthesis?.speaking ?? false)
}

/**
 * @param {string} text
 * @param {string} language   'Français' | 'English' | 'Español' | 'Deutsch'
 * @param {{ rate?:number, pitch?:number, gender?:'male'|'female', openaiVoice?:string }} opts
 * @param {string|null} openaiKey  — if provided, uses OpenAI TTS; else Web Speech fallback
 * @returns {Promise<boolean>}
 */
export async function speak(text, language, opts = {}, openaiKey = null) {
  if (!text) return false
  if (openaiKey) {
    try { return await speakOpenAI(text, language, opts, openaiKey) }
    catch (e) { console.warn('OpenAI TTS failed, falling back to Web Speech:', e) }
  }
  return speakWebSpeech(text, language, opts)
}
