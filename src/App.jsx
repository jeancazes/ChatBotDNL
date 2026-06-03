import { useState } from 'react'
import { defaultScenarios } from './data/defaultScenarios'
import { getSettings, saveSettings, getScenarios, saveScenarios } from './utils/storage'
import Setup from './components/Setup'
import TeacherView from './components/TeacherView'
import ScenarioForm from './components/ScenarioForm'
import StudentView from './components/StudentView'
import GameView from './components/GameView'

export default function App() {
  const [view, setView] = useState('home')
  const [settings, setSettings] = useState(() => getSettings())
  const [scenarios, setScenarios] = useState(() => getScenarios(defaultScenarios))
  const [editingScenario, setEditingScenario] = useState(null)
  const [gameConfig, setGameConfig] = useState(null)

  const handleSaveSettings = (s) => { setSettings(s); saveSettings(s) }
  const handleSaveScenarios = (list) => { setScenarios(list); saveScenarios(list) }
  const handleEditScenario = (scenario) => { setEditingScenario(scenario); setView('teacher-form') }
  const handleSaveScenario = (scenario) => {
    const updated = editingScenario ? scenarios.map((s)=>(s.id===scenario.id?scenario:s)) : [...scenarios, {...scenario, id:`scenario-${Date.now()}`}]
    handleSaveScenarios(updated); setEditingScenario(null); setView('teacher')
  }
  const handleDeleteScenario = (id) => handleSaveScenarios(scenarios.filter((s)=>s.id!==id))
  const handleStartGame = (scenario, difficulty, language) => { setGameConfig({scenario,difficulty,language}); setView('game') }

  return (
    <div className="app-wrapper">
      {view !== 'game' && (
        <header className="navbar">
          <button className="navbar-brand" onClick={()=>setView('home')}>🎓 DNL Chatbot</button>
          <nav className="navbar-links">
            {view !== 'home' && <button className="btn-nav" onClick={()=>setView('home')}>← Accueil</button>}
            <button className="btn-nav btn-settings" onClick={()=>setView('setup')}>⚙️ Clés API</button>
          </nav>
        </header>
      )}

      <main className={`main-content${view==='game'?' full-height':''}`}>
        {view==='home' && <HomeScreen onNavigate={setView} settings={settings} />}
        {view==='setup' && <Setup settings={settings} onSave={handleSaveSettings} onBack={()=>setView('home')} />}
        {view==='teacher' && <TeacherView scenarios={scenarios} onEdit={handleEditScenario} onDelete={handleDeleteScenario} onNew={()=>{setEditingScenario(null);setView('teacher-form')}} onImport={handleSaveScenarios} />}
        {view==='teacher-form' && <ScenarioForm scenario={editingScenario} onSave={handleSaveScenario} onCancel={()=>setView('teacher')} />}
        {view==='student' && <StudentView scenarios={scenarios} settings={settings} onStart={handleStartGame} onSetup={()=>setView('setup')} />}
        {view==='game' && gameConfig && <GameView config={gameConfig} settings={settings} onEnd={()=>setView('student')} />}
      </main>
    </div>
  )
}

function HomeScreen({ onNavigate, settings }) {
  const hasKeys = settings.anthropicKey
  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hero-icon">🎓</div>
        <h1>Jeu avec Chatbot DNL</h1>
        <p className="home-subtitle">Application pédagogique pour les sections <strong>SELO / DNL</strong> (Anglais · Espagnol · Allemand)</p>
        <p className="home-desc">Débattez avec un chatbot intelligent, construisez des arguments, utilisez le bon vocabulaire et gagnez des points en temps réel.</p>
        {!hasKeys && <div className="home-warning">⚠️ Configurez vos clés API avant de commencer → <button className="link-btn" onClick={()=>onNavigate('setup')}>Paramètres</button></div>}
      </div>
      <div className="home-cards">
        <button className="home-card card-teacher" onClick={()=>onNavigate('teacher')}>
          <span className="card-icon">👩‍🏫</span>
          <h2>Espace Professeur</h2>
          <p>Créez et gérez des scénarios pédagogiques. Définissez le chatbot, les objectifs et les critères de notation.</p>
          <span className="card-cta">Gérer les scénarios →</span>
        </button>
        <button className="home-card card-student" onClick={()=>onNavigate('student')}>
          <span className="card-icon">🎯</span>
          <h2>Espace Élève</h2>
          <p>Choisissez un scénario, sélectionnez votre niveau et votre langue, puis lancez-vous dans le débat !</p>
          <span className="card-cta">Jouer maintenant →</span>
        </button>
      </div>
    </div>
  )
}
