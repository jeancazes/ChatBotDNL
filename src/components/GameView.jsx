import { useState, useEffect, useRef, useCallback } from 'react'
import { buildSystemPrompt, sendMessage, calculateScore } from '../utils/claude'
import { transcribeAudio, startRecording, checkMicrophoneAvailable } from '../utils/whisper'

const DIFF_LABELS = ['','🌱 Très facile','🌿 Facile','⚡ Intermédiaire','🔥 Difficile','💎 Expert']

export default function GameView({ config, settings, onEnd }) {
  const { scenario, difficulty, language } = config
  const criteria = scenario.scoringCriteria

  const [messages, setMessages] = useState([])
  const [apiHistory, setApiHistory] = useState([])
  const [score, setScore] = useState(0)
  const [usedWords, setUsedWords] = useState(new Set())
  const [scoreLog, setScoreLog] = useState([])
  const [inputText, setInputText] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recorderRef, setRecorderRef] = useState(null)
  const [gameOver, setGameOver] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [micAvailable, setMicAvailable] = useState(false)
  const [turnCount, setTurnCount] = useState(0)
  const [showResources, setShowResources] = useState(false)

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const systemPrompt = useRef(buildSystemPrompt(scenario, difficulty, language))
  const toastTimer = useRef(null)

  useEffect(() => {
    const opening = scenario.openingPhrase
    setMessages([{ role:'assistant', content:opening }])
    setApiHistory([{ role:'assistant', content:opening }])
    checkMicrophoneAvailable().then(setMicAvailable)
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, isThinking])

  const showToast = (text) => { clearTimeout(toastTimer.current); setToast(text); toastTimer.current = setTimeout(()=>setToast(null), 2200) }

  const handleSend = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || isThinking || gameOver) return
    if (!settings.anthropicKey) { setError("⚠️ Clé API Anthropic manquante. Allez dans Paramètres."); return }

    setInputText(''); setError(null); setIsThinking(true); setTurnCount((n)=>n+1)
    const userMsg = { role:'user', content:trimmed }
    setMessages((prev)=>[...prev, { role:'user', content:trimmed }])

    try {
      const result = await sendMessage(settings.anthropicKey, systemPrompt.current, apiHistory, trimmed)
      const botMsg = result.message || '...'
      const scoring = result.scoring || {}
      const feedback = result.feedback || ''
      const { newScore, pointsThisTurn, updatedUsedWords, breakdown } = calculateScore(score, criteria, scoring, usedWords)
      setScore(newScore); setUsedWords(updatedUsedWords)
      setApiHistory((prev)=>[...prev, userMsg, { role:'assistant', content:botMsg }])
      setMessages((prev)=>[...prev, { role:'assistant', content:botMsg, scoring, feedback }])
      if (breakdown.length > 0) { setScoreLog((prev)=>[...prev, ...breakdown.map((b)=>({...b, turn:turnCount+1}))]); if (pointsThisTurn>0) showToast(`+${pointsThisTurn} pts !`) }
      if (scoring.objective_reached) setTimeout(()=>setGameOver(true), 800)
    } catch (err) { setError(`❌ ${err.message}`); setMessages((prev)=>prev.slice(0,-1)) }
    finally { setIsThinking(false); setTimeout(()=>textareaRef.current?.focus(), 100) }
  }, [apiHistory, score, usedWords, isThinking, gameOver, settings, criteria, turnCount])

  const handleKeyDown = (e) => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(inputText) } }

  const handleMicClick = async () => {
    if (!settings.openaiKey) { setError("⚠️ Clé API OpenAI manquante pour le mode oral."); return }
    if (isRecording) {
      try {
        const blob = await recorderRef.stop(); setIsRecording(false); setRecorderRef(null); setIsThinking(true)
        const text = await transcribeAudio(settings.openaiKey, blob, language); setIsThinking(false)
        if (text.trim()) { setInputText(text); if (scenario.interactionMode==='oral') handleSend(text) }
        else setError('Transcription vide. Réessayez.')
      } catch (err) { setIsThinking(false); setIsRecording(false); setRecorderRef(null); setError(`❌ ${err.message}`) }
    } else {
      try { setError(null); const recorder = await startRecording(); setRecorderRef(recorder); setIsRecording(true) }
      catch (err) { setError(`❌ Microphone inaccessible : ${err.message}`) }
    }
  }

  const canUseOral = (scenario.interactionMode==='oral'||scenario.interactionMode==='both') && micAvailable
  const vocabList = criteria.vocabularyList || []

  return (
    <div className="game-wrapper">
      <div className="game-topbar">
        <div>
          <div className="game-topbar-title">{scenario.title}</div>
          <div className="game-topbar-meta">{language} · {DIFF_LABELS[difficulty]} · Tour {turnCount}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="btn btn-outline btn-sm" onClick={()=>setShowResources(!showResources)}>📚 Ressources</button>
          <div className="score-pill"><span className="score-pill-label">SCORE</span><span>{score}</span></div>
          <button className="btn btn-outline btn-sm" onClick={onEnd}>✕ Quitter</button>
        </div>
      </div>

      {showResources && (
        <div className="modal-overlay" onClick={()=>setShowResources(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth:600, maxHeight:'80vh', overflow:'auto' }}>
            <h3>📚 Ressources</h3>
            <p className="modal-subtitle">{scenario.studentInstructions}</p>
            {scenario.links?.length>0 && <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:'var(--fz-sm)', marginBottom:8 }}>Liens :</div>
              {scenario.links.map((link,i)=>(<a key={i} href={link} target="_blank" rel="noreferrer" className="resource-link" style={{ marginBottom:6, display:'flex' }}>🔗 {link}</a>))}
            </div>}
            {scenario.textResources && <div>
              <div style={{ fontWeight:700, fontSize:'var(--fz-sm)', marginBottom:8 }}>Documents :</div>
              <pre className="resources-text">{scenario.textResources}</pre>
            </div>}
            <button className="btn btn-outline btn-full" style={{ marginTop:16 }} onClick={()=>setShowResources(false)}>Fermer</button>
          </div>
        </div>
      )}

      <div className="game-body">
        <div className="chat-area">
          <div className="chat-messages">
            <div className="message system"><div className="message-bubble">🎯 <strong>Objectif :</strong> {scenario.objective}</div></div>
            {messages.map((msg,i)=>(
              <div key={i} className={`message ${msg.role}`}>
                {msg.role!=='system' && <div className="message-avatar">{msg.role==='user'?'👤':'🎭'}</div>}
                <div>
                  <div className="message-bubble">{msg.content}</div>
                  {msg.feedback && msg.role==='assistant' && <div style={{ marginTop:4, fontSize:'var(--fz-xs)', color:'var(--c-text-muted)', fontStyle:'italic', paddingLeft:4 }}>💡 {msg.feedback}</div>}
                </div>
              </div>
            ))}
            {isThinking && <div className="message assistant"><div className="message-avatar">🎭</div><div className="typing-indicator"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div></div>}
            <div ref={messagesEndRef} />
          </div>

          {error && <div style={{ padding:'8px 16px', background:'#fef2f2', borderTop:'1px solid #fca5a5', fontSize:'var(--fz-sm)', color:'#b91c1c', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            {error}<button onClick={()=>setError(null)} style={{ color:'#b91c1c', fontWeight:700 }}>×</button>
          </div>}

          <div className="chat-input-area">
            {canUseOral && <button className={`btn-mic ${isRecording?'recording':''}`} onClick={handleMicClick} disabled={isThinking||gameOver} title={isRecording?"Arrêter":"Parler"}>{isRecording?'⏹️':'🎙️'}</button>}
            <textarea ref={textareaRef} className="chat-textarea" value={inputText} onChange={(e)=>setInputText(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={isRecording?'🔴 Enregistrement… cliquez ⏹️ pour terminer':gameOver?'Jeu terminé !':`Écrivez en ${language}… (Entrée pour envoyer)`}
              disabled={isThinking||isRecording||gameOver} rows={1} />
            <button className="btn-send" onClick={()=>handleSend(inputText)} disabled={!inputText.trim()||isThinking||isRecording||gameOver}>➤</button>
          </div>
        </div>

        <div className="game-side-panel">
          <div className="side-panel-section">
            <div className="side-panel-title">🏆 Score : {score} pts</div>
            <div className="score-log">
              {scoreLog.slice(-8).reverse().map((item,i)=>(<div className="score-log-item" key={i}><span>{item.emoji} {item.label}</span><span className="pts">+{item.points}</span></div>))}
              {scoreLog.length===0 && <div style={{ fontSize:'var(--fz-xs)', color:'var(--c-text-muted)' }}>Les points s'afficheront ici…</div>}
            </div>
          </div>

          {vocabList.length>0 && <div className="side-panel-section">
            <div className="side-panel-title">📚 Vocabulaire ({usedWords.size}/{vocabList.length})</div>
            <div className="vocab-list">
              {vocabList.map((word)=>{ const used=usedWords.has(word.toLowerCase()); return (
                <div key={word} className={`vocab-item ${used?'used':'unused'}`}><span className="vocab-check">{used?'✅':'⬜'}</span>{word}</div>
              )})}
            </div>
          </div>}

          {criteria.grammarStructure && <div className="side-panel-section">
            <div className="side-panel-title">📝 Structure grammaticale</div>
            <div style={{ fontSize:'var(--fz-xs)' }}>{criteria.grammarStructure}</div>
          </div>}

          <div className="side-panel-section">
            <div className="side-panel-title">🎯 Barème</div>
            <div style={{ fontSize:'var(--fz-xs)', display:'flex', flexDirection:'column', gap:4 }}>
              {[['📚','Mot de vocab.',criteria.vocabularyPoints],['✅','Bon argument',criteria.argumentAcceptedPoints],['🗣️','Langue correcte',criteria.languageQualityPoints],['📝','Structure gram.',criteria.grammarPoints],['💬','Intervention',criteria.interventionPoints],['🏆','Objectif atteint !',criteria.victoryPoints]].map(([emoji,label,pts])=>(
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'2px 0', fontWeight:label==='Objectif atteint !'?700:400, color:label==='Objectif atteint !'?'var(--c-gold)':'var(--c-text)' }}>
                  <span>{emoji} {label}</span><span style={{ fontWeight:700 }}>+{pts}</span>
                </div>
              ))}
            </div>
          </div>

          {(scenario.links?.length>0||scenario.textResources) && <div className="side-panel-section">
            <div className="side-panel-title">📎 Ressources</div>
            <div className="resources-links">
              {scenario.links?.map((link,i)=>(<a key={i} href={link} target="_blank" rel="noreferrer" className="resource-link">🔗 {(() => { try { return new URL(link).hostname } catch { return link } })()}</a>))}
              {scenario.textResources && <button className="resource-link" style={{ border:'none', cursor:'pointer', width:'100%', textAlign:'left' }} onClick={()=>setShowResources(true)}>📄 Voir les documents</button>}
            </div>
          </div>}
        </div>
      </div>

      {toast && <div className="score-toast">{toast}</div>}

      {gameOver && <div className="game-over"><div className="game-over-card">
        <div className="game-over-icon">🏆</div>
        <h2>Bravo !</h2>
        <div className="score-big">{score}</div>
        <p>Objectif atteint en <strong>{turnCount}</strong> intervention{turnCount>1?'s':''} !<br/>Vocabulaire utilisé : <strong>{usedWords.size}/{vocabList.length}</strong></p>
        <button className="btn btn-green btn-lg btn-full" onClick={onEnd}>🎯 Rejouer</button>
      </div></div>}
    </div>
  )
}
