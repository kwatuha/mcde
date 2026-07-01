import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Paper, CircularProgress, IconButton,
  Select, MenuItem, FormControl, InputLabel, Snackbar, Alert, Stack, useTheme, FormControlLabel,
  Chip, Checkbox, Switch, Avatar, Tabs, Tab, Accordion, AccordionSummary, AccordionDetails, Divider,
  DialogContentText, InputAdornment, Grid, Autocomplete,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip,
  Menu, ListItemIcon, ListItemText,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DataGrid } from "@mui/x-data-grid";
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, PersonAdd as PersonAddIcon, Settings as SettingsIcon, Lock as LockIcon, LockReset as LockResetIcon, MarkEmailRead as MarkEmailReadIcon, Block as BlockIcon, CheckCircle as CheckCircleIcon, Search as SearchIcon, Clear as ClearIcon, Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon, AccountTree as AccountTreeIcon, ExpandMore as ExpandMoreIcon, ViewList as ViewListIcon, Hub as HubIcon, AdminPanelSettings as AdminPanelSettingsIcon, TableChart as ExcelIcon, Security as SecurityIcon, SyncAlt as SyncAltIcon, MoreVert as MoreVertIcon } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { useSearchParams } from 'react-router-dom';
import apiService from '../api/userService';
import apiServiceMain from '../api';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "./dashboard/theme";
import { brand } from '../theme/colorTokens';
import menuConfig from '../configs/menuConfig.json';
import {
  isSuperAdminUser,
  normalizeRoleForCompare,
  isMdaIctAdminUser,
  canMdaIctAdminMutateUser,
} from '../utils/roleUtils';

/** Shown when MDA ICT Admin hits controls for users outside allowed roles (matches API copy). */
const MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE =
  'MDA ICT Admin can only edit users in Data Entry Officer, Data Approver, or Viewer roles.';

/** Cabinet row in the ministries catalog; all county users share this parent. */
const DEFAULT_MACHAKOS_PARENT_ORG = 'Machakos County Executive';

/** Map users.otp_channel to checkbox state for the user form. */
function otpDeliveryFromChannel(channel) {
  const c = String(channel || 'email').trim().toLowerCase();
  return {
    email: c === 'email' || c === 'both',
    sms: c === 'sms' || c === 'both',
  };
}

function otpChannelFromDelivery({ email, sms }) {
  if (email && sms) return 'both';
  if (sms) return 'sms';
  return 'email';
}

function formatOtpChannelLabel(channel) {
  const c = String(channel || 'email').trim().toLowerCase();
  if (c === 'both') return 'Email and SMS';
  if (c === 'sms') return 'SMS only';
  return 'Email only';
}

const PROJECT_DETAIL_UI_TAB_OPTIONS = [
  { key: 'projectDetails:overview', label: 'Overview', group: 'Core details', description: 'Project summary, location, ownership and status.' },
  { key: 'projectDetails:financials', label: 'Financials', group: 'Finance and planning', description: 'Budget, disbursement and financial fields.' },
  { key: 'projectDetails:sites', label: 'Sites / Photos', group: 'Delivery evidence', description: 'Project sites, uploaded photos and location evidence.' },
  { key: 'projectDetails:jobs', label: 'Jobs', group: 'Delivery evidence', description: 'Employment and local impact records.' },
  { key: 'projectDetails:inspection', label: 'Inspection', group: 'Delivery evidence', description: 'Inspection and monitoring evidence.' },
  { key: 'projectDetails:schedule', label: 'Schedule & Milestones', group: 'Delivery evidence', description: 'Timeline, milestones and implementation schedule.' },
  { key: 'projectDetails:bq', label: 'BQ', group: 'Finance and planning', description: 'Bill of quantities and work items.' },
  { key: 'projectDetails:certificates', label: 'Payment Certificates', group: 'Finance and planning', description: 'Certificate generation and payment support.' },
  { key: 'projectDetails:map', label: 'Map', group: 'Core details', description: 'Project map and geospatial view.' },
  { key: 'projectDetails:implementation-plan', label: 'CIDP / Implementation Plan', group: 'Finance and planning', description: 'CIDP linkage and implementation plan context.' },
  { key: 'projectDetails:inception', label: 'Inception', group: 'Delivery evidence', description: 'Inception reports and project kick-off documentation.' },
  { key: 'projectDetails:payments', label: 'Payments', group: 'Finance and planning', description: 'Payment requests and contractor payment workflow.' },
];

const USER_FORM_TEXT_FIELD_NAMES = [
  'username',
  'email',
  'phoneNumber',
  'firstName',
  'lastName',
  'idNumber',
  'employeeNumber',
  'password',
  'confirmPassword',
];

const USER_FORM_ERROR_PRIORITY = [
  'projectScopes',
  'role',
  'username',
  'email',
  'password',
  'confirmPassword',
  'firstName',
  'lastName',
  'phoneNumber',
  'otpChannel',
];

function getPrimaryUserFormError(errors = {}) {
  for (const key of USER_FORM_ERROR_PRIORITY) {
    if (errors[key]) return errors[key];
  }
  const keys = Object.keys(errors);
  return keys.length ? errors[keys[0]] : null;
}

function normalizeUiProfileKeys(keys) {
  return [...new Set((keys || []).map((key) => String(key || '').trim()).filter(Boolean))];
}

function buildUiMenuVisibilityGroups() {
  return (menuConfig.menuCategories || []).flatMap((category) => {
    if (category.hidden === true || category.scopeDown === true) return [];
    const items = (category.submenus || [])
      .filter((submenu) => submenu.hidden !== true)
      .map((submenu) => ({
        key: submenu.route ? `route:${submenu.route}` : `menu:${category.id}:${submenu.title || submenu.to || ''}`,
        label: submenu.title || submenu.route || submenu.to || 'Untitled menu item',
        route: submenu.route || submenu.to || '',
      }))
      .filter((item) => item.key && item.label);
    if (items.length === 0) return [];
    return [{
      key: `category:${category.id}`,
      id: category.id,
      label: category.label || category.id,
      labelTree: category.labelTree || category.label || category.id,
      items,
    }];
  });
}

function buildUiMenuVisibilityOptions(groups = buildUiMenuVisibilityGroups()) {
  return groups.flatMap((category) => {
    const group = {
      key: category.key,
      label: `Menu group: ${category.label || category.id}`,
      group: 'Menu groups',
    };
    const items = (category.items || [])
      .map((item) => ({
        key: item.key,
        label: `${category.label || category.id}: ${item.label}`,
        group: 'Menu items',
      }));
    return [group, ...items];
  });
}

function resolveCountyParentOrgName(hierarchy) {
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) return DEFAULT_MACHAKOS_PARENT_ORG;
  const row = hierarchy.find((m) => {
    const n = String(m?.name || m?.alias || '').toLowerCase();
    return n.includes('machakos') || n.includes('county executive');
  });
  const name = String(row?.name || row?.alias || hierarchy[0]?.name || '').trim();
  return name || DEFAULT_MACHAKOS_PARENT_ORG;
}

/** Profile `directorate` stores one or more section names joined by `|||`. */
function splitDirectorateProfileField(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  const s = String(raw).trim();
  if (s.includes('|||')) return s.split('|||').map((x) => x.trim()).filter(Boolean);
  return [s];
}

/** API `issue` codes from GET /users/organization-integrity/preview → misaligned rows */
const ORG_INTEGRITY_ISSUE_LABELS = {
  unknown_ministry: 'Parent organization: no registry match (reconcile skips)',
  ministry_would_change: 'Parent organization: will update to registry name',
  unknown_state_department: 'Department: no registry match (reconcile skips)',
  state_department_would_change: 'Department: will update to registry name',
};

function formatOrgIntegrityIssue(issue) {
  if (!issue) return '—';
  return ORG_INTEGRITY_ISSUE_LABELS[issue] || issue;
}

function orgIntegrityRowSearchHaystack(sectionKey, row) {
  const parts = [];
  if (sectionKey === 'users') {
    parts.push(row.userId, row.username, row.currentMinistry, row.currentStateDepartment, row.proposedMinistry, row.proposedStateDepartment, row.issue, formatOrgIntegrityIssue(row.issue));
  } else if (sectionKey === 'scopes') {
    parts.push(row.scopeId, row.userId, row.username, row.scopeType, row.currentMinistry, row.currentStateDepartment, row.proposedMinistry, row.proposedStateDepartment, row.issue, formatOrgIntegrityIssue(row.issue));
  } else {
    parts.push(row.projectId, row.projectName, row.currentMinistry, row.currentStateDepartment, row.proposedMinistry, row.proposedStateDepartment, row.issue, formatOrgIntegrityIssue(row.issue));
  }
  return parts.filter((v) => v != null && v !== '').join(' ').toLowerCase();
}

function filterOrgIntegrityRows(rows, sectionKey, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q || !Array.isArray(rows)) return rows || [];
  return rows.filter((row) => orgIntegrityRowSearchHaystack(sectionKey, row).includes(q));
}

// --- Utility function for case conversion (Copied from ProjectDetailsPage for consistency) ---
const snakeToCamelCase = (obj) => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(v => snakeToCamelCase(v));
  }
  const newObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      newObj[camelKey] = snakeToCamelCase(obj[key]);
    }
  }
  return newObj;
};

/** Strings from user_organization_scope rows (and legacy user fields) for global search */
function organizationScopesToSearchStrings(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return [];
  const parts = [];
  for (const s of scopes) {
    if (!s || typeof s !== 'object') continue;
    const ministry = s.ministry;
    const sd = s.stateDepartment ?? s.state_department ?? '';
    const agencyName = s.agencyName ?? s.agency_name ?? '';
    const aid = s.agencyId ?? s.agency_id;
    if (ministry) parts.push(String(ministry));
    if (sd) parts.push(String(sd));
    if (agencyName) parts.push(String(agencyName));
    if (aid != null && aid !== '') parts.push(String(aid));
    const st = s.scopeType ?? s.scope_type;
    if (st) parts.push(String(st));
  }
  return parts;
}

function projectScopesToSearchStrings(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return [];
  return scopes.flatMap((s) => [
    s?.scopeType ?? s?.scope_type ?? '',
    s?.scopeValue ?? s?.scope_value ?? '',
  ]).map((v) => String(v || '').trim()).filter(Boolean);
}

/** One cell-friendly summary of organizationScopes for Excel export */
function organizationScopesToExcelString(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return '';
  return scopes
    .map((s) => {
      if (!s || typeof s !== 'object') return '';
      const st = s.scopeType ?? s.scope_type ?? '';
      const m = (s.ministry || '').trim();
      const sd = String(s.stateDepartment ?? s.state_department ?? '').trim();
      const an = String(s.agencyName ?? s.agency_name ?? '').trim();
      const aid = s.agencyId ?? s.agency_id;
      const bits = [st, m || null, sd || null, an || null, aid != null && aid !== '' ? `#${aid}` : null].filter(Boolean);
      return bits.join(' · ');
    })
    .filter(Boolean)
    .join(' | ');
}

function projectScopesToExcelString(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return '';
  return scopes
    .map((s) => {
      const st = String(s?.scopeType ?? s?.scope_type ?? '').trim();
      const sv = String(s?.scopeValue ?? s?.scope_value ?? '').trim();
      if (st.toUpperCase() === 'ALL_DEPARTMENTS') return 'All departments (county-wide project access)';
      return [st, sv].filter(Boolean).join(' · ');
    })
    .filter(Boolean)
    .join(' | ');
}

/**
 * Primary organization bucket for grouping (profile fields, then scope rows).
 * @param {object} options
 * @param {boolean} [options.excludeAgency] — If true, never group by implementing agency; use ministry/state
 *   (and non-agency scopes, or ministry/state on AGENCY scope rows) instead. Used for "By organization" view.
 */
function getUserOrgGroupInfo(user, options = {}) {
  const excludeAgency = options.excludeAgency === true;
  const agencyName = (user.agencyName || user.agency_name || '').trim();
  const ministry = (user.ministry || '').trim();
  const stateDepartment = (user.stateDepartment || user.state_department || '').trim();
  const agencyId = user.agencyId ?? user.agency_id;

  if (!excludeAgency && (agencyName || agencyId != null)) {
    const label = agencyName || (agencyId != null ? `Agency #${agencyId}` : 'Agency');
    const subtitle = [ministry, stateDepartment].filter(Boolean).join(' · ');
    return {
      key: `agency:${agencyId ?? agencyName}`,
      label: subtitle ? `${label} — ${subtitle}` : label,
      sortTier: 0,
    };
  }
  if (ministry && stateDepartment) {
    return {
      key: `dept:${ministry}|${stateDepartment}`,
      label: `${ministry} — ${stateDepartment}`,
      sortTier: 1,
    };
  }
  if (ministry) {
    return {
      key: `ministry:${ministry}`,
      label: `${ministry} (parent organization on profile only)`,
      sortTier: 2,
    };
  }

  const scopes = user.organizationScopes;
  if (Array.isArray(scopes) && scopes.length > 0) {
    const s = excludeAgency
      ? (scopes.find((x) => (x.scopeType || x.scope_type) !== 'AGENCY') || scopes[0])
      : scopes[0];
    const st = s.scopeType || s.scope_type;
    if (st === 'AGENCY') {
      if (excludeAgency) {
        const m = (s.ministry || '').trim();
        const sd = String(s.stateDepartment || s.state_department || '').trim();
        if (m && sd) {
          return { key: `scope-sd:${m}|${sd}`, label: `${m} — ${sd} (org access)`, sortTier: 1 };
        }
        if (m) {
          return { key: `scope-m:${m}`, label: `${m} (org access)`, sortTier: 2 };
        }
        return { key: 'unassigned', label: 'No organization assigned', sortTier: 99 };
      }
      const an = (s.agencyName || s.agency_name || '').trim();
      const aid = s.agencyId ?? s.agency_id;
      const label = an || (aid != null ? `Agency #${aid}` : 'Agency (scope)');
      return { key: `scope-a:${aid ?? label}`, label: `${label} (org access)`, sortTier: 0 };
    }
    if (st === 'STATE_DEPARTMENT_ALL') {
      const m = (s.ministry || '').trim();
      const sd = (s.stateDepartment || s.state_department || '').trim();
      return { key: `scope-sd:${m}|${sd}`, label: `${m} — ${sd} (department access)`, sortTier: 1 };
    }
    if (st === 'MINISTRY_ALL') {
      const m = (s.ministry || '').trim();
      return { key: `scope-m:${m}`, label: `${m} (all departments under parent)`, sortTier: 2 };
    }
  }

  return { key: 'unassigned', label: 'No organization assigned', sortTier: 99 };
}

function getUserAccessLevelGroups(user, options = {}) {
  const agencies = Array.isArray(options.agencies) ? options.agencies : [];
  const validMinistryNames = options.validMinistryNames || new Set();
  const validDeptPairs = options.validDeptPairs || new Set();
  const validDepartmentNames = options.validDepartmentNames || new Set();
  const validAgenciesById = options.validAgenciesById || new Map();
  const validAgenciesByName = options.validAgenciesByName || new Map();

  const normalizeKey = (v) => String(v || '').trim().toLowerCase();
  const scopes = Array.isArray(user?.organizationScopes) ? user.organizationScopes : [];
  const normalizedScopes = scopes
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const scopeType = String(s.scopeType || s.scope_type || '').trim().toUpperCase();
      const ministry = String(s.ministry || '').trim();
      const stateDepartment = String(s.stateDepartment || s.state_department || '').trim();
      const agencyId = s.agencyId ?? s.agency_id;
      const agencyName = String(s.agencyName || s.agency_name || '').trim();
      return { scopeType, ministry, stateDepartment, agencyId, agencyName };
    })
    .filter(Boolean);

  const groups = [];
  const seen = new Set();
  const addGroup = (group) => {
    if (!group || !group.key || seen.has(group.key)) return;
    seen.add(group.key);
    groups.push(group);
  };

  for (const s of normalizedScopes) {
    if (s.scopeType === 'ALL_MINISTRIES') {
      addGroup({
        key: 'access:all-ministries',
        label: 'All departments (county-wide)',
        sortTier: 0,
        description: 'Can access projects across the full county department catalog',
      });
      continue;
    }
    if (s.scopeType === 'MINISTRY_ALL') {
      const m = s.ministry || 'Unspecified parent organization';
      const validMinistry = validMinistryNames.has(normalizeKey(m));
      addGroup({
        key: validMinistry
          ? `access:ministry:${normalizeKey(m)}`
          : `access:invalid-ministry:${normalizeKey(m) || 'unspecified'}`,
        label: validMinistry
          ? `Parent organization — all departments: ${m}`
          : `Invalid parent organization: ${m}`,
        sortTier: validMinistry ? 1 : 96,
        description: validMinistry
          ? `Can access projects for all departments under ${m}`
          : 'Parent organization not found in registry; user may not load projects',
      });
      continue;
    }
    if (s.scopeType === 'STATE_DEPARTMENT_ALL') {
      const m = s.ministry || 'Unspecified parent organization';
      const sd = s.stateDepartment || 'Unspecified department';
      const validPair = validDeptPairs.has(`${normalizeKey(m)}|${normalizeKey(sd)}`);
      const validDepartment = validDepartmentNames.has(normalizeKey(sd));
      addGroup({
        key: validPair
          ? `access:state-department:${normalizeKey(m)}|${normalizeKey(sd)}`
          : `access:invalid-state-department:${normalizeKey(m)}|${normalizeKey(sd)}`,
        label: validPair
          ? `Department: ${sd}`
          : `Invalid department: ${sd}`,
        sortTier: validPair ? 2 : 97,
        description: validPair
          ? `Parent organization: ${m}`
          : validDepartment
          ? `Department exists but is not under parent organization ${m}; user may not load projects`
          : 'Department not found in registry; user may not load projects',
      });
      continue;
    }
    if (s.scopeType === 'AGENCY') {
      const agencyIdKey = s.agencyId != null && s.agencyId !== '' ? String(s.agencyId) : null;
      const agencyNameKey = normalizeKey(s.agencyName);
      const agencyRow =
        (agencyIdKey ? validAgenciesById.get(agencyIdKey) : null) ||
        (agencyNameKey ? validAgenciesByName.get(agencyNameKey) : null) ||
        (agencyIdKey
          ? agencies.find((a) => String(a?.agency_id ?? a?.agencyId ?? '') === agencyIdKey)
          : null);

      const mappedMinistry = String(agencyRow?.ministry || '').trim();
      const mappedStateDept = String(agencyRow?.state_department || agencyRow?.stateDepartment || '').trim();

      if (mappedStateDept) {
        const pairOk = validDeptPairs.has(`${normalizeKey(mappedMinistry)}|${normalizeKey(mappedStateDept)}`);
        const deptOk = validDepartmentNames.has(normalizeKey(mappedStateDept));
        addGroup({
          key: pairOk
            ? `access:legacy-to-state-department:${normalizeKey(mappedMinistry)}|${normalizeKey(mappedStateDept)}`
            : `access:legacy-invalid-state-department:${normalizeKey(mappedMinistry)}|${normalizeKey(mappedStateDept)}`,
          label: pairOk
            ? `Legacy agency → department: ${mappedStateDept}`
            : `Legacy agency → invalid department: ${mappedStateDept}`,
          sortTier: pairOk ? 3 : 97,
          description: pairOk
            ? `Derived from agency mapping (parent: ${mappedMinistry || '—'})`
            : deptOk
            ? `Derived department exists but not under parent organization ${mappedMinistry || '—'}`
            : 'Derived department not found in registry; user may not load projects',
        });
      }
      addGroup({
        key: 'access:legacy-agency',
        label: 'Legacy Agency Scope',
        sortTier: 98,
        description: 'Still mapped to old agency scope and may not see projects',
      });
    }
  }

  const hasNonAgencyScope = normalizedScopes.some((s) => s.scopeType && s.scopeType !== 'AGENCY');
  const hasAgencyScope = normalizedScopes.some((s) => s.scopeType === 'AGENCY');
  const hasProfileAgency = Boolean((user?.agencyName || user?.agency_name || '').trim() || user?.agencyId || user?.agency_id);
  const hasProfileMinistryState = Boolean((user?.ministry || '').trim() || (user?.stateDepartment || user?.state_department || '').trim());

  if (!hasNonAgencyScope && (hasAgencyScope || hasProfileAgency)) {
    addGroup({
      key: 'access:legacy-agency',
      label: 'Legacy Agency Scope',
      sortTier: 98,
      description: 'Still mapped to old agency scope and may not see projects',
    });
  }

  if (groups.length === 0) {
    addGroup({
      key: hasProfileMinistryState ? 'access:no-scope-profile-only' : 'access:no-scope',
      label: hasProfileMinistryState ? 'No Scope Assigned (Profile Values Only)' : 'No Scope Assigned',
      sortTier: 99,
      description: hasProfileMinistryState
        ? 'Has parent organization / department on profile but no organization access rows'
        : 'No organization scope rows configured',
    });
  }

  return groups;
}

/** Filled icon button for data-grid row actions — white icon on tone background. */
function TableActionIconButton({ title, onClick, disabled, tone = 'neutral', children }) {
  const colors = tokens(useTheme().palette.mode);
  const toneBg = {
    neutral: { main: colors.blueAccent[500], hover: colors.blueAccent[600] },
    info: { main: colors.blueAccent[700], hover: colors.blueAccent[600] },
    scope: { main: colors.purple?.[700] || colors.blueAccent[800], hover: colors.purple?.[600] || colors.blueAccent[700] },
    danger: { main: colors.redAccent[700], hover: colors.redAccent[600] },
    success: { main: colors.greenAccent[700], hover: colors.greenAccent[600] },
  }[tone] || { main: colors.blueAccent[500], hover: colors.blueAccent[600] };

  const button = (
    <IconButton
      size="small"
      disabled={disabled}
      onClick={onClick}
      aria-label={title}
      sx={{
        width: 36,
        height: 36,
        borderRadius: '8px',
        border: 'none',
        color: disabled ? alpha(brand.onPrimary, 0.45) : brand.onPrimary,
        bgcolor: disabled ? alpha(colors.primary[500], 0.35) : toneBg.main,
        boxShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,0.12)',
        '& .MuiSvgIcon-root': {
          color: 'inherit',
        },
        '&:hover': disabled
          ? {}
          : {
              bgcolor: toneBg.hover,
              color: brand.onPrimary,
            },
      }}
    >
      {children}
    </IconButton>
  );

  return (
    <Tooltip title={title} arrow placement="top">
      {disabled ? <span>{button}</span> : button}
    </Tooltip>
  );
}

/** Active / disabled status pill — white label on tone background (matches action buttons). */
function UserStatusBadge({
  isActive,
  canToggle = false,
  onToggle,
  title,
  size = 'default',
}) {
  const colors = tokens(useTheme().palette.mode);
  const compact = size === 'compact';
  const bg = isActive ? colors.greenAccent[700] : colors.redAccent[700];
  const hoverBg = isActive ? colors.redAccent[600] : colors.greenAccent[600];

  return (
    <Box
      m={compact ? 0 : '0 auto'}
      px={compact ? 1 : undefined}
      py={compact ? 0.25 : undefined}
      p={compact ? undefined : '6px 12px'}
      display="inline-flex"
      justifyContent="center"
      alignItems="center"
      gap={0.5}
      bgcolor={bg}
      borderRadius="8px"
      onClick={() => {
        if (canToggle && onToggle) onToggle();
      }}
      title={title}
      sx={{
        cursor: canToggle ? 'pointer' : 'default',
        transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        minWidth: 'fit-content',
        whiteSpace: 'nowrap',
        color: brand.onPrimary,
        '&:hover': canToggle
          ? {
              bgcolor: hoverBg,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }
          : {},
      }}
    >
      {isActive ? (
        <CheckCircleIcon sx={{ color: brand.onPrimary, fontSize: compact ? 16 : 18 }} />
      ) : (
        <BlockIcon sx={{ color: brand.onPrimary, fontSize: compact ? 16 : 18 }} />
      )}
      <Typography sx={{ color: brand.onPrimary, fontSize: compact ? '0.75rem' : '0.875rem', fontWeight: 700 }}>
        {isActive ? 'Active' : 'Disabled'}
      </Typography>
    </Box>
  );
}

/** Stable badge colour from role name (handles long display names like "Sub-County Administrator"). */
function resolveRoleBadgeColor(roleName, colors) {
  const r = String(roleName || '').trim().toLowerCase();
  if (!r) return colors.blueAccent[700];
  if (r.includes('super admin')) return colors.redAccent[700];
  if (r.includes('sub-county') || r.includes('subcounty')) return colors.blueAccent[700];
  if (r.includes('ward')) return colors.greenAccent[700];
  if (r.includes('ict')) return colors.blueAccent[600];
  if (r.includes('architect')) return colors.purple?.[700] || colors.blueAccent[800];
  if (r.includes('viewer')) return colors.greenAccent[600];
  if (r.includes('monitor')) return colors.orange?.[600] || colors.blueAccent[600];
  if (r.includes('admin')) return colors.primary[500] || colors.blueAccent[600];
  if (r.includes('approver')) return colors.purple?.[600] || colors.blueAccent[700];
  if (r.includes('officer') || r.includes('entry')) return colors.blueAccent[500];
  let hash = 0;
  for (let i = 0; i < r.length; i += 1) {
    hash = r.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = [
    colors.blueAccent[700],
    colors.greenAccent[700],
    colors.purple?.[700] || colors.blueAccent[800],
    colors.blueAccent[600],
  ];
  return palette[Math.abs(hash) % palette.length];
}

/** Role pill — full name in tooltip; truncates cleanly inside narrow columns. */
function UserRoleBadge({ role, size = 'default' }) {
  const colors = tokens(useTheme().palette.mode);
  const label = String(role || '').trim() || 'N/A';
  const compact = size === 'compact';
  const bg = resolveRoleBadgeColor(label, colors);

  return (
    <Tooltip title={label} arrow placement="top">
      <Chip
        size="small"
        label={label}
        sx={{
          maxWidth: '100%',
          height: compact ? 24 : 28,
          bgcolor: bg,
          color: brand.onPrimary,
          fontWeight: 700,
          borderRadius: '8px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
          '& .MuiChip-label': {
            px: compact ? 1 : 1.25,
            py: 0.25,
            color: brand.onPrimary,
            fontSize: compact ? '0.7rem' : '0.8rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
          },
        }}
      />
    </Tooltip>
  );
}

function UserRowActionsCell({
  row,
  currentUser,
  isSuperAdmin,
  canUpdate,
  canDelete,
  onView,
  onProjectAccess,
  onResetPassword,
  onDelete,
  onResendCredentials,
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const isCurrentUser = row.userId === currentUser?.id;
  const canMutate = canMdaIctAdminMutateUser(currentUser, row);

  const menuItems = [];
  if (canUpdate) {
    menuItems.push({
      key: 'scope',
      label: 'Project access',
      icon: <AccountTreeIcon fontSize="small" />,
      disabled: !canMutate,
      title: canMutate
        ? 'County-wide, sector, department, ward, and other data scopes'
        : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE,
      onClick: () => canMutate && onProjectAccess(row),
    });
    menuItems.push({
      key: 'reset',
      label: 'Reset password',
      icon: <LockResetIcon fontSize="small" />,
      disabled: isCurrentUser || !canMutate,
      title: isCurrentUser
        ? 'Use profile to change your password'
        : !canMutate
          ? MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
          : 'Reset password to reset123',
      onClick: () => !isCurrentUser && canMutate && onResetPassword(row),
    });
  }
  if (isSuperAdmin && canUpdate) {
    menuItems.push({
      key: 'credentials',
      label: 'Resend login email',
      icon: <SecurityIcon fontSize="small" />,
      disabled: !row?.email,
      title: row?.email ? 'Resend login credentials (Super Admin only)' : 'User has no email address',
      onClick: () => row?.email && onResendCredentials(row),
    });
  }
  if (isSuperAdmin && canDelete) {
    menuItems.push({
      key: 'delete',
      label: 'Delete user',
      icon: <DeleteIcon fontSize="small" />,
      disabled: isCurrentUser,
      danger: true,
      title: isCurrentUser ? 'You cannot delete your own account' : 'Delete user (Super Admin only)',
      onClick: () => !isCurrentUser && onDelete(row.userId, row.username),
    });
  }

  const closeMenu = () => setMenuAnchor(null);

  return (
    <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="center">
      <TableActionIconButton title="View details" tone="info" onClick={() => onView(row)}>
        <VisibilityIcon sx={{ fontSize: 18 }} />
      </TableActionIconButton>
      {menuItems.length > 0 && (
        <>
          <TableActionIconButton
            title="More actions"
            tone="neutral"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <MoreVertIcon sx={{ fontSize: 18 }} />
          </TableActionIconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={closeMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  minWidth: 220,
                  mt: 0.5,
                  borderRadius: 1.5,
                  border: `1px solid ${alpha(colors.primary[300], 0.4)}`,
                },
              },
            }}
          >
            {menuItems.map((item) => (
              <Tooltip key={item.key} title={item.title} placement="left" arrow>
                <span>
                  <MenuItem
                    disabled={item.disabled}
                    onClick={() => {
                      closeMenu();
                      item.onClick();
                    }}
                    sx={{
                      py: 1,
                      gap: 1,
                      color: item.danger && !item.disabled ? colors.redAccent[400] : undefined,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 32,
                        color: item.danger && !item.disabled ? colors.redAccent[400] : 'inherit',
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                    />
                  </MenuItem>
                </span>
              </Tooltip>
            ))}
          </Menu>
        </>
      )}
    </Stack>
  );
}

function UserManagementPage() {
  const { user, logout, hasPrivilege } = useAuth();
  const isSuperAdmin = isSuperAdminUser(user);
  const isMdaIctAdmin = isMdaIctAdminUser(user);
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [searchParams] = useSearchParams();
  
  // Check if we should show only pending users from URL parameter
  const showPendingOnly = searchParams.get('pending') === 'true';

  const [users, setUsers] = useState([]);
  const [voidedUsers, setVoidedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [exportingExcel, setExportingExcel] = useState(false);

  // Global search state
  const [globalSearch, setGlobalSearch] = useState('');
  /** 'all' | 'byOrganization' | 'byAccessLevel' */
  const [userListView, setUserListView] = useState('all');

  // User Management States
  const [openUserDialog, setOpenUserDialog] = useState(false);
  const [currentUserToEdit, setCurrentUserToEdit] = useState(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    email: '',
    phoneNumber: '',
    password: 'reset123',
    confirmPassword: 'reset123',
    firstName: '',
    lastName: '',
    idNumber: '',
    employeeNumber: '',
    role: '',
    ministry: '',
    stateDepartment: '',
    accessDepartments: [],
    homeDirectorates: [],
    directorate: '',
    agencyId: '',
    otpEnabled: false,
    otpChannel: 'email',
    uiProfileId: '',
  });
  const [userFormErrors, setUserFormErrors] = useState({});
  const [userFormSubmitAttempted, setUserFormSubmitAttempted] = useState(false);
  const userFormInputRefs = useRef({});
  const userDialogContentRef = useRef(null);
  const projectAccessSectionRef = useRef(null);
  const setUserFormInputRef = useCallback((fieldName, node) => {
    if (node) {
      userFormInputRefs.current[fieldName] = node;
    } else {
      delete userFormInputRefs.current[fieldName];
    }
  }, []);
  const readUserFormData = useCallback((baseData = userFormData) => {
    const next = { ...baseData };
    USER_FORM_TEXT_FIELD_NAMES.forEach((fieldName) => {
      if (userFormInputRefs.current[fieldName]) {
        next[fieldName] = userFormInputRefs.current[fieldName].value ?? '';
      }
    });
    return next;
  }, [userFormData]);
  const [showUserFormPasswords, setShowUserFormPasswords] = useState({
    password: false,
    confirmPassword: false,
  });
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const usernameCheckSeqRef = useRef(0);
  const [agencies, setAgencies] = useState([]);
  const [ministries, setMinistries] = useState([]);
  /** GET /ministries?withDepartments=1 — ministry + departments for cascading dropdowns */
  const [ministriesHierarchy, setMinistriesHierarchy] = useState([]);
  const [loadingAgencies, setLoadingAgencies] = useState(false);

  /** Effective organization access (legacy agency, whole parent org, or single department). */
  const [organizationScopes, setOrganizationScopes] = useState([]);
  const [newScopeType, setNewScopeType] = useState('STATE_DEPARTMENT_ALL');
  const [newScopeMinistry, setNewScopeMinistry] = useState(null);
  const [newScopeStateDept, setNewScopeStateDept] = useState(null);
  const [newScopeStateDepts, setNewScopeStateDepts] = useState([]);
  const [projectScopes, setProjectScopes] = useState([]);
  const [projectScopeOptions, setProjectScopeOptions] = useState({
    sectors: [],
    departments: [],
    subcounties: [],
    wards: [],
    sublocations: [],
    villages: [],
    municipalities: [],
    departmentSectorMappings: [],
  });
  const [newProjectScopeType, setNewProjectScopeType] = useState('SECTOR');
  const [newProjectScopeValues, setNewProjectScopeValues] = useState([]);
  const [uiProfiles, setUiProfiles] = useState([]);
  const [countyPositions, setCountyPositions] = useState([]);
  const [selectedCountyPositionId, setSelectedCountyPositionId] = useState('');
  const [loadingUiProfiles, setLoadingUiProfiles] = useState(false);
  const [openUiProfileManagementDialog, setOpenUiProfileManagementDialog] = useState(false);
  const [openUiProfileDialog, setOpenUiProfileDialog] = useState(false);
  const [currentUiProfileToEdit, setCurrentUiProfileToEdit] = useState(null);
  const [uiProfileFormData, setUiProfileFormData] = useState({
    name: '',
    description: '',
    visibleMenuKeys: [],
    visibleTabKeys: [],
    isDefault: false,
  });
  const uiProfileNameInputRef = useRef(null);
  const uiProfileDescriptionInputRef = useRef(null);

  /** Standalone dialog: assign org scope without opening full edit form */
  const [openStandaloneOrgDialog, setOpenStandaloneOrgDialog] = useState(false);
  const [standaloneOrgUserId, setStandaloneOrgUserId] = useState(null);
  const [standaloneOrgUsername, setStandaloneOrgUsername] = useState('');
  const [standaloneScopes, setStandaloneScopes] = useState([]);
  const [standaloneNewScopeType, setStandaloneNewScopeType] = useState('STATE_DEPARTMENT_ALL');
  const [standaloneNewMinistry, setStandaloneNewMinistry] = useState(null);
  const [standaloneNewStateDept, setStandaloneNewStateDept] = useState(null);
  const [standaloneNewStateDepts, setStandaloneNewStateDepts] = useState([]);
  const [standaloneProjectScopes, setStandaloneProjectScopes] = useState([]);
  const [standaloneProjectScopeType, setStandaloneProjectScopeType] = useState('SECTOR');
  const [standaloneProjectScopeValues, setStandaloneProjectScopeValues] = useState([]);
  const [standaloneSaving, setStandaloneSaving] = useState(false);

  // View User Details Dialog State
  const [openViewDetailsDialog, setOpenViewDetailsDialog] = useState(false);
  const [viewDetailsUser, setViewDetailsUser] = useState(null);

  // Delete Confirmation Dialog States
  const [openDeleteConfirmDialog, setOpenDeleteConfirmDialog] = useState(false);
  const [userToDeleteId, setUserToDeleteId] = useState(null);
  const [userToDeleteName, setUserToDeleteName] = useState('');

  // Reset Password Confirmation Dialog States
  const [openResetPasswordDialog, setOpenResetPasswordDialog] = useState(false);
  const [userToResetId, setUserToResetId] = useState(null);
  const [userToResetName, setUserToResetName] = useState('');

  // Resend login credentials email (Super Admin) — styled dialog like reset password
  const [openResendCredentialsDialog, setOpenResendCredentialsDialog] = useState(false);
  const [userToResendCredentialsId, setUserToResendCredentialsId] = useState(null);
  const [userToResendCredentialsName, setUserToResendCredentialsName] = useState('');
  const [userToResendCredentialsEmail, setUserToResendCredentialsEmail] = useState('');

  // Toggle User Status Confirmation Dialog States
  const [openToggleStatusDialog, setOpenToggleStatusDialog] = useState(false);
  const [userToToggleId, setUserToToggleId] = useState(null);
  const [userToToggleName, setUserToToggleName] = useState('');
  const [userToToggleCurrentStatus, setUserToToggleCurrentStatus] = useState(true);

  // Role Delete Confirmation Dialog States
  const [openRoleDeleteConfirmDialog, setOpenRoleDeleteConfirmDialog] = useState(false);
  const [roleToDeleteId, setRoleToDeleteId] = useState(null);
  const [roleToDeleteName, setRoleToDeleteName] = useState('');

  // Role Management States
  const [openRoleManagementDialog, setOpenRoleManagementDialog] = useState(false);
  const [roles, setRoles] = useState([]);
  const [openRoleDialog, setOpenRoleDialog] = useState(false);
  const [currentRoleToEdit, setCurrentRoleToEdit] = useState(null);
  const [roleFormData, setRoleFormData] = useState({
    roleName: '',
    description: '',
    privilegeIds: [],
    uiProfileId: '',
  });
  const [roleFormErrors, setRoleFormErrors] = useState({});
  const roleNameInputRef = useRef(null);
  const roleDescriptionInputRef = useRef(null);

  const assignableRoles = useMemo(() => {
    if (isSuperAdmin) return roles;
    if (isMdaIctAdmin) {
      const allowed = new Set(['data entry officer', 'data approver', 'viewer']);
      return roles.filter((role) => allowed.has(normalizeRoleForCompare(role.roleName)));
    }
    return roles;
  }, [isSuperAdmin, isMdaIctAdmin, roles]);

  // Privilege Management States
  const [openPrivilegeManagementDialog, setOpenPrivilegeManagementDialog] = useState(false);
  const [privileges, setPrivileges] = useState([]);
  const [openPrivilegeDialog, setOpenPrivilegeDialog] = useState(false);
  const [currentPrivilegeToEdit, setCurrentPrivilegeToEdit] = useState(null);
  const [privilegeFormData, setPrivilegeFormData] = useState({
    privilegeName: '',
    description: ''
  });
  
  // Privilege Delete Confirmation Dialog States
  const [openPrivilegeDeleteConfirmDialog, setOpenPrivilegeDeleteConfirmDialog] = useState(false);
  const [privilegeToDeleteId, setPrivilegeToDeleteId] = useState(null);
  const [privilegeToDeleteName, setPrivilegeToDeleteName] = useState('');
  const [privilegeFormErrors, setPrivilegeFormErrors] = useState({});

  // Session Security States (idle timeout policy)
  const [openSessionSecurityDialog, setOpenSessionSecurityDialog] = useState(false);
  const [sessionIdleTimeoutMinutes, setSessionIdleTimeoutMinutes] = useState(60);
  const [sessionPolicyLoading, setSessionPolicyLoading] = useState(false);
  const [sessionPolicySaving, setSessionPolicySaving] = useState(false);

  /** Super Admin: align users / org scopes / projects to canonical ministries & departments */
  const [openOrgIntegrityDialog, setOpenOrgIntegrityDialog] = useState(false);
  const [openOrgIntegrityApplyConfirm, setOpenOrgIntegrityApplyConfirm] = useState(false);
  const [orgIntegrityLoading, setOrgIntegrityLoading] = useState(false);
  const [orgIntegrityApplyLoading, setOrgIntegrityApplyLoading] = useState(false);
  const [orgIntegrityPreview, setOrgIntegrityPreview] = useState(null);
  const [orgIntegrityPreviewLimit, setOrgIntegrityPreviewLimit] = useState(50);
  const [orgIntegrityTableSearch, setOrgIntegrityTableSearch] = useState('');
  const [orgIntegrityTab, setOrgIntegrityTab] = useState(0);
  const [orgIntegrityDistinct, setOrgIntegrityDistinct] = useState(null);
  const [orgIntegrityDistinctLoading, setOrgIntegrityDistinctLoading] = useState(false);
  const [orgIntegrityManualApplyLoading, setOrgIntegrityManualApplyLoading] = useState(false);
  const [orgIntegrityManualMinistryTo, setOrgIntegrityManualMinistryTo] = useState({});
  const [orgIntegrityManualStateTo, setOrgIntegrityManualStateTo] = useState({});
  const [openOrgIntegrityManualConfirm, setOpenOrgIntegrityManualConfirm] = useState(false);
  const [orgIntegrityManualConfirmKind, setOrgIntegrityManualConfirmKind] = useState('ministry');

  // --- Fetching Data ---

  const fetchUsers = useCallback(async (pendingOnly = false) => {
    setLoading(true);
    setError(null);
    try {
      if (hasPrivilege('user.read_all') || hasPrivilege('user.read') || hasPrivilege('user.approve')) {
        let data;
        
        // If pendingOnly is true, fetch only pending users
        if (pendingOnly) {
          try {
            // Try using the users service from main API
            if (apiServiceMain.users && typeof apiServiceMain.users.getPendingUsers === 'function') {
              data = await apiServiceMain.users.getPendingUsers();
            } else {
              // Fallback: fetch all users and filter
              const allUsers = await apiService.getUsers();
              data = allUsers.filter(u => {
                const isActive = u.isActive !== undefined ? u.isActive : u.is_active;
                return !isActive || isActive === false || isActive === 0;
              });
            }
            // Ensure it's an array
            if (!Array.isArray(data)) {
              data = [];
            }
          } catch (pendingErr) {
            console.error('Error fetching pending users:', pendingErr);
            // Fallback to fetching all users and filtering
            try {
              const allUsers = await apiService.getUsers();
              data = allUsers.filter(u => {
                const isActive = u.isActive !== undefined ? u.isActive : u.is_active;
                return !isActive || isActive === false || isActive === 0;
              });
            } catch (fallbackErr) {
              console.error('Error in fallback fetch:', fallbackErr);
              data = [];
            }
          }
        } else {
          data = await apiService.getUsers();
        }
        
        const camelCaseData = data.map(u => snakeToCamelCase(u));
        setUsers(camelCaseData);
      } else {
        setError("You do not have permission to view user management.");
        setUsers([]);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      if (err.response?.status === 401) {
        logout();
      }
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.response?.data?.msg ||
          err.message ||
          'Failed to load users.'
      );
    } finally {
      setLoading(false);
    }
  }, [hasPrivilege, logout]);

  const fetchVoidedUsers = useCallback(async () => {
    if (!isSuperAdmin) {
      setVoidedUsers([]);
      return;
    }
    try {
      const data = await apiService.getVoidedUsers();
      const list = Array.isArray(data) ? data : [];
      setVoidedUsers(list.map((u) => snakeToCamelCase(u)));
    } catch (err) {
      console.error('Error fetching voided users:', err);
      setSnackbar({ open: true, message: err?.error || err?.message || 'Failed to load voided users.', severity: 'error' });
      setVoidedUsers([]);
    }
  }, [isSuperAdmin]);

  const fetchRoles = useCallback(async () => {
    try {
      if (hasPrivilege('role.read_all')) {
        const data = await apiService.getRoles();
        setRoles(data);
      } else {
        setRoles([]);
        console.warn("User does not have 'role.read_all' privilege.");
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
      setSnackbar({ open: true, message: `Failed to load roles: ${err.message}`, severity: 'error' });
    }
  }, [hasPrivilege]);

  const fetchPrivileges = useCallback(async () => {
    try {
      if (hasPrivilege('privilege.read_all')) {
        const data = await apiService.getPrivileges();
        const list = Array.isArray(data) ? data : [];

        const normalized = list.map((p) => {
          const privilegeId = p.privilegeId ?? p.privilege_id ?? p.privilegeid;
          const privilegeName = String(
            p.privilegeName ?? p.privilege_name ?? p.privilegename ?? ''
          ).trim();
          return { ...p, privilegeId, privilegeName };
        }).filter((p) => p.privilegeId != null && String(p.privilegeId) !== '');

        const uniquePrivileges = Array.from(
          new Map(normalized.map((p) => [String(p.privilegeId), p])).values()
        );
        uniquePrivileges.sort((a, b) =>
          (a.privilegeName || '').localeCompare(b.privilegeName || '', undefined, { sensitivity: 'base' })
        );

        setPrivileges(uniquePrivileges);
      } else {
        setPrivileges([]);
        console.warn("User does not have 'privilege.read_all' privilege.");
      }
    } catch (err) {
      console.error('Error fetching privileges:', err);
      setSnackbar({ open: true, message: `Failed to load privileges: ${err.message}`, severity: 'error' });
    }
  }, [hasPrivilege]);

  const handleOpenSessionSecurityDialog = useCallback(async () => {
    if (!isSuperAdmin) return;
    setOpenSessionSecurityDialog(true);
    setSessionPolicyLoading(true);
    try {
      const data = await apiServiceMain.auth.getSessionPolicy();
      const mins = parseInt(String(data?.idleTimeoutMinutes), 10);
      setSessionIdleTimeoutMinutes(Number.isFinite(mins) && mins > 0 ? mins : 60);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err?.error || err?.message || 'Failed to load session security policy.',
        severity: 'error',
      });
    } finally {
      setSessionPolicyLoading(false);
    }
  }, [isSuperAdmin]);

  const handleSaveSessionSecurityPolicy = useCallback(async () => {
    const mins = parseInt(String(sessionIdleTimeoutMinutes), 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
      setSnackbar({ open: true, message: 'Idle timeout must be between 1 and 1440 minutes.', severity: 'error' });
      return;
    }
    setSessionPolicySaving(true);
    try {
      await apiServiceMain.auth.updateSessionPolicy(mins);
      setSnackbar({ open: true, message: 'Session security policy updated.', severity: 'success' });
      setOpenSessionSecurityDialog(false);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err?.error || err?.message || 'Failed to update session security policy.',
        severity: 'error',
      });
    } finally {
      setSessionPolicySaving(false);
    }
  }, [sessionIdleTimeoutMinutes]);

  const loadOrganizationIntegrityPreview = useCallback(async (limit) => {
    const lim = Math.max(1, Math.min(parseInt(String(limit), 10) || 50, 500));
    setOrgIntegrityLoading(true);
    try {
      const data = await apiService.getOrganizationIntegrityPreview(lim);
      setOrgIntegrityPreview(data);
    } catch (err) {
      setOrgIntegrityPreview(null);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || err?.message || 'Failed to load organization integrity preview.',
        severity: 'error',
      });
    } finally {
      setOrgIntegrityLoading(false);
    }
  }, []);

  const loadOrganizationIntegrityMisalignedDistinct = useCallback(async () => {
    setOrgIntegrityDistinctLoading(true);
    try {
      const data = await apiService.getOrganizationIntegrityMisalignedDistinct();
      setOrgIntegrityDistinct(data);
    } catch (err) {
      setOrgIntegrityDistinct(null);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || err?.message || 'Failed to load misaligned ministry/state lists.',
        severity: 'error',
      });
    } finally {
      setOrgIntegrityDistinctLoading(false);
    }
  }, []);

  const handleOpenOrgIntegrityDialog = useCallback(() => {
    if (!isSuperAdmin) return;
    setOpenOrgIntegrityDialog(true);
    setOrgIntegrityTab(0);
    setOrgIntegrityManualMinistryTo({});
    setOrgIntegrityManualStateTo({});
    loadOrganizationIntegrityPreview(orgIntegrityPreviewLimit);
    loadOrganizationIntegrityMisalignedDistinct();
  }, [isSuperAdmin, orgIntegrityPreviewLimit, loadOrganizationIntegrityPreview, loadOrganizationIntegrityMisalignedDistinct]);

  const handleApplyOrganizationIntegrity = useCallback(async () => {
    if (!isSuperAdmin) return;
    setOpenOrgIntegrityApplyConfirm(false);
    setOrgIntegrityApplyLoading(true);
    try {
      const result = await apiService.postOrganizationIntegrityReconcile({
        dryRun: false,
        limit: orgIntegrityPreviewLimit,
      });
      const c = result?.changed || {};
      setSnackbar({
        open: true,
        message: `Reconcile applied. Rows updated — users (ministry/state): ${c.usersMinistry ?? 0}/${c.usersStateDepartment ?? 0}; scopes: ${c.scopesMinistry ?? 0}/${c.scopesStateDepartment ?? 0}; projects: ${c.projectsMinistry ?? 0}/${c.projectsStateDepartment ?? 0}.`,
        severity: 'success',
      });
      await loadOrganizationIntegrityPreview(orgIntegrityPreviewLimit);
      await fetchUsers(false);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || err?.message || 'Reconcile failed.',
        severity: 'error',
      });
    } finally {
      setOrgIntegrityApplyLoading(false);
    }
  }, [isSuperAdmin, orgIntegrityPreviewLimit, loadOrganizationIntegrityPreview, fetchUsers]);

  /** One row per `departments` table record (via GET /ministries?withDepartments=1). departmentId is unique; same name can appear under different ministries. */
  const orgIntegrityManualDepartmentOptions = useMemo(() => {
    const items = [];
    (ministriesHierarchy || []).forEach((m) => {
      const mn = String(m?.name || '').trim();
      (m?.departments || []).forEach((d) => {
        const dn = String(d?.name || '').trim();
        const departmentId = d?.departmentId ?? d?.department_id;
        if (!dn || departmentId == null || departmentId === '') return;
        items.push({
          departmentId: Number(departmentId),
          departmentName: dn,
          ministryName: mn,
          label: `${dn} — ${mn}`,
        });
      });
    });
    return items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [ministriesHierarchy]);

  const buildMinistryManualMappingsPayload = useCallback(() => {
    const rows = orgIntegrityDistinct?.misalignedMinistries || [];
    return rows
      .map((row) => {
        const key = row.ministryKey ?? '';
        const to = String(orgIntegrityManualMinistryTo[key] ?? '').trim();
        if (!to) return null;
        return row.isEmpty
          ? { isEmptyMinistry: true, toMinistryName: to }
          : { ministryKey: key, isEmptyMinistry: false, toMinistryName: to };
      })
      .filter(Boolean);
  }, [orgIntegrityDistinct, orgIntegrityManualMinistryTo]);

  const buildStateManualMappingsPayload = useCallback(() => {
    const rows = orgIntegrityDistinct?.misalignedStateDepartments || [];
    return rows
      .map((row) => {
        const key = row.stateDepartmentKey ?? '';
        const idRaw = orgIntegrityManualStateTo[key];
        if (idRaw === '' || idRaw == null) return null;
        const opt = orgIntegrityManualDepartmentOptions.find(
          (o) => String(o.departmentId) === String(idRaw)
        );
        const to = String(opt?.departmentName ?? '').trim();
        if (!to) return null;
        return row.isEmpty
          ? { isEmptyStateDepartment: true, toDepartmentName: to }
          : { stateDepartmentKey: key, isEmptyStateDepartment: false, toDepartmentName: to };
      })
      .filter(Boolean);
  }, [orgIntegrityDistinct, orgIntegrityManualStateTo, orgIntegrityManualDepartmentOptions]);

  const handleClickApplyManualMinistries = useCallback(() => {
    const ministryMappings = buildMinistryManualMappingsPayload();
    if (ministryMappings.length === 0) {
      setSnackbar({ open: true, message: 'Choose a registry ministry for at least one row.', severity: 'warning' });
      return;
    }
    setOrgIntegrityManualConfirmKind('ministry');
    setOpenOrgIntegrityManualConfirm(true);
  }, [buildMinistryManualMappingsPayload]);

  const handleClickApplyManualStateDepartments = useCallback(() => {
    const stateDepartmentMappings = buildStateManualMappingsPayload();
    if (stateDepartmentMappings.length === 0) {
      setSnackbar({ open: true, message: 'Choose a registry state department for at least one row.', severity: 'warning' });
      return;
    }
    setOrgIntegrityManualConfirmKind('state');
    setOpenOrgIntegrityManualConfirm(true);
  }, [buildStateManualMappingsPayload]);

  const handleConfirmOrganizationManualMap = useCallback(async () => {
    const kind = orgIntegrityManualConfirmKind;
    setOpenOrgIntegrityManualConfirm(false);
    setOrgIntegrityManualApplyLoading(true);
    try {
      const ministryMappings = kind === 'ministry' ? buildMinistryManualMappingsPayload() : [];
      const stateDepartmentMappings = kind === 'state' ? buildStateManualMappingsPayload() : [];
      const result = await apiService.postOrganizationIntegrityManualMap({
        ministryMappings,
        stateDepartmentMappings,
      });
      const c = result?.changed || {};
      setSnackbar({
        open: true,
        message:
          kind === 'ministry'
            ? `Ministries updated — users: ${c.usersMinistry ?? 0}; scopes: ${c.scopesMinistry ?? 0}; projects: ${c.projectsMinistry ?? 0}.`
            : `State departments updated — users: ${c.usersStateDepartment ?? 0}; scopes: ${c.scopesStateDepartment ?? 0}; projects: ${c.projectsStateDepartment ?? 0}.`,
        severity: 'success',
      });
      if (kind === 'ministry') {
        setOrgIntegrityManualMinistryTo({});
      } else {
        setOrgIntegrityManualStateTo({});
      }
      await loadOrganizationIntegrityMisalignedDistinct();
      await loadOrganizationIntegrityPreview(orgIntegrityPreviewLimit);
      await fetchUsers(false);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || err?.message || 'Manual update failed.',
        severity: 'error',
      });
    } finally {
      setOrgIntegrityManualApplyLoading(false);
    }
  }, [
    orgIntegrityManualConfirmKind,
    buildMinistryManualMappingsPayload,
    buildStateManualMappingsPayload,
    loadOrganizationIntegrityMisalignedDistinct,
    loadOrganizationIntegrityPreview,
    orgIntegrityPreviewLimit,
    fetchUsers,
  ]);

  const orgIntegrityFilteredMisaligned = useMemo(() => {
    const m = orgIntegrityPreview?.misaligned;
    if (!m) return { users: [], scopes: [], projects: [] };
    const q = orgIntegrityTableSearch;
    return {
      users: filterOrgIntegrityRows(m.users || [], 'users', q),
      scopes: filterOrgIntegrityRows(m.scopes || [], 'scopes', q),
      projects: filterOrgIntegrityRows(m.projects || [], 'projects', q),
    };
  }, [orgIntegrityPreview, orgIntegrityTableSearch]);


  const fetchMinistriesCatalog = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get('/ministries', { params: { withDepartments: '1', withSections: '1' } });
      const list = Array.isArray(data) ? data : [];
      /* Only parent orgs that have at least one department in the tree (Machakos catalog has no national orphans). */
      const withDepts = list.filter((m) => Array.isArray(m.departments) && m.departments.length > 0);
      const hierarchy = withDepts.length > 0 ? withDepts : list;
      setMinistriesHierarchy(hierarchy);
      setMinistries(hierarchy.map((m) => m.name).filter(Boolean).sort((a, b) => a.localeCompare(b)));
    } catch (err) {
      console.error('Error fetching ministries catalog:', err);
      setMinistriesHierarchy([]);
      setMinistries([]);
    }
  }, []);

  useEffect(() => {
    if (openOrgIntegrityDialog && isSuperAdmin) {
      fetchMinistriesCatalog();
    }
  }, [openOrgIntegrityDialog, isSuperAdmin, fetchMinistriesCatalog]);

  // Legacy agency list (org-integrity / diagnostics; not used for county user-form department dropdowns)
  const fetchAgencies = useCallback(async () => {
    setLoadingAgencies(true);
    try {
      const response = await apiServiceMain.agencies.getAllAgencies();
      const agenciesList = Array.isArray(response) ? response : [];
      setAgencies(agenciesList);
    } catch (err) {
      console.error('Error fetching agencies:', err);
    } finally {
      setLoadingAgencies(false);
    }
  }, []);

  const fetchProjectScopeOptions = useCallback(async () => {
    try {
      const data = await apiService.getProjectScopeOptions();
      setProjectScopeOptions({
        sectors: Array.isArray(data?.sectors) ? data.sectors : [],
        departments: Array.isArray(data?.departments) ? data.departments : [],
        subcounties: Array.isArray(data?.subcounties) ? data.subcounties : [],
        wards: Array.isArray(data?.wards) ? data.wards : [],
        sublocations: Array.isArray(data?.sublocations) ? data.sublocations : [],
        villages: Array.isArray(data?.villages) ? data.villages : [],
        municipalities: Array.isArray(data?.municipalities) ? data.municipalities : [],
        departmentSectorMappings: Array.isArray(data?.departmentSectorMappings) ? data.departmentSectorMappings : [],
      });
    } catch (err) {
      console.warn('Could not load project scope options:', err);
    }
  }, []);

  const fetchUiProfiles = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingUiProfiles(true);
    try {
      const data = await apiService.getUiProfiles();
      setUiProfiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Could not load UI profiles:', err);
      setUiProfiles([]);
    } finally {
      setLoadingUiProfiles(false);
    }
  }, [isSuperAdmin]);

  const fetchCountyPositions = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const data = await apiService.getCountyPositionRoleMap();
      setCountyPositions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Could not load county position role map:', err);
      setCountyPositions([]);
    }
  }, [isSuperAdmin]);

  const handleCountyPositionSelect = (positionId) => {
    setSelectedCountyPositionId(positionId);
    const position = countyPositions.find((p) => String(p.id) === String(positionId));
    if (!position) return;

    const matchedRole = roles.find(
      (r) => String(r.roleId) === String(position.roleId)
        || normalizeOrgText(r.roleName) === normalizeOrgText(position.baseRoleName)
    );

    setUserFormData((prev) => ({
      ...prev,
      role: matchedRole?.roleName || position.baseRoleName || prev.role,
      uiProfileId: position.uiProfileId ? String(position.uiProfileId) : prev.uiProfileId,
    }));

    const scopeType = String(position.defaultScopeType || '').toUpperCase();
    if (scopeType === 'ALL_DEPARTMENTS') {
      setProjectScopes([{ scopeType: 'ALL_DEPARTMENTS', scopeValue: '*' }]);
      setNewProjectScopeType('ALL_DEPARTMENTS');
      setNewProjectScopeValues([]);
    } else if (scopeType) {
      setNewProjectScopeType(scopeType);
      setNewProjectScopeValues([]);
    }

    const needsScopeValues = scopeType && scopeType !== 'ALL_DEPARTMENTS';
    const scopeArea = position.defaultScopeArea || scopeType;
    setSnackbar({
      open: true,
      message: needsScopeValues
        ? `${position.responsibility}: scroll to Project access, choose ${scopeArea}, click "Add project scope", then save.`
        : (position.notes
          ? `${position.responsibility}: ${position.notes}`
          : `Applied ${position.responsibility}.`),
      severity: needsScopeValues ? 'warning' : 'info',
    });
  };

  const normalizeOrgText = (v) => String(v || '').trim().toLowerCase();

  const uiMenuVisibilityGroups = useMemo(() => buildUiMenuVisibilityGroups(), []);
  const uiMenuVisibilityOptions = useMemo(
    () => buildUiMenuVisibilityOptions(uiMenuVisibilityGroups),
    [uiMenuVisibilityGroups]
  );
  const uiTabVisibilityOptions = useMemo(() => PROJECT_DETAIL_UI_TAB_OPTIONS, []);
  const uiTabVisibilityGroups = useMemo(() => {
    const order = ['Core details', 'Delivery evidence', 'Finance and planning'];
    return order
      .map((group) => ({
        group,
        options: uiTabVisibilityOptions.filter((option) => option.group === group),
      }))
      .filter((group) => group.options.length > 0);
  }, [uiTabVisibilityOptions]);

  const countyParentOrgName = useMemo(
    () => resolveCountyParentOrgName(ministriesHierarchy),
    [ministriesHierarchy]
  );

  const allCountyDepartmentNames = useMemo(() => {
    const set = new Set();
    for (const mrow of ministriesHierarchy || []) {
      for (const d of mrow?.departments || []) {
        const n = String(d?.name || d?.departmentName || '').trim();
        if (n) set.add(n);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [ministriesHierarchy]);

  /** Section (directorate) names from the catalog for all selected access departments (any ministry row that lists that department). */
  const sectionsForAccessDepartments = useMemo(() => {
    const depts = Array.isArray(userFormData.accessDepartments) ? userFormData.accessDepartments : [];
    if (!depts.length || !ministriesHierarchy?.length) return [];
    const out = new Set();
    for (const mrow of ministriesHierarchy) {
      for (const d of mrow?.departments || []) {
        const dn = String(d?.name || d?.departmentName || '').trim();
        const dal = String(d?.alias || '').trim();
        const inPick = depts.some((pd) => {
          const p = String(pd || '').trim();
          return (
            p === dn ||
            (dal && p === dal) ||
            normalizeOrgText(p) === normalizeOrgText(dn) ||
            (dal && normalizeOrgText(p) === normalizeOrgText(dal))
          );
        });
        if (!inPick) continue;
        for (const s of d?.sections || []) {
          const sn = String(s?.name || s?.alias || '').trim();
          if (sn) out.add(sn);
        }
      }
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }, [ministriesHierarchy, userFormData.accessDepartments]);

  const directorateOptionsMulti = useMemo(() => {
    const base = [...sectionsForAccessDepartments];
    const seenNorms = new Set(base.map((x) => normalizeOrgText(x)));
    for (const h of userFormData.homeDirectorates || []) {
      const t = String(h || '').trim();
      if (!t) continue;
      const n = normalizeOrgText(t);
      if (!seenNorms.has(n)) {
        base.push(t);
        seenNorms.add(n);
      }
    }
    return base.sort((a, b) => a.localeCompare(b));
  }, [sectionsForAccessDepartments, userFormData.homeDirectorates]);

  const accessDepartmentFieldOptions = useMemo(() => {
    const base = [...allCountyDepartmentNames];
    for (const d of userFormData.accessDepartments || []) {
      const t = String(d || '').trim();
      if (t && !base.some((x) => normalizeOrgText(x) === normalizeOrgText(t))) base.push(t);
    }
    return base.sort((a, b) => a.localeCompare(b));
  }, [allCountyDepartmentNames, userFormData.accessDepartments]);

  const projectScopeValueOptions = useMemo(() => {
    const unique = (values) => [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    if (newProjectScopeType === 'ALL_DEPARTMENTS') {
      return [];
    }
    if (newProjectScopeType === 'SECTOR') {
      return unique((projectScopeOptions.sectors || []).map((s) => s.sectorName || s.name));
    }
    if (newProjectScopeType === 'DEPARTMENT') {
      return unique([
        ...((projectScopeOptions.departments || []).map((d) => d.departmentName || d.name)),
        ...allCountyDepartmentNames,
      ]);
    }
    if (newProjectScopeType === 'SUBCOUNTY') {
      return unique((projectScopeOptions.subcounties || []).map((s) => s.subcountyName || s.name));
    }
    if (newProjectScopeType === 'WARD') {
      return unique((projectScopeOptions.wards || []).map((w) => w.wardName || w.name));
    }
    if (newProjectScopeType === 'SUBLOCATION') {
      return unique((projectScopeOptions.sublocations || []).map((s) => s.sublocationName || s.name));
    }
    if (newProjectScopeType === 'VILLAGE') {
      return unique((projectScopeOptions.villages || []).map((v) => v.villageName || v.name));
    }
    if (newProjectScopeType === 'MUNICIPALITY') {
      return unique((projectScopeOptions.municipalities || []).map((m) => m.name || m.municipalityName));
    }
    return [];
  }, [newProjectScopeType, projectScopeOptions, allCountyDepartmentNames]);

  const standaloneProjectScopeValueOptions = useMemo(() => {
    const unique = (values) => [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    if (standaloneProjectScopeType === 'ALL_DEPARTMENTS') {
      return [];
    }
    if (standaloneProjectScopeType === 'SECTOR') {
      return unique((projectScopeOptions.sectors || []).map((s) => s.sectorName || s.name));
    }
    if (standaloneProjectScopeType === 'DEPARTMENT') {
      return unique([
        ...((projectScopeOptions.departments || []).map((d) => d.departmentName || d.name)),
        ...allCountyDepartmentNames,
      ]);
    }
    if (standaloneProjectScopeType === 'SUBCOUNTY') {
      return unique((projectScopeOptions.subcounties || []).map((s) => s.subcountyName || s.name));
    }
    if (standaloneProjectScopeType === 'WARD') {
      return unique((projectScopeOptions.wards || []).map((w) => w.wardName || w.name));
    }
    if (standaloneProjectScopeType === 'SUBLOCATION') {
      return unique((projectScopeOptions.sublocations || []).map((s) => s.sublocationName || s.name));
    }
    if (standaloneProjectScopeType === 'VILLAGE') {
      return unique((projectScopeOptions.villages || []).map((v) => v.villageName || v.name));
    }
    if (standaloneProjectScopeType === 'MUNICIPALITY') {
      return unique((projectScopeOptions.municipalities || []).map((m) => m.name || m.municipalityName));
    }
    return [];
  }, [standaloneProjectScopeType, projectScopeOptions, allCountyDepartmentNames]);

  /** When access departments shrink, drop home directorates that are no longer under any selected department. */
  useEffect(() => {
    if (!openUserDialog) return;
    const depts = userFormData.accessDepartments || [];
    if (!depts.length) return;
    if (!sectionsForAccessDepartments.length) return;
    const validNorms = new Set(sectionsForAccessDepartments.map((x) => normalizeOrgText(x)));
    setUserFormData((prev) => {
      const hd = Array.isArray(prev.homeDirectorates) ? prev.homeDirectorates : [];
      const next = hd.filter((h) => validNorms.has(normalizeOrgText(h)));
      if (next.length === hd.length) return prev;
      return { ...prev, homeDirectorates: next, directorate: next.join('|||') };
    });
  }, [openUserDialog, userFormData.accessDepartments, sectionsForAccessDepartments]);

  // Use ref to track the last user ID we fetched for to prevent infinite loops
  const lastFetchedUserIdRef = useRef(null);
  
  useEffect(() => {
    const currentUserId = user?.userId || user?.id;
    // Only fetch if user ID changed (login/logout) or on initial mount
    if (lastFetchedUserIdRef.current !== currentUserId) {
      lastFetchedUserIdRef.current = currentUserId;
      fetchUsers(showPendingOnly);
      fetchRoles();
      fetchPrivileges();
      fetchAgencies();
      fetchMinistriesCatalog();
      fetchProjectScopeOptions();
      fetchUiProfiles();
      fetchCountyPositions();
      fetchVoidedUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, user?.id]); // Only re-fetch if user ID changes (user login/logout)

  // Refetch users when pending filter changes
  useEffect(() => {
    if (lastFetchedUserIdRef.current === (user?.userId || user?.id)) {
      fetchUsers(showPendingOnly);
      fetchVoidedUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPendingOnly]);


  // --- User Management Handlers ---
  const handleOpenCreateUserDialog = () => {
    if (!hasPrivilege('user.create')) {
        setSnackbar({ open: true, message: 'Permission denied to create users.', severity: 'error' });
        return;
    }
    setCurrentUserToEdit(null);
    setSelectedCountyPositionId('');
    setOrganizationScopes([]);
    setProjectScopes([]);
    setNewScopeType('STATE_DEPARTMENT_ALL');
    setNewScopeMinistry(null);
    setNewScopeStateDept(null);
    setNewScopeStateDepts([]);
    setNewProjectScopeType('SECTOR');
    setNewProjectScopeValues([]);
    const countyParent = resolveCountyParentOrgName(ministriesHierarchy);
    setUserFormData({
      username: '', email: '', phoneNumber: '', password: 'reset123', confirmPassword: 'reset123', firstName: '', lastName: '',
      idNumber: '', employeeNumber: '',
      role: roles.length > 0 ? roles[0].roleName : '',
      ministry: countyParent,
      stateDepartment: '',
      accessDepartments: [],
      homeDirectorates: [],
      directorate: '',
      agencyId: '',
      otpEnabled: false,
      uiProfileId: '',
    });
    setUserFormErrors({});
    setUserFormSubmitAttempted(false);
    setIsCheckingUsername(false);
    setOpenStandaloneOrgDialog(false);
    setOpenUserDialog(true);
  };

  const handleExportUsersToExcel = async () => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can export users.', severity: 'error' });
      return;
    }
    setExportingExcel(true);
    try {
      const res = await apiService.getUsersForExcelExport();
      const list = Array.isArray(res?.data) ? res.data : [];
      if (list.length === 0) {
        setSnackbar({ open: true, message: 'No users to export.', severity: 'warning' });
        return;
      }
      const dataToExport = list.map((u) => {
        const created = u.createdAt || u.created_at;
        const updated = u.updatedAt || u.updated_at;
        const roleName =
          [u.role, u.roleName, u.role_name].find((x) => x != null && String(x).trim() !== '') ?? '';
        return {
          'User ID': u.userId ?? '',
          Username: u.username ?? '',
          Email: u.email ?? '',
          Phone: u.phoneNumber ?? u.phone ?? '',
          'First name': u.firstName ?? u.first_name ?? '',
          'Last name': u.lastName ?? u.last_name ?? '',
          'ID number': u.idNumber ?? u.id_number ?? '',
          'Employee number': u.employeeNumber ?? u.employee_number ?? '',
          Role: roleName,
          Active: u.isActive === true || u.isActive === 1 ? 'Yes' : (u.isActive === false || u.isActive === 0 ? 'No' : ''),
          'OTP at login': u.otpEnabled === true || u.otpEnabled === 1 ? 'Yes' : 'No',
          'OTP delivery': u.otpEnabled === true || u.otpEnabled === 1
            ? formatOtpChannelLabel(u.otpChannel || u.otp_channel)
            : '',
          'Parent organization': u.ministry ?? '',
          Department: u.stateDepartment ?? u.state_department ?? '',
          Directorate: u.directorate ?? '',
          'Organization access': organizationScopesToExcelString(u.organizationScopes),
          'Project access': projectScopesToExcelString(u.projectScopes),
          'UI profile': u.uiProfile?.name ?? '',
          'Created at': created ? new Date(created).toLocaleString() : '',
          'Updated at': updated ? new Date(updated).toLocaleString() : '',
        };
      });
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `users_export_${dateStr}.xlsx`);
      setSnackbar({
        open: true,
        message: `Exported ${list.length} user${list.length !== 1 ? 's' : ''} to Excel.`,
        severity: 'success',
      });
    } catch (err) {
      console.error('Export users failed:', err);
      const msg = err?.error || err?.message || (typeof err === 'string' ? err : 'Failed to export users.');
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleOpenEditUserDialog = async (userItem) => {
    if (!hasPrivilege('user.update')) {
        setSnackbar({ open: true, message: 'Permission denied to edit users.', severity: 'error' });
        return;
    }
    if (!canMdaIctAdminMutateUser(user, userItem)) {
      setSnackbar({ open: true, message: MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE, severity: 'warning' });
      return;
    }
    setOpenStandaloneOrgDialog(false);
    setCurrentUserToEdit(userItem);
    setOrganizationScopes([]);
    setProjectScopes([]);
    setNewProjectScopeType('SECTOR');
    setNewProjectScopeValues([]);
    const countyParentOpen = resolveCountyParentOrgName(ministriesHierarchy);
    setUserFormData({
      username: userItem.username || '',
      email: userItem.email || '',
      phoneNumber: userItem.phoneNumber || userItem.phone || '',
      password: '',
      confirmPassword: '',
      firstName: userItem.firstName || '',
      lastName: userItem.lastName || '',
      idNumber: userItem.idNumber || '',
      employeeNumber: userItem.employeeNumber || '',
      role: userItem.role || '',
      ministry: countyParentOpen,
      stateDepartment: '',
      accessDepartments: [],
      homeDirectorates: [],
      directorate: '',
      agencyId: '',
      otpEnabled: !!(userItem.otpEnabled ?? userItem.otp_enabled),
      otpChannel: userItem.otpChannel || userItem.otp_channel || 'email',
      uiProfileId: userItem.uiProfile?.id || '',
    });
    setUserFormErrors({});
    setIsCheckingUsername(false);
    setOpenUserDialog(true);
    try {
      const full = await apiService.getUserById(userItem.userId);
      setProjectScopes(Array.isArray(full.projectScopes) ? full.projectScopes : []);

      setUserFormData((prev) => ({
        ...prev,
        otpEnabled: !!(full.otpEnabled ?? full.otp_enabled ?? prev.otpEnabled),
        otpChannel: full.otpChannel || full.otp_channel || prev.otpChannel || 'email',
        uiProfileId: full.uiProfile?.id || '',
      }));
    } catch (err) {
      console.warn('Could not load user project access:', err);
    }
  };

  const handleOpenStandaloneOrgDialog = async (row) => {
    if (!hasPrivilege('user.update')) {
      setSnackbar({ open: true, message: 'Permission denied to edit project access.', severity: 'error' });
      return;
    }
    if (!canMdaIctAdminMutateUser(user, row)) {
      setSnackbar({ open: true, message: MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE, severity: 'warning' });
      return;
    }
    if (openUserDialog) {
      handleCloseUserDialog();
    }
    setStandaloneOrgUserId(row.userId);
    setStandaloneOrgUsername(row.username || '');
    setStandaloneProjectScopes([]);
    setStandaloneProjectScopeType('SECTOR');
    setStandaloneProjectScopeValues([]);
    setOpenStandaloneOrgDialog(true);
    try {
      const full = await apiService.getUserById(row.userId);
      setStandaloneProjectScopes(Array.isArray(full.projectScopes) ? full.projectScopes : []);
    } catch (err) {
      console.warn('Could not load project access:', err);
      setSnackbar({ open: true, message: 'Could not load project access for this user.', severity: 'error' });
    }
  };

  const handleCloseStandaloneOrgDialog = () => {
    setOpenStandaloneOrgDialog(false);
    setStandaloneOrgUserId(null);
    setStandaloneOrgUsername('');
    setStandaloneScopes([]);
    setStandaloneNewScopeType('STATE_DEPARTMENT_ALL');
    setStandaloneNewMinistry(null);
    setStandaloneNewStateDept(null);
    setStandaloneNewStateDepts([]);
    setStandaloneProjectScopes([]);
    setStandaloneProjectScopeType('SECTOR');
    setStandaloneProjectScopeValues([]);
    setStandaloneSaving(false);
  };

  const handleAddStandaloneScope = () => {
    if (standaloneNewScopeType === 'ALL_MINISTRIES') {
      setStandaloneScopes([{ scopeType: 'ALL_MINISTRIES' }]);
    } else if (standaloneNewScopeType === 'MINISTRY_ALL') {
      const m = (standaloneNewMinistry || '').trim();
      if (!m) {
        setSnackbar({ open: true, message: 'Select or enter a parent organization.', severity: 'warning' });
        return;
      }
      setStandaloneScopes([{ scopeType: 'MINISTRY_ALL', ministry: m }]);
    } else {
      const m = countyParentOrgName;
      const departments = [
        ...new Set(
          (Array.isArray(standaloneNewStateDepts) && standaloneNewStateDepts.length > 0
            ? standaloneNewStateDepts
            : [standaloneNewStateDept]
          )
            .map((sd) => String(sd || '').trim())
            .filter(Boolean)
        ),
      ];
      if (!departments.length) {
        setSnackbar({ open: true, message: 'Select at least one department.', severity: 'warning' });
        return;
      }
      setStandaloneScopes(departments.map((sd) => ({ scopeType: 'STATE_DEPARTMENT_ALL', ministry: m, stateDepartment: sd })));
    }
  };

  const handleRemoveStandaloneScope = (index) => {
    setStandaloneScopes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddStandaloneProjectScopes = () => {
    if (standaloneProjectScopeType === 'ALL_DEPARTMENTS') {
      setStandaloneProjectScopes([{ scopeType: 'ALL_DEPARTMENTS', scopeValue: '*' }]);
      setStandaloneProjectScopeValues([]);
      return;
    }
    const values = [...new Set((standaloneProjectScopeValues || []).map((v) => String(v || '').trim()).filter(Boolean))];
    if (!values.length) {
      setSnackbar({ open: true, message: 'Select at least one project access value.', severity: 'warning' });
      return;
    }
    setStandaloneProjectScopes((prev) => {
      const existingKeys = new Set(
        (prev || []).map((s) => `${String(s.scopeType || s.scope_type || '').toUpperCase()}::${String(s.scopeValue || s.scope_value || '').trim().toLowerCase()}`)
      );
      const next = [...(prev || [])];
      values.forEach((value) => {
        const key = `${standaloneProjectScopeType}::${value.toLowerCase()}`;
        if (!existingKeys.has(key)) {
          next.push({ scopeType: standaloneProjectScopeType, scopeValue: value });
          existingKeys.add(key);
        }
      });
      return next;
    });
    setStandaloneProjectScopeValues([]);
  };

  const handleRemoveStandaloneProjectScope = (index) => {
    setStandaloneProjectScopes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveStandaloneOrgScopes = async () => {
    if (!standaloneOrgUserId) return;
    const projectScopePayload = (standaloneProjectScopes || []).map((s) => ({
      scopeType: String(s.scopeType || s.scope_type || '').trim().toUpperCase(),
      scopeValue: String(s.scopeValue || s.scope_value || '').trim(),
      scopeRefId: s.scopeRefId || s.scope_ref_id || null,
    })).filter((s) => s.scopeType && s.scopeValue);
    if (!projectScopePayload.length) {
      setSnackbar({ open: true, message: 'Add at least one project access rule before saving.', severity: 'warning' });
      return;
    }
    setStandaloneSaving(true);
    try {
      await apiService.updateUser(standaloneOrgUserId, {
        organizationScopes: [],
        projectScopes: projectScopePayload,
      });
      setSnackbar({ open: true, message: 'Project access updated.', severity: 'success' });
      handleCloseStandaloneOrgDialog();
      fetchUsers(showPendingOnly);
    } catch (err) {
      console.error(err);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save access scopes.',
        severity: 'error',
      });
    } finally {
      setStandaloneSaving(false);
    }
  };

  const handleCloseUserDialog = () => {
    setOpenUserDialog(false);
    setCurrentUserToEdit(null);
    setUserFormErrors({});
    setUserFormSubmitAttempted(false);
    setOrganizationScopes([]);
    setProjectScopes([]);
    setNewProjectScopeType('SECTOR');
    setNewProjectScopeValues([]);
    setShowUserFormPasswords({ password: false, confirmPassword: false });
    setIsCheckingUsername(false);
    usernameCheckSeqRef.current += 1;
  };

  const toggleUserFormPasswordVisibility = (field) => {
    setShowUserFormPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const scopeRowLabel = (s) => {
    if (!s || !s.scopeType) return '';
    if (s.scopeType === 'AGENCY') {
      const name = s.agencyName || 'Agency';
      return `Legacy agency scope: ${name}`;
    }
    if (s.scopeType === 'ALL_MINISTRIES') return 'All departments (county-wide)';
    if (s.scopeType === 'MINISTRY_ALL') {
      const m = String(s.ministry || '').trim();
      if (m === '*' || m.toUpperCase() === 'ALL') return 'All departments (county-wide)';
      return `Parent organization — all departments: ${m || '—'}`;
    }
    return `Department: ${s.stateDepartment || s.state_department || '—'} (${s.ministry || '—'})`;
  };

  const projectScopeRowLabel = (s) => {
    const type = String(s?.scopeType || s?.scope_type || '').trim().toUpperCase();
    const value = s?.scopeValue || s?.scope_value || s?.value || '—';
    const labels = {
      ALL_DEPARTMENTS: 'All departments',
      SECTOR: 'Sector',
      DEPARTMENT: 'Department',
      SUBCOUNTY: 'Sub-county',
      WARD: 'Ward',
      SUBLOCATION: 'Sublocation',
      VILLAGE: 'Village',
      MUNICIPALITY: 'Municipality',
    };
    if (type === 'ALL_DEPARTMENTS') return 'All departments (county-wide project access)';
    return `${labels[type] || 'Project scope'}: ${value}`;
  };

  const handleAddOrganizationScope = () => {
    if (newScopeType === 'ALL_MINISTRIES') {
      setOrganizationScopes([{ scopeType: 'ALL_MINISTRIES' }]);
    } else if (newScopeType === 'MINISTRY_ALL') {
      const m = (newScopeMinistry || '').trim();
      if (!m) {
        setSnackbar({ open: true, message: 'Select a parent organization.', severity: 'warning' });
        return;
      }
      setOrganizationScopes([{ scopeType: 'MINISTRY_ALL', ministry: m }]);
    } else {
      const m = countyParentOrgName;
      const departments = [
        ...new Set(
          (Array.isArray(newScopeStateDepts) && newScopeStateDepts.length > 0 ? newScopeStateDepts : [newScopeStateDept])
            .map((sd) => String(sd || '').trim())
            .filter(Boolean)
        ),
      ];
      if (!departments.length) {
        setSnackbar({ open: true, message: 'Select at least one department.', severity: 'warning' });
        return;
      }
      setOrganizationScopes(departments.map((sd) => ({ scopeType: 'STATE_DEPARTMENT_ALL', ministry: m, stateDepartment: sd })));
    }
  };

  const handleRemoveOrganizationScope = (index) => {
    setOrganizationScopes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddProjectScopes = () => {
    if (newProjectScopeType === 'ALL_DEPARTMENTS') {
      setProjectScopes([{ scopeType: 'ALL_DEPARTMENTS', scopeValue: '*' }]);
      setUserFormErrors((prev) => ({ ...prev, projectScopes: '' }));
      setNewProjectScopeValues([]);
      return;
    }
    const values = [...new Set((newProjectScopeValues || []).map((v) => String(v || '').trim()).filter(Boolean))];
    if (!values.length) {
      setSnackbar({ open: true, message: 'Select at least one project access value.', severity: 'warning' });
      return;
    }
    setProjectScopes((prev) => {
      const existingKeys = new Set(
        (prev || []).map((s) => `${String(s.scopeType || s.scope_type || '').toUpperCase()}::${String(s.scopeValue || s.scope_value || '').trim().toLowerCase()}`)
      );
      const next = [...(prev || [])];
      values.forEach((value) => {
        const key = `${newProjectScopeType}::${value.toLowerCase()}`;
        if (!existingKeys.has(key)) {
          next.push({ scopeType: newProjectScopeType, scopeValue: value });
          existingKeys.add(key);
        }
      });
      return next;
    });
    setUserFormSubmitAttempted(false);
    setUserFormErrors((prev) => ({ ...prev, projectScopes: '', accessDepartments: '' }));
    setNewProjectScopeValues([]);
  };

  const handleRemoveProjectScope = (index) => {
    setProjectScopes((prev) => prev.filter((_, i) => i !== index));
  };

  const resetUiProfileForm = () => {
    setCurrentUiProfileToEdit(null);
    setUiProfileFormData({
      name: '',
      description: '',
      visibleMenuKeys: [],
      visibleTabKeys: [],
      isDefault: false,
    });
  };

  const handleOpenUiProfileManagementDialog = () => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can manage UI profiles.', severity: 'error' });
      return;
    }
    fetchUiProfiles();
    setOpenUiProfileManagementDialog(true);
  };

  const handleOpenCreateUiProfileDialog = () => {
    resetUiProfileForm();
    setOpenUiProfileDialog(true);
  };

  const handleOpenEditUiProfileDialog = (profile) => {
    setCurrentUiProfileToEdit(profile);
    setUiProfileFormData({
      name: profile?.name || '',
      description: profile?.description || '',
      visibleMenuKeys: Array.isArray(profile?.visibleMenuKeys) ? profile.visibleMenuKeys : [],
      visibleTabKeys: Array.isArray(profile?.visibleTabKeys) ? profile.visibleTabKeys : [],
      isDefault: !!profile?.isDefault,
    });
    setOpenUiProfileDialog(true);
  };

  const handleCloseUiProfileDialog = () => {
    setOpenUiProfileDialog(false);
    resetUiProfileForm();
  };

  const readUiProfileFormData = () => ({
    ...uiProfileFormData,
    name: uiProfileNameInputRef.current?.value ?? uiProfileFormData.name,
    description: uiProfileDescriptionInputRef.current?.value ?? uiProfileFormData.description,
  });

  const setUiProfileMenuKeys = (keys) => {
    const next = normalizeUiProfileKeys(keys);
    setUiProfileFormData((prev) => ({ ...prev, visibleMenuKeys: next }));
  };

  const updateUiProfileMenuKeys = (updater) => {
    setUiProfileFormData((prev) => {
      const current = new Set(normalizeUiProfileKeys(prev.visibleMenuKeys));
      const next = updater(current);
      return { ...prev, visibleMenuKeys: normalizeUiProfileKeys([...next]) };
    });
  };

  const setUiProfileTabKeys = (keys) => {
    const next = normalizeUiProfileKeys(keys);
    setUiProfileFormData((prev) => ({ ...prev, visibleTabKeys: next }));
  };

  const handleSelectAllUiMenus = () => setUiProfileMenuKeys(uiMenuVisibilityOptions.map((option) => option.key));
  const handleSelectUiMenuGroups = () => setUiProfileMenuKeys(uiMenuVisibilityOptions.filter((option) => option.group === 'Menu groups').map((option) => option.key));
  const handleSelectUiMenuItems = () => setUiProfileMenuKeys(uiMenuVisibilityOptions.filter((option) => option.group === 'Menu items').map((option) => option.key));
  const handleClearUiMenus = () => setUiProfileMenuKeys([]);
  const handleToggleUiMenuGroupItems = (group) => {
    updateUiProfileMenuKeys((selected) => {
      const itemKeys = (group.items || []).map((item) => item.key);
      const groupAllowed = selected.has(group.key);
      const allItemsSelected = itemKeys.length > 0 && itemKeys.every((key) => selected.has(key));
      selected.delete(group.key);
      if (groupAllowed || allItemsSelected) {
        itemKeys.forEach((key) => selected.delete(key));
      } else {
        itemKeys.forEach((key) => selected.add(key));
      }
      return selected;
    });
  };
  const handleAllowWholeUiMenuGroup = (group) => {
    updateUiProfileMenuKeys((selected) => {
      (group.items || []).forEach((item) => selected.delete(item.key));
      selected.add(group.key);
      return selected;
    });
  };
  const handleClearUiMenuGroup = (group) => {
    updateUiProfileMenuKeys((selected) => {
      selected.delete(group.key);
      (group.items || []).forEach((item) => selected.delete(item.key));
      return selected;
    });
  };
  const handleToggleUiMenuItem = (group, item, checked) => {
    updateUiProfileMenuKeys((selected) => {
      if (selected.has(group.key)) {
        selected.delete(group.key);
        (group.items || []).forEach((groupItem) => {
          if (groupItem.key !== item.key) selected.add(groupItem.key);
        });
      }
      if (checked) {
        selected.add(item.key);
      } else {
        selected.delete(item.key);
      }
      return selected;
    });
  };
  const handleSelectAllUiTabs = () => setUiProfileTabKeys(uiTabVisibilityOptions.map((option) => option.key));
  const handleClearUiTabs = () => setUiProfileTabKeys([]);
  const handleToggleUiTabGroup = (group) => {
    setUiProfileFormData((prev) => {
      const selected = new Set(normalizeUiProfileKeys(prev.visibleTabKeys));
      const keys = (group.options || []).map((option) => option.key);
      const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
      if (allSelected) {
        keys.forEach((key) => selected.delete(key));
      } else {
        keys.forEach((key) => selected.add(key));
      }
      return { ...prev, visibleTabKeys: normalizeUiProfileKeys([...selected]) };
    });
  };
  const handleToggleUiTab = (tabKey, checked) => {
    setUiProfileFormData((prev) => {
      const selected = new Set(normalizeUiProfileKeys(prev.visibleTabKeys));
      if (checked) {
        selected.add(tabKey);
      } else {
        selected.delete(tabKey);
      }
      return { ...prev, visibleTabKeys: normalizeUiProfileKeys([...selected]) };
    });
  };

  const handleSaveUiProfile = async () => {
    const formData = readUiProfileFormData();
    const payload = {
      ...formData,
      name: String(formData.name || '').trim(),
      description: String(formData.description || '').trim(),
    };
    if (!payload.name) {
      setSnackbar({ open: true, message: 'UI profile name is required.', severity: 'warning' });
      return;
    }
    setLoadingUiProfiles(true);
    try {
      if (currentUiProfileToEdit?.id) {
        await apiService.updateUiProfile(currentUiProfileToEdit.id, payload);
      } else {
        await apiService.createUiProfile(payload);
      }
      await fetchUiProfiles();
      handleCloseUiProfileDialog();
      setSnackbar({ open: true, message: 'UI profile saved.', severity: 'success' });
    } catch (err) {
      console.error('Save UI profile failed:', err);
      setSnackbar({ open: true, message: err?.response?.data?.error || err?.message || 'Failed to save UI profile.', severity: 'error' });
    } finally {
      setLoadingUiProfiles(false);
    }
  };

  const handleOpenViewDetails = async (userRow) => {
    setViewDetailsUser(userRow);
    setOpenViewDetailsDialog(true);
    try {
      const full = await apiService.getUserById(userRow.userId);
      setViewDetailsUser(full);
    } catch (err) {
      console.warn('Could not load full user for details:', err);
    }
  };

  const handleCloseViewDetails = () => {
    setOpenViewDetailsDialog(false);
    setViewDetailsUser(null);
  };

  const handleUserFormChange = (e) => {
    const { name, value } = e.target;
    setUserFormSubmitAttempted(false);
    setUserFormData(prev => {
      if (name === 'password' && currentUserToEdit) {
        // Edit mode: keep confirm password in sync so users don't need to retype it.
        return { ...prev, password: value, confirmPassword: value };
      }
      return { ...prev, [name]: value };
    });
    if (name === 'role') {
      setUserFormErrors((prev) => ({ ...prev, role: '' }));
      return;
    }
    if (name === 'phoneNumber') {
      setUserFormErrors((prev) => ({ ...prev, phoneNumber: '' }));
      return;
    }
    if (name === 'username') {
      setUserFormErrors((prev) => ({ ...prev, username: '' }));
      setIsCheckingUsername(false);
      return;
    }
    if (name === 'password' && currentUserToEdit) {
      setUserFormErrors((prev) => ({ ...prev, password: '', confirmPassword: '' }));
    }
  };

  const handleUserTextInputChange = (fieldName) => {
    if (!fieldName) return;
    if (fieldName === 'username') {
      setUserFormErrors((prev) => ({ ...prev, username: '' }));
      setIsCheckingUsername(false);
      return;
    }
    if (['password', 'confirmPassword'].includes(fieldName)) {
      setUserFormErrors((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(userFormErrors, fieldName)) {
      setUserFormErrors((prev) => ({ ...prev, [fieldName]: '' }));
    }
  };

  const handleUserTextInputBlur = (fieldName) => {
    const node = userFormInputRefs.current[fieldName];
    if (!node) return;
    setUserFormData((prev) => {
      const value = node.value ?? '';
      if (prev[fieldName] === value) return prev;
      return { ...prev, [fieldName]: value };
    });
  };

  useEffect(() => {
    if (!openUserDialog || !currentUserToEdit || !isSuperAdmin) return;
    const typed = String(userFormData.username || '').trim();
    const original = String(currentUserToEdit.username || '').trim();
    if (!typed || typed.toLowerCase() === original.toLowerCase()) {
      setIsCheckingUsername(false);
      setUserFormErrors((prev) => {
        if (!prev.username) return prev;
        const { username: _username, ...rest } = prev;
        return rest;
      });
      return;
    }

    const seq = ++usernameCheckSeqRef.current;
    setIsCheckingUsername(true);
    const t = setTimeout(async () => {
      try {
        const result = await apiService.checkUsernameAvailability(typed, currentUserToEdit.userId);
        if (seq !== usernameCheckSeqRef.current) return;
        setUserFormErrors((prev) => ({
          ...prev,
          username: result?.available ? '' : 'This username is already taken.',
        }));
      } catch {
        if (seq !== usernameCheckSeqRef.current) return;
        setUserFormErrors((prev) => ({
          ...prev,
          username: 'Could not verify username availability right now.',
        }));
      } finally {
        if (seq === usernameCheckSeqRef.current) {
          setIsCheckingUsername(false);
        }
      }
    }, 450);

    return () => {
      clearTimeout(t);
    };
  }, [openUserDialog, currentUserToEdit, isSuperAdmin, userFormData.username]);

  const collectUserFormErrors = (formValues = readUserFormData()) => {
    const errors = {};
    const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
    const normalizedProjectScopes = (projectScopes || [])
      .map((s) => ({
        scopeType: String(s.scopeType || s.scope_type || '').trim().toUpperCase(),
        scopeValue: String(s.scopeValue || s.scope_value || '').trim(),
      }))
      .filter((s) => s.scopeType && s.scopeValue);
    const hasProjectAccess = normalizedProjectScopes.length > 0;
    const roleName = String(formValues.role || '').trim();
    if (!roleName) {
      errors.role = 'Role is required.';
    } else {
      const matchedRole = assignableRoles.find((role) => role.roleName === roleName)
        || roles.find((role) => role.roleName === roleName);
      if (!matchedRole) {
        errors.role = `Role "${roleName}" is not available. Choose a role from the list.`;
      }
    }

    if (!String(formValues.username || '').trim()) errors.username = 'Username is required.';
    if (!String(formValues.email || '').trim()) errors.email = 'Email is required.';
    if (!/\S+@\S+\.\S+/.test(String(formValues.email || ''))) errors.email = 'Email is invalid.';
    if (formValues.phoneNumber && !phoneRegex.test(String(formValues.phoneNumber || '').trim())) {
      errors.phoneNumber = 'Use 07XXXXXXXX or +2547XXXXXXXX';
    }

    if (formValues.otpEnabled) {
      const delivery = otpDeliveryFromChannel(formValues.otpChannel);
      if (!delivery.email && !delivery.sms) {
        errors.otpChannel = 'Select at least one OTP delivery method (email and/or SMS).';
      }
      if (delivery.sms && !String(formValues.phoneNumber || '').trim()) {
        errors.phoneNumber = errors.phoneNumber || 'Phone number is required when SMS OTP is selected.';
      }
    }

    const orgProfileEditable = !currentUserToEdit || isSuperAdmin;
    if (orgProfileEditable && !hasProjectAccess) {
      errors.projectScopes = 'Add at least one project access rule before the user can sign in.';
    }

    if (!currentUserToEdit) {
        // For new users, password is required
        if (!String(formValues.password || '').trim()) errors.password = 'Password is required for new users.';
        else if (String(formValues.password || '').trim().length < 6) errors.password = 'Password must be at least 6 characters.';

        if (!String(formValues.confirmPassword || '').trim()) errors.confirmPassword = 'Please confirm your password.';
        else if (formValues.password !== formValues.confirmPassword) errors.confirmPassword = 'Passwords do not match.';

        if (!String(formValues.firstName || '').trim()) errors.firstName = 'First Name is required.';
        if (!String(formValues.lastName || '').trim()) errors.lastName = 'Last Name is required.';
    } else {
        // For existing users, only validate password if it's being changed
        if (String(formValues.password || '').trim()) {
            if (String(formValues.password || '').trim().length < 6) errors.password = 'Password must be at least 6 characters.';
            if (!String(formValues.confirmPassword || '').trim()) errors.confirmPassword = 'Please confirm your password.';
            else if (formValues.password !== formValues.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
        }
    }

    return errors;
  };

  const validateUserForm = (formValues = readUserFormData()) => {
    const errors = collectUserFormErrors(formValues);
    setUserFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const scrollToUserFormError = (errors) => {
    const scrollContainer = userDialogContentRef.current;
    if (!scrollContainer) return;

    const scrollToNode = (node) => {
      if (!node) return;
      const containerTop = scrollContainer.getBoundingClientRect().top;
      const nodeTop = node.getBoundingClientRect().top;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + (nodeTop - containerTop) - 16,
        behavior: 'smooth',
      });
    };

    if (errors.projectScopes) {
      scrollToNode(projectAccessSectionRef.current);
      return;
    }
    if (errors.role) {
      scrollToNode(scrollContainer.querySelector('[data-user-form-field="role"]'));
      return;
    }
    const invalidInput = scrollContainer.querySelector('.Mui-error input, .Mui-error textarea');
    scrollToNode(invalidInput?.closest('.MuiFormControl-root') || invalidInput);
  };

  const handleUserSubmit = async () => {
    const formValues = readUserFormData();
    setUserFormData(formValues);
    const errors = collectUserFormErrors(formValues);
    setUserFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setUserFormSubmitAttempted(true);
      const primaryError = getPrimaryUserFormError(errors);
      setSnackbar({
        open: true,
        message: primaryError || 'Please correct the form errors.',
        severity: 'error',
      });
      window.setTimeout(() => scrollToUserFormError(errors), 50);
      return;
    }
    setUserFormSubmitAttempted(false);
    if (isCheckingUsername) {
      setSnackbar({ open: true, message: 'Please wait for username validation to finish.', severity: 'warning' });
      return;
    }
    if (currentUserToEdit && isSuperAdmin) {
      const typed = String(formValues.username || '').trim();
      const original = String(currentUserToEdit.username || '').trim();
      if (typed && typed.toLowerCase() !== original.toLowerCase()) {
        try {
          const result = await apiService.checkUsernameAvailability(typed, currentUserToEdit.userId);
          if (!result?.available) {
            setUserFormErrors((prev) => ({ ...prev, username: 'This username is already taken.' }));
            setSnackbar({ open: true, message: 'Username is already taken.', severity: 'error' });
            return;
          }
        } catch {
          setUserFormErrors((prev) => ({ ...prev, username: 'Could not verify username availability right now.' }));
          setSnackbar({ open: true, message: 'Unable to verify username availability. Try again.', severity: 'error' });
          return;
        }
      }
    }

    setLoading(true);
    try {
      // Convert role name to roleId for backend
      const selectedRole = assignableRoles.find(role => role.roleName === formValues.role) || roles.find(role => role.roleName === formValues.role);
      const countyParent = countyParentOrgName;

      const dataToSend = {
        ...formValues,
        ministry: countyParent,
        stateDepartment: '',
        roleId: selectedRole ? selectedRole.roleId : null,
        agency_id: null,
        state_department: null,
        directorate: null,
        organizationScopes: [],
        projectScopes: (projectScopes || []).map((s) => ({
          scopeType: String(s.scopeType || s.scope_type || '').trim().toUpperCase(),
          scopeValue: String(s.scopeValue || s.scope_value || '').trim(),
          scopeRefId: s.scopeRefId || s.scope_ref_id || null,
        })).filter((s) => s.scopeType && s.scopeValue),
      };

      // Remove fields that backend doesn't expect
      delete dataToSend.role;
      delete dataToSend.confirmPassword;
      delete dataToSend.agencyId;
      delete dataToSend.stateDepartment;
      delete dataToSend.accessDepartments;
      delete dataToSend.homeDirectorates;

      // Editing organization profile fields on existing users is restricted to Super Admin.
      if (currentUserToEdit && !isSuperAdmin) {
        delete dataToSend.ministry;
        delete dataToSend.state_department;
        delete dataToSend.directorate;
        delete dataToSend.agency_id;
      }

      if (currentUserToEdit) {
        if (!hasPrivilege('user.update')) {
            setSnackbar({ open: true, message: 'Permission denied to update user.', severity: 'error' });
            setLoading(false);
            return;
        }
        await apiService.updateUser(currentUserToEdit.userId, dataToSend);
        setSnackbar({ open: true, message: 'User updated successfully!', severity: 'success' });
      } else {
        if (!hasPrivilege('user.create')) {
            setSnackbar({ open: true, message: 'Permission denied to create user.', severity: 'error' });
            setLoading(false);
            return;
        }
        console.log('Creating user with data:', dataToSend); // Debug log
        await apiService.createUser(dataToSend);
        setSnackbar({ open: true, message: 'User created successfully!', severity: 'success' });
      }
      handleCloseUserDialog();
      fetchUsers();
    } catch (err) {
      console.error("Submit user error:", err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save user.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteConfirmDialog = (userId, username) => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can delete users.', severity: 'warning' });
      return;
    }
    if (!hasPrivilege('user.delete')) {
        setSnackbar({ open: true, message: 'Permission denied to delete users.', severity: 'error' });
        return;
    }
    setUserToDeleteId(userId);
    setUserToDeleteName(username);
    setOpenDeleteConfirmDialog(true);
  };

  const handleCloseDeleteConfirmDialog = () => {
    setOpenDeleteConfirmDialog(false);
    setUserToDeleteId(null);
    setUserToDeleteName('');
  };

  const handleConfirmDeleteUser = async () => {
    setLoading(true);
    handleCloseDeleteConfirmDialog();
    try {
      if (!isSuperAdmin) {
        setSnackbar({ open: true, message: 'Only Super Admin can delete users.', severity: 'warning' });
        setLoading(false);
        return;
      }
      if (!hasPrivilege('user.delete')) {
          setSnackbar({ open: true, message: 'Permission denied to delete user.', severity: 'error' });
          setLoading(false);
          return;
      }
      await apiService.deleteUser(userToDeleteId);
      setSnackbar({ open: true, message: 'User deleted successfully!', severity: 'success' });
      fetchUsers();
      fetchVoidedUsers();
    } catch (err) {
      console.error("Delete user error:", err);
      setSnackbar({
        open: true,
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to delete user.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreVoidedUser = async (userId, username) => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can restore voided users.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      await apiService.restoreUser(userId);
      setSnackbar({ open: true, message: `User "${username}" restored successfully.`, severity: 'success' });
      fetchUsers(showPendingOnly);
      fetchVoidedUsers();
    } catch (err) {
      const errorMessage = err?.error || err?.message || 'Failed to restore user.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  // Reset Password Handler
  const handleOpenResetPasswordDialog = (targetRow) => {
    if (!hasPrivilege('user.update')) {
      setSnackbar({ open: true, message: 'Permission denied to reset passwords.', severity: 'error' });
      return;
    }
    if (!canMdaIctAdminMutateUser(user, targetRow)) {
      setSnackbar({ open: true, message: MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE, severity: 'warning' });
      return;
    }
    setUserToResetId(targetRow.userId);
    setUserToResetName(targetRow.username);
    setOpenResetPasswordDialog(true);
  };

  const handleCloseResetPasswordDialog = () => {
    setOpenResetPasswordDialog(false);
    setUserToResetId(null);
    setUserToResetName('');
  };

  const handleConfirmResetPassword = async () => {
    setLoading(true);
    try {
      // Update user with new password
      await apiService.updateUser(userToResetId, { password: 'reset123' });
      setSnackbar({ 
        open: true, 
        message: `Password reset successfully for ${userToResetName}. New password: reset123`, 
        severity: 'success' 
      });
      handleCloseResetPasswordDialog();
    } catch (err) {
      console.error("Reset password error:", err);
      setSnackbar({
        open: true,
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to reset password.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenResendCredentialsDialog = (targetRow) => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can resend credentials email.', severity: 'warning' });
      return;
    }
    if (!targetRow?.email) {
      setSnackbar({ open: true, message: 'User has no email address.', severity: 'warning' });
      return;
    }
    setUserToResendCredentialsId(targetRow.userId);
    setUserToResendCredentialsName(targetRow.username || '');
    setUserToResendCredentialsEmail(String(targetRow.email).trim());
    setOpenResendCredentialsDialog(true);
  };

  const handleCloseResendCredentialsDialog = () => {
    setOpenResendCredentialsDialog(false);
    setUserToResendCredentialsId(null);
    setUserToResendCredentialsName('');
    setUserToResendCredentialsEmail('');
  };

  const handleConfirmResendCredentialsEmail = async () => {
    if (userToResendCredentialsId == null) return;
    setLoading(true);
    try {
      const result = await apiService.resendUserCredentials(userToResendCredentialsId);
      const username = userToResendCredentialsName || 'user';
      setSnackbar({
        open: true,
        message: result?.message || `Credentials email sent to ${username}.`,
        severity: 'success',
      });
      handleCloseResendCredentialsDialog();
    } catch (err) {
      setSnackbar({
        open: true,
        message:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.error ||
          err?.message ||
          'Failed to resend credentials email.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Disable/Enable User Handler
  const handleToggleUserStatus = (targetRow) => {
    if (!hasPrivilege('user.update')) {
      setSnackbar({ open: true, message: 'Permission denied to change user status.', severity: 'error' });
      return;
    }
    if (!canMdaIctAdminMutateUser(user, targetRow)) {
      setSnackbar({ open: true, message: MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE, severity: 'warning' });
      return;
    }

    setUserToToggleId(targetRow.userId);
    setUserToToggleName(targetRow.username);
    setUserToToggleCurrentStatus(targetRow.isActive);
    setOpenToggleStatusDialog(true);
  };

  const handleCloseToggleStatusDialog = () => {
    setOpenToggleStatusDialog(false);
    setUserToToggleId(null);
    setUserToToggleName('');
    setUserToToggleCurrentStatus(true);
  };

  const handleConfirmToggleUserStatus = async () => {
    const action = userToToggleCurrentStatus ? 'disable' : 'enable';
    const newStatus = !userToToggleCurrentStatus;

    setLoading(true);
    try {
      await apiService.updateUser(userToToggleId, { isActive: newStatus });
      setSnackbar({ 
        open: true, 
        message: `User ${userToToggleName} ${action}d successfully!`, 
        severity: 'success' 
      });
      fetchUsers(); // Refresh the user list
      handleCloseToggleStatusDialog();
    } catch (err) {
      console.error(`${action} user error:`, err);
      setSnackbar({
        open: true,
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          `Failed to ${action} user.`,
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  /** Toggle `users.otp_enabled` / `users.otpEnabled` — off during dev for quick login; on for 6-digit email code after password. */
  const handleToggleUserOtpLogin = async (targetRow, nextEnabled) => {
    if (!hasPrivilege('user.update')) {
      setSnackbar({ open: true, message: 'Permission denied to change OTP setting.', severity: 'error' });
      return;
    }
    if (!canMdaIctAdminMutateUser(user, targetRow)) {
      setSnackbar({ open: true, message: MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE, severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await apiService.updateUser(targetRow.userId, { otpEnabled: !!nextEnabled });
      setSnackbar({
        open: true,
        message: nextEnabled
          ? `Email OTP enabled for ${targetRow.username} (6-digit code after password).`
          : `Email OTP disabled for ${targetRow.username} — password-only sign-in.`,
        severity: 'success',
      });
      fetchUsers(showPendingOnly);
    } catch (err) {
      setSnackbar({
        open: true,
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to update OTP setting.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // --- Role Management Handlers ---
  const handleOpenRoleManagementDialog = () => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can open role management.', severity: 'warning' });
      return;
    }
    if (!hasPrivilege('role.read_all')) {
      setSnackbar({ open: true, message: 'Permission denied to view roles.', severity: 'error' });
      return;
    }
    fetchRoles();
    fetchPrivileges();
    setOpenRoleManagementDialog(true);
  };

  const handleCloseRoleManagementDialog = () => {
    setOpenRoleManagementDialog(false);
  };

  const handleOpenCreateRoleDialog = () => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can add roles.', severity: 'warning' });
      return;
    }
    if (!hasPrivilege('role.create')) {
      setSnackbar({ open: true, message: 'Permission denied to create roles.', severity: 'error' });
      return;
    }
    setCurrentRoleToEdit(null);
    setRoleFormData({ roleName: '', description: '', privilegeIds: [], uiProfileId: '' });
    setRoleFormErrors({});
    fetchPrivileges();
    setOpenRoleDialog(true);
  };

  const handleOpenEditRoleDialog = async (role) => {
    if (!hasPrivilege('role.update')) {
      setSnackbar({ open: true, message: 'Permission denied to edit roles.', severity: 'error' });
      return;
    }
    setCurrentRoleToEdit(role);
    fetchPrivileges();
    setRoleFormData({
      roleName: role.roleName || '',
      description: role.description || '',
      privilegeIds: [],
      uiProfileId: role.uiProfileId ? String(role.uiProfileId) : '',
    });
    setRoleFormErrors({});

    try {
      const rolePrivileges = await apiService.getRolePrivileges(role.roleId);
      const rows = Array.isArray(rolePrivileges) ? rolePrivileges : [];
      const currentPrivilegeIds = [...new Set(
        rows.map((rp) => rp.privilegeId ?? rp.privilege_id).filter((id) => id != null).map((id) => String(id))
      )];
      setRoleFormData(prev => ({ ...prev, privilegeIds: currentPrivilegeIds }));
    } catch (err) {
      console.error('Error fetching role privileges for edit:', err);
      setSnackbar({ open: true, message: 'Failed to load role privileges.', severity: 'error' });
    }
    setOpenRoleDialog(true);
  };

  const handleCloseRoleDialog = () => {
    setOpenRoleDialog(false);
    setCurrentRoleToEdit(null);
    setRoleFormErrors({});
  };

  const validateRoleForm = () => {
    let errors = {};
    const nextRoleName = String(roleNameInputRef.current?.value ?? roleFormData.roleName ?? '').trim();
    if (!nextRoleName) {
      errors.roleName = 'Role Name is required.';
    } else {
      const duplicateRole = roles.find((role) => {
        const sameName = String(role.roleName || '').trim().toLowerCase() === nextRoleName.toLowerCase();
        const sameRole = currentRoleToEdit && String(role.roleId) === String(currentRoleToEdit.roleId);
        return sameName && !sameRole;
      });
      if (duplicateRole) {
        errors.roleName = 'Another role with this name already exists.';
      }
    }
    setRoleFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRoleSubmit = async () => {
    if (!validateRoleForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }

    setLoading(true);
    const roleDataToSubmit = {
      ...roleFormData,
      roleName: String(roleNameInputRef.current?.value ?? roleFormData.roleName ?? '').trim(),
      description: String(roleDescriptionInputRef.current?.value ?? roleFormData.description ?? '').trim(),
      uiProfileId: roleFormData.uiProfileId || null,
    };
    const privilegeIdsToAssign = roleDataToSubmit.privilegeIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    roleDataToSubmit.privilegeIds = privilegeIdsToAssign;

    try {
      if (currentRoleToEdit) {
        if (!hasPrivilege('role.update')) {
          setSnackbar({ open: true, message: 'Permission denied to update role.', severity: 'error' });
          setLoading(false);
          return;
        }
        await apiService.updateRole(currentRoleToEdit.roleId, roleDataToSubmit);
        setSnackbar({ open: true, message: 'Role updated successfully!', severity: 'success' });
      } else {
        if (!isSuperAdmin) {
          setSnackbar({ open: true, message: 'Only Super Admin can create roles.', severity: 'warning' });
          setLoading(false);
          return;
        }
        if (!hasPrivilege('role.create')) {
          setSnackbar({ open: true, message: 'Permission denied to create role.', severity: 'error' });
          setLoading(false);
          return;
        }
        const createdRole = await apiService.createRole(roleDataToSubmit);
        if (!createdRole || !createdRole.roleId) {
          throw new Error('Role creation succeeded but did not return a valid role ID');
        }
        setSnackbar({ open: true, message: 'Role created successfully!', severity: 'success' });
      }

      handleCloseRoleDialog();
      fetchRoles();
    } catch (err) {
      console.error("Submit role error:", err);
      // Extract error message - check multiple possible locations
      // The axios interceptor may return error.response.data directly, or we may have an Error object
      let errorMessage = 'Failed to save role.';
      if (err && typeof err === 'object') {
        // Check if it's a plain object with error property (from axios interceptor)
        if (err.error && typeof err.error === 'string') {
          errorMessage = err.error;
        }
        // Check if it's an Error object with message property
        else if (err.message && typeof err.message === 'string') {
          errorMessage = err.message;
        }
        // Check standard axios error structure
        else if (err.response?.data) {
          errorMessage = err.response.data.error || err.response.data.message || err.message || errorMessage;
        }
        // Fallback to message if available
        else if (err.message) {
          errorMessage = err.message;
        }
      }
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteRoleConfirm = (roleId, roleName) => {
    if (!hasPrivilege('role.delete')) {
      setSnackbar({ open: true, message: 'Permission denied to delete roles.', severity: 'error' });
      return;
    }
    setRoleToDeleteId(roleId);
    setRoleToDeleteName(roleName);
    setOpenRoleDeleteConfirmDialog(true);
  };

  const handleCloseRoleDeleteConfirmDialog = () => {
    setOpenRoleDeleteConfirmDialog(false);
    setRoleToDeleteId(null);
    setRoleToDeleteName('');
  };

  const handleConfirmDeleteRole = async () => {
    if (!roleToDeleteId) return;
    setLoading(true);
    setOpenRoleDeleteConfirmDialog(false);
    try {
      await apiService.deleteRole(roleToDeleteId);
      setSnackbar({ open: true, message: 'Role deleted successfully!', severity: 'success' });
      fetchRoles();
    } catch (err) {
      console.error("Delete role error:", err);
      setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to delete role.', severity: 'error' });
    } finally {
      setLoading(false);
      setRoleToDeleteId(null);
      setRoleToDeleteName('');
    }
  };


  // --- Privilege Management Handlers ---
  const handleOpenPrivilegeManagementDialog = () => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can open privilege management.', severity: 'warning' });
      return;
    }
    if (!hasPrivilege('privilege.read_all')) {
      setSnackbar({ open: true, message: 'Permission denied to view privileges.', severity: 'error' });
      return;
    }
    fetchPrivileges();
    setOpenPrivilegeManagementDialog(true);
  };

  const handleClosePrivilegeManagementDialog = () => {
    setOpenPrivilegeManagementDialog(false);
  };

  const handleOpenCreatePrivilegeDialog = () => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can add privileges.', severity: 'warning' });
      return;
    }
    if (!hasPrivilege('privilege.create')) {
      setSnackbar({ open: true, message: 'Permission denied to create privileges.', severity: 'error' });
      return;
    }
    setCurrentPrivilegeToEdit(null);
    setPrivilegeFormData({ privilegeName: '', description: '' });
    setPrivilegeFormErrors({});
    setOpenPrivilegeDialog(true);
  };

  const handleOpenEditPrivilegeDialog = (privilege) => {
    if (!hasPrivilege('privilege.update')) {
      setSnackbar({ open: true, message: 'Permission denied to edit privileges.', severity: 'error' });
      return;
    }
    setCurrentPrivilegeToEdit(privilege);
    setPrivilegeFormData({
      privilegeName: privilege.privilegeName || '',
      description: privilege.description || ''
    });
    setPrivilegeFormErrors({});
    setOpenPrivilegeDialog(true);
  };

  const handleClosePrivilegeDialog = () => {
    setOpenPrivilegeDialog(false);
    setCurrentPrivilegeToEdit(null);
    setPrivilegeFormErrors({});
  };

  const handlePrivilegeFormChange = (e) => {
    const { name, value } = e.target;
    setPrivilegeFormData(prev => ({ ...prev, [name]: value }));
  };

  const validatePrivilegeForm = () => {
    let errors = {};
    const name = (privilegeFormData.privilegeName != null && String(privilegeFormData.privilegeName).trim()) || '';
    if (!name) errors.privilegeName = 'Privilege Name is required.';
    setPrivilegeFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePrivilegeSubmit = async () => {
    console.log('handlePrivilegeSubmit called');
    console.log('Form data:', privilegeFormData);
    
    if (!validatePrivilegeForm()) {
      console.log('Validation failed');
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      if (currentPrivilegeToEdit) {
        if (!hasPrivilege('privilege.update')) {
          setSnackbar({ open: true, message: 'Permission denied to update privilege.', severity: 'error' });
          setLoading(false);
          return;
        }
        const { privilegeId: _privilegeId, ...updatedFields } = privilegeFormData;
        await apiService.updatePrivilege(currentPrivilegeToEdit.privilegeId, updatedFields);
        setSnackbar({ open: true, message: 'Privilege updated successfully!', severity: 'success' });
      } else {
        if (!isSuperAdmin) {
          setSnackbar({ open: true, message: 'Only Super Admin can create privileges.', severity: 'warning' });
          setLoading(false);
          return;
        }
        if (!hasPrivilege('privilege.create')) {
          setSnackbar({ open: true, message: 'Permission denied to create privilege.', severity: 'error' });
          setLoading(false);
          return;
        }
        const newPrivilegeData = {
          privilegeName: privilegeFormData.privilegeName.trim(),
          description: (privilegeFormData.description || '').trim()
        };
        console.log('Creating privilege with data:', newPrivilegeData);
        const createdPrivilege = await apiService.createPrivilege(newPrivilegeData);
        console.log('Created privilege response:', createdPrivilege);
        if (!createdPrivilege) {
          throw new Error('No response from privilege creation');
        }
        // Check for privilegeId in various possible formats
        const privilegeId = createdPrivilege.privilegeId || createdPrivilege.privilegeid || createdPrivilege.id;
        if (!privilegeId) {
          console.warn('Created privilege missing ID, but proceeding:', createdPrivilege);
          // Still proceed - the privilege might have been created even if response format is unexpected
        }
        setSnackbar({ open: true, message: 'Privilege created successfully!', severity: 'success' });
      }
      handleClosePrivilegeDialog();
      await fetchPrivileges();
      try {
        await fetchRoles();
      } catch (e) {
        console.warn('fetchRoles after privilege save:', e);
      }
    } catch (err) {
      console.error("Submit privilege error:", err);
      // The axios interceptor rejects with error.response.data directly, so err.message should have the error
      // Also check if err is a plain object with error property (from interceptor)
      let errorMessage = 'Failed to save privilege.';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.error) {
        errorMessage = err.error;
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeletePrivilegeConfirm = (privilegeId, privilegeName) => {
    if (!hasPrivilege('privilege.delete')) {
      setSnackbar({ open: true, message: 'Permission denied to delete privileges.', severity: 'error' });
      return;
    }
    setPrivilegeToDeleteId(privilegeId);
    setPrivilegeToDeleteName(privilegeName);
    setOpenPrivilegeDeleteConfirmDialog(true);
  };

  const handleClosePrivilegeDeleteConfirmDialog = () => {
    setOpenPrivilegeDeleteConfirmDialog(false);
    setPrivilegeToDeleteId(null);
    setPrivilegeToDeleteName('');
  };

  const handleConfirmDeletePrivilege = async () => {
    if (!privilegeToDeleteId) return;
    setLoading(true);
    setOpenPrivilegeDeleteConfirmDialog(false);
    try {
      await apiService.deletePrivilege(privilegeToDeleteId);
      setSnackbar({ open: true, message: 'Privilege deleted successfully!', severity: 'success' });
      fetchPrivileges();
      fetchRoles();
    } catch (err) {
      console.error("Delete privilege error:", err);
      setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to delete privilege.', severity: 'error' });
    } finally {
      setLoading(false);
      setPrivilegeToDeleteId(null);
      setPrivilegeToDeleteName('');
    }
  };

  // Filter users based on global search
  const filteredUsers = useMemo(() => {
    if (!globalSearch.trim()) {
      return users;
    }

    const query = globalSearch.toLowerCase().trim();
    return users.filter(user => {
      const scopeStrings = organizationScopesToSearchStrings(user.organizationScopes);
      const projectScopeStrings = projectScopesToSearchStrings(user.projectScopes);
      const searchableFields = [
        user.userId?.toString() || '',
        user.username || '',
        user.email || '',
        user.firstName || '',
        user.lastName || '',
        user.role || '',
        `${user.firstName || ''} ${user.lastName || ''}`.trim(), // Full name
        user.isActive ? 'active' : 'disabled',
        user.isActive ? 'enabled' : 'disabled',
        user.ministry || '',
        user.stateDepartment || user.state_department || '',
        user.directorate || '',
        user.uiProfile?.name || '',
        user.agencyName || user.agency_name || '',
        user.agencyId != null && user.agencyId !== '' ? String(user.agencyId) : '',
        user.agency_id != null && user.agency_id !== '' ? String(user.agency_id) : '',
        ...scopeStrings,
        ...projectScopeStrings,
      ];

      return searchableFields.some(field => 
        field.toLowerCase().includes(query)
      );
    });
  }, [users, globalSearch]);

  const filteredVoidedUsers = useMemo(() => {
    if (!globalSearch.trim()) return voidedUsers;
    const query = globalSearch.toLowerCase().trim();
    return voidedUsers.filter((user) => {
      const searchableFields = [
        user.userId?.toString() || '',
        user.username || '',
        user.email || '',
        user.firstName || '',
        user.lastName || '',
        user.role || '',
        `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        user.ministry || '',
        user.stateDepartment || user.state_department || '',
        user.directorate || '',
        user.agencyName || user.agency_name || '',
        user.agencyId != null && user.agencyId !== '' ? String(user.agencyId) : '',
      ];
      return searchableFields.some((field) => String(field).toLowerCase().includes(query));
    });
  }, [voidedUsers, globalSearch]);

  const usersByOrganization = useMemo(() => {
    const groups = new Map();
    for (const u of filteredUsers) {
      const { key, label, sortTier } = getUserOrgGroupInfo(u, { excludeAgency: true });
      if (!groups.has(key)) {
        groups.set(key, { key, label, sortTier, users: [] });
      }
      groups.get(key).users.push(u);
    }
    for (const g of groups.values()) {
      g.users.sort((a, b) =>
        String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' })
      );
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.sortTier !== b.sortTier) return a.sortTier - b.sortTier;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
  }, [filteredUsers]);

  const activeRoleNameSet = useMemo(() => {
    return new Set(
      (roles || [])
        .map((r) => String(r.roleName || '').trim().toLowerCase())
        .filter(Boolean)
    );
  }, [roles]);

  const usersByRole = useMemo(() => {
    const groups = new Map();
    for (const u of filteredUsers) {
      const rawRole = String(u.role || '').trim();
      const rawRoleKey = rawRole.toLowerCase();
      // Exclude users assigned to voided roles from By Role view.
      // `roles` list is fetched from active (non-voided) roles only.
      if (rawRole && activeRoleNameSet.size > 0 && !activeRoleNameSet.has(rawRoleKey)) {
        continue;
      }
      const label = rawRole || 'No role assigned';
      const key = `role:${label.toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, { key, label, sortTier: rawRole ? 0 : 99, users: [] });
      }
      groups.get(key).users.push(u);
    }
    for (const g of groups.values()) {
      g.users.sort((a, b) =>
        String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' })
      );
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.sortTier !== b.sortTier) return a.sortTier - b.sortTier;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
  }, [filteredUsers, activeRoleNameSet]);

  const usersByAccessLevel = useMemo(() => {
    const normalizeKey = (v) => String(v || '').trim().toLowerCase();
    const validMinistryNames = new Set();
    const validDepartmentNames = new Set();
    const validDeptPairs = new Set();
    const validAgenciesById = new Map();
    const validAgenciesByName = new Map();

    for (const m of ministriesHierarchy || []) {
      const mName = String(m?.name || '').trim();
      if (!mName) continue;
      validMinistryNames.add(normalizeKey(mName));
      const departments = Array.isArray(m?.departments) ? m.departments : [];
      for (const d of departments) {
        const dName = String(d?.name || d?.department_name || '').trim();
        if (!dName) continue;
        validDepartmentNames.add(normalizeKey(dName));
        validDeptPairs.add(`${normalizeKey(mName)}|${normalizeKey(dName)}`);
      }
    }

    for (const a of agencies || []) {
      const aid = a?.agency_id ?? a?.agencyId;
      const aName = String(a?.name || a?.agency_name || '').trim();
      if (aid != null && aid !== '') validAgenciesById.set(String(aid), a);
      if (aName) validAgenciesByName.set(normalizeKey(aName), a);
    }

    const groups = new Map();
    for (const u of filteredUsers) {
      const accessGroups = getUserAccessLevelGroups(u, {
        agencies,
        validMinistryNames,
        validDepartmentNames,
        validDeptPairs,
        validAgenciesById,
        validAgenciesByName,
      });
      for (const g of accessGroups) {
        if (!groups.has(g.key)) {
          groups.set(g.key, {
            key: g.key,
            label: g.label,
            sortTier: g.sortTier ?? 50,
            description: g.description || '',
            users: [],
          });
        }
        groups.get(g.key).users.push(u);
      }
    }
    for (const g of groups.values()) {
      g.users.sort((a, b) =>
        String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' })
      );
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.sortTier !== b.sortTier) return a.sortTier - b.sortTier;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
  }, [filteredUsers, ministriesHierarchy, agencies]);

  // Key columns only: avoid horizontal scroll; full details in View details dialog
  const userColumns = [
    {
      field: "username",
      headerName: "Username",
      flex: 1,
      minWidth: 120,
      cellClassName: "username-column--cell",
    },
    {
      field: "fullName",
      headerName: "Full Name",
      flex: 1.2,
      minWidth: 150,
      valueGetter: (value, row) => `${row.firstName || ''} ${row.lastName || ''}`.trim() || 'N/A',
      renderCell: ({ row }) => {
        const fullName = `${row.firstName || ''} ${row.lastName || ''}`.trim();
        return (
          <Typography sx={{ fontWeight: 500, color: colors.grey[100] }}>
            {fullName || 'N/A'}
          </Typography>
        );
      },
    },
    {
      field: "email",
      headerName: "Email",
      flex: 1.5,
      minWidth: 160,
    },
    {
      field: "role",
      headerName: "Role",
      flex: 1.15,
      minWidth: 200,
      cellClassName: 'role-column-cell',
      renderCell: ({ row: { role } }) => (
        <Box sx={{ width: '100%', minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <UserRoleBadge role={role} />
        </Box>
      ),
    },
    {
      field: "isActive",
      headerName: "Status",
      width: 130,
      minWidth: 130,
      headerAlign: 'center',
      align: 'center',
      renderCell: ({ row }) => {
        const { isActive, userId } = row;
        const canToggle =
          hasPrivilege('user.update') &&
          userId !== user.id &&
          canMdaIctAdminMutateUser(user, row);
        return (
          <UserStatusBadge
            isActive={!!isActive}
            canToggle={canToggle}
            onToggle={() => handleToggleUserStatus(row)}
            title={
              canToggle
                ? `Click to ${isActive ? 'disable' : 'enable'} user`
                : !hasPrivilege('user.update') || userId === user.id
                  ? isActive
                    ? 'Active'
                    : 'Disabled'
                  : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
            }
          />
        );
      },
    },
    {
      field: 'otpEnabled',
      headerName: 'OTP login',
      width: 118,
      minWidth: 118,
      sortable: true,
      headerAlign: 'center',
      align: 'center',
      description:
        'When on, sign-in sends a 6-digit code after password (email, SMS, or both per user setting).',
      valueGetter: (value, row) => !!(row.otpEnabled ?? row.otp_enabled),
      renderCell: ({ row }) => {
        const enabled = !!(row.otpEnabled ?? row.otp_enabled);
        const canEdit =
          hasPrivilege('user.update') && canMdaIctAdminMutateUser(user, row);
        return (
          <Tooltip
            title={
              canEdit
                ? enabled
                  ? 'On: user must enter email code after password. Click to turn off for faster dev login.'
                  : 'Off: password-only. Click to require 6-digit email code after password.'
                : 'You cannot change this user’s OTP setting.'
            }
          >
            <span>
              <Switch
                size="small"
                checked={enabled}
                disabled={!canEdit}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggleUserOtpLogin(row, e.target.checked);
                }}
                inputProps={{ 'aria-label': `Email OTP login for ${row.username}` }}
              />
            </span>
          </Tooltip>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 112,
      sortable: false,
      filterable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <UserRowActionsCell
          row={params.row}
          currentUser={user}
          isSuperAdmin={isSuperAdmin}
          canUpdate={hasPrivilege('user.update')}
          canDelete={hasPrivilege('user.delete')}
          onView={handleOpenViewDetails}
          onProjectAccess={handleOpenStandaloneOrgDialog}
          onResetPassword={handleOpenResetPasswordDialog}
          onDelete={handleOpenDeleteConfirmDialog}
          onResendCredentials={handleOpenResendCredentialsDialog}
        />
      ),
    },
  ];

  const voidedUserColumns = [
    ...userColumns.filter((c) => c.field !== 'isActive' && c.field !== 'actions'),
    {
      field: "voidedStatus",
      headerName: "Status",
      width: 130,
      minWidth: 130,
      headerAlign: 'center',
      align: 'center',
      renderCell: () => (
        <Box
          m="0 auto"
          p="6px 12px"
          display="inline-flex"
          justifyContent="center"
          alignItems="center"
          gap={0.5}
          bgcolor={colors.redAccent[700]}
          borderRadius="8px"
          sx={{ boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}
        >
          <Typography sx={{ color: brand.onPrimary, fontSize: '0.875rem', fontWeight: 700 }}>
            Voided
          </Typography>
        </Box>
      ),
    },
    {
      field: "restoreAction",
      headerName: "Actions",
      width: 120,
      sortable: false,
      filterable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <TableActionIconButton
          title="Restore user"
          tone="success"
          onClick={() => handleRestoreVoidedUser(params.row.userId, params.row.username)}
        >
          <CheckCircleIcon sx={{ fontSize: 18 }} />
        </TableActionIconButton>
      ),
    },
  ];

  const roleColumns = [
    { field: "roleId", headerName: "ID", width: 90 },
    { field: "roleName", headerName: "Role Name", flex: 1, cellClassName: "username-column--cell" },
    { field: "description", headerName: "Description", flex: 2 },
    {
      field: "actions",
      headerName: "Actions",
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.75} justifyContent="center">
          {hasPrivilege('role.update') && (
            <TableActionIconButton
              title="Edit role"
              tone="info"
              onClick={() => handleOpenEditRoleDialog(params.row)}
            >
              <EditIcon sx={{ fontSize: 18 }} />
            </TableActionIconButton>
          )}
          {hasPrivilege('role.delete') && (
            <TableActionIconButton
              title="Delete role"
              tone="danger"
              onClick={() => handleOpenDeleteRoleConfirm(params.row.roleId, params.row.roleName)}
            >
              <DeleteIcon sx={{ fontSize: 18 }} />
            </TableActionIconButton>
          )}
        </Stack>
      ),
    },
  ];

  const privilegeColumns = [
    { field: "privilegeId", headerName: "ID", width: 90 },
    { field: "privilegeName", headerName: "Privilege Name", flex: 1, cellClassName: "username-column--cell" },
    { field: "description", headerName: "Description", flex: 2 },
    {
      field: "actions",
      headerName: "Actions",
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.75} justifyContent="center">
          {hasPrivilege('privilege.update') && (
            <TableActionIconButton
              title="Edit privilege"
              tone="info"
              onClick={() => handleOpenEditPrivilegeDialog(params.row)}
            >
              <EditIcon sx={{ fontSize: 18 }} />
            </TableActionIconButton>
          )}
          {hasPrivilege('privilege.delete') && (
            <TableActionIconButton
              title="Delete privilege"
              tone="danger"
              onClick={() => handleOpenDeletePrivilegeConfirm(params.row.privilegeId, params.row.privilegeName)}
            >
              <DeleteIcon sx={{ fontSize: 18 }} />
            </TableActionIconButton>
          )}
        </Stack>
      ),
    },
  ];

  if (loading && !error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading data...</Typography>
      </Box>
    );
  }

  if (error && !hasPrivilege('user.read_all')) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || "You do not have sufficient privileges to view this page."}</Alert>
        <Alert severity="warning" sx={{ mt: 2 }}>
            You need 'user.read_all' privilege to access this page.
        </Alert>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }


  return (
    <Box sx={{ p: 2 }}>
      {/* Compact Header with Search and Actions */}
      <Box sx={{ mb: 1.5 }}>
        {/* Title Row */}
        <Typography variant="h5" component="h1" sx={{ color: colors.grey[100], fontWeight: 700, mb: 0.5, fontSize: '1.35rem' }}>
          User Management
        </Typography>
        <Tabs
          value={userListView}
          onChange={(_, v) => setUserListView(v)}
          sx={{
            mb: 1,
            minHeight: 42,
            '& .MuiTab-root': {
              color: colors.grey[400],
              minHeight: 42,
              py: 0.75,
              fontWeight: 600,
              fontSize: '0.875rem',
              textTransform: 'none',
            },
            '& .Mui-selected': { color: `${colors.greenAccent[400]} !important` },
            '& .MuiTabs-indicator': { backgroundColor: colors.greenAccent[400] },
          }}
        >
          <Tab value="all" icon={<ViewListIcon sx={{ fontSize: '1.05rem' }} />} iconPosition="start" label="All users" />
          <Tab value="byOrganization" icon={<HubIcon sx={{ fontSize: '1.05rem' }} />} iconPosition="start" label="By organization" />
          <Tab value="byAccessLevel" icon={<AccountTreeIcon sx={{ fontSize: '1.05rem' }} />} iconPosition="start" label="By access level" />
          <Tab value="byRole" icon={<AdminPanelSettingsIcon sx={{ fontSize: '1.05rem' }} />} iconPosition="start" label="By role" />
          {isSuperAdmin && <Tab value="voided" icon={<BlockIcon sx={{ fontSize: '1.05rem' }} />} iconPosition="start" label="Voided users" />}
        </Tabs>

        {/* Search Bar and Action Buttons Row */}
        <Paper 
          elevation={1} 
          sx={{ 
            p: 1, 
            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            borderRadius: 1.5
          }}
        >
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} md={globalSearch ? 6 : 8}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search users by name, email, role, parent organization, department, agency, or org access…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ '& .MuiSvgIcon-root': { fontSize: '1.1rem' } }}>
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: globalSearch && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setGlobalSearch('')} edge="end">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: { '& input': { py: 0.75 } },
                }}
                sx={{
                  backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : 'white',
                  '& .MuiOutlinedInput-root': {
                    '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                  },
                }}
              />
            </Grid>
            {globalSearch && (
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: { xs: 'flex-start', md: 'center' } }}>
                  <Chip
                    label={`${(userListView === 'voided' ? filteredVoidedUsers.length : filteredUsers.length)} result${(userListView === 'voided' ? filteredVoidedUsers.length : filteredUsers.length) !== 1 ? 's' : ''} found`}
                    color="primary"
                    size="small"
                    icon={<SearchIcon sx={{ fontSize: '0.9rem !important' }} />}
                    sx={{ fontWeight: 600, height: 24, '& .MuiChip-label': { px: 1, fontSize: '0.75rem' } }}
                  />
                  {(userListView === 'voided' ? filteredVoidedUsers.length < voidedUsers.length : filteredUsers.length < users.length) && (
                    <Typography variant="caption" sx={{ color: colors.grey[300], fontWeight: 500, fontSize: '0.75rem' }}>
                      (of {userListView === 'voided' ? voidedUsers.length : users.length})
                    </Typography>
                  )}
                </Box>
              </Grid>
            )}
            <Grid item xs={12} md={globalSearch ? 3 : 4}>
              <Stack direction="row" spacing={0.75} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} flexWrap="wrap" useFlexGap>
                {hasPrivilege('user.create') && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PersonAddIcon sx={{ fontSize: '1rem' }} />}
                    onClick={handleOpenCreateUserDialog}
                    sx={{ 
                      backgroundColor: colors.greenAccent[600], 
                      '&:hover': { backgroundColor: colors.greenAccent[700] }, 
                      color: 'white', 
                      fontWeight: 600, 
                      borderRadius: '8px', 
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.8125rem'
                    }}
                  >
                    Add User
                  </Button>
                )}
                {isSuperAdmin && hasPrivilege('role.read_all') && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SettingsIcon sx={{ fontSize: '1rem' }} />}
                    onClick={handleOpenRoleManagementDialog}
                    sx={{ 
                      borderColor: colors.blueAccent[500], 
                      color: colors.blueAccent[500], 
                      '&:hover': { backgroundColor: colors.blueAccent[700], color: 'white', borderColor: colors.blueAccent[700] }, 
                      fontWeight: 600, 
                      borderRadius: '8px', 
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.8125rem'
                    }}
                  >
                    Roles
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ViewListIcon sx={{ fontSize: '1rem' }} />}
                    onClick={handleOpenUiProfileManagementDialog}
                    sx={{
                      borderColor: colors.blueAccent[500],
                      color: colors.blueAccent[500],
                      '&:hover': { backgroundColor: colors.blueAccent[700], color: 'white', borderColor: colors.blueAccent[700] },
                      fontWeight: 600,
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.8125rem'
                    }}
                  >
                    UI Profiles
                  </Button>
                )}
                {isSuperAdmin && hasPrivilege('privilege.read_all') && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LockIcon sx={{ fontSize: '1rem' }} />}
                    onClick={handleOpenPrivilegeManagementDialog}
                    sx={{ 
                      borderColor: colors.blueAccent[500], 
                      color: colors.blueAccent[500], 
                      '&:hover': { backgroundColor: colors.blueAccent[700], color: 'white', borderColor: colors.blueAccent[700] }, 
                      fontWeight: 600, 
                      borderRadius: '8px', 
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.8125rem'
                    }}
                  >
                    Privileges
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SecurityIcon sx={{ fontSize: '1rem' }} />}
                    onClick={handleOpenSessionSecurityDialog}
                    sx={{
                      borderColor: colors.blueAccent[500],
                      color: colors.blueAccent[500],
                      '&:hover': { backgroundColor: colors.blueAccent[700], color: 'white', borderColor: colors.blueAccent[700] },
                      fontWeight: 600,
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.8125rem'
                    }}
                  >
                    Session Security
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SyncAltIcon sx={{ fontSize: '1rem' }} />}
                    onClick={handleOpenOrgIntegrityDialog}
                    sx={{
                      borderColor: colors.yellowAccent[600],
                      color: colors.yellowAccent[600],
                      '&:hover': {
                        backgroundColor: colors.yellowAccent[700],
                        color: 'white',
                        borderColor: colors.yellowAccent[700],
                      },
                      fontWeight: 600,
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.8125rem',
                    }}
                  >
                    Org data reconcile
                  </Button>
                )}
                {isSuperAdmin && userListView !== 'voided' && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={exportingExcel ? <CircularProgress size={14} color="inherit" /> : <ExcelIcon sx={{ fontSize: '1rem' }} />}
                    disabled={exportingExcel}
                    onClick={handleExportUsersToExcel}
                    sx={{
                      borderColor: colors.blueAccent[500],
                      color: colors.blueAccent[500],
                      '&:hover': { backgroundColor: colors.blueAccent[700], color: 'white', borderColor: colors.blueAccent[700] },
                      fontWeight: 600,
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.8125rem',
                    }}
                  >
                    {exportingExcel ? 'Exporting…' : 'Export Excel'}
                  </Button>
                )}
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {userListView === 'voided' ? (
        !isSuperAdmin ? (
          <Alert severity="warning">Only Super Admin can view voided users.</Alert>
        ) : filteredVoidedUsers.length === 0 ? (
          <Alert severity="info">{globalSearch ? `No voided users found matching "${globalSearch}".` : 'No voided users found.'}</Alert>
        ) : (
          <Box
            mt={1.5}
            sx={{
              height: 'calc(100vh - 220px)',
              minHeight: 320,
              overflow: 'hidden',
            }}
          >
            <DataGrid
              rows={filteredVoidedUsers}
              columns={voidedUserColumns}
              getRowId={(row) => row.userId}
              disableRowSelectionOnClick
              density="compact"
              sx={{
                border: 0,
                '& .MuiDataGrid-columnHeaders': { backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : colors.grey[100] },
              }}
            />
          </Box>
        )
      ) : users.length === 0 && hasPrivilege('user.read_all') ? (
        <Alert severity="info">No users found. Add a new user to get started.</Alert>
      ) : filteredUsers.length === 0 && globalSearch ? (
        <Alert severity="info">
          No users found matching "{globalSearch}". Try a different search term.
        </Alert>
      ) : userListView === 'byOrganization' || userListView === 'byRole' || userListView === 'byAccessLevel' ? (
        <Box
          mt={1.5}
          sx={{
            height: 'calc(100vh - 220px)',
            minHeight: 320,
            overflow: 'auto',
            pr: 0.5,
          }}
        >
          <Typography variant="caption" sx={{ color: colors.grey[400], display: 'block', mb: 1 }}>
            {userListView === 'byRole'
              ? 'Expand a role to see users assigned to it. Search above still filters this list.'
              : userListView === 'byAccessLevel'
              ? 'Users are grouped by effective access scope, including invalid parent/department mappings and legacy agency-derived mappings. Search above still filters this list.'
              : 'Grouped by parent organization and department (legacy agency is not used as a section). Expand a section to see users. Search above still filters this list.'}
          </Typography>
          {(userListView === 'byRole' ? usersByRole : userListView === 'byAccessLevel' ? usersByAccessLevel : usersByOrganization).map((g, index) => (
            <Accordion
              key={g.key}
              defaultExpanded={index === 0}
              disableGutters
              sx={{
                mb: 1,
                backgroundColor: colors.primary[400],
                borderRadius: '8px !important',
                overflow: 'hidden',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: colors.grey[200] }} />}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: '100%', pr: 1 }}>
                  {userListView === 'byRole' ? (
                    <AdminPanelSettingsIcon sx={{ color: colors.greenAccent[400], flexShrink: 0 }} />
                  ) : userListView === 'byAccessLevel' ? (
                    <AccountTreeIcon sx={{ color: colors.greenAccent[400], flexShrink: 0 }} />
                  ) : (
                    <AccountTreeIcon sx={{ color: colors.greenAccent[400], flexShrink: 0 }} />
                  )}
                  <Typography sx={{ flex: 1, fontWeight: 600, color: colors.grey[100], fontSize: '0.95rem' }}>
                    {g.label}
                  </Typography>
                  <Chip
                    label={`${g.users.length} user${g.users.length !== 1 ? 's' : ''}`}
                    size="small"
                    sx={{ backgroundColor: colors.blueAccent[700], color: colors.grey[100], fontWeight: 700 }}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails
                sx={{
                  backgroundColor: 'transparent',
                  pt: 0.75,
                  px: 1.25,
                  pb: 1.25,
                }}
              >
                <Stack spacing={0.75}>
                  {userListView === 'byAccessLevel' && g.description && (
                    <Typography variant="caption" sx={{ color: colors.grey[300], px: 0.5 }}>
                      {g.description}
                    </Typography>
                  )}
                  {g.users.map((row) => {
                    const fullName = `${row.firstName || ''} ${row.lastName || ''}`.trim() || '—';
                    const isCurrentUser = row.userId === user.id;
                    const canToggle =
                      hasPrivilege('user.update') &&
                      row.userId !== user.id &&
                      canMdaIctAdminMutateUser(user, row);
                    return (
                      <Paper
                        key={row.userId}
                        elevation={0}
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 1,
                          py: 1,
                          px: 1.5,
                          backgroundColor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 1,
                          boxShadow: 'none',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            borderColor: colors.blueAccent[600],
                            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                          },
                        }}
                      >
                        <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600, color: colors.greenAccent[300], fontSize: '0.85rem' }} noWrap>
                            {row.username}
                          </Typography>
                          <Typography variant="caption" sx={{ color: colors.grey[400], display: 'block' }} noWrap>
                            {fullName}
                          </Typography>
                        </Box>
                        <Typography sx={{ flex: '1 1 160px', color: colors.grey[200], fontSize: '0.8rem', minWidth: 0 }} noWrap>
                          {row.email}
                        </Typography>
                        <Box sx={{ flex: '1 1 180px', minWidth: 0, maxWidth: 220 }}>
                          <UserRoleBadge role={row.role} size="compact" />
                        </Box>
                        <UserStatusBadge
                          isActive={!!row.isActive}
                          canToggle={canToggle}
                          onToggle={() => handleToggleUserStatus(row)}
                          size="compact"
                          title={
                            canToggle
                              ? `Click to ${row.isActive ? 'disable' : 'enable'}`
                              : !hasPrivilege('user.update') || isCurrentUser
                                ? row.isActive
                                  ? 'Active'
                                  : 'Disabled'
                                : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
                          }
                        />
                        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0, ml: { xs: 0, sm: 'auto' } }}>
                          <UserRowActionsCell
                            row={row}
                            currentUser={user}
                            isSuperAdmin={isSuperAdmin}
                            canUpdate={hasPrivilege('user.update')}
                            canDelete={hasPrivilege('user.delete')}
                            onView={handleOpenViewDetails}
                            onProjectAccess={handleOpenStandaloneOrgDialog}
                            onResetPassword={handleOpenResetPasswordDialog}
                            onDelete={handleOpenDeleteConfirmDialog}
                            onResendCredentials={handleOpenResendCredentialsDialog}
                          />
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ) : (
        <Box
          mt={1.5}
          sx={{
            height: 'calc(100vh - 200px)',
            minHeight: 320,
            "& .MuiDataGrid-root": {
              border: "none",
              borderRadius: '8px',
              overflow: 'hidden',
            },
            "& .MuiDataGrid-cell": {
              borderBottom: `1px solid ${colors.grey[700]}`,
              padding: '6px 12px',
              '&:focus': { outline: 'none' },
              '&:focus-within': { outline: 'none' },
            },
            "& .MuiDataGrid-row": {
              minHeight: '48px !important',
              maxHeight: '48px !important',
              transition: 'background-color 0.2s ease',
              '&:hover': {
                backgroundColor: `${colors.blueAccent[700]} !important`,
                cursor: 'pointer',
                '& .MuiDataGrid-cell': {
                  color: `${colors.grey[100]} !important`,
                  borderBottomColor: `${colors.blueAccent[600]} !important`,
                },
              },
              '&.Mui-selected': {
                backgroundColor: `${colors.blueAccent[600]} !important`,
                '&:hover': { backgroundColor: `${colors.blueAccent[500]} !important` },
              },
            },
            "& .username-column--cell": {
              color: colors.greenAccent[300],
              fontWeight: 600,
            },
            "& .role-column-cell": {
              overflow: 'hidden',
              alignItems: 'center',
              '& .MuiDataGrid-cellContent': {
                width: '100%',
                overflow: 'hidden',
              },
            },
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: `${colors.blueAccent[700]} !important`,
              borderBottom: `2px solid ${colors.blueAccent[600]}`,
              minHeight: '40px !important',
              maxHeight: '40px !important',
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 700,
                fontSize: '0.85rem',
              },
            },
            "& .MuiDataGrid-columnHeader": {
              padding: '6px 12px',
              '&:focus': { outline: 'none' },
              '&:focus-within': { outline: 'none' },
            },
            "& .MuiDataGrid-virtualScroller": {
              backgroundColor: colors.primary[400],
            },
            "& .MuiDataGrid-footerContainer": {
              borderTop: `2px solid ${colors.blueAccent[600]}`,
              backgroundColor: `${colors.blueAccent[700]} !important`,
              padding: '8px 16px',
              minHeight: 48,
              '& .MuiTablePagination-root': {
                color: `${colors.grey[100]} !important`,
                width: '100%',
                margin: 0,
                padding: 0,
              },
              '& .MuiTablePagination-toolbar': {
                padding: 0,
                minHeight: 'auto',
                flexWrap: 'wrap',
                gap: '6px',
              },
              '& .MuiTablePagination-selectLabel': {
                color: `${colors.grey[100]} !important`,
                fontWeight: 600,
                fontSize: '0.8rem',
                margin: 0,
                marginRight: '6px',
              },
              '& .MuiTablePagination-displayedRows': {
                color: `${colors.grey[100]} !important`,
                fontWeight: 600,
                fontSize: '0.8rem',
                margin: 0,
                marginLeft: '10px',
              },
              '& .MuiTablePagination-select': {
                color: `${colors.grey[100]} !important`,
                fontWeight: 600,
                fontSize: '0.8rem',
                marginRight: '16px',
                paddingRight: '20px',
              },
              '& .MuiTablePagination-spacer': { flex: '1 1 auto' },
              '& .MuiTablePagination-actions': {
                marginLeft: '8px',
                '& .MuiIconButton-root': {
                  color: `${colors.grey[100]} !important`,
                  padding: '4px',
                  '&:hover': { backgroundColor: `${colors.blueAccent[600]} !important` },
                  '&.Mui-disabled': { color: `${colors.grey[600]} !important` },
                },
              },
            },
            "& .MuiDataGrid-toolbarContainer": {
              padding: '8px 12px',
              backgroundColor: colors.primary[400],
              borderRadius: 0,
            },
            "& .MuiDataGrid-toolbar": { borderRadius: 0 },
            "& .MuiDataGrid-footerContainer .MuiToolbar-root": { borderRadius: 0 },
            "& .MuiCheckbox-root": {
              color: `${colors.greenAccent[200]} !important`,
              '&.Mui-checked': { color: `${colors.greenAccent[300]} !important` },
            },
            "& .MuiDataGrid-cellContent": {
              fontSize: '0.85rem',
            },
          }}
        >
          <DataGrid
            rows={filteredUsers}
            columns={userColumns}
            getRowId={(row) => row.userId}
            rowHeight={48}
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
            }}
            disableRowSelectionOnClick
            sx={{
              '& .MuiDataGrid-cell': { color: colors.grey[100] },
            }}
          />
        </Box>
      )}

      {/* View User Details Dialog */}
      <Dialog open={openViewDetailsDialog} onClose={handleCloseViewDetails} fullWidth maxWidth="sm" PaperProps={{ sx: { minHeight: '72vh' } }}>
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white', fontWeight: 700, fontSize: '1.1rem', py: 1.25 }}>
          User details
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[400] : '#f9fafb',
            pt: 1.5,
            pb: 1.5,
            flex: 1,
            minHeight: 0,
          }}
        >
          {viewDetailsUser && (() => {
            const u = viewDetailsUser;
            const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || '—';
            const initials = fullName !== '—' ? fullName.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase() : '?';
            const roleBg = resolveRoleBadgeColor(u.role, colors);
            const DetailRow = ({ label, value, emptyChar = '—' }) => (
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" sx={{ color: colors.grey[400], display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '0.7rem' }}>
                  {label}
                </Typography>
                <Typography sx={{ color: value && value !== emptyChar ? colors.grey[100] : colors.grey[500], fontSize: '0.85rem', lineHeight: 1.3 }}>
                  {value || emptyChar}
                </Typography>
              </Grid>
            );
            return (
              <Box>
                {/* Header: avatar + name + status & role chips */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, pb: 1.5, borderBottom: `1px solid ${colors.grey[700]}` }}>
                  <Avatar
                    sx={{
                      width: 44,
                      height: 44,
                      bgcolor: colors.blueAccent[600],
                      fontSize: '1rem',
                      fontWeight: 700,
                    }}
                  >
                    {initials}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: colors.grey[100], mb: 0.25 }}>
                      {fullName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.grey[400], fontSize: '0.8rem', mb: 0.5 }}>
                      @{u.username}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap">
                      <Chip
                        size="small"
                        label={u.isActive ? 'Active' : 'Disabled'}
                        sx={{
                          height: 22,
                          backgroundColor: u.isActive ? colors.greenAccent[700] : colors.redAccent[700],
                          color: brand.onPrimary,
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          '& .MuiChip-label': { px: 1, color: brand.onPrimary },
                        }}
                      />
                      {u.role && (
                        <Chip
                          size="small"
                          label={u.role}
                          sx={{
                            height: 22,
                            maxWidth: '100%',
                            backgroundColor: roleBg,
                            color: brand.onPrimary,
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            '& .MuiChip-label': {
                              px: 1,
                              color: brand.onPrimary,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            },
                          }}
                        />
                      )}
                    </Stack>
                  </Box>
                </Box>

                {/* Account */}
                <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
                  Account
                </Typography>
                <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
                  <DetailRow label="User ID" value={u.userId?.toString()} />
                  <DetailRow label="Username" value={u.username} />
                  <DetailRow label="Email" value={u.email} />
                  <DetailRow label="Phone" value={u.phoneNumber || u.phone} />
                  <DetailRow label="UI Profile" value={u.uiProfile?.name} />
                  <DetailRow
                    label="OTP at login"
                    value={
                      u.otpEnabled === true || u.otpEnabled === 1 || u.otp_enabled
                        ? `On — ${formatOtpChannelLabel(u.otpChannel || u.otp_channel)}`
                        : 'Off — password only'
                    }
                  />
                </Grid>

                {/* Personal */}
                <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
                  Personal
                </Typography>
                <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
                  <DetailRow label="First Name" value={u.firstName} />
                  <DetailRow label="Last Name" value={u.lastName} />
                  <DetailRow label="ID Number" value={u.idNumber} />
                  <DetailRow label="Employee No." value={u.employeeNumber} />
                </Grid>

                {/* Organization */}
                <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
                  Organization
                </Typography>
                <Grid container spacing={1.5}>
                  <DetailRow label="Role" value={u.role} />
                  <DetailRow label="Parent organization" value={u.ministry} />
                  <DetailRow label="Department" value={u.stateDepartment || u.state_department} />
                  <DetailRow label="Directorate" value={u.directorate} />
                  {(u.agencyName || u.agency_name || u.agencyId || u.agency_id) ? (
                    <DetailRow
                      label="Legacy agency"
                      value={u.agencyName || u.agency_name || (u.agencyId != null ? `#${u.agencyId}` : u.agency_id != null ? `#${u.agency_id}` : '')}
                    />
                  ) : null}
                </Grid>
                {Array.isArray(u.projectScopes) && u.projectScopes.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
                      Project access
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                      {u.projectScopes.map((s, idx) => (
                        <Chip
                          key={`vd-ps-${idx}-${s.scopeType || s.scope_type}-${s.scopeValue || s.scope_value || ''}`}
                          label={projectScopeRowLabel(s)}
                          size="small"
                          color="info"
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
                {Array.isArray(u.organizationScopes) && u.organizationScopes.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ color: colors.grey[400], fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
                      Legacy organization access
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                      {u.organizationScopes.map((s, idx) => (
                        <Chip key={`vd-${idx}-${s.scopeType}-${s.agencyId || s.ministry || ''}`} label={scopeRowLabel(s)} size="small" sx={{ fontWeight: 600 }} />
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : '#f0f0f0', px: 1.5, py: 0.75, minHeight: 0 }}>
          {viewDetailsUser && hasPrivilege('user.update') && (
            <Button
              size="small"
              variant="contained"
              startIcon={<EditIcon sx={{ fontSize: '1rem' }} />}
              disabled={!canMdaIctAdminMutateUser(user, viewDetailsUser)}
              title={
                canMdaIctAdminMutateUser(user, viewDetailsUser)
                  ? ''
                  : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
              }
              onClick={() => {
                if (!canMdaIctAdminMutateUser(user, viewDetailsUser)) return;
                handleCloseViewDetails();
                handleOpenEditUserDialog(viewDetailsUser);
              }}
              sx={{ backgroundColor: colors.blueAccent[600], '&:hover': { backgroundColor: colors.blueAccent[500] }, py: 0.5 }}
            >
              Edit user
            </Button>
          )}
          <Button size="small" variant="outlined" onClick={handleCloseViewDetails} sx={{ py: 0.5 }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit User Dialog */}
      <Dialog open={openUserDialog} onClose={handleCloseUserDialog} fullWidth maxWidth="md" scroll="paper">
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white', fontWeight: 700, fontSize: '1.25rem' }}>
          {currentUserToEdit ? 'Edit User' : 'Add New User'}
        </DialogTitle>
        <DialogContent
          ref={userDialogContentRef}
          dividers 
          sx={{ 
            maxHeight: { xs: '80vh', sm: '85vh' },
            overflowY: 'auto',
            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[400] : '#f9fafb',
            '& .MuiFormLabel-root': {
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#374151',
              fontWeight: 600,
              fontSize: '0.9rem',
            },
            '& .MuiInputBase-input': {
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#111827',
              fontSize: '0.95rem',
              fontWeight: 500,
            },
            '& .MuiFormHelperText-root': {
              color: theme.palette.mode === 'dark' ? colors.grey[200] : '#6b7280',
              fontSize: '0.8rem',
              fontWeight: 400,
            },
          }}
        >
          {userFormSubmitAttempted && Object.keys(userFormErrors).length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <strong>Could not save user.</strong>{' '}
              {getPrimaryUserFormError(userFormErrors)}
            </Alert>
          )}
          <Alert severity="info" icon={<AccountTreeIcon />} sx={{ mb: 2 }}>
            <strong>Project access</strong> controls which projects and data this user can see after sign-in.
            Use county-wide, sector, department, sub-county, ward, or other scopes below. Role and UI profile still control menus and privileges.
          </Alert>
          <TextField 
            autoFocus 
            margin="dense" 
            name="username" 
            label="Username" 
            type="text" 
            fullWidth 
            variant="outlined" 
            defaultValue={userFormData.username}
            inputRef={(node) => setUserFormInputRef('username', node)}
            onChange={() => handleUserTextInputChange('username')}
            onBlur={() => handleUserTextInputBlur('username')}
            error={!!userFormErrors.username} 
            helperText={userFormErrors.username || (currentUserToEdit && isCheckingUsername ? 'Checking username availability...' : '')} 
            disabled={!!currentUserToEdit && !isSuperAdmin} 
            sx={{ 
              mb: 2, 
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }} 
          />
          <TextField 
            margin="dense" 
            name="email" 
            label="Email" 
            type="email" 
            fullWidth 
            variant="outlined" 
            defaultValue={userFormData.email}
            inputRef={(node) => setUserFormInputRef('email', node)}
            onChange={() => handleUserTextInputChange('email')}
            onBlur={() => handleUserTextInputBlur('email')}
            error={!!userFormErrors.email} 
            helperText={userFormErrors.email} 
            disabled={!!currentUserToEdit} 
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }} 
          />
          <TextField 
            margin="dense" 
            name="phoneNumber" 
            label="Phone Number" 
            type="tel" 
            fullWidth 
            variant="outlined" 
            defaultValue={userFormData.phoneNumber}
            inputRef={(node) => setUserFormInputRef('phoneNumber', node)}
            onChange={() => handleUserTextInputChange('phoneNumber')}
            onBlur={() => handleUserTextInputBlur('phoneNumber')}
            error={!!userFormErrors.phoneNumber} 
            helperText={userFormErrors.phoneNumber || 'Optional: 07XXXXXXXX or +2547XXXXXXXX'} 
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }} 
          />
          <FormControlLabel
            sx={{ mb: userFormData.otpEnabled ? 1 : 2, alignItems: 'flex-start', ml: 0 }}
            control={
              <Checkbox
                checked={!!userFormData.otpEnabled}
                onChange={(e) => setUserFormData((prev) => ({ ...prev, otpEnabled: e.target.checked }))}
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Require verification code (OTP) to sign in
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  After password, a 6-digit code is sent by email and/or SMS depending on the delivery option below.
                </Typography>
              </Box>
            }
          />
          {userFormData.otpEnabled && (
            <Box sx={{ mb: 2, pl: 0.5 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                Send OTP via
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={otpDeliveryFromChannel(userFormData.otpChannel).email}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUserFormData((prev) => {
                          const flags = otpDeliveryFromChannel(prev.otpChannel);
                          const next = { email: checked, sms: flags.sms };
                          if (!next.email && !next.sms) return prev;
                          return { ...prev, otpChannel: otpChannelFromDelivery(next) };
                        });
                      }}
                      color="primary"
                    />
                  }
                  label="Email"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={otpDeliveryFromChannel(userFormData.otpChannel).sms}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUserFormData((prev) => {
                          const flags = otpDeliveryFromChannel(prev.otpChannel);
                          const next = { email: flags.email, sms: checked };
                          if (!next.email && !next.sms) return prev;
                          return { ...prev, otpChannel: otpChannelFromDelivery(next) };
                        });
                      }}
                      color="primary"
                    />
                  }
                  label="SMS"
                />
              </Stack>
              <Typography variant="caption" color={userFormErrors.otpChannel ? 'error' : 'text.secondary'} display="block" sx={{ mt: 0.25 }}>
                {userFormErrors.otpChannel ||
                  'Choose email, SMS, or both. SMS requires a valid phone number above.'}
              </Typography>
            </Box>
          )}
          <TextField 
            margin="dense" 
            name="firstName" 
            label="First Name" 
            type="text" 
            fullWidth 
            variant="outlined" 
            defaultValue={userFormData.firstName}
            inputRef={(node) => setUserFormInputRef('firstName', node)}
            onChange={() => handleUserTextInputChange('firstName')}
            onBlur={() => handleUserTextInputBlur('firstName')}
            error={!!userFormErrors.firstName} 
            helperText={userFormErrors.firstName} 
            disabled={!!currentUserToEdit} 
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }} 
          />
          <TextField 
            margin="dense" 
            name="lastName" 
            label="Last Name" 
            type="text" 
            fullWidth 
            variant="outlined" 
            defaultValue={userFormData.lastName}
            inputRef={(node) => setUserFormInputRef('lastName', node)}
            onChange={() => handleUserTextInputChange('lastName')}
            onBlur={() => handleUserTextInputBlur('lastName')}
            error={!!userFormErrors.lastName} 
            helperText={userFormErrors.lastName} 
            disabled={!!currentUserToEdit} 
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }} 
          />
          <TextField 
            margin="dense" 
            name="idNumber" 
            label="ID Number" 
            type="text" 
            fullWidth 
            variant="outlined" 
            defaultValue={userFormData.idNumber}
            inputRef={(node) => setUserFormInputRef('idNumber', node)}
            onChange={() => handleUserTextInputChange('idNumber')}
            onBlur={() => handleUserTextInputBlur('idNumber')}
            error={!!userFormErrors.idNumber} 
            helperText={userFormErrors.idNumber || 'National ID number'} 
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }} 
          />
          <TextField 
            margin="dense" 
            name="employeeNumber" 
            label="Employee Number" 
            type="text" 
            fullWidth 
            variant="outlined" 
            defaultValue={userFormData.employeeNumber}
            inputRef={(node) => setUserFormInputRef('employeeNumber', node)}
            onChange={() => handleUserTextInputChange('employeeNumber')}
            onBlur={() => handleUserTextInputBlur('employeeNumber')}
            error={!!userFormErrors.employeeNumber} 
            helperText={userFormErrors.employeeNumber || 'Employee number'} 
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }} 
          />
          {!currentUserToEdit ? (
            <>
              <TextField 
                margin="dense" 
                name="password" 
                label="Password" 
                type={showUserFormPasswords.password ? 'text' : 'password'} 
                fullWidth 
                variant="outlined" 
                defaultValue={userFormData.password}
                inputRef={(node) => setUserFormInputRef('password', node)}
                onChange={() => handleUserTextInputChange('password')}
                onBlur={() => handleUserTextInputBlur('password')}
                error={!!userFormErrors.password} 
                helperText={userFormErrors.password} 
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton edge="end" onClick={() => toggleUserFormPasswordVisibility('password')}>
                        {showUserFormPasswords.password ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ 
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#ffffff',
                    borderRadius: 1.5,
                  },
                }} 
              />
              <TextField 
                margin="dense" 
                name="confirmPassword" 
                label="Confirm Password" 
                type={showUserFormPasswords.confirmPassword ? 'text' : 'password'} 
                fullWidth 
                variant="outlined" 
                defaultValue={userFormData.confirmPassword}
                inputRef={(node) => setUserFormInputRef('confirmPassword', node)}
                onChange={() => handleUserTextInputChange('confirmPassword')}
                onBlur={() => handleUserTextInputBlur('confirmPassword')}
                error={!!userFormErrors.confirmPassword} 
                helperText={userFormErrors.confirmPassword} 
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton edge="end" onClick={() => toggleUserFormPasswordVisibility('confirmPassword')}>
                        {showUserFormPasswords.confirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ 
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#ffffff',
                    borderRadius: 1.5,
                  },
                }} 
              />
            </>
          ) : (
            <>
              <TextField 
                margin="dense" 
                name="password" 
                label="New Password (leave blank to keep current)" 
                type={showUserFormPasswords.password ? 'text' : 'password'} 
                fullWidth 
                variant="outlined" 
                value={userFormData.password} 
                onChange={handleUserFormChange} 
                error={!!userFormErrors.password} 
                helperText={userFormErrors.password} 
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton edge="end" onClick={() => toggleUserFormPasswordVisibility('password')}>
                        {showUserFormPasswords.password ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ 
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#ffffff',
                    borderRadius: 1.5,
                  },
                }} 
              />
              {userFormData.password && (
                <TextField 
                  margin="dense" 
                  name="confirmPassword" 
                  label="Confirm New Password" 
                  type={showUserFormPasswords.confirmPassword ? 'text' : 'password'} 
                  fullWidth 
                  variant="outlined" 
                  value={userFormData.confirmPassword} 
                  onChange={handleUserFormChange} 
                  error={!!userFormErrors.confirmPassword} 
                  helperText={userFormErrors.confirmPassword} 
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton edge="end" onClick={() => toggleUserFormPasswordVisibility('confirmPassword')}>
                          {showUserFormPasswords.confirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: '#ffffff',
                      borderRadius: 1.5,
                    },
                  }} 
                />
              )}
            </>
          )}
          {isSuperAdmin && countyPositions.length > 0 && (
            <FormControl
              fullWidth
              margin="dense"
              variant="outlined"
              sx={{
                mb: 2,
                minWidth: 120,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#ffffff',
                  borderRadius: 1.5,
                },
              }}
            >
              <InputLabel sx={{ fontWeight: 600, color: colors.grey[100] }}>County position (optional)</InputLabel>
              <Select
                label="County position (optional)"
                value={selectedCountyPositionId}
                onChange={(e) => handleCountyPositionSelect(e.target.value)}
              >
                <MenuItem value="">
                  <em>— Select to auto-fill role, UI profile and scope —</em>
                </MenuItem>
                {countyPositions.map((position) => (
                  <MenuItem key={position.id} value={String(position.id)}>
                    {position.responsibility} — {position.area} ({position.permissionPattern})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <FormControl
            fullWidth
            margin="dense"
            variant="outlined"
            data-user-form-field="role"
            error={!!userFormErrors.role}
            sx={{ 
              mb: 2, 
              minWidth: 120,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#ffffff',
                borderRadius: 1.5,
              },
            }}
          >
            <InputLabel sx={{ fontWeight: 600, color: colors.grey[100] }}>Role</InputLabel>
            <Select
              name="role"
              label="Role"
              value={userFormData.role}
              onChange={handleUserFormChange}
            >
              {assignableRoles.map(role => (
                <MenuItem key={role.roleId} value={role.roleName}>{role.roleName}</MenuItem>
              ))}
            </Select>
            {userFormErrors.role && (
              <Typography variant="caption" sx={{ color: 'error.main', mt: 0.5, ml: 1.75, display: 'block' }}>
                {userFormErrors.role}
              </Typography>
            )}
          </FormControl>
          {isSuperAdmin && (
            <FormControl
              fullWidth
              margin="dense"
              variant="outlined"
              sx={{
                mb: 2,
                minWidth: 120,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#ffffff',
                  borderRadius: 1.5,
                },
              }}
            >
              <InputLabel sx={{ fontWeight: 600, color: colors.grey[100] }}>UI Profile</InputLabel>
              <Select
                name="uiProfileId"
                label="UI Profile"
                value={userFormData.uiProfileId || ''}
                onChange={handleUserFormChange}
              >
                <MenuItem value="">
                  Use default navigation
                </MenuItem>
                {uiProfiles.map((profile) => (
                  <MenuItem key={profile.id} value={profile.id}>
                    {profile.name}{profile.isDefault ? ' (Default)' : ''}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" sx={{ color: colors.grey[300], mt: 0.5, display: 'block' }}>
                Controls visible menus and supported tabs. Role privileges still control actual authorization.
              </Typography>
            </FormControl>
          )}
          <Typography
            ref={projectAccessSectionRef}
            variant="subtitle2"
            sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 1, mt: 1 }}
          >
            Project access
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: colors.grey[300], mb: 1.5 }}>
            Required. Choose all departments for county-wide visibility, or narrow by sector, department, sub-county, ward, sublocation, village, or municipality.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }} alignItems={{ md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180, bgcolor: '#fff', borderRadius: 1 }}>
              <InputLabel>Project scope</InputLabel>
              <Select
                label="Project scope"
                value={newProjectScopeType}
                onChange={(e) => {
                  setNewProjectScopeType(e.target.value);
                  setNewProjectScopeValues([]);
                }}
              >
                <MenuItem value="ALL_DEPARTMENTS">All departments (county-wide)</MenuItem>
                <MenuItem value="SECTOR">Sector</MenuItem>
                <MenuItem value="DEPARTMENT">Department</MenuItem>
                <MenuItem value="SUBCOUNTY">Sub-county</MenuItem>
                <MenuItem value="WARD">Ward</MenuItem>
                <MenuItem value="SUBLOCATION">Sublocation</MenuItem>
                <MenuItem value="VILLAGE">Village</MenuItem>
                <MenuItem value="MUNICIPALITY">Municipality</MenuItem>
              </Select>
            </FormControl>
            <Autocomplete
              multiple
              freeSolo
              disabled={newProjectScopeType === 'ALL_DEPARTMENTS'}
              sx={{ flex: 1, minWidth: 260, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
              options={projectScopeValueOptions}
              value={newProjectScopeValues}
              onChange={(_, v) => setNewProjectScopeValues(Array.isArray(v) ? v : [])}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={
                    newProjectScopeType === 'ALL_DEPARTMENTS'
                      ? 'County-wide project access'
                      : newProjectScopeType === 'SECTOR'
                      ? 'Sectors'
                      : newProjectScopeType === 'DEPARTMENT'
                        ? 'Departments'
                        : newProjectScopeType === 'SUBCOUNTY'
                          ? 'Sub-counties'
                          : newProjectScopeType === 'WARD'
                            ? 'Wards'
                            : newProjectScopeType === 'SUBLOCATION'
                              ? 'Sublocations'
                              : 'Villages'
                  }
                  margin="dense"
                  size="small"
                />
              )}
            />
            <Button variant="outlined" size="small" onClick={handleAddProjectScopes} sx={{ height: 40 }}>
              Add project scope
            </Button>
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
            {projectScopes.map((s, idx) => (
              <Chip
                key={`ps-${idx}-${s.scopeType || s.scope_type}-${s.scopeValue || s.scope_value || ''}`}
                label={projectScopeRowLabel(s)}
                onDelete={() => handleRemoveProjectScope(idx)}
                size="small"
                color="info"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            ))}
            {projectScopes.length === 0 && (
              <Typography variant="caption" sx={{ color: colors.grey[500], fontStyle: 'italic' }}>
                No project access rules added.
              </Typography>
            )}
          </Box>
          {userFormErrors.projectScopes && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {userFormErrors.projectScopes}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button onClick={handleCloseUserDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleUserSubmit} color="primary" variant="contained">{currentUserToEdit ? 'Update User' : 'Create User'}</Button>
        </DialogActions>
      </Dialog>

          {/* Access scopes only (no full user form) */}
      <Dialog
        open={openStandaloneOrgDialog}
        onClose={handleCloseStandaloneOrgDialog}
        fullWidth
        maxWidth="md"
        scroll="paper"
      >
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountTreeIcon />
          Project access
          {standaloneOrgUsername ? (
            <Typography component="span" variant="subtitle1" sx={{ fontWeight: 600, ml: 0.5, opacity: 0.95 }}>
              — {standaloneOrgUsername}
            </Typography>
          ) : null}
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            maxHeight: '85vh',
            overflowY: 'auto',
            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[400] : '#f9fafb',
            pt: 2,
          }}
        >
          <Typography variant="body2" sx={{ mb: 2, color: colors.grey[200] }}>
            Configure which projects and data this user can access. County-wide users need an <strong>All departments</strong> project scope; ward monitors need a <strong>Ward</strong> scope, and so on.
          </Typography>
          <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 1 }}>
            Project access
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: colors.grey[300], mb: 1.5 }}>
            Required. All departments gives county-wide project visibility; other rules narrow by sector, department, sub-county, ward, sublocation, village, or municipality.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }} alignItems={{ md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180, bgcolor: '#fff', borderRadius: 1 }}>
              <InputLabel>Project scope</InputLabel>
              <Select
                label="Project scope"
                value={standaloneProjectScopeType}
                onChange={(e) => {
                  setStandaloneProjectScopeType(e.target.value);
                  setStandaloneProjectScopeValues([]);
                }}
              >
                <MenuItem value="ALL_DEPARTMENTS">All departments (county-wide)</MenuItem>
                <MenuItem value="SECTOR">Sector</MenuItem>
                <MenuItem value="DEPARTMENT">Department</MenuItem>
                <MenuItem value="SUBCOUNTY">Sub-county</MenuItem>
                <MenuItem value="WARD">Ward</MenuItem>
                <MenuItem value="SUBLOCATION">Sublocation</MenuItem>
                <MenuItem value="VILLAGE">Village</MenuItem>
                <MenuItem value="MUNICIPALITY">Municipality</MenuItem>
              </Select>
            </FormControl>
            <Autocomplete
              multiple
              freeSolo
              disabled={standaloneProjectScopeType === 'ALL_DEPARTMENTS'}
              sx={{ flex: 1, minWidth: 260, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
              options={standaloneProjectScopeValueOptions}
              value={standaloneProjectScopeValues}
              onChange={(_, v) => setStandaloneProjectScopeValues(Array.isArray(v) ? v : [])}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={
                    standaloneProjectScopeType === 'ALL_DEPARTMENTS'
                      ? 'County-wide project access'
                      : standaloneProjectScopeType === 'SECTOR'
                      ? 'Sectors'
                      : standaloneProjectScopeType === 'DEPARTMENT'
                        ? 'Departments'
                    : standaloneProjectScopeType === 'SUBCOUNTY'
                          ? 'Sub-counties'
                          : standaloneProjectScopeType === 'WARD'
                            ? 'Wards'
                            : standaloneProjectScopeType === 'SUBLOCATION'
                              ? 'Sublocations'
                              : 'Villages'
                  }
                  margin="dense"
                  size="small"
                />
              )}
            />
            <Button variant="outlined" size="small" onClick={handleAddStandaloneProjectScopes} sx={{ height: 40 }}>
              Add project scope
            </Button>
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
            {standaloneProjectScopes.map((s, idx) => (
              <Chip
                key={`st-ps-${idx}-${s.scopeType || s.scope_type}-${s.scopeValue || s.scope_value || ''}`}
                label={projectScopeRowLabel(s)}
                onDelete={() => handleRemoveStandaloneProjectScope(idx)}
                size="small"
                color="info"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            ))}
            {standaloneProjectScopes.length === 0 && (
              <Typography variant="caption" sx={{ color: colors.grey[500], fontStyle: 'italic' }}>
                No project access rules configured.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, backgroundColor: colors.primary[400] }}>
          <Button onClick={handleCloseStandaloneOrgDialog} color="inherit" disabled={standaloneSaving}>
            Cancel
          </Button>
          <Button onClick={handleSaveStandaloneOrgScopes} color="primary" variant="contained" disabled={standaloneSaving || !standaloneOrgUserId}>
            {standaloneSaving ? 'Saving…' : 'Save project access'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={openDeleteConfirmDialog} 
        onClose={handleCloseDeleteConfirmDialog} 
        aria-labelledby="delete-dialog-title" 
        aria-describedby="delete-dialog-description"
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            boxShadow: theme.palette.mode === 'dark' 
              ? '0 8px 32px rgba(0,0,0,0.4)' 
              : '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle 
          id="delete-dialog-title"
          sx={{ 
            backgroundColor: colors.redAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 3
          }}
        >
          <Avatar sx={{ bgcolor: colors.redAccent[700] }}>
            <DeleteIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Confirm User Deletion
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              This action cannot be undone
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <DialogContentText 
            id="delete-dialog-description"
            sx={{ 
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1a1a1a',
              fontSize: '1.2rem',
              lineHeight: 1.7,
              fontWeight: 600
            }}
          >
            Are you sure you want to permanently delete the user{' '}
            <Box component="span" sx={{ fontWeight: 'bold', fontSize: '1.3rem', color: colors.redAccent[700] }}>
              "{userToDeleteName}"
            </Box>
            ?
          </DialogContentText>
          <Alert 
            severity="warning" 
            sx={{ 
              mt: 2,
              bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[900] : '#fff3e0',
              color: theme.palette.mode === 'dark' ? colors.redAccent[100] : '#bf360c',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.redAccent[700] : colors.redAccent[400]}`,
              '& .MuiAlert-icon': {
                color: theme.palette.mode === 'dark' ? colors.redAccent[300] : colors.redAccent[700]
              }
            }}
          >
            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '1rem', mb: 1.5, color: 'inherit' }}>
              This will permanently remove:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3, '& li': { mb: 0.75, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.8, color: 'inherit' } }}>
              <li>All user account data and profile information</li>
              <li>All user activity history and logs</li>
              <li>All user assignments and relationships</li>
              <li>All user-generated content and contributions</li>
            </Box>
          </Alert>
          <Alert 
            severity="error" 
            sx={{ 
              mt: 2,
              bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[950] : colors.redAccent[100],
              color: theme.palette.mode === 'dark' ? colors.redAccent[200] : colors.redAccent[900],
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.redAccent[800] : colors.redAccent[400]}`,
              '& .MuiAlert-icon': {
                color: colors.redAccent[600]
              }
            }}
          >
            <strong>Warning:</strong> This action cannot be reversed. All data associated with this user will be permanently deleted from the system.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button 
            onClick={handleCloseDeleteConfirmDialog} 
            variant="outlined"
            sx={{ 
              borderColor: colors.grey[500],
              color: colors.grey[100],
              '&:hover': {
                borderColor: colors.grey[400],
                backgroundColor: colors.grey[700]
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmDeleteUser} 
            variant="contained"
            sx={{
              backgroundColor: colors.redAccent[600],
              '&:hover': {
                backgroundColor: colors.redAccent[700]
              },
              fontWeight: 'bold'
            }}
            startIcon={<DeleteIcon />}
          >
            Delete User
          </Button>
        </DialogActions>
      </Dialog>

      {/* Role Delete Confirmation Dialog */}
      <Dialog 
        open={openRoleDeleteConfirmDialog} 
        onClose={handleCloseRoleDeleteConfirmDialog} 
        aria-labelledby="role-delete-dialog-title" 
        aria-describedby="role-delete-dialog-description"
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            boxShadow: theme.palette.mode === 'dark' 
              ? '0 8px 32px rgba(0,0,0,0.4)' 
              : '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle 
          id="role-delete-dialog-title"
          sx={{ 
            backgroundColor: colors.redAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 3
          }}
        >
          <Avatar sx={{ bgcolor: colors.redAccent[700] }}>
            <DeleteIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Confirm Role Deletion
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              This action cannot be undone
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <DialogContentText 
            id="role-delete-dialog-description"
            sx={{ 
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1a1a1a',
              fontSize: '1.2rem',
              lineHeight: 1.7,
              fontWeight: 600,
              mb: 2
            }}
          >
            Are you sure you want to delete the role{' '}
            <Box component="span" sx={{ fontWeight: 'bold', fontSize: '1.3rem', color: colors.redAccent[700] }}>
              "{roleToDeleteName}"
            </Box>
            ?
          </DialogContentText>
          <Alert 
            severity="warning" 
            sx={{ 
              mb: 2,
              bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[900] : '#fff3e0',
              color: theme.palette.mode === 'dark' ? colors.redAccent[100] : '#bf360c',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.redAccent[700] : colors.redAccent[400]}`,
              '& .MuiAlert-icon': {
                color: theme.palette.mode === 'dark' ? colors.redAccent[300] : colors.redAccent[700]
              }
            }}
          >
            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '1rem', mb: 1.5, color: 'inherit' }}>
              This will permanently remove:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3, '& li': { mb: 0.75, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.8, color: 'inherit' } }}>
              <li>All privileges associated with this role</li>
              <li>All role-privilege relationships</li>
              <li>The role assignment from any users currently assigned to this role</li>
            </Box>
          </Alert>
          <Alert 
            severity="error" 
            sx={{ 
              bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[950] : colors.redAccent[100],
              color: theme.palette.mode === 'dark' ? colors.redAccent[200] : colors.redAccent[900],
              '& .MuiAlert-icon': {
                color: colors.redAccent[600]
              }
            }}
          >
            <strong>Warning:</strong> Users assigned to this role will lose their role assignment and may lose access to certain features. This action cannot be reversed.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button 
            onClick={handleCloseRoleDeleteConfirmDialog} 
            variant="outlined"
            sx={{ 
              borderColor: colors.grey[500],
              color: colors.grey[100],
              '&:hover': {
                borderColor: colors.grey[400],
                backgroundColor: colors.grey[700]
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmDeleteRole} 
            variant="contained"
            disabled={loading}
            sx={{
              backgroundColor: colors.redAccent[600],
              '&:hover': {
                backgroundColor: colors.redAccent[700]
              },
              fontWeight: 'bold'
            }}
            startIcon={<DeleteIcon />}
          >
            {loading ? 'Deleting...' : 'Delete Role'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <Dialog 
        open={openResetPasswordDialog} 
        onClose={handleCloseResetPasswordDialog} 
        aria-labelledby="reset-dialog-title" 
        aria-describedby="reset-dialog-description"
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            boxShadow: theme.palette.mode === 'dark' 
              ? '0 8px 32px rgba(0,0,0,0.4)' 
              : '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle 
          id="reset-dialog-title"
          sx={{ 
            backgroundColor: colors.blueAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 3
          }}
        >
          <Avatar sx={{ bgcolor: colors.blueAccent[700] }}>
            <LockResetIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Reset User Password
            </Typography>
            <Typography variant="body2" sx={{ opacity: 1, fontWeight: 500 }}>
              Security action required
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <DialogContentText 
            id="reset-dialog-description"
            sx={{ 
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1a1a1a',
              fontSize: '1.2rem',
              lineHeight: 1.7,
              fontWeight: 600
            }}
          >
            Are you sure you want to reset the password for user{' '}
            <Box component="span" sx={{ fontWeight: 'bold', fontSize: '1.3rem', color: colors.blueAccent[700] }}>
              "{userToResetName}"
            </Box>
            ?
          </DialogContentText>
          <Alert 
            severity="info" 
            sx={{ 
              mt: 2,
              bgcolor: theme.palette.mode === 'dark' ? colors.blueAccent[900] : '#e3f2fd',
              color: theme.palette.mode === 'dark' ? colors.blueAccent[100] : '#0d47a1',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[400]}`,
              '& .MuiAlert-icon': {
                color: theme.palette.mode === 'dark' ? colors.blueAccent[300] : colors.blueAccent[700]
              }
            }}
          >
            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '1rem', mb: 1.5, color: 'inherit' }}>
              New Password: reset123
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.8, color: 'inherit' }}>
              The user will need to change this password on their next login.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button 
            onClick={handleCloseResetPasswordDialog} 
            variant="outlined"
            sx={{ 
              borderColor: colors.grey[500],
              color: colors.grey[100],
              '&:hover': {
                borderColor: colors.grey[400],
                backgroundColor: colors.grey[700]
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmResetPassword} 
            variant="contained"
            sx={{
              backgroundColor: colors.blueAccent[600],
              '&:hover': {
                backgroundColor: colors.blueAccent[700]
              },
              fontWeight: 'bold'
            }}
            startIcon={<LockResetIcon />}
          >
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resend login credentials email (Super Admin) */}
      <Dialog
        open={openResendCredentialsDialog}
        onClose={handleCloseResendCredentialsDialog}
        aria-labelledby="resend-credentials-dialog-title"
        aria-describedby="resend-credentials-dialog-description"
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            boxShadow:
              theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 8px 32px rgba(0,0,0,0.12)',
          },
        }}
      >
        <DialogTitle
          id="resend-credentials-dialog-title"
          sx={{
            backgroundColor: colors.greenAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 3,
          }}
        >
          <Avatar sx={{ bgcolor: colors.greenAccent[700] }}>
            <MarkEmailReadIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Resend login credentials
            </Typography>
            <Typography variant="body2" sx={{ opacity: 1, fontWeight: 500 }}>
              Email will be sent to the user&apos;s address on file
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <DialogContentText
            id="resend-credentials-dialog-description"
            sx={{
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1a1a1a',
              fontSize: '1.2rem',
              lineHeight: 1.7,
              fontWeight: 600,
            }}
          >
            Send a new login credentials email to{' '}
            <Box component="span" sx={{ fontWeight: 'bold', fontSize: '1.3rem', color: colors.greenAccent[700] }}>
              "{userToResendCredentialsName}"
            </Box>
            ?
          </DialogContentText>
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 2,
              // Use MUI palette here — dashboard `tokens('light').grey[100]` is a dark hex, not a light surface.
              bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={700} letterSpacing={0.5}>
              RECIPIENT
            </Typography>
            <Typography
              variant="body1"
              fontWeight="bold"
              color="text.primary"
              sx={{ wordBreak: 'break-all', mt: 0.5 }}
            >
              {userToResendCredentialsEmail}
            </Typography>
          </Box>
          <Alert
            severity="info"
            sx={{
              mt: 2,
              bgcolor: theme.palette.mode === 'dark' ? colors.greenAccent[900] : '#e8f5e9',
              color: theme.palette.mode === 'dark' ? colors.greenAccent[100] : '#1b5e20',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] : colors.greenAccent[400]}`,
              '& .MuiAlert-icon': {
                color: theme.palette.mode === 'dark' ? colors.greenAccent[300] : colors.greenAccent[700],
              },
            }}
          >
            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '1rem', mb: 1, color: 'inherit' }}>
              What this email includes
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.8, color: 'inherit' }}>
              Login link, username, and a fresh one-time password. The user should use it promptly and change their
              password after signing in if your policy requires it.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={handleCloseResendCredentialsDialog}
            variant="outlined"
            sx={{
              borderColor: colors.grey[500],
              color: colors.grey[100],
              '&:hover': {
                borderColor: colors.grey[400],
                backgroundColor: colors.grey[700],
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmResendCredentialsEmail}
            variant="contained"
            disabled={loading}
            sx={{
              backgroundColor: colors.greenAccent[600],
              '&:hover': {
                backgroundColor: colors.greenAccent[700],
              },
              fontWeight: 'bold',
            }}
            startIcon={<MarkEmailReadIcon />}
          >
            {loading ? 'Sending…' : 'Send email'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toggle User Status Confirmation Dialog */}
      <Dialog 
        open={openToggleStatusDialog} 
        onClose={handleCloseToggleStatusDialog} 
        aria-labelledby="toggle-status-dialog-title" 
        aria-describedby="toggle-status-dialog-description"
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            boxShadow: theme.palette.mode === 'dark' 
              ? '0 8px 32px rgba(0,0,0,0.4)' 
              : '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle 
          id="toggle-status-dialog-title"
          sx={{ 
            backgroundColor: userToToggleCurrentStatus ? colors.redAccent[600] : colors.greenAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 3
          }}
        >
          <Avatar sx={{ bgcolor: userToToggleCurrentStatus ? colors.redAccent[700] : colors.greenAccent[700] }}>
            {userToToggleCurrentStatus ? <BlockIcon /> : <CheckCircleIcon />}
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              {userToToggleCurrentStatus ? 'Disable User Account' : 'Enable User Account'}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 1, fontWeight: 500 }}>
              {userToToggleCurrentStatus ? 'Restrict user access' : 'Restore user access'}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <DialogContentText 
            id="toggle-status-dialog-description"
            sx={{ 
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1a1a1a',
              fontSize: '1.2rem',
              lineHeight: 1.7,
              fontWeight: 600
            }}
          >
            Are you sure you want to {userToToggleCurrentStatus ? 'disable' : 'enable'} the user{' '}
            <Box component="span" sx={{ fontWeight: 'bold', fontSize: '1.3rem', color: userToToggleCurrentStatus ? colors.redAccent[700] : colors.greenAccent[700] }}>
              "{userToToggleName}"
            </Box>
            ?
          </DialogContentText>
          
          {userToToggleCurrentStatus ? (
            <Alert 
              severity="warning" 
              sx={{ 
                mt: 2,
                bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[900] : '#fff3e0',
                color: theme.palette.mode === 'dark' ? colors.redAccent[100] : '#bf360c',
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.redAccent[700] : colors.redAccent[400]}`,
                '& .MuiAlert-icon': {
                  color: theme.palette.mode === 'dark' ? colors.redAccent[300] : colors.redAccent[700]
                }
              }}
            >
              <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '1rem', mb: 1.5, color: 'inherit' }}>
                This will prevent the user from logging in
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.8, color: 'inherit' }}>
                • User will be immediately logged out from all sessions<br/>
                • User cannot access the system until re-enabled<br/>
                • User data and permissions are preserved
              </Typography>
            </Alert>
          ) : (
            <Alert 
              severity="success" 
              sx={{ 
                mt: 2,
                bgcolor: theme.palette.mode === 'dark' ? colors.greenAccent[900] : '#e8f5e9',
                color: theme.palette.mode === 'dark' ? colors.greenAccent[100] : '#1b5e20',
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] : colors.greenAccent[400]}`,
                '& .MuiAlert-icon': {
                  color: theme.palette.mode === 'dark' ? colors.greenAccent[300] : colors.greenAccent[700]
                }
              }}
            >
              <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '1rem', mb: 1.5, color: 'inherit' }}>
                This will restore user access to the system
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.8, color: 'inherit' }}>
                • User can log in immediately<br/>
                • All previous permissions and data are restored<br/>
                • User will have full access to assigned features
              </Typography>
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button 
            onClick={handleCloseToggleStatusDialog} 
            variant="outlined"
            sx={{ 
              borderColor: colors.grey[500],
              color: colors.grey[100],
              '&:hover': {
                borderColor: colors.grey[400],
                backgroundColor: colors.grey[700]
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmToggleUserStatus} 
            variant="contained"
            sx={{
              backgroundColor: userToToggleCurrentStatus ? colors.redAccent[600] : colors.greenAccent[600],
              '&:hover': {
                backgroundColor: userToToggleCurrentStatus ? colors.redAccent[700] : colors.greenAccent[700]
              },
              fontWeight: 'bold'
            }}
            startIcon={userToToggleCurrentStatus ? <BlockIcon /> : <CheckCircleIcon />}
          >
            {userToToggleCurrentStatus ? 'Disable User' : 'Enable User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* UI Profile Management Dialog */}
      <Dialog
        open={openUiProfileManagementDialog}
        onClose={() => setOpenUiProfileManagementDialog(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white' }}>
          UI Profiles
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            UI profiles control what menus and project registry tabs a user sees. They do not grant backend permissions.
            Assign a profile on the role (default for all users in that role) or per user. Users must sign out and back in, or refresh the page, after changes.
          </Alert>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} spacing={1}>
            <Typography variant="body2" sx={{ color: colors.grey[300] }}>
              {uiProfiles.length} profile{uiProfiles.length === 1 ? '' : 's'} configured
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreateUiProfileDialog}
              disabled={loadingUiProfiles}
            >
              New profile
            </Button>
          </Stack>
          {loadingUiProfiles ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer
              component={Paper}
              sx={{
                backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : '#d0d7de'}`,
                borderRadius: 2,
                overflow: 'hidden',
                '& .MuiTableCell-root': {
                  color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1f2937',
                  borderColor: theme.palette.mode === 'dark' ? colors.grey[700] : '#e5e7eb',
                },
                '& .MuiTableHead-root .MuiTableCell-root': {
                  backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : '#f8fafc',
                  color: theme.palette.mode === 'dark' ? colors.grey[100] : '#111827',
                  fontWeight: 700,
                },
                '& .MuiTableBody-root .MuiTableRow-root': {
                  backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                },
                '& .MuiTableBody-root .MuiTableRow-root:nth-of-type(even)': {
                  backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : '#f9fafb',
                },
                '& .MuiTableBody-root .MuiTableRow-root:hover': {
                  backgroundColor: theme.palette.mode === 'dark' ? colors.blueAccent[900] : '#eef6ff',
                },
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Menus</TableCell>
                    <TableCell>Tabs</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {uiProfiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography sx={{ fontWeight: 700 }}>{profile.name}</Typography>
                          {profile.isDefault && <Chip size="small" label="Default" color="success" />}
                        </Stack>
                      </TableCell>
                      <TableCell>{profile.description || '—'}</TableCell>
                      <TableCell>{profile.visibleMenuKeys?.length || 0}</TableCell>
                      <TableCell>{profile.visibleTabKeys?.length || 0}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => handleOpenEditUiProfileDialog(profile)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {uiProfiles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" sx={{ color: colors.grey[400], py: 2, textAlign: 'center' }}>
                          No UI profiles found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setOpenUiProfileManagementDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openUiProfileDialog} onClose={handleCloseUiProfileDialog} fullWidth maxWidth="lg">
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white' }}>
          {currentUiProfileToEdit ? 'Edit UI Profile' : 'Create UI Profile'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
            Empty menu or tab selections mean “use normal visibility”. Select only when you want this profile to restrict what users see.
          </Alert>
          <TextField
            key={`ui-profile-name-${currentUiProfileToEdit?.id || 'new'}`}
            fullWidth
            margin="dense"
            label="Profile name"
            defaultValue={uiProfileFormData.name}
            inputRef={uiProfileNameInputRef}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff', borderRadius: 1.5 } }}
          />
          <TextField
            key={`ui-profile-description-${currentUiProfileToEdit?.id || 'new'}`}
            fullWidth
            multiline
            minRows={2}
            margin="dense"
            label="Description"
            defaultValue={uiProfileFormData.description}
            inputRef={uiProfileDescriptionInputRef}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff', borderRadius: 1.5 } }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={!!uiProfileFormData.isDefault}
                onChange={(event) => setUiProfileFormData((prev) => ({ ...prev, isDefault: event.target.checked }))}
              />
            }
            label="Use as default profile"
            sx={{ mb: 2 }}
          />
          <Box sx={{ mb: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700 }}>
                Visible menus ({uiProfileFormData.visibleMenuKeys.length} selected)
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" onClick={handleSelectAllUiMenus}>Select all</Button>
                <Button size="small" variant="outlined" onClick={handleSelectUiMenuGroups}>Groups only</Button>
                <Button size="small" variant="outlined" onClick={handleSelectUiMenuItems}>Items only</Button>
                <Button size="small" color="inherit" onClick={handleClearUiMenus}>Clear</Button>
              </Stack>
            </Stack>
          </Box>
          <Paper
            variant="outlined"
            sx={{
              mb: 2,
              borderRadius: 2,
              overflow: 'hidden',
              backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
              borderColor: theme.palette.mode === 'dark' ? colors.grey[700] : '#d0d7de',
            }}
          >
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : '#e5e7eb'}` }}>
              <Typography variant="body2" sx={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#374151' }}>
                Expand a menu group, then select only the items this profile should show. Use “Whole group” when the user should see every current and future item in that group.
              </Typography>
            </Box>
            {uiMenuVisibilityGroups.map((group) => {
              const selectedKeys = new Set(uiProfileFormData.visibleMenuKeys);
              const itemKeys = (group.items || []).map((item) => item.key);
              const groupAllowed = selectedKeys.has(group.key);
              const selectedItemCount = groupAllowed
                ? itemKeys.length
                : itemKeys.filter((key) => selectedKeys.has(key)).length;
              const allItemsSelected = itemKeys.length > 0 && selectedItemCount === itemKeys.length;
              const partiallySelected = !groupAllowed && selectedItemCount > 0 && !allItemsSelected;
              return (
                <Accordion
                  key={group.key}
                  disableGutters
                  square
                  sx={{
                    backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                    color: theme.palette.mode === 'dark' ? colors.grey[100] : '#111827',
                    '&:before': { display: 'none' },
                    borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : '#e5e7eb'}`,
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ width: '100%' }}>
                      <Checkbox
                        size="small"
                        checked={groupAllowed || allItemsSelected}
                        indeterminate={partiallySelected}
                        onClick={(event) => event.stopPropagation()}
                        onFocus={(event) => event.stopPropagation()}
                        onChange={() => handleToggleUiMenuGroupItems(group)}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }}>{group.label}</Typography>
                        <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? colors.grey[300] : '#6b7280' }}>
                          {groupAllowed ? 'Whole group allowed' : `${selectedItemCount}/${itemKeys.length} items selected`}
                        </Typography>
                      </Box>
                      {groupAllowed ? <Chip size="small" color="success" label="Whole group" /> : null}
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                      <Button size="small" variant="outlined" onClick={() => handleToggleUiMenuGroupItems(group)}>
                        {groupAllowed || allItemsSelected ? 'Clear group items' : 'Select group items'}
                      </Button>
                      <Button size="small" variant="outlined" onClick={() => handleAllowWholeUiMenuGroup(group)}>
                        Whole group
                      </Button>
                      <Button size="small" color="inherit" onClick={() => handleClearUiMenuGroup(group)}>
                        Clear group
                      </Button>
                    </Stack>
                    <Divider sx={{ mb: 1 }} />
                    <Grid container spacing={0.75}>
                      {(group.items || []).map((item) => {
                        const itemChecked = groupAllowed || selectedKeys.has(item.key);
                        return (
                          <Grid item xs={12} sm={6} md={4} key={item.key}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={itemChecked}
                                  onChange={(event) => handleToggleUiMenuItem(group, item, event.target.checked)}
                                />
                              }
                              label={
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? colors.grey[100] : '#111827' }}>
                                    {item.label}
                                  </Typography>
                                  {item.route ? (
                                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? colors.grey[400] : '#6b7280' }}>
                                      {item.route}
                                    </Typography>
                                  ) : null}
                                </Box>
                              }
                              sx={{
                                alignItems: 'flex-start',
                                width: '100%',
                                m: 0,
                                p: 0.75,
                                borderRadius: 1,
                                backgroundColor: itemChecked
                                  ? (theme.palette.mode === 'dark' ? colors.blueAccent[900] : '#eff6ff')
                                  : 'transparent',
                              }}
                            />
                          </Grid>
                        );
                      })}
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Paper>
          <Box sx={{ mb: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700 }}>
                Visible project registry tabs ({uiProfileFormData.visibleTabKeys.length} selected)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={handleSelectAllUiTabs}>Select all tabs</Button>
                <Button size="small" color="inherit" onClick={handleClearUiTabs}>Clear</Button>
              </Stack>
            </Stack>
          </Box>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2,
              overflow: 'hidden',
              backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
              borderColor: theme.palette.mode === 'dark' ? colors.grey[700] : '#d0d7de',
            }}
          >
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : '#e5e7eb'}` }}>
              <Typography variant="body2" sx={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#374151' }}>
                Select which Project Details tabs users with this profile can open (Overview, Financials, BQ, Payments, etc.).
                Leave empty to show all supported tabs.
              </Typography>
            </Box>
            <Stack spacing={0} divider={<Divider />}>
              {uiTabVisibilityGroups.map((group) => {
                const selectedKeys = new Set(uiProfileFormData.visibleTabKeys);
                const groupKeys = group.options.map((option) => option.key);
                const selectedCount = groupKeys.filter((key) => selectedKeys.has(key)).length;
                const allSelected = groupKeys.length > 0 && selectedCount === groupKeys.length;
                const partiallySelected = selectedCount > 0 && !allSelected;
                return (
                  <Box key={group.group} sx={{ p: 1.5 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={allSelected}
                            indeterminate={partiallySelected}
                            onChange={() => handleToggleUiTabGroup(group)}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{ fontWeight: 800, color: theme.palette.mode === 'dark' ? colors.grey[100] : '#111827' }}>
                              {group.group}
                            </Typography>
                            <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? colors.grey[300] : '#6b7280' }}>
                              {selectedCount}/{groupKeys.length} tabs selected
                            </Typography>
                          </Box>
                        }
                        sx={{ m: 0 }}
                      />
                      <Button size="small" variant="outlined" onClick={() => handleToggleUiTabGroup(group)}>
                        {allSelected ? 'Clear section' : 'Select section'}
                      </Button>
                    </Stack>
                    <Grid container spacing={0.75}>
                      {group.options.map((option) => {
                        const checked = selectedKeys.has(option.key);
                        return (
                          <Grid item xs={12} sm={6} md={4} key={option.key}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={checked}
                                  onChange={(event) => handleToggleUiTab(option.key, event.target.checked)}
                                />
                              }
                              label={
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? colors.grey[100] : '#111827' }}>
                                    {option.label}
                                  </Typography>
                                  <Typography variant="caption" sx={{ display: 'block', color: theme.palette.mode === 'dark' ? colors.grey[400] : '#6b7280' }}>
                                    {option.description}
                                  </Typography>
                                </Box>
                              }
                              sx={{
                                alignItems: 'flex-start',
                                width: '100%',
                                m: 0,
                                p: 0.75,
                                borderRadius: 1,
                                backgroundColor: checked
                                  ? (theme.palette.mode === 'dark' ? colors.blueAccent[900] : '#eff6ff')
                                  : 'transparent',
                              }}
                            />
                          </Grid>
                        );
                      })}
                    </Grid>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={handleCloseUiProfileDialog} variant="outlined">Cancel</Button>
          <Button onClick={handleSaveUiProfile} variant="contained" disabled={loadingUiProfiles}>
            Save profile
          </Button>
        </DialogActions>
      </Dialog>

      {/* Role Management Dialog */}
      <Dialog
        open={openRoleManagementDialog}
        onClose={handleCloseRoleManagementDialog}
        fullWidth
        maxWidth="md"
        disableEnforceFocus={openRoleDialog}
      >
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white' }}>
          Role Management
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          {isSuperAdmin && hasPrivilege('role.create') && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateRoleDialog} sx={{ mb: 2, backgroundColor: colors.greenAccent[600], '&:hover': { backgroundColor: colors.greenAccent[700] }, color: 'white' }}>
              Add New Role
            </Button>
          )}
          {roles.length === 0 ? (
            <Alert severity="info">
              {isSuperAdmin
                ? 'No roles found. Use Add New Role to create one.'
                : 'No roles found.'}
            </Alert>
          ) : (
            <Box
              height="400px"
              sx={{
                "& .MuiDataGrid-root": {
                  border: "none",
                },
                "& .MuiDataGrid-cell": {
                  borderBottom: "none",
                },
                "& .username-column--cell": {
                  color: colors.greenAccent[300],
                },
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: `${colors.blueAccent[700]} !important`,
                  borderBottom: "none",
                },
                "& .MuiDataGrid-virtualScroller": {
                  backgroundColor: colors.primary[400],
                },
                "& .MuiDataGrid-footerContainer": {
                  borderTop: "none",
                  backgroundColor: `${colors.blueAccent[700]} !important`,
                },
                "& .MuiCheckbox-root": {
                  color: `${colors.greenAccent[200]} !important`,
                },
              }}
            >
              <DataGrid
                rows={roles}
                columns={roleColumns}
                getRowId={(row) => row.roleId}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button onClick={handleCloseRoleManagementDialog} color="primary" variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>
      
      {/* Create/Edit Role Dialog */}
      <Dialog open={openRoleDialog} onClose={handleCloseRoleDialog} fullWidth maxWidth="sm" disableEnforceFocus>
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white' }}>
          {currentRoleToEdit ? 'Edit Role' : 'Add New Role'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Create the role name, choose privileges, then save once. Privileges are now saved together with the role.
          </Alert>
          <TextField
            key={`role-name-${currentRoleToEdit?.roleId || 'new'}`}
            autoFocus
            margin="dense"
            name="roleName"
            label="Role Name"
            type="text"
            fullWidth
            variant="outlined"
            defaultValue={roleFormData.roleName}
            inputRef={roleNameInputRef}
            onBlur={() => {
              if (roleFormErrors.roleName && String(roleNameInputRef.current?.value || '').trim()) {
                setRoleFormErrors((prev) => ({ ...prev, roleName: '' }));
              }
            }}
            error={!!roleFormErrors.roleName}
            helperText={roleFormErrors.roleName || (currentRoleToEdit ? 'Role name can be changed, but duplicates are not allowed.' : '')}
            sx={{ mb: 2 }}
          />
          <TextField
            key={`role-description-${currentRoleToEdit?.roleId || 'new'}`}
            margin="dense"
            name="description"
            label="Description"
            type="text"
            fullWidth
            variant="outlined"
            defaultValue={roleFormData.description}
            inputRef={roleDescriptionInputRef}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
            <InputLabel>Default UI profile (optional)</InputLabel>
            <Select
              label="Default UI profile (optional)"
              value={roleFormData.uiProfileId || ''}
              onChange={(e) => setRoleFormData((prev) => ({ ...prev, uiProfileId: e.target.value }))}
            >
              <MenuItem value="">
                <em>No default UI profile</em>
              </MenuItem>
              {uiProfiles.map((profile) => (
                <MenuItem key={profile.id} value={String(profile.id)}>
                  {profile.name}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Users with this role inherit this navigation/tab profile unless a user-specific profile is set.
            </Typography>
          </FormControl>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 1 }}>
            <Chip
              size="small"
              color={roleFormData.privilegeIds.length > 0 ? 'primary' : 'default'}
              label={`${roleFormData.privilegeIds.length} privilege${roleFormData.privilegeIds.length === 1 ? '' : 's'} selected`}
              sx={{ fontWeight: 700, alignSelf: { xs: 'flex-start', sm: 'center' } }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const readPrivilegeIds = privileges
                  .filter((p) => {
                    const name = String(p.privilegeName || '').toLowerCase();
                    return name.endsWith('.read_all') || name.endsWith('.read') || name.includes('.view');
                  })
                  .map((p) => String(p.privilegeId));
                setRoleFormData((prev) => ({ ...prev, privilegeIds: readPrivilegeIds }));
              }}
              disabled={!privileges.length}
            >
              Select read-only defaults
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setRoleFormData((prev) => ({ ...prev, privilegeIds: [] }))}
              disabled={roleFormData.privilegeIds.length === 0}
            >
              Clear privileges
            </Button>
          </Stack>
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={privileges}
            groupBy={(option) => {
              const name = option.privilegeName || '';
              const dot = name.indexOf('.');
              return dot === -1 ? (name || 'Other') : name.slice(0, dot);
            }}
            getOptionLabel={(option) => option.privilegeName || String(option.privilegeId ?? '')}
            isOptionEqualToValue={(a, b) => String(a.privilegeId) === String(b.privilegeId)}
            value={privileges.filter((p) => roleFormData.privilegeIds.includes(String(p.privilegeId)))}
            onChange={(event, newValue) => {
              setRoleFormData((prev) => ({
                ...prev,
                privilegeIds: newValue.map((p) => String(p.privilegeId)),
              }));
            }}
            filterOptions={(opts, state) => {
              const q = state.inputValue.trim().toLowerCase();
              if (!q) return opts;
              return opts.filter((o) => {
                const name = (o.privilegeName || '').toLowerCase();
                const desc = String(o.description ?? '').toLowerCase();
                const prefix = name.includes('.') ? name.slice(0, name.indexOf('.')).toLowerCase() : name;
                return name.includes(q) || desc.includes(q) || prefix.includes(q);
              });
            }}
            renderOption={(props, option, { selected }) => {
              const { key, ...otherProps } = props;
              return (
                <li key={key} {...otherProps}>
                  <Checkbox style={{ marginRight: 8 }} checked={selected} size="small" />
                  {option.privilegeName}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                margin="dense"
                label="Privileges"
                placeholder="Type to search, then pick from the list"
                helperText="Search filters by name, prefix, or description"
              />
            )}
            ListboxProps={{ style: { maxHeight: 360 } }}
            slotProps={{
              popper: { sx: { zIndex: (t) => t.zIndex.modal + 2 } },
            }}
            sx={{ mb: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button onClick={handleCloseRoleDialog} color="primary" variant="outlined">Cancel</Button>
          <Button
            onClick={handleRoleSubmit}
            color="primary"
            variant="contained"
            disabled={loading || (!currentRoleToEdit && !isSuperAdmin)}
          >
            {loading ? 'Saving…' : currentRoleToEdit ? 'Update Role' : 'Create Role'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Privilege Management Dialog */}
      <Dialog
        open={openPrivilegeManagementDialog}
        onClose={handleClosePrivilegeManagementDialog}
        fullWidth
        maxWidth="md"
        disableEnforceFocus={openPrivilegeDialog}
      >
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white' }}>
          Privilege Management
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          {isSuperAdmin && hasPrivilege('privilege.create') && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreatePrivilegeDialog} sx={{ mb: 2, backgroundColor: colors.greenAccent[600], '&:hover': { backgroundColor: colors.greenAccent[700] }, color: 'white' }}>
              Add New Privilege
            </Button>
          )}
          {privileges.length === 0 ? (
            <Alert severity="info">
              {isSuperAdmin
                ? 'No privileges found. Use Add New Privilege to create one.'
                : 'No privileges found.'}
            </Alert>
          ) : (
            <Box
              height="400px"
              sx={{
                "& .MuiDataGrid-root": {
                  border: "none",
                },
                "& .MuiDataGrid-cell": {
                  borderBottom: "none",
                },
                "& .username-column--cell": {
                  color: colors.greenAccent[300],
                },
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: `${colors.blueAccent[700]} !important`,
                  borderBottom: "none",
                },
                "& .MuiDataGrid-virtualScroller": {
                  backgroundColor: colors.primary[400],
                },
                "& .MuiDataGrid-footerContainer": {
                  borderTop: "none",
                  backgroundColor: `${colors.blueAccent[700]} !important`,
                },
                "& .MuiCheckbox-root": {
                  color: `${colors.greenAccent[200]} !important`,
                },
              }}
            >
              <DataGrid
                rows={privileges}
                columns={privilegeColumns}
                getRowId={(row) => row.privilegeId}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button onClick={handleClosePrivilegeManagementDialog} color="primary" variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Privilege Dialog */}
      <Dialog open={openPrivilegeDialog} onClose={handleClosePrivilegeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white' }}>
          {currentPrivilegeToEdit ? 'Edit Privilege' : 'Add New Privilege'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          <TextField autoFocus margin="dense" name="privilegeName" label="Privilege Name" type="text" fullWidth variant="outlined" value={privilegeFormData.privilegeName} onChange={handlePrivilegeFormChange} error={!!privilegeFormErrors.privilegeName} helperText={privilegeFormErrors.privilegeName} disabled={!!currentPrivilegeToEdit} sx={{ mb: 2 }} />
          <TextField margin="dense" name="description" label="Description" type="text" fullWidth variant="outlined" value={privilegeFormData.description} onChange={handlePrivilegeFormChange} sx={{ mb: 2 }} />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button type="button" onClick={handleClosePrivilegeDialog} color="primary" variant="outlined" disabled={loading}>Cancel</Button>
          <Button
            type="button"
            onClick={handlePrivilegeSubmit}
            color="primary"
            variant="contained"
            disabled={loading || (!currentPrivilegeToEdit && !isSuperAdmin)}
          >
            {loading ? 'Saving...' : (currentPrivilegeToEdit ? 'Update Privilege' : 'Create Privilege')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openOrgIntegrityDialog}
        onClose={() => {
          setOpenOrgIntegrityDialog(false);
          setOrgIntegrityPreview(null);
          setOrgIntegrityTableSearch('');
          setOrgIntegrityTab(0);
          setOrgIntegrityDistinct(null);
          setOrgIntegrityManualMinistryTo({});
          setOrgIntegrityManualStateTo({});
          setOpenOrgIntegrityManualConfirm(false);
        }}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle sx={{ backgroundColor: colors.yellowAccent[700], color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SyncAltIcon />
          Organization data reconcile
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          <Tabs value={orgIntegrityTab} onChange={(_, v) => setOrgIntegrityTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tab label="Preview & auto-reconcile" />
            <Tab label="Manual: ministries" />
            <Tab label="Manual: state departments" />
          </Tabs>

          {orgIntegrityTab === 0 && (
          <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 2 }} flexWrap="wrap">
            <TextField
              size="small"
              type="number"
              label="Rows per table (max)"
              value={orgIntegrityPreviewLimit}
              onChange={(e) => setOrgIntegrityPreviewLimit(Math.max(1, Math.min(parseInt(e.target.value, 10) || 50, 500)))}
              inputProps={{ min: 1, max: 500 }}
              sx={{ width: 160 }}
            />
            <Button
              variant="outlined"
              size="small"
              disabled={orgIntegrityLoading}
              onClick={() => loadOrganizationIntegrityPreview(orgIntegrityPreviewLimit)}
            >
              {orgIntegrityLoading ? 'Loading…' : 'Refresh preview'}
            </Button>
            <TextField
              size="small"
              label="Search in loaded tables"
              placeholder="Username, ministry, project name…"
              value={orgIntegrityTableSearch}
              onChange={(e) => setOrgIntegrityTableSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
          {orgIntegrityLoading && !orgIntegrityPreview ? (
            <Box display="flex" justifyContent="center" py={3}>
              <CircularProgress size={28} />
            </Box>
          ) : orgIntegrityPreview ? (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, color: colors.grey[100] }}>
                Full counts (entire database)
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
                <Chip size="small" color="default" label={`Users misaligned: ${orgIntegrityPreview.summary?.usersMisaligned ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…unknown ministry: ${orgIntegrityPreview.summary?.usersUnknownMinistry ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…ministry rename: ${orgIntegrityPreview.summary?.usersMinistryWouldChange ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…unknown state dept: ${orgIntegrityPreview.summary?.usersUnknownStateDepartment ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…state dept rename: ${orgIntegrityPreview.summary?.usersStateWouldChange ?? 0}`} />
              </Stack>
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                <Chip size="small" color="default" label={`Scopes misaligned: ${orgIntegrityPreview.summary?.scopesMisaligned ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…unknown ministry: ${orgIntegrityPreview.summary?.scopesUnknownMinistry ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…ministry rename: ${orgIntegrityPreview.summary?.scopesMinistryWouldChange ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…unknown state dept: ${orgIntegrityPreview.summary?.scopesUnknownStateDepartment ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…state dept rename: ${orgIntegrityPreview.summary?.scopesStateWouldChange ?? 0}`} />
              </Stack>
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                <Chip size="small" color="default" label={`Projects misaligned: ${orgIntegrityPreview.summary?.projectsMisaligned ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…unknown ministry: ${orgIntegrityPreview.summary?.projectsUnknownMinistry ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…ministry rename: ${orgIntegrityPreview.summary?.projectsMinistryWouldChange ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…unknown state dept: ${orgIntegrityPreview.summary?.projectsUnknownStateDepartment ?? 0}`} />
                <Chip size="small" variant="outlined" label={`…state dept rename: ${orgIntegrityPreview.summary?.projectsStateWouldChange ?? 0}`} />
              </Stack>

              {[
                {
                  key: 'users',
                  title: 'Users (misaligned only)',
                  columns: [
                    { id: 'userId', label: 'User ID', width: 72 },
                    { id: 'username', label: 'Username', width: 120 },
                    { id: 'currentOrg', label: 'Current organization', minWidth: 200 },
                    { id: 'proposedOrg', label: 'Proposed after reconcile', minWidth: 200 },
                    { id: 'issue', label: 'Issue', width: 160 },
                  ],
                  rowCells: (row) => ({
                    userId: row.userId,
                    username: row.username || '—',
                    currentOrg: [row.currentMinistry, row.currentStateDepartment].filter(Boolean).join(' / ') || '—',
                    proposedOrg: [row.proposedMinistry, row.proposedStateDepartment].filter(Boolean).join(' / ') || '— (no automatic fix)',
                    issue: formatOrgIntegrityIssue(row.issue),
                  }),
                },
                {
                  key: 'scopes',
                  title: 'Organization scopes (misaligned only)',
                  columns: [
                    { id: 'scopeId', label: 'Scope #', width: 72 },
                    { id: 'user', label: 'User', width: 140 },
                    { id: 'type', label: 'Type', width: 140 },
                    { id: 'currentOrg', label: 'Current organization', minWidth: 200 },
                    { id: 'proposedOrg', label: 'Proposed after reconcile', minWidth: 200 },
                    { id: 'issue', label: 'Issue', width: 160 },
                  ],
                  rowCells: (row) => ({
                    scopeId: row.scopeId,
                    user: row.username ? `${row.username} (${row.userId ?? '—'})` : String(row.userId ?? '—'),
                    type: row.scopeType || '—',
                    currentOrg: [row.currentMinistry, row.currentStateDepartment].filter(Boolean).join(' / ') || '—',
                    proposedOrg: [row.proposedMinistry, row.proposedStateDepartment].filter(Boolean).join(' / ') || '— (no automatic fix)',
                    issue: formatOrgIntegrityIssue(row.issue),
                  }),
                },
                {
                  key: 'projects',
                  title: 'Projects (misaligned only)',
                  columns: [
                    { id: 'projectId', label: 'Project ID', width: 88 },
                    { id: 'name', label: 'Name', width: 160 },
                    { id: 'currentOrg', label: 'Current organization', minWidth: 200 },
                    { id: 'proposedOrg', label: 'Proposed after reconcile', minWidth: 200 },
                    { id: 'issue', label: 'Issue', width: 160 },
                  ],
                  rowCells: (row) => ({
                    projectId: row.projectId,
                    name: row.projectName || '—',
                    currentOrg: [row.currentMinistry, row.currentStateDepartment].filter(Boolean).join(' / ') || '—',
                    proposedOrg: [row.proposedMinistry, row.proposedStateDepartment].filter(Boolean).join(' / ') || '— (no automatic fix)',
                    issue: formatOrgIntegrityIssue(row.issue),
                  }),
                },
              ].map((section) => {
                const loadedRows = orgIntegrityPreview.misaligned?.[section.key] || [];
                const rows = orgIntegrityFilteredMisaligned[section.key] || [];
                const totalMis = orgIntegrityPreview.summary?.[`${section.key}Misaligned`] ?? loadedRows.length;
                const searchActive = Boolean(orgIntegrityTableSearch.trim());
                return (
                <Box key={section.key} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 700, color: colors.grey[100] }}>
                    {section.title}
                    {searchActive
                      ? ` — showing ${rows.length} of ${loadedRows.length} loaded row${loadedRows.length === 1 ? '' : 's'} (search; up to ${orgIntegrityPreviewLimit} loaded; ${totalMis} misaligned in DB)`
                      : ` (showing up to ${orgIntegrityPreviewLimit} of ${totalMis} misaligned total)`}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 260, bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : 'grey.50' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          {section.columns.map((col) => (
                            <TableCell key={col.id} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }} width={col.width} style={col.minWidth ? { minWidth: col.minWidth } : undefined}>
                              {col.label}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {loadedRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={section.columns.length}>
                              <Typography variant="body2" color="text.secondary">
                                No misaligned rows in this category.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={section.columns.length}>
                              <Typography variant="body2" color="text.secondary">
                                No rows match your search in this category.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((row, idx) => {
                            const cells = section.rowCells(row);
                            return (
                              <TableRow key={`${section.key}-${idx}-${cells.userId ?? cells.scopeId ?? cells.projectId}`}>
                                {section.columns.map((col) => (
                                  <TableCell key={col.id} sx={{ verticalAlign: 'top', fontSize: '0.8125rem' }}>
                                    {cells[col.id]}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
                );
              })}
            </>
          ) : (
            <Alert severity="info">No preview loaded.</Alert>
          )}
          </>
          )}

          {orgIntegrityTab === 1 && (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Button variant="outlined" size="small" disabled={orgIntegrityDistinctLoading} onClick={() => loadOrganizationIntegrityMisalignedDistinct()}>
                  {orgIntegrityDistinctLoading ? 'Loading…' : 'Refresh distinct list'}
                </Button>
              </Stack>
              {orgIntegrityDistinctLoading ? (
                <Box display="flex" justifyContent="center" py={3}>
                  <CircularProgress size={28} />
                </Box>
              ) : (orgIntegrityDistinct?.misalignedMinistries || []).length === 0 ? (
                <Alert severity="success">No misaligned ministry values found.</Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420, bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : 'grey.50' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Misaligned ministry (stored)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} width={88}>Users</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} width={88}>Scopes</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} width={88}>Projects</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>Update to</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(orgIntegrityDistinct?.misalignedMinistries || []).map((row) => {
                        const key = row.ministryKey ?? '';
                        return (
                          <TableRow key={`m-${row.isEmpty ? 'empty' : key}`}>
                            <TableCell sx={{ fontSize: '0.8125rem' }}>{row.displayMinistry}</TableCell>
                            <TableCell>{row.userCount ?? 0}</TableCell>
                            <TableCell>{row.scopeCount ?? 0}</TableCell>
                            <TableCell>{row.projectCount ?? 0}</TableCell>
                            <TableCell>
                              <Autocomplete
                                size="small"
                                fullWidth
                                options={ministries || []}
                                value={(() => {
                                  const v = orgIntegrityManualMinistryTo[key];
                                  if (!v) return null;
                                  return (ministries || []).includes(v) ? v : null;
                                })()}
                                onChange={(_, newValue) => {
                                  setOrgIntegrityManualMinistryTo((prev) => ({
                                    ...prev,
                                    [key]: newValue || '',
                                  }));
                                }}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Type to search ministries…"
                                    inputProps={{ ...params.inputProps, 'aria-label': `Update ministry for ${row.displayMinistry}` }}
                                  />
                                )}
                                noOptionsText="No matching ministry"
                                clearOnEscape
                                ListboxProps={{ style: { maxHeight: 280 } }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="warning"
                  onClick={handleClickApplyManualMinistries}
                  disabled={orgIntegrityManualApplyLoading || orgIntegrityDistinctLoading}
                >
                  Apply ministry updates…
                </Button>
              </Stack>
            </>
          )}

          {orgIntegrityTab === 2 && (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Button variant="outlined" size="small" disabled={orgIntegrityDistinctLoading} onClick={() => loadOrganizationIntegrityMisalignedDistinct()}>
                  {orgIntegrityDistinctLoading ? 'Loading…' : 'Refresh distinct list'}
                </Button>
              </Stack>
              {orgIntegrityDistinctLoading ? (
                <Box display="flex" justifyContent="center" py={3}>
                  <CircularProgress size={28} />
                </Box>
              ) : (orgIntegrityDistinct?.misalignedStateDepartments || []).length === 0 ? (
                <Alert severity="success">No misaligned state department values found.</Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420, bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : 'grey.50' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Misaligned state department (stored)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} width={88}>Users</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} width={88}>Scopes</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} width={88}>Projects</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 320 }}>Update to</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(orgIntegrityDistinct?.misalignedStateDepartments || []).map((row) => {
                        const key = row.stateDepartmentKey ?? '';
                        return (
                          <TableRow key={`sd-${row.isEmpty ? 'empty' : key}`}>
                            <TableCell sx={{ fontSize: '0.8125rem' }}>{row.displayStateDepartment}</TableCell>
                            <TableCell>{row.userCount ?? 0}</TableCell>
                            <TableCell>{row.scopeCount ?? 0}</TableCell>
                            <TableCell>{row.projectCount ?? 0}</TableCell>
                            <TableCell>
                              <Autocomplete
                                size="small"
                                fullWidth
                                options={orgIntegrityManualDepartmentOptions}
                                getOptionLabel={(opt) => opt.label}
                                isOptionEqualToValue={(a, b) => a.departmentId === b.departmentId}
                                value={(() => {
                                  const idRaw = orgIntegrityManualStateTo[key];
                                  if (idRaw === '' || idRaw == null) return null;
                                  return (
                                    orgIntegrityManualDepartmentOptions.find(
                                      (o) => String(o.departmentId) === String(idRaw)
                                    ) || null
                                  );
                                })()}
                                onChange={(_, newValue) => {
                                  setOrgIntegrityManualStateTo((prev) => ({
                                    ...prev,
                                    [key]: newValue != null ? String(newValue.departmentId) : '',
                                  }));
                                }}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Type to search state departments…"
                                    inputProps={{
                                      ...params.inputProps,
                                      'aria-label': `Update state department for ${row.displayStateDepartment}`,
                                    }}
                                  />
                                )}
                                noOptionsText="No matching department"
                                clearOnEscape
                                ListboxProps={{ style: { maxHeight: 280 } }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="warning"
                  onClick={handleClickApplyManualStateDepartments}
                  disabled={orgIntegrityManualApplyLoading || orgIntegrityDistinctLoading}
                >
                  Apply state department updates…
                </Button>
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button
            onClick={() => {
              setOpenOrgIntegrityDialog(false);
              setOrgIntegrityPreview(null);
              setOrgIntegrityTableSearch('');
              setOrgIntegrityTab(0);
              setOrgIntegrityDistinct(null);
              setOrgIntegrityManualMinistryTo({});
              setOrgIntegrityManualStateTo({});
              setOpenOrgIntegrityManualConfirm(false);
            }}
            variant="outlined"
          >
            Close
          </Button>
          {orgIntegrityTab === 0 && (
          <Button
            variant="contained"
            color="warning"
            disabled={orgIntegrityLoading || orgIntegrityApplyLoading}
            onClick={() => setOpenOrgIntegrityApplyConfirm(true)}
          >
            Apply reconcile
          </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={openOrgIntegrityManualConfirm} onClose={() => !orgIntegrityManualApplyLoading && setOpenOrgIntegrityManualConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: colors.yellowAccent[800], color: 'white' }}>Confirm manual updates</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <DialogContentText sx={{ color: colors.grey[100] }}>
            {orgIntegrityManualConfirmKind === 'ministry'
              ? 'This will overwrite the ministry field for every user, organization scope, and project row that matches the selected source values. Continue?'
              : 'This will overwrite the state department field for every matching user, STATE_DEPARTMENT_ALL scope, and project row. Continue?'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setOpenOrgIntegrityManualConfirm(false)} variant="outlined" disabled={orgIntegrityManualApplyLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirmOrganizationManualMap} variant="contained" color="warning" disabled={orgIntegrityManualApplyLoading}>
            {orgIntegrityManualApplyLoading ? 'Applying…' : 'Yes, apply'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openOrgIntegrityApplyConfirm} onClose={() => setOpenOrgIntegrityApplyConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: colors.redAccent[700], color: 'white' }}>Confirm reconcile</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <DialogContentText sx={{ color: colors.grey[100] }}>
            This will write updates to the database for users, organization scopes, and projects that can be matched to the
            ministries/departments registry. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setOpenOrgIntegrityApplyConfirm(false)} variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleApplyOrganizationIntegrity} variant="contained" color="error" disabled={orgIntegrityApplyLoading}>
            {orgIntegrityApplyLoading ? 'Applying…' : 'Yes, apply'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openSessionSecurityDialog} onClose={() => setOpenSessionSecurityDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white' }}>
          Session Security
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: colors.primary[400] }}>
          {sessionPolicyLoading ? (
            <Box display="flex" justifyContent="center" py={2}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Configure automatic logout after user inactivity. This applies to all users.
              </Alert>
              <TextField
                fullWidth
                type="number"
                label="Idle timeout (minutes)"
                value={sessionIdleTimeoutMinutes}
                onChange={(e) => setSessionIdleTimeoutMinutes(e.target.value)}
                inputProps={{ min: 1, max: 1440 }}
                helperText="Minimum 1 minute, maximum 1440 minutes (24 hours)."
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setOpenSessionSecurityDialog(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleSaveSessionSecurityPolicy} variant="contained" disabled={sessionPolicyLoading || sessionPolicySaving}>
            {sessionPolicySaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Privilege Delete Confirmation Dialog */}
      <Dialog 
        open={openPrivilegeDeleteConfirmDialog} 
        onClose={handleClosePrivilegeDeleteConfirmDialog} 
        aria-labelledby="privilege-delete-dialog-title" 
        aria-describedby="privilege-delete-dialog-description"
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            boxShadow: theme.palette.mode === 'dark' 
              ? '0 8px 32px rgba(0,0,0,0.4)' 
              : '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle 
          id="privilege-delete-dialog-title"
          sx={{ 
            backgroundColor: colors.redAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 3
          }}
        >
          <Avatar sx={{ bgcolor: colors.redAccent[700] }}>
            <DeleteIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Confirm Privilege Deletion
            </Typography>
            <Typography variant="body2" sx={{ opacity: 1, fontWeight: 500 }}>
              This action cannot be undone
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <DialogContentText 
            id="privilege-delete-dialog-description"
            sx={{ 
              color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1a1a1a',
              fontSize: '1.2rem',
              lineHeight: 1.7,
              fontWeight: 600,
              mb: 2
            }}
          >
            Are you sure you want to delete the privilege{' '}
            <Box component="span" sx={{ fontWeight: 'bold', fontSize: '1.3rem', color: colors.redAccent[700] }}>
              "{privilegeToDeleteName}"
            </Box>
            ?
          </DialogContentText>
          <Alert 
            severity="warning" 
            sx={{ 
              mb: 2,
              bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[900] : '#fff3e0',
              color: theme.palette.mode === 'dark' ? colors.redAccent[100] : '#bf360c',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.redAccent[700] : colors.redAccent[400]}`,
              '& .MuiAlert-icon': {
                color: theme.palette.mode === 'dark' ? colors.redAccent[300] : colors.redAccent[700]
              }
            }}
          >
            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '1rem', mb: 1.5, color: 'inherit' }}>
              This will permanently remove:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3, '& li': { mb: 0.75, fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.8, color: 'inherit' } }}>
              <li>The privilege from the system</li>
              <li>All role-privilege relationships containing this privilege</li>
              <li>Access rights for all users with roles that include this privilege</li>
            </Box>
          </Alert>
          <Alert 
            severity="error" 
            sx={{ 
              bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[950] : colors.redAccent[100],
              color: theme.palette.mode === 'dark' ? colors.redAccent[200] : colors.redAccent[900],
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.redAccent[800] : colors.redAccent[400]}`,
              '& .MuiAlert-icon': {
                color: colors.redAccent[600]
              }
            }}
          >
            <strong>Warning:</strong> Users with roles containing this privilege will lose access to features that require it. This action cannot be reversed.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button 
            onClick={handleClosePrivilegeDeleteConfirmDialog} 
            variant="outlined"
            sx={{ 
              borderColor: colors.grey[500],
              color: colors.grey[100],
              '&:hover': {
                borderColor: colors.grey[400],
                backgroundColor: colors.grey[700]
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmDeletePrivilege} 
            variant="contained"
            disabled={loading}
            sx={{
              backgroundColor: colors.redAccent[600],
              '&:hover': {
                backgroundColor: colors.redAccent[700]
              },
              fontWeight: 'bold'
            }}
            startIcon={<DeleteIcon />}
          >
            {loading ? 'Deleting...' : 'Delete Privilege'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ zIndex: (t) => t.zIndex.modal + 2 }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default UserManagementPage;