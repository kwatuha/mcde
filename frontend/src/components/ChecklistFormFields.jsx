import { useRef, useState, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import apiService from '../api';
import kenyaWardsService from '../api/kenyaWardsService';
import { useAuth } from '../context/AuthContext';
import { isItemVisible, stripHiddenAnswers } from '../utils/checklistVisibility';
import { buildUserFieldAnswer, isUserFieldEmpty } from '../utils/userFieldUtils';
import {
  checklistOptionLabel,
  checklistOptionValue,
  multiSelectValues,
} from '../utils/checklistAnswerUtils';

/** All options visible with checkboxes (procurement stage assessment style). */
function CheckboxOptionList({
  options = [],
  selectedValues = [],
  disabled = false,
  onToggle,
  getValue = (opt) => opt,
  getLabel = (opt) => String(opt),
  emptyMessage = 'No options available.',
}) {
  const selectedSet = new Set(
    (Array.isArray(selectedValues) ? selectedValues : []).map((v) => String(v))
  );

  if (!options.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'action.hover' : 'grey.50'),
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {selectedSet.size > 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, px: 0.5 }}>
          {selectedSet.size} selected
        </Typography>
      ) : null}
      <Stack spacing={0}>
        {options.map((opt) => {
          const val = getValue(opt);
          const valKey = String(val);
          const label = getLabel(opt);
          const checked = selectedSet.has(valKey);
          return (
            <Stack
              key={valKey}
              direction="row"
              spacing={0.5}
              alignItems="flex-start"
              sx={{
                px: 0.5,
                py: 0.25,
                borderRadius: 0.5,
                '&:hover': disabled ? undefined : { bgcolor: 'action.hover' },
              }}
            >
              <Checkbox
                size="small"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(val, !checked)}
                sx={{ py: 0.25, mt: -0.25 }}
              />
              <Typography variant="body2" sx={{ pt: 0.35, flex: 1, lineHeight: 1.45 }}>
                {label}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

function photoList(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.photos)) return raw.photos;
  if (Array.isArray(raw)) return raw;
  return [];
}

function formatAnswerDisplay(item, raw) {
  if (raw === undefined || raw === null || raw === '') return '—';
  if (item.type === 'multi_select') {
    const values = multiSelectValues(raw);
    if (!values.length) return '—';
    return values.join(', ');
  }
  if (item.type === 'yes_no') return raw === 'yes' || raw === true ? 'Yes' : raw === 'no' || raw === false ? 'No' : String(raw);
  if (item.type === 'progress_status') {
    const labels = { on_track: 'On track', delayed: 'Delayed', stalled: 'Stalled', completed: 'Completed' };
    return labels[raw] || String(raw);
  }
  if (item.type === 'photo') {
    const photos = photoList(raw);
    if (!photos.length) return '—';
    return photos
      .map((p) => {
        const name = p.fileName || 'Photo';
        const geo = p.lat != null && p.lng != null ? ` (${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)})` : '';
        return `${name}${geo}`;
      })
      .join('; ');
  }
  if (item.type === 'location') {
    if (typeof raw !== 'object') return '—';
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
    const acc = raw.accuracy != null ? ` ±${Math.round(Number(raw.accuracy))}m` : '';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}${acc}`;
  }
  if (item.type === 'area_location') {
    if (!raw || typeof raw !== 'object') return '—';
    const parts = [raw.subcounty, raw.ward, raw.sublocation, raw.village].filter(Boolean);
    return parts.length ? parts.join(' → ') : '—';
  }
  if (item.type === 'user') {
    if (raw == null || raw === '') return '—';
    if (typeof raw === 'object') {
      return raw.displayName || raw.username || raw.email || (raw.userId != null ? `User #${raw.userId}` : '—');
    }
    return String(raw);
  }
  if (item.type === 'project_milestones' || item.type === 'project_bq_items' || item.type === 'indicator') {
    if (Array.isArray(raw)) {
      if (!raw.length) return '—';
      return raw.map((e) => (typeof e === 'object' ? e.label || `#${e.id}` : String(e))).join('; ');
    }
    if (raw && typeof raw === 'object' && (raw.label || raw.id != null)) {
      return raw.label || `#${raw.id}`;
    }
    return raw != null && raw !== '' ? String(raw) : '—';
  }
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

function resolvePhotoUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
}

function PhotoField({ item, value, onChange, disabled }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const photos = photoList(value);
  const maxPhotos = item.maxPhotos ?? 1;

  const setPhotos = (next) => onChange({ photos: next });

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f && /^image\//.test(f.type));
    if (!files.length) return;
    const slotsLeft = maxPhotos - photos.length;
    const toUpload = files.slice(0, Math.max(0, slotsLeft));
    if (!toUpload.length) return;

    setUploading(true);
    const next = [...photos];
    try {
      for (const file of toUpload) {
        let lat = null;
        let lng = null;
        let accuracy = null;
        if (item.requireGps && navigator.geolocation) {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 60000,
              });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            accuracy = pos.coords.accuracy;
          } catch {
            // GPS optional failure — upload without coords unless required server-side
          }
        }
        const uploaded = await apiService.dataCollection.uploadAttachment(file, {
          itemId: item.id,
          lat,
          lng,
          accuracy,
          capturedAt: new Date().toISOString(),
        });
        next.push({
          fileId: uploaded.fileId,
          url: uploaded.url,
          fileName: uploaded.fileName,
          lat: uploaded.lat,
          lng: uploaded.lng,
          accuracy: uploaded.accuracy,
          capturedAt: uploaded.capturedAt,
        });
      }
      setPhotos(next);
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Photo upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Stack spacing={1}>
      {photos.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {photos.map((p, idx) => {
            const src = p.url ? resolvePhotoUrl(p.url) : '';
            return (
              <Box
                key={`${p.fileId || p.url || idx}`}
                sx={{
                  position: 'relative',
                  width: 96,
                  height: 96,
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {src ? (
                  <Box
                    component="img"
                    src={src}
                    alt={p.fileName || 'Photo'}
                    onClick={() => setPreviewUrl(src)}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      cursor: 'zoom-in',
                    }}
                  />
                ) : (
                  <Box sx={{ p: 1, fontSize: 11 }}>{p.fileName || 'Photo'}</Box>
                )}
                {!disabled && (
                  <Button
                    size="small"
                    color="error"
                    sx={{ position: 'absolute', top: 0, right: 0, minWidth: 0, p: 0.25 }}
                    onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </Button>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
      {!disabled && photos.length < maxPhotos && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple={maxPhotos > 1}
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={uploading ? <CircularProgress size={16} /> : <PhotoCameraIcon />}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : photos.length ? 'Add photo' : 'Take / upload photo'}
          </Button>
        </>
      )}
      {item.requireGps && (
        <Typography variant="caption" color="text.secondary">
          GPS coordinates captured with each photo when available.
        </Typography>
      )}
      <Dialog open={!!previewUrl} onClose={() => setPreviewUrl(null)} maxWidth="lg" fullWidth>
        <DialogContent sx={{ p: 1, bgcolor: '#111', display: 'flex', justifyContent: 'center' }}>
          {previewUrl ? (
            <Box
              component="img"
              src={previewUrl}
              alt="Evidence photo"
              sx={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

function LocationField({ item, value, onChange, disabled }) {
  const [loading, setLoading] = useState(false);
  const loc = value && typeof value === 'object' ? value : null;
  const hasCoords = loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng));

  const capture = () => {
    if (!navigator.geolocation) {
      window.alert('Geolocation is not supported in this browser.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        window.alert(err?.message || 'Could not get GPS location.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  return (
    <Stack spacing={1}>
      {hasCoords ? (
        <Typography variant="body2">
          {Number(loc.lat).toFixed(6)}, {Number(loc.lng).toFixed(6)}
          {loc.accuracy != null ? ` (±${Math.round(Number(loc.accuracy))} m)` : ''}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No location captured yet.
        </Typography>
      )}
      {!disabled && (
        <Button
          variant="outlined"
          size="small"
          startIcon={loading ? <CircularProgress size={16} /> : <MyLocationIcon />}
          disabled={loading}
          onClick={capture}
        >
          {hasCoords ? 'Refresh location' : 'Capture GPS location'}
        </Button>
      )}
      {hasCoords && (
        <Button
          size="small"
          href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Maps
        </Button>
      )}
    </Stack>
  );
}

function linkedFieldEmptyLabel(type) {
  if (type === 'project_milestones') return 'milestones';
  if (type === 'project_bq_items') return 'BQ items';
  return 'indicators';
}

function ProjectLinkedField({ item, value, onChange, disabled, projectId, subjectType = 'project', rriProgrammeId = null }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const subjectReady =
    subjectType === 'rri_programme'
      ? Number.isFinite(Number(rriProgrammeId))
      : Number.isFinite(Number(projectId));

  useEffect(() => {
    if (!subjectReady) {
      setOptions([]);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await apiService.dataCollection.getFieldOptions({
          source: item.type,
          subjectType,
          projectId: subjectType === 'project' ? Number(projectId) : undefined,
          rriProgrammeId: subjectType === 'rri_programme' ? Number(rriProgrammeId) : undefined,
        });
        if (!cancelled) setOptions(Array.isArray(res?.options) ? res.options : []);
      } catch (e) {
        if (!cancelled) {
          setOptions([]);
          setLoadError(e?.response?.data?.message || e?.message || 'Could not load options.');
        }
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
      <Typography variant="body2" color="text.secondary">
        {subjectType === 'rri_programme'
          ? 'Select an RRI programme first — options load from linked project planning data.'
          : 'Select a project first — options load from the linked project record.'}
      </Typography>
    );
  }

  if (loading) {
    return <CircularProgress size={22} />;
  }

  if (loadError) {
    return (
      <Typography variant="body2" color="error">
        {loadError}
      </Typography>
    );
  }

  if (!options.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No {linkedFieldEmptyLabel(item.type)} found for this {subjectType === 'rri_programme' ? 'programme' : 'project'}.
      </Typography>
    );
  }

  const multi = !!item.allowMultiple;
  const selectedIds = multi
    ? (Array.isArray(value) ? value : []).map((v) => (typeof v === 'object' ? v.id : v))
    : [typeof value === 'object' && value != null ? value.id : value].filter((v) => v != null && v !== '');

  if (multi) {
    return (
      <CheckboxOptionList
        options={options}
        selectedValues={selectedIds}
        disabled={disabled}
        getValue={(opt) => opt.id}
        getLabel={(opt) => opt.label || `#${opt.id}`}
        emptyMessage={`No ${linkedFieldEmptyLabel(item.type)} found for this ${subjectType === 'rri_programme' ? 'programme' : 'project'}.`}
        onToggle={(id, checked) => {
          const nextIds = checked
            ? [...new Set([...selectedIds, id])]
            : selectedIds.filter((x) => String(x) !== String(id));
          onChange(
            nextIds.map((sid) => {
              const opt = options.find((o) => String(o.id) === String(sid));
              return { id: sid, label: opt?.label || `#${sid}` };
            })
          );
        }}
      />
    );
  }

  return (
    <FormControl size="small" fullWidth disabled={disabled}>
      <InputLabel id={`${item.id}-pl-lbl`}>Select</InputLabel>
      <Select
        labelId={`${item.id}-pl-lbl`}
        label="Select"
        value={selectedIds[0] ?? ''}
        onChange={(e) => {
          const opt = options.find((o) => String(o.id) === String(e.target.value));
          if (opt) onChange({ id: opt.id, label: opt.label });
          else onChange('');
        }}
      >
        <MenuItem value="">
          <em>—</em>
        </MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt.id} value={opt.id}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function AreaLocationField({ value, onChange, disabled }) {
  const area = value && typeof value === 'object' ? value : {};
  const [subcounties, setSubcounties] = useState([]);
  const [wards, setWards] = useState([]);
  const [sublocations, setSublocations] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await kenyaWardsService.getCatalogSubcounties();
        if (!cancelled) setSubcounties(list);
      } catch {
        if (!cancelled) setSubcounties([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!area.subcounty) {
      setWards([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await kenyaWardsService.getCatalogWardsBySubcounty(area.subcounty);
        if (!cancelled) setWards(list.map((w) => w.name || w));
      } catch {
        if (!cancelled) setWards([]);
      }
    })();
    return () => { cancelled = true; };
  }, [area.subcounty]);

  useEffect(() => {
    if (!area.subcounty || !area.ward) {
      setSublocations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await kenyaWardsService.getSublocations({ subcounty: area.subcounty, ward: area.ward });
        if (!cancelled) setSublocations(list);
      } catch {
        if (!cancelled) setSublocations([]);
      }
    })();
    return () => { cancelled = true; };
  }, [area.subcounty, area.ward]);

  useEffect(() => {
    if (!area.subcounty || !area.ward || !area.sublocation) {
      setVillages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await kenyaWardsService.getVillages({
          subcounty: area.subcounty,
          ward: area.ward,
          sublocation: area.sublocation,
        });
        if (!cancelled) setVillages(list);
      } catch {
        if (!cancelled) setVillages([]);
      }
    })();
    return () => { cancelled = true; };
  }, [area.subcounty, area.ward, area.sublocation]);

  const setLevel = (key, val) => {
    const next = { ...area, [key]: val || undefined };
    if (key === 'subcounty') {
      delete next.ward;
      delete next.sublocation;
      delete next.village;
    } else if (key === 'ward') {
      delete next.sublocation;
      delete next.village;
    } else if (key === 'sublocation') {
      delete next.village;
    }
    onChange(next);
  };

  const labels = {
    subcounty: 'Sub-county',
    ward: 'Ward',
    sublocation: 'Sublocation',
    village: 'Village',
  };

  const selectProps = (levelKey, options, parentOk) => (
    <FormControl size="small" fullWidth disabled={disabled || !parentOk || loading}>
      <InputLabel id={`area-${levelKey}-lbl`}>{labels[levelKey]}</InputLabel>
      <Select
        labelId={`area-${levelKey}-lbl`}
        label={labels[levelKey]}
        value={area[levelKey] ?? ''}
        onChange={(e) => setLevel(levelKey, e.target.value)}
      >
        <MenuItem value="">
          <em>—</em>
        </MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {opt}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Stack spacing={1}>
      {selectProps('subcounty', subcounties, true)}
      {selectProps('ward', wards, !!area.subcounty)}
      {selectProps('sublocation', sublocations, !!area.ward)}
      {selectProps('village', villages, !!area.sublocation)}
    </Stack>
  );
}

function UserField({ item, value, onChange, disabled }) {
  const { user } = useAuth();

  useEffect(() => {
    if (disabled || !isUserFieldEmpty(value) || !user) return;
    const auto = buildUserFieldAnswer(user);
    if (auto) onChange(auto);
    // Auto-fill once when empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.userId, item.id, disabled, value]);

  const display = isUserFieldEmpty(value) && !user
    ? 'Loading your profile…'
    : value && typeof value === 'object'
      ? value.displayName || value.username || value.email
      : value || '—';

  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {display}
      </Typography>
      {value?.roleName && (
        <Typography variant="caption" color="text.secondary">
          {value.roleName}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        Filled automatically from your signed-in account.
      </Typography>
    </Stack>
  );
}

/** Render editable checklist from template `structure` ({ sections: [{ id, title, items: [{ id, label, type, required, options? }] }] }). */
export default function ChecklistFormFields({
  structure,
  value,
  onChange,
  disabled = false,
  projectId = null,
  subjectType = 'project',
  rriProgrammeId = null,
}) {
  const { user } = useAuth();
  const answers = value && typeof value === 'object' ? value : {};

  useEffect(() => {
    if (disabled || !user || typeof onChange !== 'function') return;
    const auto = buildUserFieldAnswer(user);
    if (!auto) return;
    let changed = false;
    const next = { ...answers };
    for (const sec of structure.sections || []) {
      for (const item of sec.items || []) {
        if (item.type !== 'user') continue;
        if (!isUserFieldEmpty(next[item.id])) continue;
        next[item.id] = auto;
        changed = true;
      }
    }
    if (changed) {
      onChange(stripHiddenAnswers(structure, next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.userId, structure, disabled]);

  const setField = (id, v) => {
    if (disabled || typeof onChange !== 'function') return;
    const next = stripHiddenAnswers(structure, { ...answers, [id]: v });
    onChange(next);
  };

  if (!structure?.sections?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Choose a checklist template to see items.
      </Typography>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ mt: 0.5 }}>
      {structure.sections.map((sec) => {
        const visibleItems = (sec.items || []).filter((item) => isItemVisible(item, answers));
        if (!visibleItems.length) return null;
        return (
        <Box key={sec.id}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'primary.main' }}>
            {sec.title}
          </Typography>
          <Stack spacing={1.75}>
            {visibleItems.map((item) => (
              <Box key={item.id}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: item.required ? 600 : 400 }}>
                  {item.label}
                  {item.required ? ' *' : ''}
                </Typography>
                {item.type === 'yes_no' && (
                  <FormControl disabled={disabled} component="fieldset" variant="standard">
                    <RadioGroup
                      row
                      value={answers[item.id] === 'yes' || answers[item.id] === true ? 'yes' : answers[item.id] === 'no' || answers[item.id] === false ? 'no' : ''}
                      onChange={(e) => setField(item.id, e.target.value)}
                    >
                      <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                      <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                    </RadioGroup>
                  </FormControl>
                )}
                {item.type === 'text' && (
                  <TextField
                    size="small"
                    fullWidth
                    value={answers[item.id] ?? ''}
                    onChange={(e) => setField(item.id, e.target.value)}
                    disabled={disabled}
                  />
                )}
                {item.type === 'textarea' && (
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    value={answers[item.id] ?? ''}
                    onChange={(e) => setField(item.id, e.target.value)}
                    disabled={disabled}
                  />
                )}
                {item.type === 'number' && (
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    value={answers[item.id] ?? ''}
                    onChange={(e) => setField(item.id, e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={disabled}
                  />
                )}
                {item.type === 'select' && (
                  <FormControl size="small" fullWidth disabled={disabled}>
                    <InputLabel id={`${item.id}-lbl`}>Select</InputLabel>
                    <Select
                      labelId={`${item.id}-lbl`}
                      label="Select"
                      value={answers[item.id] ?? ''}
                      onChange={(e) => setField(item.id, e.target.value)}
                    >
                      <MenuItem value="">
                        <em>—</em>
                      </MenuItem>
                      {(item.options || []).map((opt) => (
                        <MenuItem key={opt} value={opt}>
                          {opt}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                {item.type === 'progress_status' && (
                  <FormControl size="small" fullWidth disabled={disabled}>
                    <InputLabel id={`${item.id}-lbl`}>Progress status</InputLabel>
                    <Select
                      labelId={`${item.id}-lbl`}
                      label="Progress status"
                      value={answers[item.id] ?? ''}
                      onChange={(e) => setField(item.id, e.target.value)}
                    >
                      <MenuItem value="">
                        <em>—</em>
                      </MenuItem>
                      {[
                        { value: 'on_track', label: 'On track' },
                        { value: 'delayed', label: 'Delayed' },
                        { value: 'stalled', label: 'Stalled' },
                        { value: 'completed', label: 'Completed' },
                      ].map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                {item.type === 'multi_select' && (
                  <CheckboxOptionList
                    options={item.options || []}
                    selectedValues={multiSelectValues(answers[item.id])}
                    disabled={disabled}
                    getValue={checklistOptionValue}
                    getLabel={checklistOptionLabel}
                    onToggle={(val, checked) => {
                      const current = multiSelectValues(answers[item.id]);
                      const next = checked
                        ? (current.includes(val) ? current : [...current, val])
                        : current.filter((x) => x !== val);
                      setField(item.id, next);
                    }}
                  />
                )}
                {item.type === 'photo' && (
                  <PhotoField
                    item={item}
                    value={answers[item.id]}
                    onChange={(v) => setField(item.id, v)}
                    disabled={disabled}
                  />
                )}
                {item.type === 'location' && (
                  <LocationField
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
                  <UserField
                    item={item}
                    value={answers[item.id]}
                    onChange={(v) => setField(item.id, v)}
                    disabled={disabled}
                  />
                )}
                {(item.type === 'project_milestones' || item.type === 'project_bq_items' || item.type === 'indicator') && (
                  <ProjectLinkedField
                    item={item}
                    value={answers[item.id]}
                    onChange={(v) => setField(item.id, v)}
                    disabled={disabled}
                    projectId={projectId}
                    subjectType={subjectType}
                    rriProgrammeId={rriProgrammeId}
                  />
                )}
              </Box>
            ))}
          </Stack>
        </Box>
        );
      })}
    </Stack>
  );
}

/** Build human-readable rows [{ section, label, value }] for PDF / export */
export function checklistAnswersToRows(structure, answers) {
  if (!structure?.sections?.length) return [];
  const rows = [];
  for (const sec of structure.sections) {
    for (const item of sec.items || []) {
      if (!isItemVisible(item, answers)) continue;
      rows.push({
        section: sec.title,
        label: item.label,
        value: formatAnswerDisplay(item, answers?.[item.id]),
      });
    }
  }
  return rows;
}

export { formatAnswerDisplay };
