import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';

const LINKS = [
  { label: 'Finance snapshot', route: 'Finance', hint: 'Budget, absorption, payment gap' },
  { label: 'Portfolio by status', route: 'Portfolio', hint: 'Lifecycle status breakdown' },
  { label: 'Dept & region performance', route: 'Performance', hint: 'Departments and sub-counties' },
];

export default function ExecutiveMoreScreen() {
  const auth = useContext(AuthContext);
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <ScreenHeader title="More" subtitle="Finance and performance views" onLogout={auth?.logout} />
      <ScrollView contentContainerStyle={styles.content}>
        {LINKS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.card}
            onPress={() => {
              const parent = navigation.getParent?.();
              if (parent) parent.navigate(item.route);
              else navigation.navigate(item.route);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.hint}>{item.hint}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 16,
    marginBottom: 10,
  },
  label: { fontSize: 16, fontWeight: '800', color: THEME.primary },
  hint: { marginTop: 6, fontSize: 13, color: THEME.textMuted },
});
