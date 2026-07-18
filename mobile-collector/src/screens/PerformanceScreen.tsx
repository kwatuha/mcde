import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import apiService from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import ListRowCard from '../components/ListRowCard';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import {
  buildExecutiveBrief,
  formatKes,
  normalizeOrgProject,
} from '../utils/executiveMetrics';

type TabKey = 'department' | 'region';

type PerfRow = { name: string; projects: number; budget: number; disbursed: number };

export default function PerformanceScreen() {
  const auth = useContext(AuthContext);
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<TabKey>('department');
  const [deptRows, setDeptRows] = useState<PerfRow[]>([]);
  const [regionRows, setRegionRows] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapReportRows = (data: any): PerfRow[] => {
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.data)
          ? data.data
          : [];
    return list
      .map((r: any) => ({
        name: String(
          r.departmentName || r.department || r.subcounty || r.subCounty || r.name || 'Unspecified'
        ),
        projects: Number(r.projects ?? r.projectCount ?? r.count ?? 0),
        budget: Number(r.budget ?? r.totalBudget ?? r.allocatedBudget ?? 0),
        disbursed: Number(r.disbursed ?? r.totalDisbursed ?? r.paidOut ?? 0),
      }))
      .filter((r) => r.name)
      .sort((a, b) => b.projects - a.projects || b.budget - a.budget)
      .slice(0, 20);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dept, subcounty] = await Promise.all([
        apiService.getDepartmentSummary().catch(() => null),
        apiService.getSubcountySummary().catch(() => null),
      ]);
      let depts = mapReportRows(dept);
      let regions = mapReportRows(subcounty);

      if (!depts.length || !regions.length) {
        const brief = buildExecutiveBrief(
          (await apiService.getOrganizationProjects(3000))
            .map(normalizeOrgProject)
            .filter((p) => p.id > 0)
        );
        if (!depts.length) depts = brief.departmentRows;
        if (!regions.length) regions = brief.regionRows;
      }
      setDeptRows(depts);
      setRegionRows(regions);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load performance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = tab === 'department' ? deptRows : regionRows;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Performance"
        subtitle="Departments and sub-counties"
        onBack={() => navigation.goBack()}
        onLogout={auth?.logout}
        rightAction={{ label: 'Refresh', onPress: () => { setRefreshing(true); load(); } }}
      />
      <View style={styles.tabs}>
        {([
          { key: 'department', label: 'Departments' },
          { key: 'region', label: 'Sub-counties' },
        ] as const).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
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
          {rows.map((row) => (
            <ListRowCard
              key={`${tab}-${row.name}`}
              title={row.name}
              subtitle={`${row.projects} projects · Budget ${formatKes(row.budget)}`}
              meta={`Disbursed ${formatKes(row.disbursed)}`}
            />
          ))}
          {!rows.length && !error ? (
            <Text style={styles.empty}>No performance rows available.</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: THEME.card,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    padding: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#E8F2FA' },
  tabText: { fontWeight: '600', color: THEME.textMuted },
  tabTextActive: { color: THEME.primary, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: THEME.textMuted, marginTop: 24 },
  error: { color: THEME.danger, marginBottom: 12 },
});
