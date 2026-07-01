import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import ChecklistFormRenderer from '../components/ChecklistFormRenderer';
import ScreenHeader from '../components/ScreenHeader';
import { THEME } from '../config/api';
import apiService from '../services/api';
import {
  getCachedProjects,
  getCachedTemplates,
  getVisitDraft,
  savePendingSubmission,
  setCachedProjects,
  setVisitDraft,
} from '../services/offlineStore';
import { makeLocalId } from '../services/syncService';
import { validateChecklistAnswers } from '../utils/checklistValidation';
import { extractProgressStatusFromAnswers } from '../utils/progressStatus';
import { uploadPendingPhotosInAnswers } from '../utils/attachmentUpload';
import { extractApiError, shouldQueueOffline } from '../utils/apiErrorUtils';
import {
  DataCollectionTemplate,
  ProjectLite,
  RriProgrammeLite,
  VisitSubjectType,
} from '../types/dataCollection';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const NewVisitScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const templateId = Number(route.params?.templateId);
  const templateNameParam = route.params?.templateName as string | undefined;

  const [template, setTemplate] = useState<DataCollectionTemplate | null>(null);
  const [subjectType, setSubjectType] = useState<VisitSubjectType>('project');
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [project, setProject] = useState<ProjectLite | null>(null);
  const [rriProgrammes, setRriProgrammes] = useState<RriProgrammeLite[]>([]);
  const [rriProgramme, setRriProgramme] = useState<RriProgrammeLite | null>(null);
  const [projectQuery, setProjectQuery] = useState('');
  const [programmeQuery, setProgrammeQuery] = useState('');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showProgrammePicker, setShowProgrammePicker] = useState(false);
  const [visitDate, setVisitDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const allowedSubjectTypes = useMemo(() => {
    const raw = template?.allowedSubjectTypes;
    if (Array.isArray(raw) && raw.length) return raw;
    return ['project' as VisitSubjectType];
  }, [template]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cachedTemplates, cachedProjects, draft] = await Promise.all([
        getCachedTemplates(),
        getCachedProjects(),
        getVisitDraft(),
      ]);
      let tpl =
        cachedTemplates.find((t) => t.templateId === templateId) || null;
      if (!tpl) {
        tpl = await apiService.getTemplate(templateId);
      }
      let projectRows = cachedProjects;
      if (projectRows.length === 0) {
        try {
          projectRows = await apiService.listProjects({ limit: 500 });
          await setCachedProjects(projectRows);
        } catch {
          // Form still loads; user can retry project picker after syncing checklists.
        }
      }
      let programmeRows: RriProgrammeLite[] = [];
      try {
        programmeRows = await apiService.listRriProgrammes();
      } catch {
        // Programme visits still work once synced online.
      }
      setTemplate(tpl);
      setProjects(projectRows);
      setRriProgrammes(programmeRows);
      setTitle(
        draft?.title ||
          `${tpl?.name || templateNameParam || 'Visit'} — ${todayIso()}`
      );
      setVisitDate(draft?.visitDate || todayIso());
      if (draft?.answers && draft.templateId === templateId) {
        setAnswers(draft.answers);
      }
      const draftSubject =
        draft?.subjectType === 'rri_programme' ? 'rri_programme' : 'project';
      const tplAllowed = Array.isArray(tpl?.allowedSubjectTypes) && tpl!.allowedSubjectTypes!.length
        ? tpl!.allowedSubjectTypes!
        : ['project'];
      const nextSubject = tplAllowed.includes(draftSubject)
        ? draftSubject
        : (tplAllowed[0] as VisitSubjectType);
      setSubjectType(nextSubject);
      if (draft?.projectId && nextSubject === 'project') {
        const p = projectRows.find((x) => x.id === draft.projectId);
        if (p) setProject(p);
      }
      if (draft?.rriProgrammeId && nextSubject === 'rri_programme') {
        const rp =
          programmeRows.find((x) => x.programmeId === draft.rriProgrammeId) ||
          ({ programmeId: draft.rriProgrammeId, name: `Programme #${draft.rriProgrammeId}` } as RriProgrammeLite);
        setRriProgramme(rp);
      }
    } catch (error: any) {
      Alert.alert(
        'Load failed',
        error?.response?.data?.message || error?.message || 'Could not load template.'
      );
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, templateId, templateNameParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!allowedSubjectTypes.includes(subjectType)) {
      setSubjectType(allowedSubjectTypes[0] || 'project');
      setProject(null);
      setRriProgramme(null);
    }
  }, [allowedSubjectTypes, subjectType]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisitDraft({
        templateId,
        subjectType,
        projectId: project?.id,
        rriProgrammeId: rriProgramme?.programmeId,
        visitDate,
        title,
        answers,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [templateId, subjectType, project?.id, rriProgramme?.programmeId, visitDate, title, answers]);

  const filteredProjects = projects.filter((p) => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.projectName.toLowerCase().includes(q) ||
      String(p.id).includes(q)
    );
  });

  const filteredProgrammes = rriProgrammes.filter((p) => {
    const q = programmeQuery.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || String(p.programmeId).includes(q);
  });

  const handleSubmit = async () => {
    if (!template) return;
    if (subjectType === 'project') {
      if (!project) {
        Alert.alert('Project required', 'Select the project for this visit.');
        return;
      }
      if (!Number.isFinite(Number(project.id))) {
        Alert.alert(
          'Project required',
          'The selected project has an invalid id. Refresh checklists and pick the project again.'
        );
        return;
      }
    } else if (!rriProgramme?.programmeId) {
      Alert.alert('Programme required', 'Select the RRI programme for this visit.');
      return;
    }
    const missing = validateChecklistAnswers(template.structure, answers);
    if (missing.length) {
      Alert.alert(
        'Incomplete checklist',
        `Please complete required items:\n• ${missing.slice(0, 8).join('\n• ')}`
      );
      return;
    }

    setSubmitting(true);
    const progressStatus = extractProgressStatusFromAnswers(template.structure, answers);
    const payload = {
      templateId: template.templateId,
      subjectType,
      projectId: subjectType === 'project' ? project!.id : undefined,
      rriProgrammeId: subjectType === 'rri_programme' ? rriProgramme!.programmeId : undefined,
      visitDate,
      title: title.trim() || `${template.name} visit`,
      answers,
      ...(progressStatus ? { progressStatus } : {}),
    };

    try {
      const readyAnswers = await uploadPendingPhotosInAnswers(answers);
      const saved = await apiService.createSubmission({ ...payload, answers: readyAnswers });
      await setVisitDraft(null);

      if (subjectType === 'project' && saved.submissionId) {
        const submitToWard = () => {
          apiService
            .submitMonitoringToWard(saved.submissionId)
            .then(() => {
              Alert.alert('Submitted to ward', 'The ward administrator can now review this report.', [
                { text: 'OK', onPress: () => navigation.navigate('Submissions') },
              ]);
            })
            .catch((err: any) => {
              Alert.alert(
                'Saved as draft',
                err?.response?.data?.message ||
                  err?.message ||
                  'Visit saved but could not submit to ward. Use the Visits tab to submit later.'
              );
              navigation.navigate('Submissions');
            });
        };

        Alert.alert('Saved', 'Monitoring visit saved to the server.', [
          { text: 'Draft only', style: 'cancel', onPress: () => navigation.navigate('Submissions') },
          { text: 'Submit to ward', onPress: submitToWard },
        ]);
      } else {
        Alert.alert('Saved', 'Monitoring visit saved to the server.', [
          { text: 'OK', onPress: () => navigation.navigate('Submissions') },
        ]);
      }
    } catch (error: any) {
      const message = extractApiError(error);
      if (!shouldQueueOffline(error)) {
        Alert.alert('Submit failed', message, [{ text: 'OK' }]);
        return;
      }
      const localId = makeLocalId();
      await savePendingSubmission({
        localId,
        templateId: template.templateId,
        templateName: template.name,
        subjectType,
        projectId: subjectType === 'project' ? project!.id : undefined,
        projectName: subjectType === 'project' ? project!.projectName : undefined,
        rriProgrammeId: subjectType === 'rri_programme' ? rriProgramme!.programmeId : undefined,
        rriProgrammeName: subjectType === 'rri_programme' ? rriProgramme!.name : undefined,
        visitDate,
        title: payload.title,
        answers,
        createdAt: new Date().toISOString(),
        status: 'pending',
        lastError: message,
      });
      await setVisitDraft(null);
      Alert.alert(
        'Saved offline',
        `${message}\n\nYour responses were queued and will upload when you sync from the Checklists or Visits tab.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !template) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={template.name}
        subtitle="New monitoring visit"
        rightAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>Visit title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Visit title"
        />

        <Text style={styles.fieldLabel}>Visit date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={visitDate}
          onChangeText={setVisitDate}
          placeholder="2026-06-17"
        />

        {allowedSubjectTypes.length > 1 && (
          <>
            <Text style={styles.fieldLabel}>Visit subject *</Text>
            <View style={styles.subjectRow}>
              {allowedSubjectTypes.map((st) => {
                const active = subjectType === st;
                const label = st === 'rri_programme' ? 'RRI programme' : 'Project';
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.subjectChip, active && styles.subjectChipActive]}
                    onPress={() => {
                      setSubjectType(st);
                      setProject(null);
                      setRriProgramme(null);
                    }}
                  >
                    <Text style={[styles.subjectChipText, active && styles.subjectChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {subjectType === 'rri_programme' ? (
          <>
            <Text style={styles.fieldLabel}>RRI programme *</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowProgrammePicker(true)}
            >
              <Text style={rriProgramme ? styles.pickerValue : styles.pickerPlaceholder}>
                {rriProgramme
                  ? `${rriProgramme.name} (#${rriProgramme.programmeId})`
                  : 'Tap to select RRI programme'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Project *</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowProjectPicker(true)}
            >
              <Text style={project ? styles.pickerValue : styles.pickerPlaceholder}>
                {project
                  ? `${project.projectName} (#${project.id})`
                  : 'Tap to select project'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.divider} />
        <ChecklistFormRenderer
          structure={template.structure}
          value={answers}
          onChange={setAnswers}
          projectId={project?.id ?? null}
          subjectType={subjectType}
          rriProgrammeId={rriProgramme?.programmeId ?? null}
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit visit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showProjectPicker} animationType="slide">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Select project</Text>
          <TextInput
            style={styles.input}
            placeholder="Search by name or ID"
            value={projectQuery}
            onChangeText={setProjectQuery}
          />
          <FlatList
            data={filteredProjects.slice(0, 200)}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.projectRow}
                onPress={() => {
                  setProject(item);
                  setShowProjectPicker(false);
                  setProjectQuery('');
                }}
              >
                <Text style={styles.projectName}>{item.projectName}</Text>
                <Text style={styles.projectMeta}>#{item.id}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyProjects}>
                No projects in cache. Sync from Checklists tab first.
              </Text>
            }
          />
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setShowProjectPicker(false)}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={showProgrammePicker} animationType="slide">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Select RRI programme</Text>
          <TextInput
            style={styles.input}
            placeholder="Search by name or ID"
            value={programmeQuery}
            onChangeText={setProgrammeQuery}
          />
          <FlatList
            data={filteredProgrammes.slice(0, 200)}
            keyExtractor={(item) => String(item.programmeId)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.projectRow}
                onPress={() => {
                  setRriProgramme(item);
                  setShowProgrammePicker(false);
                  setProgrammeQuery('');
                }}
              >
                <Text style={styles.projectName}>{item.name}</Text>
                <Text style={styles.projectMeta}>#{item.programmeId}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyProjects}>
                No RRI programmes loaded. Connect and try again.
              </Text>
            }
          />
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setShowProgrammePicker(false)}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textMuted,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  subjectChip: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  subjectChipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  subjectChipText: { color: THEME.text, fontWeight: '600' },
  subjectChipTextActive: { color: '#fff' },
  pickerBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  pickerValue: { color: THEME.text, fontSize: 15 },
  pickerPlaceholder: { color: THEME.textMuted, fontSize: 15 },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 16,
  },
  submitBtn: {
    backgroundColor: THEME.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: THEME.background, padding: 16, paddingTop: 48 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  projectRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  projectName: { fontSize: 15, fontWeight: '600', color: THEME.text },
  projectMeta: { fontSize: 12, color: THEME.textMuted, marginTop: 4 },
  emptyProjects: { textAlign: 'center', color: THEME.textMuted, marginTop: 24 },
  modalClose: {
    marginTop: 12,
    padding: 14,
    alignItems: 'center',
    backgroundColor: THEME.primary,
    borderRadius: 8,
  },
  modalCloseText: { color: '#fff', fontWeight: '700' },
});

export default NewVisitScreen;
