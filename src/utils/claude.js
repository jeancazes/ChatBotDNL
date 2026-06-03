const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

const DIFFICULTY_DESCRIPTIONS = {
  1: "DIFFICULTY 1 – VERY EASY: Use very short, simple sentences (max 2 per turn). Be very easy to convince. Respond slowly and simply.",
  2: "DIFFICULTY 2 – EASY: Use simple sentences. Accept arguments after mild resistance.",
  3: "DIFFICULTY 3 – INTERMEDIATE: Use normal conversational complexity. Require reasonable, well-structured arguments.",
  4: "DIFFICULTY 4 – HARD: Use complex sentences. Require strong, detailed arguments backed by facts or data.",
  5: "DIFFICULTY 5 – VERY HARD: Use academic/scientific language. Be very difficult to convince. Require rigorous, evidence-based arguments with statistics.",
}

export function buildSystemPrompt(scenario, difficulty, language) {
  const vocab = scenario.scoringCriteria.vocabularyList.join(', ')
  const secondaryObjectives = (scenario.scoringCriteria.secondaryObjectives || []).join(' | ')
  const diffDesc = DIFFICULTY_DESCRIPTIONS[difficulty] || DIFFICULTY_DESCRIPTIONS[3]
  return `You are participating in an educational language-learning game for French high school students in DNL/SELO sections.

SCENARIO: ${scenario.title}
STUDENT OBJECTIVE: ${scenario.objective}
YOUR CHARACTER: ${scenario.chatbotPersonality}
CHARACTER SPEECH STYLE: ${scenario.languageStyle}
INTERACTION LANGUAGE: ${language}
${diffDesc}
SECONDARY OBJECTIVES: ${secondaryObjectives}

CRITICAL RULES:
1. ALWAYS write your "message" field in ${language}.
2. Stay strictly in character — never admit you are an AI.
3. Match language complexity to difficulty level.
4. Once you accept an argument, keep that ground.
5. OUTPUT ONLY THE JSON OBJECT — absolutely no text before or after it.

RESPONSE FORMAT — output ONLY this JSON, with NO surrounding text:
{"message":"Your in-character response in ${language}","scoring":{"vocabulary_used":[],"argument_accepted":false,"language_quality":true,"grammar_structure_used":false,"objective_reached":false},"feedback":"One sentence in French about what the student did well or should improve"}

VOCABULARY LIST: [${vocab}]
GRAMMAR STRUCTURE TO DETECT: "${scenario.scoringCriteria.grammarStructure}"
MAIN OBJECTIVE: "${scenario.objective}"`
}

/** Extract JSON robustly — handles text before/after, markdown fences, etc. */
function extractJSON(raw) {
  // Strategy 1: find first { and track braces to find the matching }
  const start = raw.indexOf('{')
  if (start !== -1) {
    let depth = 0
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++
      else if (raw[i] === '}') { depth--; if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)) } catch {}
      }}
    }
  }
  // Strategy 2: strip markdown fences and try again
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  try { return JSON.parse(stripped) } catch {}
  return null
}

export async function sendMessage(apiKey, systemPrompt, history, studentMessage) {
  const messages = [...history, { role: 'user', content: studentMessage }]
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt, messages }),
  })
  if (!res.ok) {
    let msg = `Erreur API Claude (${res.status})`
    try { const err = await res.json(); msg = err.error?.message || msg } catch {}
    throw new Error(msg)
  }
  const data = await res.json()
  const raw = data.content?.[0]?.text || ''
  const parsed = extractJSON(raw)
  if (parsed) return parsed

  // Last resort fallback: extract message text before any JSON block
  const jsonIdx = raw.indexOf('{')
  const fallbackMsg = jsonIdx > 0 ? raw.slice(0, jsonIdx).trim() : raw.trim()
  return {
    message: fallbackMsg || '...',
    scoring: { vocabulary_used:[], argument_accepted:false, language_quality:true, grammar_structure_used:false, objective_reached:false },
    feedback: ''
  }
}

export function calculateScore(currentScore, criteria, scoring, usedWords) {
  const updated = new Set(usedWords)
  let points = 0
  const breakdown = []
  const newWords = []
  for (const w of (scoring.vocabulary_used || [])) {
    const key = w.toLowerCase().trim()
    if (!updated.has(key)) { updated.add(key); points += criteria.vocabularyPoints; newWords.push(w) }
  }
  if (newWords.length) breakdown.push({ label: `Vocabulaire : ${newWords.join(', ')}`, points: newWords.length * criteria.vocabularyPoints, emoji: '📚' })
  if (scoring.argument_accepted) { points += criteria.argumentAcceptedPoints; breakdown.push({ label: 'Argument convaincant !', points: criteria.argumentAcceptedPoints, emoji: '✅' }) }
  if (scoring.language_quality) { points += criteria.languageQualityPoints; breakdown.push({ label: 'Expression correcte', points: criteria.languageQualityPoints, emoji: '🗣️' }) }
  if (scoring.grammar_structure_used) { points += criteria.grammarPoints; breakdown.push({ label: 'Structure grammaticale', points: criteria.grammarPoints, emoji: '📝' }) }
  points += criteria.interventionPoints
  breakdown.push({ label: 'Participation', points: criteria.interventionPoints, emoji: '💬' })
  if (scoring.objective_reached) { points += criteria.victoryPoints; breakdown.push({ label: '🏆 Objectif atteint !', points: criteria.victoryPoints, emoji: '🏆' }) }
  return { newScore: currentScore + points, pointsThisTurn: points, updatedUsedWords: updated, breakdown }
}
