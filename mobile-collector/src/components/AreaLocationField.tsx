import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { THEME } from '../config/api';
import apiService from '../services/api';

export interface AreaLocationAnswer {
  subcounty?: string;
  ward?: string;
  sublocation?: string;
  village?: string;
}

interface LevelConfig {
  key: keyof AreaLocationAnswer;
  label: string;
  fetch: (parents: AreaLocationAnswer) => Promise<string[]>;
}

const LEVELS: LevelConfig[] = [
  {
    key: 'subcounty',
    label: 'Sub-county',
    fetch: () => apiService.getGeographySubcounties(),
  },
  {
    key: 'ward',
    label: 'Ward',
    fetch: (p) => apiService.getGeographyWards(p.subcounty || ''),
  },
  {
    key: 'sublocation',
    label: 'Sublocation',
    fetch: (p) =>
      apiService.getGeographySublocations(p.subcounty || '', p.ward || ''),
  },
  {
    key: 'village',
    label: 'Village',
    fetch: (p) =>
      apiService.getGeographyVillages(
        p.subcounty || '',
        p.ward || '',
        p.sublocation || ''
      ),
  },
];

function normalizeArea(value: unknown): AreaLocationAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  return {
    subcounty: v.subcounty != null ? String(v.subcounty) : undefined,
    ward: v.ward != null ? String(v.ward) : undefined,
    sublocation: v.sublocation != null ? String(v.sublocation) : undefined,
    village: v.village != null ? String(v.village) : undefined,
  };
}

export function hasCompleteAreaLocation(
  value: unknown,
  requiredLevels: (keyof AreaLocationAnswer)[] = ['subcounty', 'ward', 'sublocation', 'village']
): boolean {
  const area = normalizeArea(value);
  return requiredLevels.every((k) => String(area[k] || '').trim() !== '');
}

interface Props {
  value: unknown;
  onChange: (v: AreaLocationAnswer) => void;
  disabled?: boolean;
}

export default function AreaLocationField({ value, onChange, disabled }: Props) {
  const area = normalizeArea(value);
  const [pickerLevel, setPickerLevel] = useState<keyof AreaLocationAnswer | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const openPicker = useCallback(
    async (level: keyof AreaLocationAnswer) => {
      if (disabled) return;
      const idx = LEVELS.findIndex((l) => l.key === level);
      if (idx > 0) {
        const prev = LEVELS[idx - 1];
        if (!String(area[prev.key] || '').trim()) return;
      }
      setPickerLevel(level);
      setLoading(true);
      setLoadError('');
      try {
        const cfg = LEVELS[idx];
        const list = await cfg.fetch(area);
        setOptions(list);
      } catch (e: any) {
        setOptions([]);
        setLoadError(e?.message || 'Could not load options.');
      } finally {
        setLoading(false);
      }
    },
    [area, disabled]
  );

  const selectValue = (name: string) => {
    if (!pickerLevel) return;
    const idx = LEVELS.findIndex((l) => l.key === pickerLevel);
    const next: AreaLocationAnswer = { ...area, [pickerLevel]: name };
    for (let i = idx + 1; i < LEVELS.length; i += 1) {
      delete next[LEVELS[i].key];
    }
    onChange(next);
    setPickerLevel(null);
  };

  useEffect(() => {
    if (!pickerLevel) return;
    const idx = LEVELS.findIndex((l) => l.key === pickerLevel);
    if (idx <= 0) return;
    const prev = LEVELS[idx - 1];
    if (!String(area[prev.key] || '').trim()) {
      setPickerLevel(null);
    }
  }, [area, pickerLevel]);

  return (
    <View>
      {LEVELS.map((level, idx) => {
        const prevOk =
          idx === 0 || String(area[LEVELS[idx - 1].key] || '').trim() !== '';
        const selected = area[level.key] || '';
        return (
          <View key={level.key} style={styles.row}>
            <Text style={styles.levelLabel}>{level.label}</Text>
            <TouchableOpacity
              style={[
                styles.selectBtn,
                !prevOk && styles.selectBtnDisabled,
                selected ? styles.selectBtnFilled : null,
              ]}
              disabled={disabled || !prevOk}
              onPress={() => openPicker(level.key)}
            >
              <Text
                style={[
                  styles.selectBtnText,
                  !selected && styles.selectBtnPlaceholder,
                ]}
                numberOfLines={1}
              >
                {selected || `Select ${level.label.toLowerCase()}`}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <Modal visible={pickerLevel != null} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerLevel(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {LEVELS.find((l) => l.key === pickerLevel)?.label || 'Select'}
            </Text>
            {loading ? (
              <ActivityIndicator color={THEME.primary} style={{ marginVertical: 24 }} />
            ) : loadError ? (
              <Text style={styles.errorText}>{loadError}</Text>
            ) : (
              <FlatList
                data={options}
                keyExtractor={(item) => item}
                style={{ maxHeight: 320 }}
                ListEmptyComponent={
                  <Text style={styles.hint}>No options available.</Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.optionRow}
                    onPress={() => selectValue(item)}
                  >
                    <Text style={styles.optionText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPickerLevel(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 10 },
  levelLabel: {
    fontSize: 12,
    color: THEME.textMuted,
    marginBottom: 4,
    fontWeight: '600',
  },
  selectBtn: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  selectBtnFilled: {
    borderColor: THEME.primary,
  },
  selectBtnDisabled: {
    opacity: 0.45,
    backgroundColor: '#f5f5f5',
  },
  selectBtnText: {
    fontSize: 15,
    color: THEME.text,
  },
  selectBtnPlaceholder: {
    color: THEME.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.primary,
    marginBottom: 12,
  },
  optionRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.border,
  },
  optionText: { fontSize: 16, color: THEME.text },
  cancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: { color: THEME.primary, fontWeight: '600', fontSize: 16 },
  hint: { fontSize: 13, color: THEME.textMuted, textAlign: 'center', marginVertical: 16 },
  errorText: { fontSize: 13, color: THEME.danger, marginVertical: 12 },
});
