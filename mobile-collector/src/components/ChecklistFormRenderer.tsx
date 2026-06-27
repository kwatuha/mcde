import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { THEME } from '../config/api';
import { TemplateStructure } from '../types/dataCollection';

interface Props {
  structure: TemplateStructure;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

export default function ChecklistFormRenderer({
  structure,
  value,
  onChange,
  disabled = false,
}: Props) {
  const answers = value && typeof value === 'object' ? value : {};

  const setField = (id: string, v: unknown) => {
    if (disabled) return;
    onChange({ ...answers, [id]: v });
  };

  if (!structure?.sections?.length) {
    return (
      <Text style={styles.empty}>No checklist items in this template.</Text>
    );
  }

  return (
    <View>
      {structure.sections.map((sec) => (
        <View key={sec.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          {(sec.items || []).map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={[styles.label, item.required && styles.required]}>
                {item.label}
                {item.required ? ' *' : ''}
              </Text>

              {item.type === 'yes_no' && (
                <View style={styles.row}>
                  {(['yes', 'no'] as const).map((opt) => {
                    const selected = answers[item.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.chip, selected && styles.chipSelected]}
                        disabled={disabled}
                        onPress={() => setField(item.id, opt)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {opt === 'yes' ? 'Yes' : 'No'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {item.type === 'text' && (
                <TextInput
                  style={styles.input}
                  value={String(answers[item.id] ?? '')}
                  onChangeText={(t) => setField(item.id, t)}
                  editable={!disabled}
                  placeholder="Enter text"
                />
              )}

              {item.type === 'textarea' && (
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={String(answers[item.id] ?? '')}
                  onChangeText={(t) => setField(item.id, t)}
                  editable={!disabled}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholder="Enter details"
                />
              )}

              {item.type === 'number' && (
                <TextInput
                  style={styles.input}
                  value={
                    answers[item.id] === undefined || answers[item.id] === null
                      ? ''
                      : String(answers[item.id])
                  }
                  onChangeText={(t) =>
                    setField(item.id, t === '' ? '' : Number(t))
                  }
                  editable={!disabled}
                  keyboardType="numeric"
                  placeholder="0"
                />
              )}

              {item.type === 'select' && (
                <View style={styles.optionList}>
                  {(item.options || []).map((opt) => {
                    const selected = answers[item.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optionRow, selected && styles.optionRowSelected]}
                        disabled={disabled}
                        onPress={() => setField(item.id, opt)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            selected && styles.optionTextSelected,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {item.type === 'multi_select' && (
                <View style={styles.optionList}>
                  {(item.options || []).map((opt) => {
                    const current = Array.isArray(answers[item.id])
                      ? (answers[item.id] as string[])
                      : [];
                    const checked = current.includes(opt);
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optionRow, checked && styles.optionRowSelected]}
                        disabled={disabled}
                        onPress={() => {
                          const next = checked
                            ? current.filter((x) => x !== opt)
                            : [...current, opt];
                          setField(item.id, next);
                        }}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            checked && styles.optionTextSelected,
                          ]}
                        >
                          {checked ? '☑ ' : '☐ '}
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: THEME.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.primary,
    marginBottom: 12,
  },
  item: {
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    color: THEME.text,
    marginBottom: 6,
  },
  required: {
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: THEME.text,
  },
  textarea: {
    minHeight: 96,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: '#fff',
  },
  chipSelected: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  chipText: {
    color: THEME.text,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },
  optionList: {
    gap: 6,
  },
  optionRow: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  optionRowSelected: {
    borderColor: THEME.primary,
    backgroundColor: '#E3F2FD',
  },
  optionText: {
    fontSize: 14,
    color: THEME.text,
  },
  optionTextSelected: {
    color: THEME.primaryDark,
    fontWeight: '600',
  },
});
