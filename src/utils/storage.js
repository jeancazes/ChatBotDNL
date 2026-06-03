const SETTINGS_KEY = 'dnl_settings'
const SCENARIOS_KEY = 'dnl_scenarios'

export function getSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    return stored ? JSON.parse(stored) : { anthropicKey: '', openaiKey: '' }
  } catch { return { anthropicKey: '', openaiKey: '' } }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function getScenarios(defaults) {
  try {
    const stored = localStorage.getItem(SCENARIOS_KEY)
    if (stored) { const parsed = JSON.parse(stored); if (Array.isArray(parsed) && parsed.length > 0) return parsed }
  } catch {}
  return defaults
}

export function saveScenarios(scenarios) {
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios))
}

export function exportScenariosToFile(scenarios) {
  const json = JSON.stringify(scenarios, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scenarios-dnl-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importScenariosFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        if (!Array.isArray(data)) return reject(new Error('Le fichier doit contenir un tableau de scénarios.'))
        resolve(data)
      } catch { reject(new Error('Fichier JSON invalide.')) }
    }
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'))
    reader.readAsText(file)
  })
}
