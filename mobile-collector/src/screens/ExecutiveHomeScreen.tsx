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
import apiService, { AuthUser } from '../services/api';
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
import { displayRoleLabel } from '../utils/roleUtils';

function navigateApp(navigation: any, route: string) {
  const tabRoutes = new Set(['Home', 'Attention', 'Projects', 'More']);
  if (tabRoutes.has(route)) {
    navigation.navigate(route);
    return;
  }
  const parent = navigation.getParent?.();
  if (parent) {
    parent.navigate(route);
  } else {
    navigation.navigate(route);
  }
}

export default function ExecutiveHomeScreen() {
  const auth = useContext(AuthContext);
  const navigation = useNavigation<any>();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [brief, setBrief] = useState<ExecutiveBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await apiService.getUserData();
      setUser(me);
      const [rows, kpis] = await Promise.all([
        apiService.getOrganizationProjects(1000).catch(() => []),
        apiService.getSummaryKpis().catch(() => null),
      ]);
      const projects = (rows || []).map(normalizeOrgProject).filter((p) => p.id > 0);
      const base = buildExecutiveBrief(projects);
      setBrief(applySummaryKpis(base, kpis));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load briefing.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.username ||
    'Executive';

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="CIMES Mobile"
        subtitle={`${name} · ${displayRoleLabel(user?.roleName)}`}
        onLogout={auth?.logout}
        rightAction={{ label: 'Refresh', onPress: onRefresh }}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.sectionTitle}>Executive briefing</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {brief ? (
            <>
              <View style={styles.metricsRow}>
                <MetricCard
                  label="Delivery health"
                  value={`${brief.deliveryHealth}%`}
                  hint={`${brief.totalProjects} projects`}
                  tone="success"
                />
                <MetricCard
                  label="At risk"
                  value={brief.atRiskCount}
                  hint="Delayed / stalled / suspended"
                  tone={brief.atRiskCount > 0 ? 'danger' : 'default'}
                />
              </View>
              <View style={styles.metricsRow}>
                <MetricCard
                  label="Absorption"
                  value={`${brief.absorptionPct}%`}
                  hint={`${formatKes(brief.totalDisbursed)} paid`}
                  tone="default"
                />
                <MetricCard
                  label="Payment gap"
                  value={formatKes(brief.disbursementGap)}
                  hint={`Budget ${formatKes(brief.totalBudget)}`}
                  tone="warning"
                />
              </View>
              <View style={styles.metricsRow}>
                <MetricCard
                  label="Completed"
                  value={`${brief.completionRate}%`}
                  hint="Share of portfolio"
                />
                <MetricCard
                  label="Pipeline"
                  value={brief.pipelineCount}
                  hint="Not started / procurement"
                />
              </View>

              <View style={styles.insightCard}>
                <Text style={styles.insightLabel}>Highlights</Text>
                <Text style={styles.insightText}>
                  Top sub-county: {brief.topSubCounty || '—'}
                </Text>
                <Text style={styles.insightText}>Top sector: {brief.topSector || '—'}</Text>
              </View>

              <Text style={styles.sectionTitle}>Quick links</Text>
              <View style={styles.links}>
                {[
                  { label: 'Attention inbox', route: 'Attention' },
                  { label: 'Find projects', route: 'Projects' },
                  { label: 'Finance snapshot', route: 'Finance' },
                  { label: 'Portfolio by status', route: 'Portfolio' },
                  { label: 'Dept & region', route: 'Performance' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.route}
                    style={styles.linkBtn}
                    onPress={() => navigateApp(navigation, item.route)}
                  >
                    <Text style={styles.linkText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 12,
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  insightCard: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  insightLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.primary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  insightText: {
    fontSize: 14,
    color: THEME.text,
    marginBottom: 4,
  },
  links: { gap: 8 },
  linkBtn: {
    backgroundColor: THEME.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.primary,
  },
  error: {
    color: THEME.danger,
    marginBottom: 12,
  },
});
