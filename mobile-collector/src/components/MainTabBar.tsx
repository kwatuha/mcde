import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../config/api';

type TabIconName = 'checklists' | 'visits';

function TabIcon({ name, color, focused }: { name: TabIconName; color: string; focused: boolean }) {
  if (name === 'checklists') {
    return (
      <View style={[styles.iconBox, focused && styles.iconBoxActive]}>
        <View style={[styles.listLine, { backgroundColor: color }]} />
        <View style={[styles.listLine, styles.listLineMid, { backgroundColor: color }]} />
        <View style={[styles.listLine, styles.listLineShort, { backgroundColor: color }]} />
      </View>
    );
  }

  return (
    <View style={[styles.iconBox, focused && styles.iconBoxActive]}>
      <View style={[styles.pinHead, { backgroundColor: color }]} />
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </View>
  );
}

export default function MainTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 6);

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label =
          options.tabBarLabel !== undefined
            ? String(options.tabBarLabel)
            : options.title !== undefined
              ? String(options.title)
              : route.name;
        const focused = state.index === index;
        const color = focused ? THEME.primary : THEME.textMuted;
        const iconName: TabIconName = route.name === 'Submissions' ? 'visits' : 'checklists';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel || label}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[styles.tab, focused && styles.tabActive]}
            activeOpacity={0.85}
          >
            <TabIcon name={iconName} color={color} focused={focused} />
            <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingTop: 8,
    ...Platform.select({
      android: { elevation: 12 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginHorizontal: 6,
    borderRadius: 12,
    minHeight: 64,
  },
  tabActive: {
    backgroundColor: '#E8F2FA',
  },
  label: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textMuted,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: THEME.primary,
    fontWeight: '800',
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  iconBoxActive: {
    backgroundColor: 'rgba(0, 90, 154, 0.12)',
  },
  listLine: {
    width: 18,
    height: 2.5,
    borderRadius: 2,
    marginVertical: 2,
  },
  listLineMid: {
    width: 14,
    alignSelf: 'flex-start',
    marginLeft: 2,
  },
  listLineShort: {
    width: 16,
    alignSelf: 'flex-start',
    marginLeft: 2,
  },
  pinHead: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 1,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
});
