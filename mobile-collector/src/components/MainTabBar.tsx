import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../config/api';

type TabIconName = 'home' | 'attention' | 'projects' | 'finance' | 'checklists' | 'visits' | 'more';

function TabIcon({ name, color, focused }: { name: TabIconName; color: string; focused: boolean }) {
  if (name === 'home') {
    return (
      <View style={[styles.iconBox, focused && styles.iconBoxActive]}>
        <View style={[styles.homeRoof, { borderBottomColor: color }]} />
        <View style={[styles.homeBody, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'attention') {
    return (
      <View style={[styles.iconBox, focused && styles.iconBoxActive]}>
        <View style={[styles.bell, { borderColor: color }]} />
        <View style={[styles.bellDot, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'projects' || name === 'finance' || name === 'more') {
    return (
      <View style={[styles.iconBox, focused && styles.iconBoxActive]}>
        <View style={[styles.bar, { backgroundColor: color, height: 10 }]} />
        <View style={[styles.bar, { backgroundColor: color, height: 14, marginLeft: 3 }]} />
        <View style={[styles.bar, { backgroundColor: color, height: 7, marginLeft: 3 }]} />
      </View>
    );
  }
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

function iconForRoute(routeName: string): TabIconName {
  switch (routeName) {
    case 'Home':
      return 'home';
    case 'Attention':
      return 'attention';
    case 'More':
      return 'more';
    case 'Finance':
      return 'finance';
    case 'Portfolio':
    case 'Performance':
      return 'more';
    case 'Submissions':
      return 'visits';
    default:
      return 'checklists';
  }
}

export default function MainTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 6);
  const manyTabs = state.routes.length > 4;

  return (
    <View style={[styles.barOuter, { paddingBottom: bottomPad }]}>
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
        const iconName = iconForRoute(route.name);

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

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel || label}
            onPress={onPress}
            style={[styles.tab, focused && styles.tabActive, manyTabs && styles.tabCompact]}
            activeOpacity={0.85}
          >
            <TabIcon name={iconName} color={color} focused={focused} />
            <Text
              style={[styles.label, focused && styles.labelActive, manyTabs && styles.labelCompact]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barOuter: {
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
    marginHorizontal: 2,
    borderRadius: 12,
    minHeight: 64,
  },
  tabCompact: {
    minHeight: 58,
    paddingVertical: 6,
  },
  tabActive: {
    backgroundColor: '#E8F2FA',
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: THEME.textMuted,
    letterSpacing: 0.2,
  },
  labelCompact: {
    fontSize: 10,
    marginTop: 4,
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
    flexDirection: 'row',
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
  homeRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: 1,
  },
  homeBody: {
    width: 14,
    height: 10,
    borderRadius: 1,
  },
  bell: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderRadius: 7,
  },
  bellDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bar: {
    width: 5,
    borderRadius: 2,
    alignSelf: 'flex-end',
  },
});
