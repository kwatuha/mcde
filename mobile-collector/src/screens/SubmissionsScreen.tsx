import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import apiService from '../services/api';
import { getPendingSubmissions } from '../services/offlineStore';
import { syncPendingSubmissions } from '../services/syncService';
import {
  DataCollectionSubmission,
  PendingSubmission,
} from '../types/dataCollection';

type Row =
  | { kind: 'server'; data: DataCollectionSubmission }
  | { kind: 'pending'; data: PendingSubmission };

const SubmissionsScreen: React.FC = () => {
  const auth = useContext(AuthContext);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [server, pending] = await Promise.all([
        apiService.listSubmissions(),
        getPendingSubmissions(),
      ]);
      const merged: Row[] = [
        ...pending.map((p) => ({ kind: 'pending' as const, data: p })),
        ...server.map((s) => ({ kind: 'server' as const, data: s })),
      ];
      setRows(merged);
    } catch (error: any) {
      const pending = await getPendingSubmissions();
      setRows(pending.map((p) => ({ kind: 'pending' as const, data: p })));
      if (!pending.length) {
        Alert.alert(
          'Could not load',
          error?.response?.data?.message || error?.message || 'Network error'
        );
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncPendingSubmissions();
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Visits"
        subtitle="Submitted and queued monitoring visits"
        onLogout={auth?.logout}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={THEME.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) =>
            item.kind === 'pending'
              ? item.data.localId
              : String(item.data.submissionId)
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No visits yet. Start from a checklist.</Text>
          }
          renderItem={({ item }) => {
            if (item.kind === 'pending') {
              const p = item.data;
              return (
                <View style={[styles.card, styles.pendingCard]}>
                  <View style={styles.row}>
                    <Text style={styles.cardTitle}>{p.title}</Text>
                    <Text style={styles.pendingBadge}>Queued</Text>
                  </View>
                  <Text style={styles.meta}>{p.templateName}</Text>
                  <Text style={styles.meta}>{p.projectName}</Text>
                  <Text style={styles.meta}>
                    {p.visitDate} · saved {new Date(p.createdAt).toLocaleString()}
                  </Text>
                  {p.lastError ? (
                    <Text style={styles.error} numberOfLines={2}>
                      {p.lastError}
                    </Text>
                  ) : null}
                </View>
              );
            }
            const s = item.data;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{s.title || 'Monitoring visit'}</Text>
                <Text style={styles.meta}>{s.templateName || `Template #${s.templateId}`}</Text>
                <Text style={styles.meta}>Project #{s.projectId}</Text>
                <Text style={styles.meta}>
                  {s.visitDate || '—'}
                  {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString()}` : ''}
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  loader: { marginTop: 40 },
  list: { padding: 16, paddingBottom: 32 },
  empty: {
    textAlign: 'center',
    color: THEME.textMuted,
    marginTop: 40,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  pendingCard: {
    borderColor: THEME.warning,
    backgroundColor: '#FFF8E1',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
  },
  pendingBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E65100',
    backgroundColor: '#FFE0B2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: THEME.textMuted,
  },
  error: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.danger,
  },
});

export default SubmissionsScreen;
