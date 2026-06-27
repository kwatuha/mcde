import React, { useCallback, useEffect, useState } from 'react';
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
  setVisitDraft,
} from '../services/offlineStore';
import { makeLocalId } from '../services/syncService';
import { validateChecklistAnswers } from '../utils/checklistValidation';
import {
  DataCollectionTemplate,
  ProjectLite,
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
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [project, setProject] = useState<ProjectLite | null>(null);
  const [projectQuery, setProjectQuery] = useState('');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [visitDate, setVisitDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
      setTemplate(tpl);
      setProjects(cachedProjects);
      setTitle(
        draft?.title ||
          `${tpl?.name || templateNameParam || 'Visit'} — ${todayIso()}`
      );
      setVisitDate(draft?.visitDate || todayIso());
      if (draft?.answers && draft.templateId === templateId) {
        setAnswers(draft.answers);
      }
      if (draft?.projectId) {
        const p = cachedProjects.find((x) => x.id === draft.projectId);
        if (p) setProject(p);
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
    const timer = setTimeout(() => {
      setVisitDraft({
        templateId,
        projectId: project?.id,
        visitDate,
        title,
        answers,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [templateId, project?.id, visitDate, title, answers]);

  const filteredProjects = projects.filter((p) => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.projectName.toLowerCase().includes(q) ||
      String(p.id).includes(q)
    );
  });

  const handleSubmit = async () => {
    if (!template) return;
    if (!project) {
      Alert.alert('Project required', 'Select the project for this visit.');
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
    const payload = {
      templateId: template.templateId,
      projectId: project.id,
      visitDate,
      title: title.trim() || `${template.name} visit`,
      answers,
    };

    try {
      await apiService.createSubmission(payload);
      await setVisitDraft(null);
      Alert.alert('Saved', 'Monitoring visit submitted to Machakos server.', [
        { text: 'OK', onPress: () => navigation.navigate('Submissions') },
      ]);
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Upload failed';
      const localId = makeLocalId();
      await savePendingSubmission({
        localId,
        templateId: template.templateId,
        templateName: template.name,
        projectId: project.id,
        projectName: project.projectName,
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
        `${message}\n\nYour responses were queued and will upload when you sync from the Checklists tab.`,
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

        <View style={styles.divider} />
        <ChecklistFormRenderer
          structure={template.structure}
          value={answers}
          onChange={setAnswers}
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
