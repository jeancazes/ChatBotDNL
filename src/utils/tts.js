/**
 * Text-to-Speech via Web Speech API
 * Selects voice based on language + gender hint
 */

let _timer = null

export function stopSpeaking() {
  if (window.speechSynthesis) {
    clearInterval(_timer)
    window.speechSynthesis.cancel()
  }
}

export function isSpeaking() {
  return window.speechSynthesis?.speaking ?? false
}

/** Returns all voices available for a given language string */
export function getVoices(language) {
  const prefixes = { Français:'fr', English:'en', Español:'es', Deutsch:'de' }
  const prefix = prefixes[language] || 'en'
  return (window.speechSynthesis?.getVoices() || []).filter(v => v.lang.startsWith(prefix))
}

const FEMALE_NAMES = ['marie','amélie','alice','julie','sarah','karen','moira','tessa','fiona','veena','isabelle','aurelie','lea']
const MALE_NAMES   = ['thomas','nicolas','pierre','daniel','fred','jorge','diego','markus','hans','jean','alexandre']

function pickVoice(voices, gender) {
  if (!voices.length) return null
  if (!gender) return voices[0]
  const names = gender === 'female' ? FEMALE_NAMES : MALE_NAMES
  return (
    voices.find(v => names.some(n => v.name.toLowerCase().includes(n))) ||
    voices.find(v => v.name.toLowerCase().includes(gender === 'female' ? 'female' : 'male')) ||
    voices[0]
  )
}

/**
 * @param {string} text
 * @param {string} language  — 'Français' | 'English' | 'Español' | 'Deutsch'
 * @param {{ rate?:number, pitch?:number, volume?:number, gender?:'male'|'female' }} opts
 * @returns {Promise<boolean>}  resolves true when done, false on error
 */
export function speak(text, language, opts = {}) {
  if (!window.speechSynthesis || !text) return Promise.resolve(false)
  stopSpeaking()

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const langMap = { Français:'fr-FR', English:'en-GB', Español:'es-ES', Deutsch:'de-DE' }
    u.lang   = langMap[language] || 'en-GB'
    u.rate   = opts.rate   ?? 0.9
    u.pitch  = opts.pitch  ?? 1.0
    u.volume = opts.volume ?? 1.0

    // Wait for voices list (Chrome loads them async on first call)
    const assignVoiceAndSpeak = () => {
      const voices = getVoices(language)
      const v = pickVoice(voices, opts.gender)
      if (v) u.voice = v

      // Chrome bug: speech stops after ~15s without this
      clearInterval(_timer)
      _timer = setInterval(() => {
        if (!window.speechSynthesis.speaking) { clearInterval(_timer); return }
        window.speechSynthesis.pause(); window.speechSynthesis.resume()
      }, 10000)

      u.onend   = () => { clearInterval(_timer); resolve(true) }
      u.onerror = () => { clearInterval(_timer); resolve(false) }
      window.speechSynthesis.speak(u)
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      assignVoiceAndSpeak()
    } else {
      window.speechSynthesis.onvoiceschanged = assignVoiceAndSpeak
    }
  })
}
