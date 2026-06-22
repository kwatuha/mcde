/** Evaluation criteria from docs/Evaluation_questions.docx (English + Kiswahili). */

export const EVALUATION_INTRO = {
  titleEn: 'Evaluation Tool',
  titleSw: 'Fomu ya Tathmini',
  instructionEn: 'Please tick (✓) the response that best reflects your opinion.',
  instructionSw: 'Tafadhali weka alama ya tiki (✓) kwenye jibu linaloonyesha maoni yako.',
};

/** Strongly Agree first (left) through Strongly Disagree (right). Stored values remain 1–5. */
export const LIKERT_SCALE = [
  { value: 5, en: 'Strongly Agree', sw: 'Nakubaliana Kabisa' },
  { value: 4, en: 'Agree', sw: 'Nakubaliana' },
  { value: 3, en: 'Neutral', sw: 'Sina Maoni' },
  { value: 2, en: 'Disagree', sw: 'Sikubaliani' },
  { value: 1, en: 'Strongly Disagree', sw: 'Sikubaliani Kabisa' },
];

export const LIKERT_DISPLAY_ORDER = [5, 4, 3, 2, 1];

export const EVALUATION_CRITERIA = [
  {
    name: 'ratingRelevance',
    criterionEn: 'Relevance',
    criterionSw: 'Umuhimu',
    statementEn: 'The project/programme addressed the priority needs of beneficiaries.',
    statementSw: 'Mradi/programu huu ulizingatia mahitaji ya kipaumbele ya walengwa.',
  },
  {
    name: 'ratingCoherence',
    criterionEn: 'Coherence',
    criterionSw: 'Muwafaka',
    statementEn: 'The project/programme complemented other related interventions and policies.',
    statementSw: 'Mradi/programu huu ulikamilisha juhudi nyingine na uliendana na sera husika.',
  },
  {
    name: 'ratingEffectiveness',
    criterionEn: 'Effectiveness',
    criterionSw: 'Ufanisi wa Matokeo',
    statementEn: 'The project/programme achieved its intended objectives and planned results.',
    statementSw: 'Mradi/programu huu ulifikia malengo na matokeo yaliyopangwa.',
  },
  {
    name: 'ratingEfficiency',
    criterionEn: 'Efficiency',
    criterionSw: 'Ufanisi wa Matumizi ya Rasilimali',
    statementEn: 'The project/programme utilized resources efficiently and adhered to planned timelines and budgets.',
    statementSw: 'Mradi/programu huu ulitumia rasilimali kwa ufanisi na kutekelezwa ndani ya muda na bajeti iliyopangwa.',
  },
  {
    name: 'ratingImpact',
    criterionEn: 'Impact',
    criterionSw: 'Athari',
    statementEn: 'The project/programme contributed to positive changes for beneficiaries and the community.',
    statementSw: 'Mradi/programu huu ulichangia mabadiliko chanya kwa walengwa na jamii.',
  },
  {
    name: 'ratingSustainability',
    criterionEn: 'Sustainability',
    criterionSw: 'Uendelevu',
    statementEn: 'Measures are in place to sustain the benefits of the project/programme beyond its completion.',
    statementSw: 'Kuna mikakati ya kuhakikisha kuwa manufaa ya mradi/programu huu yataendelea baada ya kukamilika kwake.',
  },
];

export const OPEN_ENDED_QUESTIONS = [
  {
    name: 'openAchievements',
    en: 'What were the major achievements of the project/programme?',
    sw: 'Je, ni mafanikio gani makubwa yaliyopatikana kupitia mradi/programu huu?',
  },
  {
    name: 'openChallenges',
    en: 'What challenges affected the implementation of the project/programme?',
    sw: 'Ni changamoto gani ziliathiri utekelezaji wa mradi/programu huu?',
  },
  {
    name: 'openLessons',
    en: 'What lessons were learned from the project/programme?',
    sw: 'Ni mafunzo gani yaliyopatikana kutokana na mradi/programu huu?',
  },
  {
    name: 'openRecommendations',
    en: 'What recommendations would you make to improve future projects/programmes?',
    sw: 'Ni mapendekezo gani ungependa kutoa ili kuboresha miradi/programu zijazo?',
  },
];

export const EMPTY_EVALUATION_FORM = {
  ratingRelevance: null,
  ratingCoherence: null,
  ratingEffectiveness: null,
  ratingEfficiency: null,
  ratingImpact: null,
  ratingSustainability: null,
  openAchievements: '',
  openChallenges: '',
  openLessons: '',
  openRecommendations: '',
};

export function hasEvaluationResponse(formData) {
  const hasRating = EVALUATION_CRITERIA.some(
    (item) => formData[item.name] != null && formData[item.name] !== '',
  );
  const hasOpenEnded = OPEN_ENDED_QUESTIONS.some(
    (item) => String(formData[item.name] || '').trim(),
  );
  const hasMessage = String(formData.message || '').trim();
  return hasRating || hasOpenEnded || hasMessage;
}
