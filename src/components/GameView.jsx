import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { buildSystemPrompt, sendMessage, calculateScore, getLocalizedOpening } from '../utils/claude'
import { transcribeAudio, startRecording, checkMicrophoneAvailable, initWhisper, isWhisperReady } from '../utils/whisper'
import { speak, speakStreaming, splitSentences, stopSpeaking, generateAudioBlob, playBlob, initKokoro, isKokoroReady } from '../utils/tts'

const DIFF_LABELS = ['','🌱','🌿','⚡','🔥','💎']
const TRANSCRIPTION_PENALTY = 5
// Probability of a bot message being voice-only, by difficulty level (index = difficulty)
const VOICE_ONLY_PROBA = [0, 0.50, 0.75, 1.0, 1.0, 1.0]

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
}
function formatDuration(s) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
}

// ── Waveform ──────────────────────────────────────────────────────────────────
function WaveformBars({ count = 32, playing = false }) {
  const bars = useMemo(() => Array.from({length:count}, (_,i) => 25 + ((Math.sin(i*0.8)+1)*30 + (Math.sin(i*1.7)+1)*15)), [count])
  return (
    <div className="wa-waveform">
      {bars.map((h,i) => (
        <div key={i} className={`wa-waveform-bar${playing ? ' wa-waveform-bar--playing' : ''}`}
          style={{height:`${h}%`, animationDelay: playing ? `${i * 30}ms` : '0ms'}} />
      ))}
    </div>
  )
}

// ── Audio player (user voice messages + bot voice-only) ───────────────────────
function AudioPlayer({ blob, transcription, autoPlay = false, onEnded }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef()
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  useEffect(() => { if (autoPlay && audioRef.current) { audioRef.current.play().catch(() => {}); setPlaying(true) } }, [autoPlay])

  const toggle = () => {
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }
  return (
    <div className="wa-audio-player">
      <audio ref={audioRef} src={url}
        onTimeUpdate={e => setProgress(e.target.currentTime / e.target.duration * 100)}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); onEnded?.() }} />
      <button className="wa-audio-btn" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
      <div className="wa-audio-track">
        <div className="wa-audio-progress" style={{width:`${progress}%`}} />
        <WaveformBars count={24} playing={playing} />
      </div>
      <span className="wa-audio-dur">{formatDuration(duration)}</span>
      {transcription && <div className="wa-audio-transcript">"{transcription}"</div>}
    </div>
  )
}

// ── AI models loading banner (Kokoro TTS + Whisper STT) ──────────────────────
function ModelsBanner({ kokoroPct, whisperPct }) {
  const items = [
    kokoroPct < 100 && { label: '🎤 Voix IA (Kokoro)',           pct: kokoroPct },
    whisperPct < 100 && { label: '👂 Transcription (Whisper)',   pct: whisperPct },
  ].filter(Boolean)
  if (!items.length) return null
  return (
    <div style={{background:'#f0fdf4',borderBottom:'1px solid #bbf7d0',padding:'4px 16px',display:'flex',flexDirection:'column',gap:4}}>
      {items.map(({ label, pct }) => (
        <div key={label} style={{display:'flex',alignItems:'center',gap:10,fontSize:'12px',color:'#166534'}}>
          <span style={{minWidth:200}}>{label}</span>
          <div style={{flex:1,height:5,background:'#dcfce7',borderRadius:3,overflow:'hidden'}}>
            <div style={{width:`${pct}%`,height:'100%',background:'#16a34a',transition:'width .3s'}} />
          </div>
          <span style={{minWidth:36,textAlign:'right'}}>{pct}%</span>
        </div>
      ))}
    </div>
  )
}

// ── Single chat message ───────────────────────────────────────────────────────
function WaMessage({ msg, msgIndex, autoTTS, onPlayTTS, onRevealTranscription, ttsPlaying, onAudioEnded }) {
  const { role, content, audioBlob, transcription, isVoiceOnly, transcriptionRevealed, feedback, timestamp } = msg
  if (role === 'system') return <div className="wa-system"><span>{content}</span></div>
  const isUser = role === 'user'

  return (
    <div className={`wa-row ${isUser ? 'wa-row-user' : 'wa-row-bot'}`}>
      {!isUser && <div className="wa-avatar">🎭</div>}
      <div className={`wa-bubble ${isUser ? 'wa-bubble-user' : 'wa-bubble-bot'}`}>

        {/* User voice message */}
        {isUser && audioBlob && <AudioPlayer blob={audioBlob} transcription={transcription} />}

        {/* User text */}
        {isUser && !audioBlob && <div className="wa-text">{content}</div>}

        {/* Bot voice-only message */}
        {!isUser && isVoiceOnly && audioBlob && (
          <div>
            <AudioPlayer blob={audioBlob} autoPlay={autoTTS} onEnded={onAudioEnded} />
            {!transcriptionRevealed
              ? <button className="wa-transcription-btn" onClick={() => onRevealTranscription(msgIndex)}>
                  📜 Voir la transcription <span className="wa-penalty">−{TRANSCRIPTION_PENALTY} pts</span>
                </button>
              : <div className="wa-revealed-text">
                  <em>{content}</em>
                  <span className="wa-revealed-label">📜 −{TRANSCRIPTION_PENALTY} pts</span>
                </div>
            }
          </div>
        )}

        {/* Bot text message */}
        {!isUser && !isVoiceOnly && (
          <div className="wa-text">{content}</div>
        )}

        <div className="wa-meta">
          <span className="wa-time">{formatTime(timestamp)}</span>
          {isUser && <span className="wa-tick">✓✓</span>}
          {!isUser && !isVoiceOnly && content && (
            <button className={`wa-tts-btn ${ttsPlaying ? 'active' : ''}`}
              onClick={() => onPlayTTS(content)} title="Écouter">
              {ttsPlaying ? '🔊' : '🔈'}
            </button>
          )}
        </div>
        {feedback && <div className="wa-feedback">💡 {feedback}</div>}
      </div>
    </div>
  )
}

// ── Main GameView ─────────────────────────────────────────────────────────────
export default function GameView({ config, settings, onEnd }) {
  const { scenario, difficulty, language } = config
  const criteria = scenario.scoringCriteria
  const ttsOpts  = scenario.ttsOptions || { rate:0.9, pitch:1.0, gender:undefined }

  const [messages, setMessages]         = useState([])
  const [apiHistory, setApiHistory]     = useState([])
  const [score, setScore]               = useState(0)
  const [usedWords, setUsedWords]       = useState(new Set())
  const [scoreLog, setScoreLog]         = useState([])
  const [inputText, setInputText]       = useState('')
  const [isThinking, setIsThinking]     = useState(false)
  const [isRecording, setIsRecording]   = useState(false)
  const [recorderRef, setRecorderRef]   = useState(null)
  const [gameOver, setGameOver]         = useState(false)
  const [toast, setToast]               = useState(null)
  const [error, setError]               = useState(null)
  const [micAvailable, setMicAvailable] = useState(false)
  const [turnCount, setTurnCount]       = useState(0)
  const [showResources, setShowResources] = useState(false)
  const [ttsPlayingId, setTtsPlayingId] = useState(null)
  const [autoTTS, setAutoTTS]           = useState(true)
  const [openingReady, setOpeningReady] = useState(false)
  const [kokoroPct, setKokoroPct]       = useState(isKokoroReady() ? 100 : 0)
  const [whisperPct, setWhisperPct]     = useState(isWhisperReady() ? 100 : 0)

  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)
  const systemPrompt   = useRef(buildSystemPrompt(scenario, difficulty, language))
  const toastTimer     = useRef(null)

  // Pre-warm AI models in background workers
  useEffect(() => {
    if (!isKokoroReady())   initKokoro((pct)   => setKokoroPct(pct))
    if (!isWhisperReady()) initWhisper((pct)  => setWhisperPct(pct))
  }, [])

  // Translate opening phrase & display first message
  useEffect(() => {
    let cancelled = false
    async function init() {
      checkMicrophoneAvailable().then(setMicAvailable)
      let opening = scenario.openingPhrase
      if (language !== 'Français' && settings.anthropicKey) {
        try { opening = await getLocalizedOpening(settings.anthropicKey, scenario.openingPhrase, language) }
        catch {}
      }
      if (cancelled) return
      setMessages([{ role:'assistant', content:opening, isVoiceOnly:false, timestamp:Date.now() }])
      setApiHistory([{ role:'assistant', content:opening }])
      setOpeningReady(true)
      setTimeout(() => speakStreaming(opening, language, ttsOpts, settings.openaiKey), 300)
    }
    init()
    return () => { cancelled = true; stopSpeaking() }
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, isThinking])

  const showToast = (text) => {
    clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  const handlePlayTTS = useCallback((text) => {
    const id = text.slice(0,20)
    if (ttsPlayingId === id) { stopSpeaking(); setTtsPlayingId(null); return }
    setTtsPlayingId(id)
    speakStreaming(text, language, ttsOpts, settings.openaiKey).then(() => setTtsPlayingId(null))
  }, [ttsPlayingId, language, ttsOpts, settings.openaiKey])

  const handleRevealTranscription = useCallback((msgIndex) => {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, transcriptionRevealed: true } : m))
    setScore(prev => Math.max(0, prev - TRANSCRIPTION_PENALTY))
    setScoreLog(prev => [...prev, { label: 'Transcription demandée', points: -TRANSCRIPTION_PENALTY, emoji: '📜' }])
    showToast(`−${TRANSCRIPTION_PENALTY} pts (transcription)`)
  }, [])

  const handleSend = useCallback(async (text, audioBlob = null, transcription = null) => {
    const trimmed = (text || '').trim()
    if (!trimmed || isThinking || gameOver) return
    if (!settings.anthropicKey) { setError("⚠️ Clé API Anthropic manquante. Allez dans Paramètres."); return }

    setInputText(''); setError(null); setIsThinking(true)
    const turn = turnCount + 1; setTurnCount(turn)

    const userMsg = { role:'user', content:trimmed, audioBlob, transcription, timestamp:Date.now() }
    setMessages(prev => [...prev, userMsg])
    const newHistory = [...apiHistory, { role:'user', content:trimmed }]

    try {
      const reply   = await sendMessage(settings.anthropicKey, systemPrompt.current, newHistory, trimmed)
      const botText = reply.message || '...'

      // Decide voice-only based on difficulty
      const canVoiceOnly = !!(settings.openaiKey || isKokoroReady())
      const makeVoiceOnly = canVoiceOnly && (Math.random() < (VOICE_ONLY_PROBA[difficulty] || 0))

      // Voice-only: generate only the FIRST sentence for fast display,
      // remaining sentences play via onAudioEnded callback in AudioPlayer.
      let voiceBlob = null
      let voiceRemaining = ''
      if (makeVoiceOnly) {
        const sentences = splitSentences(botText)
        voiceBlob = await generateAudioBlob(sentences[0], language, ttsOpts, settings.openaiKey)
        voiceRemaining = sentences.slice(1).join(' ')
      }

      const botMsg = {
        role: 'assistant',
        content: botText,
        isVoiceOnly: makeVoiceOnly && !!voiceBlob,
        audioBlob: voiceBlob,
        remainingText: voiceRemaining,
        transcriptionRevealed: false,
        feedback: reply.feedback,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, botMsg])
      setApiHistory([...newHistory, { role:'assistant', content:botText }])

      const { newScore, pointsThisTurn, updatedUsedWords, breakdown } = calculateScore(score, criteria, reply.scoring || {}, usedWords)
      setScore(newScore)
      setUsedWords(updatedUsedWords)
      if (breakdown.length) {
        setScoreLog(prev => [...prev, ...breakdown.map(b => ({...b, turn}))])
        if (pointsThisTurn > 0) showToast(`+${pointsThisTurn} pts !`)
      }

      // Audio: voice-only messages auto-play via AudioPlayer; text messages use speak()
      if (autoTTS && !botMsg.isVoiceOnly) {
        setTtsPlayingId(botText.slice(0,20))
        speakStreaming(botText, language, ttsOpts, settings.openaiKey).then(() => setTtsPlayingId(null))
      }

      if (reply.scoring?.objective_reached) setTimeout(() => setGameOver(true), 800)
    } catch (err) {
      setError(`❌ ${err.message}`)
      setMessages(prev => prev.slice(0,-1))
    } finally {
      setIsThinking(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [apiHistory, score, usedWords, isThinking, gameOver, settings, criteria, turnCount, autoTTS, language, ttsOpts, difficulty])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(inputText) }
  }

  const handleMicClick = async () => {
    // Browser Whisper works without OpenAI key
    if (isRecording) {
      try {
        const blob = await recorderRef.stop(); setIsRecording(false); setRecorderRef(null); setIsThinking(true)
        const text = await transcribeAudio(settings.openaiKey, blob, language); setIsThinking(false)
        if (text.trim()) {
          if (scenario.interactionMode === 'oral') handleSend(text, blob, text)
          else setInputText(text)
        } else setError('Transcription vide. Réessayez.')
      } catch (err) { setIsThinking(false); setIsRecording(false); setRecorderRef(null); setError(`❌ ${err.message}`) }
    } else {
      try { setError(null); const r = await startRecording(); setRecorderRef(r); setIsRecording(true) }
      catch (err) { setError(`❌ Microphone : ${err.message}`) }
    }
  }

  const canUseOral = (scenario.interactionMode==='oral'||scenario.interactionMode==='both') && micAvailable
  const vocabList  = criteria.vocabularyList || []

  return (
    <div className="game-wrapper">
      {/* ── Top bar ── */}
      <div className="wa-header">
        <div className="wa-header-left">
          <div className="wa-header-avatar">🎭</div>
          <div>
            <div className="wa-header-name">{scenario.title}</div>
            <div className="wa-header-sub">{language} · {DIFF_LABELS[difficulty]} Niv.{difficulty} · Tour {turnCount}</div>
          </div>
        </div>
        <div className="wa-header-right">
          <div className="score-pill-fixed">
            <span className="score-pill-label">SCORE</span>
            <span className="score-pill-value">{score}</span>
          </div>
          <button className={`wa-icon-btn ${autoTTS?'active':''}`}
            onClick={() => { setAutoTTS(!autoTTS); if(autoTTS) stopSpeaking() }}
            title={autoTTS ? "Couper l'audio" : "Activer l'audio"}>
            {autoTTS ? '🔊' : '🔇'}
          </button>
          <button className="wa-icon-btn" onClick={() => setShowResources(!showResources)} title="Ressources">📚</button>
          <button className="wa-icon-btn" onClick={() => { stopSpeaking(); onEnd() }} title="Quitter">✕</button>
        </div>
      </div>

      {/* ── AI models loading banner ── */}
      <ModelsBanner kokoroPct={kokoroPct} whisperPct={whisperPct} />

      {/* ── Resources overlay ── */}
      {showResources && (
        <div className="modal-overlay" onClick={() => setShowResources(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:600,maxHeight:'80vh',overflow:'auto'}}>
            <h3>📚 Ressources</h3>
            <p className="modal-subtitle">{scenario.studentInstructions}</p>
            {scenario.links?.length > 0 && <div style={{marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:'var(--fz-sm)',marginBottom:8}}>Liens :</div>
              {scenario.links.map((link,i) => <a key={i} href={link} target="_blank" rel="noreferrer" className="resource-link" style={{marginBottom:6,display:'flex'}}>🔗 {link}</a>)}
            </div>}
            {scenario.textResources && <div>
              <div style={{fontWeight:700,fontSize:'var(--fz-sm)',marginBottom:8}}>Documents :</div>
              <pre className="resources-text">{scenario.textResources}</pre>
            </div>}
            <button className="btn btn-outline btn-full" style={{marginTop:16}} onClick={() => setShowResources(false)}>Fermer</button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="game-body">
        {/* ── Side panel ── */}
        <div className="game-side-panel">
          <div className="side-panel-section">
            <div className="side-panel-title">🎯 Objectif</div>
            <div style={{fontSize:'var(--fz-xs)',color:'var(--c-text)',lineHeight:1.5}}>{scenario.objective}</div>
          </div>
          <div className="side-panel-section">
            <div className="side-panel-title">🏆 Score : {score} pts</div>
            <div className="score-log">
              {scoreLog.slice(-8).reverse().map((item,i) => (
                <div className="score-log-item" key={i}
                  style={{color: item.points < 0 ? '#ef4444' : 'inherit'}}>
                  <span>{item.emoji} {item.label}</span>
                  <span className="pts">{item.points > 0 ? '+' : ''}{item.points}</span>
                </div>
              ))}
              {scoreLog.length === 0 && <div style={{fontSize:'var(--fz-xs)',color:'var(--c-text-muted)'}}>Les points s'afficheront ici…</div>}
            </div>
          </div>
          {vocabList.length > 0 && <div className="side-panel-section">
            <div className="side-panel-title">📚 Vocabulaire ({usedWords.size}/{vocabList.length})</div>
            <div className="vocab-list">
              {vocabList.map(word => { const used = usedWords.has(word.toLowerCase()); return (
                <div key={word} className={`vocab-item ${used?'used':'unused'}`}><span className="vocab-check">{used?'✅':'⬜'}</span>{word}</div>
              )})}
            </div>
          </div>}
          {criteria.grammarStructure && <div className="side-panel-section">
            <div className="side-panel-title">📝 Grammaire</div>
            <div style={{fontSize:'var(--fz-xs)'}}>{criteria.grammarStructure}</div>
          </div>}
          <div className="side-panel-section">
            <div className="side-panel-title">🎯 Barème</div>
            <div style={{fontSize:'var(--fz-xs)',display:'flex',flexDirection:'column',gap:4}}>
              {[['📚','Vocab.',criteria.vocabularyPoints],['✅','Argument',criteria.argumentAcceptedPoints],['🗣️','Langue',criteria.languageQualityPoints],['📝','Gram.',criteria.grammarPoints],['💬','Intervention',criteria.interventionPoints],['🏆','Victoire',criteria.victoryPoints]].map(([e,l,p]) => (
                <div key={l} style={{display:'flex',justifyContent:'space-between',color:l==='Victoire'?'var(--c-gold)':'inherit',fontWeight:l==='Victoire'?700:400}}>
                  <span>{e} {l}</span><span style={{fontWeight:700}}>+{p}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',color:'#ef4444',marginTop:2,borderTop:'1px solid #fee2e2',paddingTop:4}}>
                <span>📜 Transcription</span><span style={{fontWeight:700}}>−{TRANSCRIPTION_PENALTY}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Chat area ── */}
        <div className="chat-area">
          <div className="wa-chat-bg">
            <div className="chat-messages" id="chat-messages">
              <div className="wa-system"><span>🎯 {scenario.objective}</span></div>
              {!openingReady && (
                <div className="wa-row wa-row-bot">
                  <div className="wa-avatar">🎭</div>
                  <div className="wa-bubble wa-bubble-bot">
                    <div className="typing-indicator"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <WaMessage key={i} msg={msg} msgIndex={i}
                  autoTTS={autoTTS}
                  onPlayTTS={handlePlayTTS}
                  onRevealTranscription={handleRevealTranscription}
                  ttsPlaying={ttsPlayingId === msg.content?.slice(0,20)}
                  onAudioEnded={msg.remainingText
                    ? () => speakStreaming(msg.remainingText, language, ttsOpts, settings.openaiKey)
                    : undefined} />
              ))}
              {isThinking && (
                <div className="wa-row wa-row-bot">
                  <div className="wa-avatar">🎭</div>
                  <div className="wa-bubble wa-bubble-bot">
                    <div className="typing-indicator"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {error && (
            <div style={{padding:'8px 16px',background:'#fef2f2',borderTop:'1px solid #fca5a5',fontSize:'var(--fz-sm)',color:'#b91c1c',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              {error}<button onClick={() => setError(null)} style={{color:'#b91c1c',fontWeight:700}}>×</button>
            </div>
          )}

          <div className="wa-input-bar">
            {canUseOral && (
              <button className={`wa-input-btn ${isRecording?'recording':''}`}
                onClick={handleMicClick} disabled={isThinking||gameOver||!openingReady}
                title={isRecording?'Arrêter':'Enregistrer'}>
                {isRecording ? '⏹️' : '🎙️'}
              </button>
            )}
            <textarea ref={textareaRef} className="wa-input-textarea"
              value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={!openingReady ? '⏳ Traduction en cours…' : isRecording ? '🔴 Enregistrement…' : gameOver ? 'Jeu terminé !' : `Message en ${language}… (Entrée pour envoyer)`}
              disabled={isThinking||isRecording||gameOver||!openingReady} rows={1} />
            <button className="wa-send-btn" onClick={() => handleSend(inputText)}
              disabled={!inputText.trim()||isThinking||isRecording||gameOver||!openingReady}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"/></svg>
            </button>
          </div>
        </div>
      </div>

      {toast && <div className="score-toast">{toast}</div>}

      {gameOver && (
        <div className="game-over">
          <div className="game-over-card">
            <div className="game-over-icon">🏆</div>
            <h2>Bravo !</h2>
            <div className="score-big">{score}</div>
            <p>Objectif atteint en <strong>{turnCount}</strong> intervention{turnCount>1?'s':''} !<br/>Vocabulaire : <strong>{usedWords.size}/{vocabList.length}</strong> mots utilisés</p>
            <button className="btn btn-green btn-lg btn-full" onClick={() => { stopSpeaking(); onEnd() }}>🎯 Rejouer</button>
          </div>
        </div>
      )}
    </div>
  )
}
