import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../config/api';

interface Props {
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'default' | 'danger' | 'warning' | 'success';
  onPress?: () => void;
}

const BADGE_COLORS = {
  default: THEME.primary,
  danger: THEME.danger,
  warning: THEME.warning,
  success: THEME.accent,
};

export default function ListRowCard({
  title,
  subtitle,
  meta,
  badge,
  badgeTone = 'default',
  onPress,
}: Props) {
  const content = (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: BADGE_COLORS[badgeTone] }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
    marginBottom: 10,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: THEME.textMuted,
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.primary,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
