import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import {
  getCachedTemplates,
  getCacheTimestamp,
  getPendingSubmissions,
} from '../services/offlineStore';
import { refreshCatalog, syncPendingSubmissions } from '../services/syncService';
import apiService from '../services/api';
import { DataCollectionTemplate } from '../types/dataCollection';

function apiErrorMessage(error: any): string {
  const data = error?.response?.data;
  const status = error?.response?.status;
  const serverMsg =
    data?.message ||
    data?.error ||
    data?.msg ||
    (typeof data === 'string' ? data : null);
  if (serverMsg) return serverMsg;
  if (status === 401) return 'Session expired. Sign in again.';
  if (error?.message?.includes('Network Error')) {
    return 'Cannot reach the server. Check mobile data or Wi‑Fi.';
  }
  if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    return 'Request timed out. Try again on a stronger connection.';
  }
  return error?.message || 'Could not refresh from server.';
}

const TemplatesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const auth = useContext(AuthContext);
  const [templates, setTemplates] = useState<DataCollectionTemplate[]>([]);
  const [cacheTime, setCacheTime] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocal = async (): Promise<number> => {
    const [cached, ts, pending] = await Promise.all([
      getCachedTemplates(),
      getCacheTimestamp(),
      getPendingSubmissions(),
    ]);
    setTemplates(cached);
    setCacheTime(ts);
    setPendingCount(pending.length);
    return cached.length;
  };

  const refreshAll = async (opts: { silent?: boolean } = {}) => {
    let result: Awaited<ReturnType<typeof refreshCatalog>> | null = null;
    let catalogError: unknown = null;

    try {
      result = await refreshCatalog();
    } catch (error) {
      catalogError = error;
    }

    const cachedCount = await loadLocal();

    // Upload queued visits even when checklist download fails.
    const sync = await syncPendingSubmissions();
    if (sync.synced > 0) {
      Alert.alert('Synced', `${sync.synced} pending visit(s) uploaded.`);
    } else if (sync.failed > 0 && !opts.silent) {
      Alert.alert('Sync issues', sync.errors.slice(0, 3).join('\n'));
    } else if (result?.partial && !opts.silent) {
      Alert.alert(
        'Partial sync',
        'Checklists downloaded. The project list could not be refreshed — tap Sync again before starting a visit.'
      );
    }

    if (catalogError) {
      if (!opts.silent || cachedCount === 0) {
        Alert.alert(
          cachedCount > 0 ? 'Sync issue' : 'Offline mode',
          `${apiErrorMessage(catalogError)}\n\n${
            cachedCount > 0
              ? 'Showing cached checklists. Queued visits were still uploaded if possible.'
              : 'No checklists cached yet. Pull down to retry.'
          }`
        );
      }
    }

    return result;
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const cachedCount = await loadLocal();
        if (!active) return;

        if (cachedCount === 0) {
          await refreshAll();
        } else {
          refreshAll({ silent: true }).catch(() => {});
        }

        if (active) {
          apiService.promptForAppUpdateIfNeeded().catch(() => {});
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const categoryLabel = (cat?: string) => {
    if (cat === 'inspection_checklist') return 'Inspection';
    if (cat === 'monitoring_checklist') return 'Monitoring';
    return 'General';
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Checklists"
        subtitle={
          cacheTime
            ? `Cached ${new Date(cacheTime).toLocaleString()}`
            : 'Not downloaded yet'
        }
        onLogout={auth?.logout}
        rightAction={{
          label: pendingCount ? `Sync (${pendingCount})` : 'Sync',
          onPress: onRefresh,
        }}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={THEME.primary} />
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => String(item.templateId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No checklists cached. Pull down to download from Machakos server.
            </Text>
          }
          renderItem={({ item }) => {
            const itemCount = (item.structure?.sections || []).reduce(
              (n, s) => n + (s.items?.length || 0),
              0
            );
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() =>
                  navigation.navigate('NewVisit', {
                    templateId: item.templateId,
                    templateName: item.name,
                  })
                }
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.badge}>{categoryLabel(item.templateCategory)}</Text>
                </View>
                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={styles.meta}>{itemCount} questions</Text>
              </TouchableOpacity>
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
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardTop: {
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
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.primaryDark,
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardDesc: {
    marginTop: 6,
    color: THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  meta: {
    marginTop: 10,
    fontSize: 12,
    color: THEME.textMuted,
  },
});

export default TemplatesScreen;
