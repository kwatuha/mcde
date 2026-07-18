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
import MetricCard from '../components/MetricCard';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import {
  buildExecutiveBrief,
  formatKes,
  normalizeOrgProject,
  applySummaryKpis,
  ExecutiveBrief,
} from '../utils/executiveMetrics';

export default function FinanceSnapshotScreen() {
  const auth = useContext(AuthContext);
  const navigation = useNavigation<any>();
  const [brief, setBrief] = useState<ExecutiveBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, kpis] = await Promise.all([
        apiService.getOrganizationProjects(1000).catch(() => []),
        apiService.getSummaryKpis(),
      ]);
      const base = buildExecutiveBrief(
        (rows || []).map(normalizeOrgProject).filter((p) => p.id > 0)
      );
      setBrief(applySummaryKpis(base, kpis));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load finance snapshot.');
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
        title="Finance"
        subtitle="Budget and absorption snapshot"
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
          {brief ? (
            <>
              <View style={styles.row}>
                <MetricCard label="Total budget" value={formatKes(brief.totalBudget)} />
                <MetricCard
                  label="Disbursed"
                  value={formatKes(brief.totalDisbursed)}
                  tone="success"
                />
              </View>
              <View style={styles.row}>
                <MetricCard label="Absorption" value={`${brief.absorptionPct}%`} tone="default" />
                <MetricCard
                  label="Payment gap"
                  value={formatKes(brief.disbursementGap)}
                  tone="warning"
                />
              </View>
              <Text style={styles.note}>
                County totals come from the same summary KPIs as the web executive briefing
                ({brief.totalProjects.toLocaleString()} projects).
              </Text>
            </>
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  note: {
    marginTop: 12,
    fontSize: 13,
    color: THEME.textMuted,
    lineHeight: 18,
  },
  error: { color: THEME.danger, marginBottom: 12 },
});
