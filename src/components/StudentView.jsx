import { useState } from 'react'

const MODE_LABELS = { written: '✍️ Écrit', oral: '🎙️ Oral', both: '✍️ + 🎙️ Les deux' }

const DIFFICULTY_INFO = [
  { level:1, emoji:'🌱', label:'Très facile', desc:'Phrases courtes, vocabulaire simple' },
  { level:2, emoji:'🌿', label:'Facile', desc:'Phrases simples, légère résistance' },
  { level:3, emoji:'⚡', label:'Intermédiaire', desc:'Niveau conversationnel normal' },
  { level:4, emoji:'🔥', label:'Difficile', desc:'Arguments précis et données chiffrées requis' },
  { level:5, emoji:'💎', label:'Expert', desc:'Langue académique, très difficile à convaincre' },
]

const LANGUAGES = [
  { code:'English', label:'English', flag:'🇬🇧' },
  { code:'Français', label:'Français', flag:'🇫🇷' },
  { code:'Español', label:'Español', flag:'🇪🇸' },
  { code:'Deutsch', label:'Deutsch', flag:'🇩🇪' },
]

export default function StudentView({ scenarios, settings, onStart, onSetup }) {
  const [selected, setSelected] = useState(null)
  const [step, setStep] = useState('pick')
  const [difficulty, setDifficulty] = useState(null)
  const [language, setLanguage] = useState(null)

  const hasKey = !!settings.anthropicKey

  const handleSelectScenario = (s) => { setSelected(s); setDifficulty(null); setLanguage(null); setStep('difficulty') }

  return (
    <div className="student-view">
      <div className="student-header">
        <h2>🎯 Choisissez votre scénario</h2>
        <p>Sélectionnez un défi, choisissez votre niveau et la langue, puis lancez le jeu !</p>
      </div>

      {!hasKey && (
        <div className="home-warning" style={{ marginBottom:24, display:'block' }}>
          ⚠️ Configurez votre clé API avant de jouer. <button className="link-btn" onClick={onSetup}>Configurer →</button>
        </div>
      )}

      {scenarios.map((s) => (
        <button key={s.id} className="student-scenario-card" onClick={() => handleSelectScenario(s)} disabled={!hasKey}>
          <div className="scenario-card-header">
            <div>
              <div className="scenario-title">{s.title}</div>
              <div className="scenario-desc">{s.description}</div>
            </div>
            <span className="badge badge-mode">{MODE_LABELS[s.interactionMode] || s.interactionMode}</span>
          </div>
          <div style={{ marginTop:10, fontStyle:'italic', fontSize:'var(--fz-sm)', color:'var(--c-text-muted)', borderLeft:'3px solid var(--c-border)', paddingLeft:12 }}>
            « {s.openingPhrase} »
          </div>
          {s.scoringCriteria?.vocabularyList?.length > 0 && (
            <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }}>
              {s.scoringCriteria.vocabularyList.slice(0,6).map((w) => <span key={w} className="badge badge-vocab">{w}</span>)}
              {s.scoringCriteria.vocabularyList.length > 6 && <span className="badge badge-vocab">+{s.scoringCriteria.vocabularyList.length - 6}</span>}
            </div>
          )}
        </button>
      ))}

      {step !== 'pick' && selected && (
        <div className="modal-overlay" onClick={() => setStep('pick')}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{selected.title}</h3>
            <p className="modal-subtitle">{selected.description}</p>

            {step === 'difficulty' && (<>
              <div style={{ fontWeight:700, marginBottom:12, fontSize:'var(--fz-sm)' }}>1 / 2 — Niveau de difficulté :</div>
              <div className="difficulty-grid">
                {DIFFICULTY_INFO.map((d) => (
                  <button key={d.level} className={`diff-btn ${difficulty === d.level ? 'selected' : ''}`}
                    onClick={() => setDifficulty(d.level)} title={d.desc}>
                    {d.emoji}<span style={{ fontSize:18, fontWeight:800 }}>{d.level}</span><span>{d.label}</span>
                  </button>
                ))}
              </div>
              {difficulty && <div style={{ background:'var(--c-student-light)', border:'1px solid var(--c-student)', borderRadius:'var(--r-md)', padding:'10px 14px', fontSize:'var(--fz-sm)', color:'var(--c-student-hover)', marginBottom:16 }}>
                {DIFFICULTY_INFO[difficulty-1].emoji} <strong>{DIFFICULTY_INFO[difficulty-1].label}</strong> — {DIFFICULTY_INFO[difficulty-1].desc}
              </div>}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setStep('pick')}>Annuler</button>
                <button className="btn btn-green" disabled={!difficulty} onClick={() => setStep('language')}>Suivant →</button>
              </div>
            </>)}

            {step === 'language' && (<>
              <div style={{ fontWeight:700, marginBottom:12, fontSize:'var(--fz-sm)' }}>2 / 2 — Langue des échanges :</div>
              <div className="lang-grid">
                {LANGUAGES.map((l) => (
                  <button key={l.code} className={`lang-btn ${language === l.code ? 'selected' : ''}`} onClick={() => setLanguage(l.code)}>
                    <span className="lang-flag">{l.flag}</span>{l.label}
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setStep('difficulty')}>← Retour</button>
                <button className="btn btn-green btn-lg" disabled={!language} onClick={() => onStart(selected, difficulty, language)}>🚀 Lancer le jeu !</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}
