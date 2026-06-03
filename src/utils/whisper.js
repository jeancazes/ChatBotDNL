const WHISPER_API = 'https://api.openai.com/v1/audio/transcriptions'

const LANG_CODES = { 'Français': 'fr', 'English': 'en', 'Español': 'es', 'Deutsch': 'de' }

export async function transcribeAudio(openaiKey, audioBlob, language) {
  const langCode = LANG_CODES[language] || 'fr'
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', 'whisper-1')
  formData.append('language', langCode)
  const res = await fetch(WHISPER_API, { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: formData })
  if (!res.ok) { let msg = `Erreur Whisper (${res.status})`; try { const err = await res.json(); msg = err.error?.message || msg } catch {}; throw new Error(msg) }
  const data = await res.json()
  return data.text || ''
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', ''].find((t) => !t || MediaRecorder.isTypeSupported(t)) || ''
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
  recorder.start(250)
  const stop = () => new Promise((resolve) => {
    recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })) }
    recorder.stop()
  })
  const cancel = () => { recorder.onstop = null; recorder.stop(); stream.getTracks().forEach((t) => t.stop()) }
  return { stop, cancel }
}

export async function checkMicrophoneAvailable() {
  try { const devices = await navigator.mediaDevices.enumerateDevices(); return devices.some((d) => d.kind === 'audioinput') }
  catch { return false }
}
