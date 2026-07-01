import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ImagePickerResponse } from 'react-native-image-picker';
import { THEME } from '../config/api';
import { PROGRESS_STATUS_OPTIONS } from '../utils/progressStatus';
import {
  ChecklistItem,
  ChecklistLocationAnswer,
  ChecklistPhotoAnswer,
  ChecklistPhotoEntry,
  TemplateStructure,
} from '../types/dataCollection';
import {
  getCurrentLocation,
  promptOpenLocationSettings,
  requestCameraPermission,
} from '../utils/locationCapture';
import { launchCameraDeferred, launchLibraryDeferred } from '../utils/cameraLaunch';
import { normalizeLocationAnswer } from '../utils/locationAnswerUtils';
import { photoList } from '../utils/checklistValidation';
import { isItemVisible, stripHiddenAnswers } from '../utils/checklistVisibility';
import {
  buildUserFieldAnswer,
  formatUserFieldDisplay,
  UserFieldAnswer,
} from '../utils/userFieldUtils';
import AreaLocationField from './AreaLocationField';
import api, { AuthUser } from '../services/api';

interface Props {
  structure: TemplateStructure;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  projectId?: number | null;
  subjectType?: 'project' | 'rri_programme';
  rriProgrammeId?: number | null;
}

function PhotoItemField({
  item,
  value,
  onChange,
  disabled,
  gpsFallback,
}: {
  item: ChecklistItem;
  value: unknown;
  onChange: (v: ChecklistPhotoAnswer) => void;
  disabled?: boolean;
  gpsFallback?: ChecklistLocationAnswer | null;
}) {
  const [busy, setBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const photos = photoList(value);
  const maxPhotos = item.maxPhotos ?? 1;
  const atMax = photos.length >= maxPhotos;

  const resolveGpsForPhoto = async (): Promise<ChecklistLocationAnswer | null> => {
    if (!item.requireGps) return null;
    if (gpsFallback?.lat != null && gpsFallback?.lng != null) {
      return gpsFallback;
    }
    try {
      return await getCurrentLocation();
    } catch (e: any) {
      Alert.alert(
        'GPS required',
        e?.message ||
          'Could not capture GPS. Capture site GPS above first, or enable location and try again.'
      );
      if (e?.code === 1 || e?.code === 2) {
        promptOpenLocationSettings();
      }
      return null;
    }
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    if (disabled || atMax) return;
    if (source === 'camera') {
      const ok = await requestCameraPermission();
      if (!ok) {
        Alert.alert('Permission needed', 'Camera access is required to take photos.');
        return;
      }
    }
    if (source === 'camera') setCameraBusy(true);
    else setBusy(true);
    try {
      const pickerOptions = {
        mediaType: 'photo' as const,
        quality: 0.8 as const,
        saveToPhotos: false,
        includeExtra: true,
      };
      const result: ImagePickerResponse =
        source === 'camera'
          ? await launchCameraDeferred(pickerOptions)
          : await launchLibraryDeferred(pickerOptions);

      if (result.didCancel) {
        return;
      }
      if (result.errorCode || result.errorMessage) {
        Alert.alert(
          'Photo failed',
          result.errorMessage || result.errorCode || 'Could not open camera or gallery.'
        );
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Photo failed', result.errorMessage || 'No image captured.');
        return;
      }

      const exifLat =
        asset.latitude != null && Number.isFinite(Number(asset.latitude))
          ? Number(asset.latitude)
          : null;
      const exifLng =
        asset.longitude != null && Number.isFinite(Number(asset.longitude))
          ? Number(asset.longitude)
          : null;

      let gps: ChecklistLocationAnswer | null = null;
      if (item.requireGps) {
        if (exifLat != null && exifLng != null) {
          gps = {
            lat: exifLat,
            lng: exifLng,
            accuracy: null,
            capturedAt: new Date().toISOString(),
          };
        } else if (gpsFallback?.lat != null && gpsFallback?.lng != null) {
          gps = gpsFallback;
        } else {
          gps = await resolveGpsForPhoto();
          if (!gps) return;
        }
      }

      const entry: ChecklistPhotoEntry = {
        localUri: asset.uri,
        fileName: asset.fileName || `photo-${Date.now()}.jpg`,
        lat: gps?.lat ?? exifLat,
        lng: gps?.lng ?? exifLng,
        accuracy: gps?.accuracy ?? null,
        capturedAt: gps?.capturedAt ?? new Date().toISOString(),
      };
      onChange({ photos: [...photos, entry] });
    } finally {
      setBusy(false);
      setCameraBusy(false);
    }
  };

  const removePhoto = (index: number) => {
    onChange({ photos: photos.filter((_, i) => i !== index) });
  };

  return (
    <View>
      {photos.length > 0 && (
        <View style={styles.photoRow}>
          {photos.map((p, idx) => (
            <View key={`${p.localUri || p.url || idx}`} style={styles.photoThumbWrap}>
              <Image
                source={{ uri: p.localUri || p.url }}
                style={styles.photoThumb}
              />
              {!disabled && (
                <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(idx)}>
                  <Text style={styles.photoRemoveText}>×</Text>
                </TouchableOpacity>
              )}
              {p.lat != null && p.lng != null && (
                <Text style={styles.photoGeo} numberOfLines={1}>
                  {Number(p.lat).toFixed(4)}, {Number(p.lng).toFixed(4)}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
      {!disabled && !atMax && (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.actionBtn, (busy || cameraBusy) && styles.actionBtnDisabled]}
            disabled={busy || cameraBusy}
            onPress={() => addPhoto('camera')}
          >
            {cameraBusy ? (
              <ActivityIndicator color={THEME.primary} size="small" />
            ) : (
              <Text style={styles.actionBtnText}>Camera</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
            disabled={busy || cameraBusy}
            onPress={() => addPhoto('library')}
          >
            <Text style={styles.actionBtnText}>Gallery</Text>
          </TouchableOpacity>
        </View>
      )}
      {!disabled && atMax && (
        <Text style={styles.hint}>Maximum {maxPhotos} photo{maxPhotos !== 1 ? 's' : ''} reached.</Text>
      )}
      {item.requireGps && (
        <Text style={styles.hint}>
          {gpsFallback
            ? 'Uses site GPS above for geotags when the image has no embedded location.'
            : 'GPS coordinates captured with each photo. Capture site GPS first for faster uploads.'}
        </Text>
      )}
    </View>
  );
}

function LocationItemField({
  item,
  value,
  onChange,
  disabled,
}: {
  item: ChecklistItem;
  value: unknown;
  onChange: (v: ChecklistLocationAnswer) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const loc = normalizeLocationAnswer(value);
  const hasCoords = loc != null;

  const capture = async (opts: { offerSettings?: boolean } = {}) => {
    if (disabled) return;
    setBusy(true);
    try {
      const pos = await getCurrentLocation();
      onChange(pos);
    } catch (e: any) {
      const code = e?.code;
      Alert.alert('Location failed', e?.message || 'Could not get GPS.');
      if (opts.offerSettings !== false && (code === 1 || code === 2)) {
        promptOpenLocationSettings();
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (disabled || !item.required || hasCoords) return;
    const timer = setTimeout(() => {
      capture({ offerSettings: false }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
    // Auto-capture once when a required GPS field is shown empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.required, disabled]);

  return (
    <View>
      {hasCoords && loc ? (
        <Text style={styles.locText}>
          {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
          {loc.accuracy != null ? ` (±${Math.round(loc.accuracy)} m)` : ''}
        </Text>
      ) : (
        <Text style={styles.hint}>No location captured yet.</Text>
      )}
      {!disabled && (
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSingle, busy && styles.actionBtnDisabled]}
          disabled={busy}
          onPress={() => capture()}
        >
          {busy ? (
            <ActivityIndicator color={THEME.primary} size="small" />
          ) : (
            <Text style={styles.actionBtnText}>
              {hasCoords ? 'Refresh GPS' : 'Capture GPS location'}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function linkedFieldEmptyLabel(type: string) {
  if (type === 'project_milestones') return 'milestones';
  if (type === 'project_bq_items') return 'BQ items';
  return 'indicators';
}

function ProjectLinkedItemField({
  item,
  value,
  onChange,
  disabled,
  projectId,
  subjectType = 'project',
  rriProgrammeId = null,
}: {
  item: ChecklistItem;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  projectId?: number | null;
  subjectType?: 'project' | 'rri_programme';
  rriProgrammeId?: number | null;
}) {
  const [options, setOptions] = useState<Array<{ id: number; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const subjectReady =
    subjectType === 'rri_programme'
      ? Number.isFinite(Number(rriProgrammeId))
      : Number.isFinite(Number(projectId));

  useEffect(() => {
    if (!subjectReady) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.getFieldOptions({
          source: item.type as 'project_milestones' | 'project_bq_items' | 'indicator',
          subjectType,
          projectId: subjectType === 'project' ? Number(projectId) : undefined,
          rriProgrammeId: subjectType === 'rri_programme' ? Number(rriProgrammeId) : undefined,
        });
        if (!cancelled) setOptions(Array.isArray(res?.options) ? res.options : []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, rriProgrammeId, subjectType, item.type, subjectReady]);

  if (!subjectReady) {
    return (
      <Text style={styles.hint}>
        {subjectType === 'rri_programme' ? 'Select an RRI programme first.' : 'Select a project first.'}
      </Text>
    );
  }
  if (loading) return <ActivityIndicator color={THEME.primary} size="small" />;
  if (!options.length) {
    return (
      <Text style={styles.hint}>
        No {linkedFieldEmptyLabel(item.type)} for this {subjectType === 'rri_programme' ? 'programme' : 'project'}.
      </Text>
    );
  }

  const selectedId =
    typeof value === 'object' && value != null && !Array.isArray(value)
      ? (value as { id?: number }).id
      : null;

  return (
    <View style={styles.optionList}>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.optionRow, selected && styles.optionRowSelected]}
            disabled={disabled}
            onPress={() => onChange({ id: opt.id, label: opt.label })}
          >
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function UserItemField({
  item,
  value,
  onChange,
  disabled,
  sessionUser,
}: {
  item: ChecklistItem;
  value: unknown;
  onChange: (v: UserFieldAnswer) => void;
  disabled?: boolean;
  sessionUser: AuthUser | null;
}) {
  useEffect(() => {
    if (disabled || value != null && value !== '') return;
    const auto = buildUserFieldAnswer(sessionUser);
    if (auto) onChange(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id, item.id, disabled]);

  const display = formatUserFieldDisplay(value);
  const profile =
    value && typeof value === 'object' ? (value as UserFieldAnswer) : null;

  return (
    <View style={styles.userFieldBox}>
      <Text style={styles.userFieldName}>{display}</Text>
      {profile?.roleName ? (
        <Text style={styles.hint}>{profile.roleName}</Text>
      ) : null}
      {profile?.email ? (
        <Text style={styles.hint}>{profile.email}</Text>
      ) : null}
      <Text style={styles.hint}>Filled automatically from your signed-in account.</Text>
    </View>
  );
}

export default function ChecklistFormRenderer({
  structure,
  value,
  onChange,
  disabled = false,
  projectId = null,
  subjectType = 'project',
  rriProgrammeId = null,
  sessionUser = null,
}: Props & { sessionUser?: AuthUser | null }) {
  const [resolvedUser, setResolvedUser] = useState<AuthUser | null>(sessionUser);

  useEffect(() => {
    if (sessionUser?.id) {
      setResolvedUser(sessionUser);
      return;
    }
    let cancelled = false;
    (async () => {
      const cached = await api.getUserData();
      if (!cancelled && cached?.id) {
        setResolvedUser(cached);
        return;
      }
      try {
        const me = await api.fetchMe();
        if (!cancelled) setResolvedUser(me);
      } catch {
        if (!cancelled) setResolvedUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser]);
  const answers = value && typeof value === 'object' ? value : {};
  const siteGps = normalizeLocationAnswer(answers.site_gps);

  const setField = (id: string, v: unknown) => {
    if (disabled) return;
    onChange(stripHiddenAnswers(structure, { ...answers, [id]: v }));
  };

  if (!structure?.sections?.length) {
    return (
      <Text style={styles.empty}>No checklist items in this template.</Text>
    );
  }

  return (
    <View>
      {structure.sections.map((sec) => {
        const visibleItems = (sec.items || []).filter((item) => isItemVisible(item, answers));
        if (!visibleItems.length) return null;
        return (
        <View key={sec.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          {visibleItems.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={[styles.label, item.required && styles.required]}>
                {item.label}
                {item.required ? ' *' : ''}
              </Text>

              {item.type === 'yes_no' && (
                <View style={styles.row}>
                  {(['yes', 'no'] as const).map((opt) => {
                    const selected = answers[item.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.chip, selected && styles.chipSelected]}
                        disabled={disabled}
                        onPress={() => setField(item.id, opt)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {opt === 'yes' ? 'Yes' : 'No'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {item.type === 'text' && (
                <TextInput
                  style={styles.input}
                  value={String(answers[item.id] ?? '')}
                  onChangeText={(t) => setField(item.id, t)}
                  editable={!disabled}
                  placeholder="Enter text"
                />
              )}

              {item.type === 'textarea' && (
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={String(answers[item.id] ?? '')}
                  onChangeText={(t) => setField(item.id, t)}
                  editable={!disabled}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholder="Enter details"
                />
              )}

              {item.type === 'number' && (
                <TextInput
                  style={styles.input}
                  value={
                    answers[item.id] === undefined || answers[item.id] === null
                      ? ''
                      : String(answers[item.id])
                  }
                  onChangeText={(t) =>
                    setField(item.id, t === '' ? '' : Number(t))
                  }
                  editable={!disabled}
                  keyboardType="numeric"
                  placeholder="0"
                />
              )}

              {item.type === 'select' && (
                <View style={styles.optionList}>
                  {(item.options || []).map((opt) => {
                    const selected = answers[item.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optionRow, selected && styles.optionRowSelected]}
                        disabled={disabled}
                        onPress={() => setField(item.id, opt)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            selected && styles.optionTextSelected,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {item.type === 'progress_status' && (
                <View style={styles.optionList}>
                  {PROGRESS_STATUS_OPTIONS.map((opt) => {
                    const selected = answers[item.id] === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.optionRow, selected && styles.optionRowSelected]}
                        disabled={disabled}
                        onPress={() => setField(item.id, opt.value)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            selected && styles.optionTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {item.type === 'multi_select' && (
                <View style={styles.optionList}>
                  {(item.options || []).map((opt) => {
                    const current = Array.isArray(answers[item.id])
                      ? (answers[item.id] as string[])
                      : [];
                    const checked = current.includes(opt);
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optionRow, checked && styles.optionRowSelected]}
                        disabled={disabled}
                        onPress={() => {
                          const next = checked
                            ? current.filter((x) => x !== opt)
                            : [...current, opt];
                          setField(item.id, next);
                        }}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            checked && styles.optionTextSelected,
                          ]}
                        >
                          {checked ? '☑ ' : '☐ '}
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {item.type === 'photo' && (
                <PhotoItemField
                  item={item}
                  value={answers[item.id]}
                  onChange={(v) => setField(item.id, v)}
                  disabled={disabled}
                  gpsFallback={siteGps}
                />
              )}

              {item.type === 'location' && (
                <LocationItemField
                  item={item}
                  value={answers[item.id]}
                  onChange={(v) => setField(item.id, v)}
                  disabled={disabled}
                />
              )}

              {item.type === 'area_location' && (
                <AreaLocationField
                  value={answers[item.id]}
                  onChange={(v) => setField(item.id, v)}
                  disabled={disabled}
                />
              )}

              {item.type === 'user' && (
                <UserItemField
                  item={item}
                  value={answers[item.id]}
                  onChange={(v) => setField(item.id, v)}
                  disabled={disabled}
                  sessionUser={resolvedUser}
                />
              )}

              {(item.type === 'project_milestones' || item.type === 'project_bq_items' || item.type === 'indicator') && (
                <ProjectLinkedItemField
                  item={item}
                  value={answers[item.id]}
                  onChange={(v) => setField(item.id, v)}
                  disabled={disabled}
                  projectId={projectId}
                  subjectType={subjectType}
                  rriProgrammeId={rriProgrammeId}
                />
              )}
            </View>
          ))}
        </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: THEME.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.primary,
    marginBottom: 12,
  },
  item: {
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    color: THEME.text,
    marginBottom: 6,
  },
  required: {
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: THEME.text,
  },
  textarea: {
    minHeight: 96,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: '#fff',
  },
  chipSelected: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  chipText: {
    color: THEME.text,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },
  optionList: {
    gap: 6,
  },
  optionRow: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  optionRowSelected: {
    borderColor: THEME.primary,
    backgroundColor: '#E3F2FD',
  },
  optionText: {
    fontSize: 14,
    color: THEME.text,
  },
  optionTextSelected: {
    color: THEME.primaryDark,
    fontWeight: '600',
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  actionBtnSingle: {
    flex: undefined,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: THEME.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    color: THEME.textMuted,
    marginTop: 4,
  },
  locText: {
    fontSize: 14,
    color: THEME.text,
    marginBottom: 4,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  photoThumbWrap: {
    width: 88,
    position: 'relative',
  },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  photoRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
  },
  photoGeo: {
    fontSize: 9,
    color: THEME.textMuted,
    marginTop: 2,
  },
  userFieldBox: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  userFieldName: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.text,
  },
});
