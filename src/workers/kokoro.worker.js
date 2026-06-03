// Kokoro TTS — runs in a Web Worker to keep the main thread unblocked
import { KokoroTTS } from 'kokoro-js'

let tts = null

self.onmessage = async ({ data }) => {
  const { type, id } = data

  if (type === 'init') {
    try {
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (info) => {
          if (info.status === 'progress' && info.total) {
            self.postMessage({ type: 'progress', pct: Math.round(info.loaded / info.total * 100) })
          }
        },
      })
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message })
    }
    return
  }

  if (type === 'generate') {
    try {
      if (!tts) throw new Error('Kokoro not loaded')
      const audio = await tts.generate(data.text, { voice: data.voice, speed: data.speed ?? 1.0 })
      // audio.toBlob() → WAV Blob (audio.audio = Float32Array, audio.sampling_rate = 24000)
      const blob = audio.toBlob()
      self.postMessage({ type: 'generated', id, blob })
    } catch (err) {
      self.postMessage({ type: 'gen_error', id, message: err.message })
    }
  }
}
