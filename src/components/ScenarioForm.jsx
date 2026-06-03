import { useState } from 'react'

const EMPTY = {
  title:'', description:'', interactionMode:'both', links:[], textResources:'',
  studentInstructions:'', objective:'', chatbotPersonality:'', languageStyle:'', openingPhrase:'',
  scoringCriteria:{ vocabularyList:[], vocabularyPoints:5, grammarStructure:'', grammarPoints:3, argumentAcceptedPoints:10, interventionPoints:1, languageQualityPoints:3, victoryPoints:50, secondaryObjectives:[] }
}

export default function ScenarioForm({ scenario, onSave, onCancel }) {
  const [form, setForm] = useState(() => scenario ? JSON.parse(JSON.stringify(scenario)) : JSON.parse(JSON.stringify(EMPTY)))

  const set = (path, value) => {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.'); let obj = next
      for (let i=0; i<keys.length-1; i++) obj = obj[keys[i]]
      obj[keys[keys.length-1]] = value
      return next
    })
  }

  const getVal = (path) => { const keys = path.split('.'); let obj = form; for (const k of keys) obj = obj[k]; return obj }
  const addItem = (path) => set(path, [...getVal(path), ''])
  const removeItem = (path, idx) => set(path, getVal(path).filter((_,i) => i !== idx))
  const updateItem = (path, idx, val) => { const arr=[...getVal(path)]; arr[idx]=val; set(path, arr) }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return alert('Le titre est obligatoire.')
    if (!form.openingPhrase.trim()) return alert('La première phrase est obligatoire.')
    onSave({ ...form, id: form.id || undefined })
  }

  const Section = ({ n, title, children }) => (
    <div className="form-section">
      <div className="form-section-title"><span className="form-section-number">{n}</span>{title}</div>
      {children}
    </div>
  )

  return (
    <form className="scenario-form" onSubmit={handleSubmit}>
      <h2>{scenario ? '✏️ Modifier le scénario' : '➕ Nouveau scénario'}</h2>

      <Section n="1" title="Informations générales">
        <div className="form-group"><label className="form-label">Titre *</label>
          <input className="form-input" value={form.title} onChange={(e)=>set('title',e.target.value)} placeholder="Ex : Le vaccinosceptique" required /></div>
        <div className="form-group"><label className="form-label">Description courte</label>
          <textarea className="form-textarea" value={form.description} onChange={(e)=>set('description',e.target.value)} rows={2} /></div>
        <div className="form-group"><label className="form-label">Mode d'interaction *</label>
          <div className="radio-group">
            {[{value:'written',label:'✍️ Écrit'},{value:'oral',label:'🎙️ Oral'},{value:'both',label:'✍️ + 🎙️ Les deux'}].map((opt)=>(
              <label className="radio-option" key={opt.value}>
                <input type="radio" name="mode" value={opt.value} checked={form.interactionMode===opt.value} onChange={()=>set('interactionMode',opt.value)} />{opt.label}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section n="2" title="Supports pédagogiques">
        <div className="form-group"><label className="form-label">Liens externes</label>
          {form.links.map((link,i)=>(<div className="list-item" key={i}>
            <input className="form-input" value={link} onChange={(e)=>updateItem('links',i,e.target.value)} placeholder="https://…" type="url" />
            <button type="button" className="btn-remove" onClick={()=>removeItem('links',i)}>×</button>
          </div>))}
          <button type="button" className="btn btn-outline btn-sm mt-2" onClick={()=>addItem('links')}>+ Ajouter un lien</button>
        </div>
        <div className="form-group"><label className="form-label">Ressources textuelles</label>
          <textarea className="form-textarea" value={form.textResources} onChange={(e)=>set('textResources',e.target.value)} rows={5} /></div>
      </Section>

      <Section n="3" title="Consigne pour les élèves">
        <div className="form-group"><label className="form-label">Consigne *</label>
          <textarea className="form-textarea" value={form.studentInstructions} onChange={(e)=>set('studentInstructions',e.target.value)} rows={3} required /></div>
        <div className="form-group"><label className="form-label">Objectif à atteindre *</label>
          <textarea className="form-textarea" value={form.objective} onChange={(e)=>set('objective',e.target.value)} rows={2} required /></div>
      </Section>

      <Section n="4" title="Configuration du chatbot">
        <div className="form-group"><label className="form-label">Personnalité du chatbot *</label>
          <textarea className="form-textarea" value={form.chatbotPersonality} onChange={(e)=>set('chatbotPersonality',e.target.value)} rows={4} required /></div>
        <div className="form-group"><label className="form-label">Style de langue</label>
          <textarea className="form-textarea" value={form.languageStyle} onChange={(e)=>set('languageStyle',e.target.value)} rows={2} /></div>
        <div className="form-group"><label className="form-label">Première phrase du chatbot *</label>
          <input className="form-input" value={form.openingPhrase} onChange={(e)=>set('openingPhrase',e.target.value)} required /></div>
      </Section>

      <Section n="5" title="Critères de notation">
        <div className="form-group"><label className="form-label">Mots de vocabulaire <span className="form-hint">— {form.scoringCriteria.vocabularyPoints} pts chacun</span></label>
          {form.scoringCriteria.vocabularyList.map((word,i)=>(<div className="list-item" key={i}>
            <input className="form-input" value={word} onChange={(e)=>updateItem('scoringCriteria.vocabularyList',i,e.target.value)} placeholder="Ex : immunity" />
            <button type="button" className="btn-remove" onClick={()=>removeItem('scoringCriteria.vocabularyList',i)}>×</button>
          </div>))}
          <button type="button" className="btn btn-outline btn-sm mt-2" onClick={()=>addItem('scoringCriteria.vocabularyList')}>+ Ajouter un mot</button>
        </div>
        <div className="form-group"><label className="form-label">Structure grammaticale <span className="form-hint">— {form.scoringCriteria.grammarPoints} pts</span></label>
          <input className="form-input" value={form.scoringCriteria.grammarStructure} onChange={(e)=>set('scoringCriteria.grammarStructure',e.target.value)} placeholder="Ex : Conditional sentences (if…then)" /></div>
        <div className="form-row">
          {[['Pts / argument accepté','scoringCriteria.argumentAcceptedPoints'],['Pts / intervention','scoringCriteria.interventionPoints'],['Pts / langue correcte','scoringCriteria.languageQualityPoints'],['Pts / mot vocab.','scoringCriteria.vocabularyPoints'],['Pts / structure gram.','scoringCriteria.grammarPoints'],['Bonus victoire','scoringCriteria.victoryPoints']].map(([label,path])=>(
            <div className="form-group" key={path}><label className="form-label" style={{fontSize:'var(--fz-xs)'}}>{label}</label>
              <input type="number" min={0} max={200} className="form-input" value={getVal(path)} onChange={(e)=>set(path,+e.target.value)} style={{textAlign:'center',fontWeight:700}} /></div>
          ))}
        </div>
        <div className="form-group mt-4"><label className="form-label">Objectifs secondaires</label>
          {form.scoringCriteria.secondaryObjectives.map((obj,i)=>(<div className="list-item" key={i}>
            <input className="form-input" value={obj} onChange={(e)=>updateItem('scoringCriteria.secondaryObjectives',i,e.target.value)} />
            <button type="button" className="btn-remove" onClick={()=>removeItem('scoringCriteria.secondaryObjectives',i)}>×</button>
          </div>))}
          <button type="button" className="btn btn-outline btn-sm mt-2" onClick={()=>addItem('scoringCriteria.secondaryObjectives')}>+ Ajouter</button>
        </div>
      </Section>

      <div className="form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary">{scenario ? '✅ Enregistrer' : '✅ Créer le scénario'}</button>
      </div>
    </form>
  )
}
