import { TemplateStructure } from '../types/dataCollection';

export function validateChecklistAnswers(
  structure: TemplateStructure,
  answers: Record<string, unknown> | undefined | null
): string[] {
  if (!answers || typeof answers !== 'object') {
    return ['Answers must be provided.'];
  }
  const missing: string[] = [];
  for (const sec of structure.sections || []) {
    for (const item of sec.items || []) {
      if (!item.required) continue;
      const v = answers[item.id];
      const empty =
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (item.type === 'multi_select' && (!Array.isArray(v) || v.length === 0)) ||
        (item.type === 'yes_no' && v !== 'yes' && v !== 'no');
      if (empty) missing.push(item.label || item.id);
    }
  }
  return missing;
}
