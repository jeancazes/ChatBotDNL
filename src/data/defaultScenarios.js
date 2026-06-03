export const defaultScenarios = [
  {
    id: 'scenario-1',
    title: 'Le vaccinosceptique',
    description: "Convaincre une personne sceptique mais raisonnable de participer à la campagne de vaccination contre la grippe.",
    interactionMode: 'both',
    links: ['https://www.who.int/news-room/fact-sheets/detail/influenza-(seasonal)', 'https://www.santepubliquefrance.fr/maladies-et-traumatismes/maladies-et-infections-respiratoires/grippe'],
    textResources: `📊 Données clés sur le vaccin grippe :
• Efficacité : 40–60 % de réduction du risque d'infection
• Chaque année : 2 à 6 millions de cas graves évités dans le monde (OMS)
• Effets secondaires graves : < 1 cas pour 1 million de doses

📝 Vocabulaire (5 pts chacun) :
vaccine / immunity / epidemic / side effects / prevention / antibodies / virus / infection / pandemic / herd immunity

📚 Point grammaire – Conditionnel (if…then) :
"If you get vaccinated, you will protect not only yourself but also vulnerable people around you."`,
    studentInstructions: "Vous devez convaincre une personne âgée sceptique de participer à la campagne de vaccination contre la grippe. Utilisez des arguments clairs et bienveillants.",
    objective: "Convaincre la personne de prendre rendez-vous pour se faire vacciner cette année.",
    chatbotPersonality: "Tu joues le rôle de Marguerite, une personne âgée de 75 ans réfractaire à l'idée de se faire vacciner. Elle a peur des aiguilles et pense que le vaccin peut donner la grippe. Elle présente des arguments valides mais accepte les bons arguments. Elle n'est pas trop difficile à convaincre si l'élève est patient.",
    languageStyle: 'Langage poli, diction lente. Ton bienveillant mais inquiet. Phrases courtes.',
    openingPhrase: "Alors, toi aussi tu veux me convaincre de faire cette horrible piqûre !",
    ttsOptions: { rate: 0.85, pitch: 1.15, gender: 'female', openaiVoice: 'nova' },
    scoringCriteria: {
      vocabularyList: ['vaccine','immunity','epidemic','side effects','prevention','antibodies','virus','infection','pandemic','herd immunity'],
      vocabularyPoints: 5, grammarStructure: 'Conditional sentences (if…then)', grammarPoints: 3,
      argumentAcceptedPoints: 10, interventionPoints: 1, languageQualityPoints: 3, victoryPoints: 50,
      secondaryObjectives: ["Citer des statistiques sur l'efficacité du vaccin","Mentionner les risques pour les personnes âgées","Rassurer sur les effets secondaires mineurs"]
    }
  },
  {
    id: 'scenario-2',
    title: 'Le climatosceptique',
    description: "Convaincre un chef d'entreprise climatosceptique que le réchauffement climatique est réel et causé par l'activité humaine.",
    interactionMode: 'both',
    links: ['https://climate.nasa.gov/evidence/', 'https://www.ipcc.ch/report/ar6/wg1/'],
    textResources: `📊 Données clés sur le climat :
• +1,1 °C de réchauffement depuis l'ère préindustrielle (GIEC, 2023)
• CO₂ : 421 ppm en 2023, jamais atteint depuis 3 millions d'années
• 97 % des climatologues s'accordent sur la cause humaine

📝 Vocabulaire (5 pts chacun) :
greenhouse gas / carbon footprint / fossil fuels / global warming / IPCC / renewable energy / CO2 emissions / temperature anomaly / deforestation / sea level rise

📚 Point grammaire – Conditionnel et cause-effet :
"If we don't reduce emissions, sea levels will rise by 1 metre by 2100."`,
    studentInstructions: "Vous devez convaincre un chef d'entreprise climatosceptique que le réchauffement climatique est réel et causé par les activités humaines.",
    objective: "Amener le chatbot à reconnaître la réalité du changement climatique anthropique et à envisager de changer au moins un comportement.",
    chatbotPersonality: "Tu joues le rôle de Bernard, un chef d'entreprise quinquagénaire convaincu que le changement climatique est naturel. Tu es de bonne foi mais résistant. Tu acceptes uniquement les arguments solides avec données chiffrées.",
    languageStyle: 'Ton direct, légèrement condescendant mais respectueux. Phrases affirmatives.',
    openingPhrase: "Le climat a toujours changé, c'est un cycle naturel ! Prouve-moi que c'est vraiment de notre faute !",
    ttsOptions: { rate: 1.0, pitch: 0.9, gender: 'male', openaiVoice: 'onyx' },
    scoringCriteria: {
      vocabularyList: ['greenhouse gas','carbon footprint','fossil fuels','global warming','IPCC','renewable energy','CO2 emissions','temperature anomaly','deforestation','sea level rise'],
      vocabularyPoints: 5, grammarStructure: 'Conditional sentences and cause-effect structures', grammarPoints: 3,
      argumentAcceptedPoints: 10, interventionPoints: 1, languageQualityPoints: 3, victoryPoints: 50,
      secondaryObjectives: ["Citer au moins 2 sources scientifiques reconnues","Utiliser des statistiques chiffrées","Aborder l'angle économique des énergies renouvelables"]
    }
  },
  {
    id: 'scenario-3',
    title: 'Le débat OGM',
    description: "Défendre l'utilisation responsable des OGM face à un agriculteur biologique hostile.",
    interactionMode: 'written',
    links: ['https://www.who.int/news-room/questions-and-answers/item/food-genetically-modified', 'https://www.efsa.europa.eu/en/topics/topic/gmos'],
    textResources: `📊 Données clés sur les OGM :
• Le maïs Bt réduit l'usage de pesticides de 35 à 65 %
• Le "Golden Rice" combat la carence en vitamine A (500 000 cas de cécité/an)
• L'EFSA et l'OMS : aucun risque sanitaire lié aux OGM autorisés

📝 Vocabulaire (5 pts chacun) :
GMO / genetic modification / pesticide / biodiversity / cross-pollination / food security / crop yield / transgenic / regulation / patent

📚 Point grammaire – Voix passive :
"GMOs are regulated by international agencies."`,
    studentInstructions: "Vous devez convaincre un agriculteur biologique que les OGM, dans un cadre réglementé, peuvent être bénéfiques.",
    objective: "Amener le chatbot à reconnaître au moins 3 avantages potentiels des OGM dans un cadre réglementé.",
    chatbotPersonality: "Tu joues le rôle de Marcel, agriculteur biologique de 55 ans très attaché à la terre. Tu crains les OGM mais tu es honnête intellectuellement et tu cèdes face à des arguments solides.",
    languageStyle: "Langage imagé, authentique, parfois émotionnel. Proverbes paysans occasionnels.",
    openingPhrase: "Les OGM ? Même pas en rêve ! On va pas laisser ces multinationales breveter le vivant et empoisonner nos terres !",
    ttsOptions: { rate: 0.9, pitch: 0.85, gender: 'male', openaiVoice: 'echo' },
    scoringCriteria: {
      vocabularyList: ['GMO','genetic modification','pesticide','biodiversity','cross-pollination','food security','crop yield','transgenic','regulation','patent'],
      vocabularyPoints: 5, grammarStructure: 'Passive voice (are regulated, have been modified…)', grammarPoints: 3,
      argumentAcceptedPoints: 10, interventionPoints: 1, languageQualityPoints: 3, victoryPoints: 50,
      secondaryObjectives: ["Distinguer les types d'OGM","Aborder les préoccupations environnementales","Mentionner les cadres réglementaires"]
    }
  },
  {
    id: 'scenario-4',
    title: 'La planète dans notre assiette',
    description: "Convaincre un omnivore passionné de barbecue de réduire sa consommation de viande.",
    interactionMode: 'both',
    links: ['https://www.fao.org/news/story/en/item/197623/icode/', 'https://ourworldindata.org/environmental-impacts-of-food'],
    textResources: `📊 Données clés sur la viande :
• L'élevage = 14,5 % des émissions mondiales de GES (FAO)
• Produire 1 kg de bœuf nécessite 15 000 litres d'eau
• 80 % de la déforestation en Amazonie liée à l'élevage

📝 Vocabulaire (5 pts chacun) :
carbon emissions / methane / deforestation / plant-based / protein / water footprint / livestock / saturated fat / biodiversity / sustainable diet

📚 Point grammaire – Comparatifs :
"Plant-based proteins are just as nutritious as animal proteins."`,
    studentInstructions: "Vous devez convaincre une personne qui mange de la viande tous les jours de réduire sa consommation.",
    objective: "Convaincre le chatbot de s'engager à réduire sa consommation de viande au moins 3 jours par semaine.",
    chatbotPersonality: "Tu joues le rôle de Gérard, 45 ans, passionné de barbecue. Jovial et de bonne foi, capable d'entendre la raison si les preuves sont solides.",
    languageStyle: "Familier, jovial, décontracté. Humour occasionnel. Direct.",
    openingPhrase: "Moi, sans mon steak quotidien, je ne suis pas moi-même ! C'est dans nos gènes de manger de la viande, non ?",
    ttsOptions: { rate: 1.05, pitch: 0.95, gender: 'male', openaiVoice: 'fable' },
    scoringCriteria: {
      vocabularyList: ['carbon emissions','methane','deforestation','plant-based','protein','water footprint','livestock','saturated fat','biodiversity','sustainable diet'],
      vocabularyPoints: 5, grammarStructure: 'Comparison structures (more…than, less…than, as…as)', grammarPoints: 3,
      argumentAcceptedPoints: 10, interventionPoints: 1, languageQualityPoints: 3, victoryPoints: 50,
      secondaryObjectives: ["Présenter des données environnementales","Aborder les bénéfices santé","Proposer des alternatives concrètes"]
    }
  }
]
