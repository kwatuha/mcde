import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import apiService from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import ListRowCard from '../components/ListRowCard';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import { formatKes, normalizeOrgProject, OrgProject } from '../utils/executiveMetrics';
import { ProjectLite } from '../types/dataCollection';

export default function ExecutiveProjectsScreen() {
  const auth = useContext(AuthContext);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgProject | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (name?: string) => {
    setError(null);
    try {
      const rows = await apiService.searchProjects({
        projectName: name?.trim() || undefined,
        limit: name?.trim() ? 80 : 120,
      });
      setProjects(rows.filter((p) => p.id > 0));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load projects.');
      setProjects([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (project: ProjectLite) => {
    setDetailLoading(true);
    try {
      const raw = await apiService.getProjectById(project.id);
      setDetail(normalizeOrgProject({ ...raw, ...project }));
    } catch {
      setDetail(
        normalizeOrgProject({
          id: project.id,
          projectName: project.projectName,
          status: project.status,
          departmentName: project.departmentName,
        })
      );
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Projects"
        subtitle="Search the county project registry"
        onLogout={auth?.logout}
      />
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search by project name"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => {
            setLoading(true);
            load(query);
          }}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => {
            setLoading(true);
            load(query);
          }}
        >
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.primary} />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(query);
              }}
            />
          }
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : (
              <Text style={styles.count}>{projects.length} shown</Text>
            )
          }
          ListEmptyComponent={<Text style={styles.empty}>No projects found.</Text>}
          renderItem={({ item }) => (
            <ListRowCard
              title={item.projectName}
              subtitle={item.departmentName || undefined}
              badge={item.status || undefined}
              onPress={() => openDetail(item)}
            />
          )}
        />
      )}

      <Modal visible={!!detail || detailLoading} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {detailLoading ? (
              <ActivityIndicator color={THEME.primary} />
            ) : detail ? (
              <ScrollView>
                <Text style={styles.modalTitle}>{detail.projectName}</Text>
                <Text style={styles.modalLine}>Status: {detail.status}</Text>
                <Text style={styles.modalLine}>Department: {detail.departmentName}</Text>
                <Text style={styles.modalLine}>Sub-county: {detail.subCounty}</Text>
                <Text style={styles.modalLine}>Ward: {detail.ward}</Text>
                <Text style={styles.modalLine}>Budget: {formatKes(detail.budget)}</Text>
                <Text style={styles.modalLine}>Disbursed: {formatKes(detail.disbursed)}</Text>
                <Text style={styles.modalLine}>
                  Progress: {Math.round(detail.percentageComplete)}%
                </Text>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setDetail(null)}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: THEME.card,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  searchBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  list: { padding: 16, paddingBottom: 32 },
  count: { marginBottom: 10, color: THEME.textMuted, fontWeight: '600' },
  empty: { textAlign: 'center', color: THEME.textMuted, marginTop: 40 },
  error: { color: THEME.danger, marginBottom: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '75%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 12,
  },
  modalLine: {
    fontSize: 14,
    color: THEME.text,
    marginBottom: 8,
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: THEME.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: '700' },
});
