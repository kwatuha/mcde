import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { THEME } from '../config/api';

type Tone = 'default' | 'success' | 'warning' | 'danger';

const TONE_BG: Record<Tone, string> = {
  default: '#E8F2FA',
  success: '#E8F5E9',
  warning: '#FFF3E0',
  danger: '#FFEBEE',
};

const TONE_FG: Record<Tone, string> = {
  default: THEME.primary,
  success: THEME.accent,
  warning: THEME.warning,
  danger: THEME.danger,
};

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  style?: ViewStyle;
}

export default function MetricCard({ label, value, hint, tone = 'default', style }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: TONE_BG[tone] }, style]}>
      <Text style={[styles.label, { color: TONE_FG[tone] }]}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    minWidth: '47%',
    flexGrow: 1,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: THEME.text,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: THEME.textMuted,
  },
});
