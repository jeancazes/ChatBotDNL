import { useState } from 'react'

export default function Setup({ settings, onSave, onBack }) {
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicKey || '')
  const [openaiKey, setOpenaiKey] = useState(settings.openaiKey || '')
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [showOpenai, setShowOpenai] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave({ anthropicKey: anthropicKey.trim(), openaiKey: openaiKey.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="setup-page">
      <h2>⚙️ Configuration des clés API</h2>
      <p className="subtitle">Les clés sont stockées uniquement dans votre navigateur.</p>

      <div className="form-group">
        <label className="form-label">Clé API Anthropic (Claude) <span className="form-hint">— obligatoire</span></label>
        <div className="api-key-field">
          <input type={showAnthropic ? 'text' : 'password'} className="form-input" value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-api03-…" autoComplete="off" spellCheck={false} />
          <button className="btn-eye" type="button" onClick={() => setShowAnthropic(!showAnthropic)}>{showAnthropic ? '🙈' : '👁️'}</button>
        </div>
        <div className="setup-note">Obtenez votre clé sur <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>. Modèle : <strong>claude-sonnet-4-6</strong>.</div>
      </div>

      <div className="form-group">
        <label className="form-label">Clé API OpenAI (Whisper) <span className="form-hint">— mode oral uniquement</span></label>
        <div className="api-key-field">
          <input type={showOpenai ? 'text' : 'password'} className="form-input" value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-proj-…" autoComplete="off" spellCheck={false} />
          <button className="btn-eye" type="button" onClick={() => setShowOpenai(!showOpenai)}>{showOpenai ? '🙈' : '👁️'}</button>
        </div>
        <div className="setup-note">Obtenez votre clé sur <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com</a>.</div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button className="btn btn-primary" onClick={handleSave}>{saved ? '✅ Enregistré !' : '💾 Enregistrer'}</button>
        <button className="btn btn-outline" onClick={onBack}>Retour</button>
      </div>
    </div>
  )
}
