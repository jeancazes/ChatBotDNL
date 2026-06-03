import { useRef } from 'react'
import { exportScenariosToFile, importScenariosFromFile } from '../utils/storage'

const MODE_LABELS = { written: '✍️ Écrit', oral: '🎙️ Oral', both: '✍️ + 🎙️ Les deux' }

export default function TeacherView({ scenarios, onEdit, onDelete, onNew, onImport }) {
  const fileInputRef = useRef()

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try { const data = await importScenariosFromFile(file); onImport(data); alert(`✅ ${data.length} scénario(s) importé(s).`) }
    catch (err) { alert(`❌ ${err.message}`) }
    e.target.value = ''
  }

  return (
    <div className="teacher-view">
      <div className="section-header">
        <div className="section-title-group">
          <h2>👩‍🏫 Espace Professeur</h2>
          <span className="section-subtitle">{scenarios.length} scénario{scenarios.length > 1 ? 's' : ''}</span>
        </div>
        <div className="teacher-toolbar">
          <button className="btn btn-primary" onClick={onNew}>+ Nouveau scénario</button>
          <button className="btn btn-outline" onClick={() => exportScenariosToFile(scenarios)}>↓ Exporter JSON</button>
          <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>↑ Importer JSON</button>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </div>

      {scenarios.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <p>Aucun scénario pour le moment.</p>
          <button className="btn btn-primary mt-4" onClick={onNew}>Créer le premier scénario</button>
        </div>
      ) : scenarios.map((s) => (
        <div key={s.id} className="scenario-card">
          <div className="scenario-card-header">
            <div>
              <div className="scenario-title">{s.title}</div>
              <div className="scenario-desc">{s.description}</div>
              <div className="scenario-meta">
                <span className="badge badge-mode">{MODE_LABELS[s.interactionMode] || s.interactionMode}</span>
                <span className="badge badge-vocab">📚 {(s.scoringCriteria?.vocabularyList || []).length} mots</span>
              </div>
            </div>
            <div className="scenario-actions">
              <button className="btn btn-outline btn-sm" onClick={() => onEdit(s)}>✏️ Modifier</button>
              <button className="btn btn-danger btn-sm" onClick={() => { if(confirm(`Supprimer « ${s.title} » ?`)) onDelete(s.id) }}>🗑️</button>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--c-border)' }}>
            <details>
              <summary style={{ cursor:'pointer', fontSize:'var(--fz-sm)', color:'var(--c-text-muted)', fontWeight:600 }}>Voir les détails</summary>
              <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[['🎯 Objectif', s.objective], ['🤖 Chatbot', s.chatbotPersonality], ['💬 Ouverture', `"${s.openingPhrase}"`]].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize:'var(--fz-xs)', fontWeight:700, color:'var(--c-text-muted)', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:'var(--fz-sm)' }}>{value}</div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      ))}
    </div>
  )
}
