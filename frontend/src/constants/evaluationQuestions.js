/** Admin display — aligned with public-dashboard evaluationQuestions (Evaluation_questions.docx). */

export const LIKERT_SCALE = [
  { value: 5, en: 'Strongly Agree', sw: 'Nakubaliana Kabisa' },
  { value: 4, en: 'Agree', sw: 'Nakubaliana' },
  { value: 3, en: 'Neutral', sw: 'Sina Maoni' },
  { value: 2, en: 'Disagree', sw: 'Sikubaliani' },
  { value: 1, en: 'Strongly Disagree', sw: 'Sikubaliani Kabisa' },
];

export const FEEDBACK_RATING_FIELDS = [
  {
    key: 'rating_relevance',
    label: 'Relevance / Umuhimu',
    statementEn: 'The project/programme addressed the priority needs of beneficiaries.',
    statementSw: 'Mradi/programu huu ulizingatia mahitaji ya kipaumbele ya walengwa.',
  },
  {
    key: 'rating_coherence',
    label: 'Coherence / Muwafaka',
    statementEn: 'The project/programme complemented other related interventions and policies.',
    statementSw: 'Mradi/programu huu ulikamilisha juhudi nyingine na uliendana na sera husika.',
  },
  {
    key: 'rating_effectiveness',
    label: 'Effectiveness / Ufanisi wa Matokeo',
    statementEn: 'The project/programme achieved its intended objectives and planned results.',
    statementSw: 'Mradi/programu huu ulifikia malengo na matokeo yaliyopangwa.',
  },
  {
    key: 'rating_efficiency',
    label: 'Efficiency / Ufanisi wa Matumizi ya Rasilimali',
    statementEn: 'The project/programme utilized resources efficiently and adhered to planned timelines and budgets.',
    statementSw: 'Mradi/programu huu ulitumia rasilimali kwa ufanisi na kutekelezwa ndani ya muda na bajeti iliyopangwa.',
  },
  {
    key: 'rating_impact',
    label: 'Impact / Athari',
    statementEn: 'The project/programme contributed to positive changes for beneficiaries and the community.',
    statementSw: 'Mradi/programu huu ulichangia mabadiliko chanya kwa walengwa na jamii.',
  },
  {
    key: 'rating_sustainability',
    label: 'Sustainability / Uendelevu',
    statementEn: 'Measures are in place to sustain the benefits of the project/programme beyond its completion.',
    statementSw: 'Kuna mikakati ya kuhakikisha kuwa manufaa ya mradi/programu huu yataendelea baada ya kukamilika kwake.',
  },
];

export const LEGACY_FEEDBACK_RATING_FIELDS = [
  { key: 'rating_overall_support', label: 'Overall Support (legacy)' },
  { key: 'rating_quality_of_life_impact', label: 'Quality of Life Impact (legacy)' },
  { key: 'rating_community_alignment', label: 'Community Alignment (legacy)' },
  { key: 'rating_transparency', label: 'Implementation/Supervision (legacy)' },
  { key: 'rating_feasibility_confidence', label: 'Feasibility Confidence (legacy)' },
];

export const FEEDBACK_OPEN_FIELDS = [
  {
    key: 'open_achievements',
    labelEn: 'What were the major achievements of the project/programme?',
    labelSw: 'Je, ni mafanikio gani makubwa yaliyopatikana kupitia mradi/programu huu?',
  },
  {
    key: 'open_challenges',
    labelEn: 'What challenges affected the implementation of the project/programme?',
    labelSw: 'Ni changamoto gani ziliathiri utekelezaji wa mradi/programu huu?',
  },
  {
    key: 'open_lessons',
    labelEn: 'What lessons were learned from the project/programme?',
    labelSw: 'Ni mafunzo gani yaliyopatikana kutokana na mradi/programu huu?',
  },
  {
    key: 'open_recommendations',
    labelEn: 'What recommendations would you make to improve future projects/programmes?',
    labelSw: 'Ni mapendekezo gani ungependa kutoa ili kuboresha miradi/programu zijazo?',
  },
];

const likertByValue = Object.fromEntries(LIKERT_SCALE.map((item) => [item.value, item]));

export function getLikertLabel(value) {
  const numeric = Number(value);
  if (!numeric || !likertByValue[numeric]) return null;
  const scale = likertByValue[numeric];
  return `${scale.en} / ${scale.sw}`;
}

export function feedbackHasAnyRating(feedback = {}) {
  return [...FEEDBACK_RATING_FIELDS, ...LEGACY_FEEDBACK_RATING_FIELDS].some(
    (field) => feedback[field.key],
  );
}

export function feedbackHasAnyOpenResponse(feedback = {}) {
  return FEEDBACK_OPEN_FIELDS.some((field) => String(feedback[field.key] || '').trim());
}

/** Short labels for charts/tables (English criterion name). */
export const FEEDBACK_RATING_ANALYTICS = FEEDBACK_RATING_FIELDS.map((field) => ({
  ...field,
  shortLabel: field.label.split(' / ')[0],
  avgKey: `avg_${field.key.replace('rating_', '')}`,
}));

export const LEGACY_RATING_ANALYTICS = LEGACY_FEEDBACK_RATING_FIELDS.map((field) => ({
  ...field,
  shortLabel: field.label.replace(' (legacy)', ''),
  avgKey: field.key === 'rating_overall_support'
    ? 'avg_overall_support'
    : field.key === 'rating_quality_of_life_impact'
      ? 'avg_quality_impact'
      : field.key === 'rating_community_alignment'
        ? 'avg_community_alignment'
        : field.key === 'rating_transparency'
          ? 'avg_transparency'
          : 'avg_feasibility_confidence',
}));

export function feedbackHasAnyRatingValue(feedback = {}) {
  return feedbackHasAnyRating(feedback);
}

export function collectRatingValues(feedbacks, fieldKey) {
  return feedbacks.map((f) => f[fieldKey]).filter((v) => v != null && v !== '');
}

export function averageRating(values) {
  if (!values?.length) return 0;
  return (values.reduce((a, b) => a + Number(b), 0) / values.length).toFixed(2);
}

export function ratingDistribution(feedbacks, fieldKey) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  feedbacks.forEach((f) => {
    const value = Number(f[fieldKey]);
    if (value >= 1 && value <= 5) dist[value] += 1;
  });
  const total = feedbacks.length || 1;
  return Object.entries(dist).map(([rating, count]) => {
    const likert = likertByValue[Number(rating)];
    const label = likert ? `${rating} — ${likert.en}` : String(rating);
    return {
      rating: label,
      count,
      percentage: ((count / total) * 100).toFixed(1),
    };
  });
}

/** Plain-text block for PDF export. */
export function formatFeedbackEvaluationForPdf(feedback = {}) {
  const lines = [];

  FEEDBACK_RATING_FIELDS.forEach((field) => {
    const value = feedback[field.key];
    if (!value) return;
    const likert = getLikertLabel(value);
    lines.push(`${field.label}`);
    if (field.statementEn) lines.push(`  Statement: ${field.statementEn}`);
    lines.push(`  Score: ${value}/5${likert ? ` — ${likert}` : ''}`);
    lines.push('');
  });

  LEGACY_FEEDBACK_RATING_FIELDS.forEach((field) => {
    const value = feedback[field.key];
    if (!value) return;
    lines.push(`${field.label}: ${value}/5`);
  });

  FEEDBACK_OPEN_FIELDS.forEach((field) => {
    const text = String(feedback[field.key] || '').trim();
    if (!text) return;
    lines.push(`${field.labelEn}`);
    lines.push(text);
    lines.push('');
  });

  return lines.join('\n').trim();
}
