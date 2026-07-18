import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import apiService from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import ListRowCard from '../components/ListRowCard';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';

type AttentionItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'default' | 'danger' | 'warning' | 'success';
};

function severityTone(sev?: string): 'danger' | 'warning' | 'default' {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'danger';
  if (s === 'medium') return 'warning';
  return 'default';
}

export default function AttentionScreen() {
  const auth = useContext(AuthContext);
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tasksRes, signals] = await Promise.all([
        apiService.getMyTasks({ limit: 50 }).catch(() => ({ tasks: [] as any[] })),
        apiService.getEscalationSignals({ status: 'open' }).catch(() => [] as any[]),
      ]);

      const fromTasks: AttentionItem[] = (tasksRes.tasks || []).map((t: any, idx: number) => ({
        id: String(t.taskId || t.id || `task-${idx}`),
        title: t.title || 'Task',
        subtitle: t.subtitle || t.projectName || t.meta?.message,
        meta: t.taskType === 'project_escalation' ? 'Escalation' : 'Workflow approval',
        badge: t.severity || t.status || undefined,
        badgeTone: severityTone(t.severity),
      }));

      const fromSignals: AttentionItem[] = (signals || []).slice(0, 40).map((s: any, idx: number) => ({
        id: `sig-${s.signalId || s.id || idx}`,
        title: s.title || s.ruleName || 'Project escalation',
        subtitle: s.projectName || s.message,
        meta: [s.department, s.severity].filter(Boolean).join(' · '),
        badge: s.severity || s.status || 'open',
        badgeTone: severityTone(s.severity),
      }));

      // Prefer my-tasks; fill with open signals if tasks empty or thin
      const merged = fromTasks.length > 0 ? fromTasks : fromSignals;
      const seen = new Set(merged.map((m) => m.id));
      for (const s of fromSignals) {
        if (!seen.has(s.id) && merged.length < 60) {
          merged.push(s);
          seen.add(s.id);
        }
      }
      setItems(merged);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load attention items.');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Attention"
        subtitle="Escalations and items waiting on you"
        onLogout={auth?.logout}
        rightAction={{ label: 'Refresh', onPress: () => { setRefreshing(true); load(); } }}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : (
              <Text style={styles.count}>{items.length} item{items.length === 1 ? '' : 's'}</Text>
            )
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Nothing needing attention right now.</Text>
          }
          renderItem={({ item }) => (
            <ListRowCard
              title={item.title}
              subtitle={item.subtitle}
              meta={item.meta}
              badge={item.badge}
              badgeTone={item.badgeTone}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  count: { marginBottom: 10, color: THEME.textMuted, fontWeight: '600' },
  empty: { textAlign: 'center', color: THEME.textMuted, marginTop: 40 },
  error: { color: THEME.danger, marginBottom: 12 },
});
