import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
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
import { progressStatusLabel } from '../utils/progressStatus';

type Row =
  | { kind: 'server'; data: DataCollectionSubmission }
  | { kind: 'pending'; data: PendingSubmission };

function workflowLabel(status?: string | null): string {
  const s = String(status || 'draft');
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function workflowBadgeStyle(status?: string | null) {
  const s = String(status || 'draft');
  if (s === 'approved') return styles.badgeApproved;
  if (s === 'pending_ward' || s === 'returned_to_ward') return styles.badgeWard;
  if (s === 'pending_subcounty' || s === 'pending_chief') return styles.badgeReview;
  return styles.badgeDraft;
}

function formatServerSubjectLine(s: DataCollectionSubmission): string {
  if (s.subjectType === 'rri_programme' && s.rriProgrammeId != null) {
    return s.rriProgrammeName
      ? `RRI: ${s.rriProgrammeName} (#${s.rriProgrammeId})`
      : `RRI programme #${s.rriProgrammeId}`;
  }
  if (s.projectId != null) {
    return `Project #${s.projectId}`;
  }
  return '—';
}

function formatPendingSubjectLine(p: PendingSubmission): string {
  if (p.subjectType === 'rri_programme' && p.rriProgrammeId != null) {
    return p.rriProgrammeName
      ? `RRI: ${p.rriProgrammeName} (#${p.rriProgrammeId})`
      : `RRI programme #${p.rriProgrammeId}`;
  }
  if (p.projectName) return p.projectName;
  if (p.projectId != null) return `Project #${p.projectId}`;
  return '—';
}

const SubmissionsScreen: React.FC = () => {
  const auth = useContext(AuthContext);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const draftCount = rows.filter(
    (r) =>
      r.kind === 'server' &&
      r.data.subjectType !== 'rri_programme' &&
      (r.data.workflowStatus || 'draft') === 'draft'
  ).length;
  const pendingCount = rows.filter((r) => r.kind === 'pending').length;

  const load = async (): Promise<Row[]> => {
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
      return merged;
    } catch (error: any) {
      const pending = await getPendingSubmissions();
      const merged = pending.map((p) => ({ kind: 'pending' as const, data: p }));
      setRows(merged);
      if (!pending.length) {
        Alert.alert(
          'Could not load',
          error?.response?.data?.message || error?.message || 'Network error'
        );
      }
      return merged;
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
    const sync = await syncPendingSubmissions();
    const merged = await load();
    setRefreshing(false);
    if (sync.synced > 0) {
      const drafts = merged.filter(
        (r) =>
          r.kind === 'server' &&
          r.data.subjectType !== 'rri_programme' &&
          (r.data.workflowStatus || 'draft') === 'draft'
      ).length;
      Alert.alert(
        'Synced',
        drafts > 0
          ? `${sync.synced} visit(s) uploaded. ${drafts} draft(s) ready — tap Submit to ward when ready.`
          : `${sync.synced} pending visit(s) uploaded.`
      );
    } else if (sync.failed > 0) {
      Alert.alert('Sync issues', sync.errors.slice(0, 3).join('\n'));
    }
  };

  const handleSubmitToWard = (submissionId: number, title?: string | null) => {
    Alert.alert(
      'Submit to ward?',
      `Send "${title || 'this visit'}" to the Ward Administrator for review.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmittingId(submissionId);
            try {
              await apiService.submitMonitoringToWard(submissionId);
              await load();
              Alert.alert('Submitted', 'The ward administrator has been notified to review this report.');
            } catch (error: any) {
              Alert.alert(
                'Submit failed',
                error?.response?.data?.message || error?.message || 'Could not submit to ward.'
              );
            } finally {
              setSubmittingId(null);
            }
          },
        },
      ]
    );
  };

  const handleSubmitAllDrafts = () => {
    if (draftCount < 2) return;
    Alert.alert(
      'Submit all drafts?',
      `Send ${draftCount} draft visit(s) to the Ward Administrator for review. Visits without progress status will be skipped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit all',
          onPress: async () => {
            setBatchSubmitting(true);
            try {
              const result = await apiService.submitAllMonitoringDrafts();
              await load();
              const submitted = result?.submitted?.length || 0;
              const failed = result?.failed?.length || 0;
              if (submitted > 0 && failed === 0) {
                Alert.alert('Submitted', `${submitted} visit(s) sent to ward for review.`);
              } else if (submitted > 0) {
                Alert.alert(
                  'Partially submitted',
                  `${submitted} submitted, ${failed} skipped (add progress status and try again).`
                );
              } else {
                Alert.alert(
                  'Nothing submitted',
                  result?.failed?.[0]?.message || 'No drafts could be submitted.'
                );
              }
            } catch (error: any) {
              Alert.alert(
                'Submit failed',
                error?.response?.data?.message || error?.message || 'Could not submit drafts.'
              );
            } finally {
              setBatchSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Visits"
        subtitle={
          draftCount > 0 || pendingCount > 0
            ? `${draftCount} draft${draftCount !== 1 ? 's' : ''}${pendingCount > 0 ? ` · ${pendingCount} queued` : ''} — submit drafts to ward`
            : 'Submitted and queued monitoring visits'
        }
        onLogout={auth?.logout}
      />

      {draftCount > 1 && (
        <TouchableOpacity
          style={[styles.batchBtn, batchSubmitting && styles.submitBtnDisabled]}
          disabled={batchSubmitting}
          onPress={handleSubmitAllDrafts}
        >
          {batchSubmitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.batchBtnText}>Submit all {draftCount} drafts to ward</Text>
          )}
        </TouchableOpacity>
      )}

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
                  <Text style={styles.meta}>{formatPendingSubjectLine(p)}</Text>
                  <Text style={styles.meta}>
                    {p.visitDate} · saved {new Date(p.createdAt).toLocaleString()}
                  </Text>
                  {p.lastError ? (
                    <Text style={styles.error} numberOfLines={2}>
                      {p.lastError}
                    </Text>
                  ) : null}
                  <Text style={styles.hint}>
                    {p.subjectType === 'rri_programme'
                      ? 'Sync from the Checklists tab to upload this queued programme visit.'
                      : 'Sync from Checklists tab, then submit to ward here.'}
                  </Text>
                </View>
              );
            }
            const s = item.data;
            const workflow = s.workflowStatus || 'draft';
            const isProjectVisit = s.subjectType !== 'rri_programme';
            const canSubmit = isProjectVisit && workflow === 'draft';
            const busy = submittingId === s.submissionId;
            const progressWarn = s.progressStatus === 'stalled' || s.progressStatus === 'delayed';

            return (
              <View style={[styles.card, progressWarn && styles.warnCard]}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>{s.title || 'Monitoring visit'}</Text>
                  <Text style={[styles.workflowBadge, workflowBadgeStyle(workflow)]}>
                    {workflowLabel(workflow)}
                  </Text>
                </View>
                <Text style={styles.meta}>{s.templateName || `Template #${s.templateId}`}</Text>
                <Text style={styles.meta}>{formatServerSubjectLine(s)}</Text>
                {s.progressStatus ? (
                  <Text style={[styles.meta, progressWarn && styles.warnText]}>
                    Progress: {progressStatusLabel(s.progressStatus)}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {s.visitDate || '—'}
                  {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString()}` : ''}
                </Text>
                {canSubmit ? (
                  <TouchableOpacity
                    style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
                    disabled={busy}
                    onPress={() => handleSubmitToWard(s.submissionId, s.title)}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>Submit to ward</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
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
  batchBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  batchBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
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
  warnCard: {
    borderColor: '#EF6C00',
    backgroundColor: '#FFF3E0',
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
  workflowBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeDraft: {
    color: '#424242',
    backgroundColor: '#EEEEEE',
  },
  badgeWard: {
    color: '#1565C0',
    backgroundColor: '#E3F2FD',
  },
  badgeReview: {
    color: '#E65100',
    backgroundColor: '#FFF3E0',
  },
  badgeApproved: {
    color: '#2E7D32',
    backgroundColor: '#E8F5E9',
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: THEME.textMuted,
  },
  warnText: {
    color: '#E65100',
    fontWeight: '600',
  },
  error: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.danger,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.textMuted,
    fontStyle: 'italic',
  },
  submitBtn: {
    marginTop: 12,
    backgroundColor: THEME.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default SubmissionsScreen;
