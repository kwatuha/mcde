import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import apiService from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import ListRowCard from '../components/ListRowCard';
import MetricCard from '../components/MetricCard';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import {
  buildExecutiveBrief,
  normalizeOrgProject,
} from '../utils/executiveMetrics';

export default function PortfolioByStatusScreen() {
  const auth = useContext(AuthContext);
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<Array<{ status: string; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      try {
        const data = await apiService.getProjectStatusCounts();
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.counts)
            ? data.counts
            : Object.entries(data || {}).map(([status, count]) => ({
                status,
                count: Number(count),
              }));
        const normalized = list
          .map((r: any) => ({
            status: String(r.status || r.Status || r.name || 'Unknown'),
            count: Number(r.count ?? r.total ?? r.value ?? 0),
          }))
          .filter((r) => r.count > 0)
          .sort((a, b) => b.count - a.count);
        if (normalized.length > 0) {
          setRows(normalized);
          setTotal(normalized.reduce((s, r) => s + r.count, 0));
          return;
        }
      } catch {
        // fall through to organization projects
      }
      const projects = (await apiService.getOrganizationProjects(3000))
        .map(normalizeOrgProject)
        .filter((p) => p.id > 0);
      const brief = buildExecutiveBrief(projects);
      setRows(brief.statusCounts);
      setTotal(brief.totalProjects);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load portfolio.');
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
        title="Portfolio"
        subtitle="Projects by lifecycle status"
        onBack={() => navigation.goBack()}
        onLogout={auth?.logout}
        rightAction={{ label: 'Refresh', onPress: () => { setRefreshing(true); load(); } }}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <MetricCard label="Total projects" value={total} tone="default" style={{ marginBottom: 16 }} />
          {rows.map((row) => (
            <ListRowCard
              key={row.status}
              title={row.status}
              meta={`${row.count} project${row.count === 1 ? '' : 's'}`}
              badge={`${total > 0 ? Math.round((row.count / total) * 100) : 0}%`}
            />
          ))}
          {!rows.length && !error ? (
            <Text style={styles.empty}>No status breakdown available.</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: THEME.textMuted, marginTop: 24 },
  error: { color: THEME.danger, marginBottom: 12 },
});
