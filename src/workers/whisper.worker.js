// Whisper ASR — runs in a Web Worker to keep the main thread unblocked
// Model: onnx-community/whisper-base (~145 MB, cached after first load)
// For lighter/faster option use 'onnx-community/whisper-tiny' (~75 MB)
import { pipeline } from '@huggingface/transformers'

let transcriber = null

self.onmessage = async ({ data }) => {
  const { type, id } = data

  if (type === 'init') {
    try {
      transcriber = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-base',
        {
          dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
          device: 'wasm',
          progress_callback: (info) => {
            if (info.status === 'progress' && info.total) {
              self.postMessage({ type: 'progress', pct: Math.round(info.loaded / info.total * 100) })
            }
          },
        }
      )
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message })
    }
    return
  }

  if (type === 'transcribe') {
    try {
      if (!transcriber) throw new Error('Whisper not loaded')
      const float32 = new Float32Array(data.audioBuffer)
      const result  = await transcriber(float32, {
        language: data.language,
        task: 'transcribe',
        return_timestamps: false,
      })
      self.postMessage({ type: 'transcribed', id, text: (result.text || '').trim() })
    } catch (err) {
      self.postMessage({ type: 'trans_error', id, message: err.message })
    }
  }
}
