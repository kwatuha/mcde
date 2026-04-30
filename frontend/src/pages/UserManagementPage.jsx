import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Paper, CircularProgress, IconButton,
  Select, MenuItem, FormControl, InputLabel, Snackbar, Alert, Stack, useTheme,
  Chip, Checkbox, Avatar, Tabs, Tab, Accordion, AccordionSummary, AccordionDetails,
  DialogContentText, InputAdornment, Grid, Autocomplete,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { DataGrid } from "@mui/x-data-grid";
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, PersonAdd as PersonAddIcon, Settings as SettingsIcon, Lock as LockIcon, LockReset as LockResetIcon, Block as BlockIcon, CheckCircle as CheckCircleIcon, Search as SearchIcon, Clear as ClearIcon, Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon, AccountTree as AccountTreeIcon, ExpandMore as ExpandMoreIcon, ViewList as ViewListIcon, Hub as HubIcon, AdminPanelSettings as AdminPanelSettingsIcon, TableChart as ExcelIcon, Security as SecurityIcon, SyncAlt as SyncAltIcon } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { useSearchParams } from 'react-router-dom';
import apiService from '../api/userService';
import apiServiceMain from '../api';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "./dashboard/theme";
import {
  isSuperAdminUser,
  normalizeRoleForCompare,
  isMdaIctAdminUser,
  canMdaIctAdminMutateUser,
} from '../utils/roleUtils';

/** Shown when MDA ICT Admin hits controls for users outside allowed roles (matches API copy). */
const MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE =
  'MDA ICT Admin can only edit users in Data Entry Officer, Data Approver, or Viewer roles.';

/** API `issue` codes from GET /users/organization-integrity/preview → misaligned rows */
const ORG_INTEGRITY_ISSUE_LABELS = {
  unknown_ministry: 'Ministry: no registry match (reconcile skips)',
  ministry_would_change: 'Ministry: will update to registry name',
  unknown_state_department: 'State department: no registry match (reconcile skips)',
  state_department_would_change: 'State department: will update to registry name',
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
      label: `${ministry} / ${stateDepartment}`,
      sortTier: 1,
    };
  }
  if (ministry) {
    return {
      key: `ministry:${ministry}`,
      label: `${ministry} (ministry only on profile)`,
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
          return { key: `scope-sd:${m}|${sd}`, label: `${m} / ${sd} (org access)`, sortTier: 1 };
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
      return { key: `scope-sd:${m}|${sd}`, label: `${m} / ${sd} (state dept access)`, sortTier: 1 };
    }
    if (st === 'MINISTRY_ALL') {
      const m = (s.ministry || '').trim();
      return { key: `scope-m:${m}`, label: `${m} (ministry access)`, sortTier: 2 };
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
        label: 'All Ministries',
        sortTier: 0,
        description: 'Can access projects across all ministries',
      });
      continue;
    }
    if (s.scopeType === 'MINISTRY_ALL') {
      const m = s.ministry || 'Unspecified Ministry';
      const validMinistry = validMinistryNames.has(normalizeKey(m));
      addGroup({
        key: validMinistry
          ? `access:ministry:${normalizeKey(m)}`
          : `access:invalid-ministry:${normalizeKey(m) || 'unspecified'}`,
        label: validMinistry
          ? `Ministry Level: ${m}`
          : `Invalid Ministry Mapping: ${m}`,
        sortTier: validMinistry ? 1 : 96,
        description: validMinistry
          ? `Can access projects for ministry ${m}`
          : 'Ministry does not exist in ministries table; user may not load projects',
      });
      continue;
    }
    if (s.scopeType === 'STATE_DEPARTMENT_ALL') {
      const m = s.ministry || 'Unspecified Ministry';
      const sd = s.stateDepartment || 'Unspecified State Department';
      const validPair = validDeptPairs.has(`${normalizeKey(m)}|${normalizeKey(sd)}`);
      const validDepartment = validDepartmentNames.has(normalizeKey(sd));
      addGroup({
        key: validPair
          ? `access:state-department:${normalizeKey(m)}|${normalizeKey(sd)}`
          : `access:invalid-state-department:${normalizeKey(m)}|${normalizeKey(sd)}`,
        label: validPair
          ? `State Department Level: ${sd}`
          : `Invalid State Department Mapping: ${sd}`,
        sortTier: validPair ? 2 : 97,
        description: validPair
          ? `Ministry: ${m}`
          : validDepartment
          ? `Department exists but not under ministry ${m}; user may not load projects`
          : 'State department does not exist in departments table; user may not load projects',
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
            ? `Legacy Agency -> State Department: ${mappedStateDept}`
            : `Legacy Agency -> Invalid State Department: ${mappedStateDept}`,
          sortTier: pairOk ? 3 : 97,
          description: pairOk
            ? `Derived from agency mapping (ministry: ${mappedMinistry || '—'})`
            : deptOk
            ? `Derived department exists but not under ministry ${mappedMinistry || '—'}`
            : 'Derived department does not exist in departments table; user may not load projects',
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
        ? 'Has ministry/state profile values but no organization scope rows'
        : 'No organization scope rows configured',
    });
  }

  return groups;
}


function UserManagementPage() {
  const { user, logout, hasPrivilege } = useAuth();
  const isSuperAdmin = isSuperAdminUser(user);
  const isMdaIctAdmin = isMdaIctAdminUser(user);
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [searchParams, setSearchParams] = useSearchParams();
  
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
    agencyId: '',
  });
  const [userFormErrors, setUserFormErrors] = useState({});
  const [showUserFormPasswords, setShowUserFormPasswords] = useState({
    password: false,
    confirmPassword: false,
  });
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const usernameCheckSeqRef = useRef(0);
  const [agencies, setAgencies] = useState([]);
  const [filteredAgencies, setFilteredAgencies] = useState([]);
  const [filteredStateDepartments, setFilteredStateDepartments] = useState([]);
  const [ministries, setMinistries] = useState([]);
  /** GET /ministries?withDepartments=1 — ministry + departments for cascading dropdowns */
  const [ministriesHierarchy, setMinistriesHierarchy] = useState([]);
  const [loadingAgencies, setLoadingAgencies] = useState(false);

  /** Effective organization access (many rows: agency / whole ministry / whole state dept). */
  const [organizationScopes, setOrganizationScopes] = useState([]);
  const [newScopeType, setNewScopeType] = useState('MINISTRY_ALL');
  const [newScopeAgency, setNewScopeAgency] = useState(null);
  const [newScopeMinistry, setNewScopeMinistry] = useState(null);
  const [newScopeStateDept, setNewScopeStateDept] = useState(null);

  /** Standalone dialog: assign org scope without opening full edit form */
  const [openStandaloneOrgDialog, setOpenStandaloneOrgDialog] = useState(false);
  const [standaloneOrgUserId, setStandaloneOrgUserId] = useState(null);
  const [standaloneOrgUsername, setStandaloneOrgUsername] = useState('');
  const [standaloneScopes, setStandaloneScopes] = useState([]);
  const [standaloneNewScopeType, setStandaloneNewScopeType] = useState('MINISTRY_ALL');
  const [standaloneNewAgency, setStandaloneNewAgency] = useState(null);
  const [standaloneNewMinistry, setStandaloneNewMinistry] = useState(null);
  const [standaloneNewStateDept, setStandaloneNewStateDept] = useState(null);
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
    privilegeIds: []
  });
  const [roleFormErrors, setRoleFormErrors] = useState({});
  const [initialRolePrivilegeIds, setInitialRolePrivilegeIds] = useState([]);

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
      setError(err.response?.data?.message || err.message || "Failed to load users.");
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
      const { data } = await axiosInstance.get('/ministries', { params: { withDepartments: '1' } });
      const list = Array.isArray(data) ? data : [];
      setMinistriesHierarchy(list);
      setMinistries(list.map((m) => m.name).filter(Boolean).sort((a, b) => a.localeCompare(b)));
    } catch (err) {
      console.error('Error fetching ministries catalog:', err);
      setMinistriesHierarchy([]);
    }
  }, []);

  useEffect(() => {
    if (openOrgIntegrityDialog && isSuperAdmin) {
      fetchMinistriesCatalog();
    }
  }, [openOrgIntegrityDialog, isSuperAdmin, fetchMinistriesCatalog]);

  // Fetch agencies (implementing agency dropdown still filtered by ministry + state department)
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

  const normalizeOrgText = (v) => String(v || '').trim().toLowerCase();

  // State departments from ministries + departments tables (cascade from selected ministry)
  useEffect(() => {
    const selectedMinistry = String(userFormData.ministry || '').trim();
    if (selectedMinistry) {
      const selectedMinistryNorm = normalizeOrgText(selectedMinistry);
      const row = ministriesHierarchy.find((m) =>
        normalizeOrgText(m?.name) === selectedMinistryNorm ||
        normalizeOrgText(m?.alias) === selectedMinistryNorm
      );

      let names = (row?.departments || [])
        .map((d) => String(d?.name || d?.departmentName || '').trim())
        .filter(Boolean);

      // Fallback: if hierarchy row has no departments, derive from agency records.
      if (names.length === 0) {
        names = agencies
          .filter((a) => normalizeOrgText(a?.ministry) === selectedMinistryNorm)
          .map((a) => String(a?.state_department || a?.stateDepartment || '').trim())
          .filter(Boolean);
      }

      names = [...new Set(names)].sort((a, b) => a.localeCompare(b));
      if (userFormData.stateDepartment && !names.includes(userFormData.stateDepartment)) {
        names = [...names, userFormData.stateDepartment].sort((a, b) => a.localeCompare(b));
      }
      setFilteredStateDepartments(names);

      if (userFormData.agencyId) {
        const selectedAgency = agencies.find((a) => a.id === userFormData.agencyId || a.agencyId === userFormData.agencyId);
        if (!selectedAgency || normalizeOrgText(selectedAgency.ministry) !== selectedMinistryNorm) {
          setUserFormData((prev) => ({ ...prev, agencyId: '' }));
        }
      }
    } else {
      setFilteredStateDepartments([]);
      setUserFormData((prev) => ({ ...prev, stateDepartment: '', agencyId: '' }));
    }
  }, [userFormData.ministry, userFormData.stateDepartment, ministriesHierarchy, agencies]);

  // Filter agencies when state department changes
  useEffect(() => {
    if (userFormData.ministry && userFormData.stateDepartment) {
      const filtered = agencies.filter(agency => 
        agency.ministry && agency.ministry.toLowerCase() === userFormData.ministry.toLowerCase() &&
        (agency.state_department || agency.stateDepartment)?.toLowerCase() === userFormData.stateDepartment.toLowerCase()
      );
      setFilteredAgencies(filtered);
      
      // Clear agency if current selection doesn't match the state department
      if (userFormData.agencyId) {
        const selectedAgency = agencies.find(a => (a.id === userFormData.agencyId || a.agencyId === userFormData.agencyId));
        if (!selectedAgency || 
            selectedAgency.ministry?.toLowerCase() !== userFormData.ministry.toLowerCase() ||
            (selectedAgency.state_department || selectedAgency.stateDepartment)?.toLowerCase() !== userFormData.stateDepartment.toLowerCase()) {
          setUserFormData(prev => ({ ...prev, agencyId: '' }));
        }
      }
    } else {
      setFilteredAgencies([]);
      if (!userFormData.stateDepartment) {
        setUserFormData(prev => ({ ...prev, agencyId: '' }));
      }
    }
  }, [userFormData.ministry, userFormData.stateDepartment, agencies]);

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
    setOrganizationScopes([]);
    setNewScopeType('MINISTRY_ALL');
    setNewScopeAgency(null);
    setNewScopeMinistry(null);
    setNewScopeStateDept(null);
    setUserFormData({
      username: '', email: '', phoneNumber: '', password: 'reset123', confirmPassword: 'reset123', firstName: '', lastName: '',
      idNumber: '', employeeNumber: '',
      role: roles.length > 0 ? roles[0].roleName : '',
      ministry: '',
      stateDepartment: '',
      agencyId: '',
    });
    setUserFormErrors({});
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
          Ministry: u.ministry ?? '',
          'State department': u.stateDepartment ?? u.state_department ?? '',
          'Agency ID': u.agencyId ?? u.agency_id ?? '',
          'Agency name': u.agencyName ?? u.agency_name ?? '',
          'Organization access': organizationScopesToExcelString(u.organizationScopes),
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
    setNewScopeType('MINISTRY_ALL');
    setNewScopeAgency(null);
    setNewScopeMinistry(null);
    setNewScopeStateDept(null);
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
      ministry: userItem.ministry || '',
      stateDepartment: userItem.stateDepartment || userItem.state_department || '',
      agencyId: userItem.agencyId || userItem.agency_id || '',
    });
    setUserFormErrors({});
    setIsCheckingUsername(false);
    setOpenUserDialog(true);
    try {
      const full = await apiService.getUserById(userItem.userId);
      setOrganizationScopes(Array.isArray(full.organizationScopes) ? full.organizationScopes : []);
    } catch (err) {
      console.warn('Could not load organization scopes:', err);
    }
  };

  const standaloneScopeStateDepartments = useMemo(() => {
    if (!standaloneNewMinistry) return [];
    const selectedMinistryNorm = normalizeOrgText(standaloneNewMinistry);
    const row = ministriesHierarchy.find((m) =>
      normalizeOrgText(m?.name) === selectedMinistryNorm ||
      normalizeOrgText(m?.alias) === selectedMinistryNorm
    );

    let names = (row?.departments || [])
      .map((d) => String(d?.name || d?.departmentName || '').trim())
      .filter(Boolean);

    if (names.length === 0) {
      names = agencies
        .filter((a) => normalizeOrgText(a?.ministry) === selectedMinistryNorm)
        .map((a) => String(a?.state_department || a?.stateDepartment || '').trim())
        .filter(Boolean);
    }

    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [agencies, ministriesHierarchy, standaloneNewMinistry]);

  const handleOpenStandaloneOrgDialog = async (row) => {
    if (!hasPrivilege('user.update')) {
      setSnackbar({ open: true, message: 'Permission denied to edit organization access.', severity: 'error' });
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
    setStandaloneNewScopeType('MINISTRY_ALL');
    setStandaloneNewAgency(null);
    setStandaloneNewMinistry(null);
    setStandaloneNewStateDept(null);
    setStandaloneScopes([]);
    setOpenStandaloneOrgDialog(true);
    try {
      const full = await apiService.getUserById(row.userId);
      setStandaloneScopes(Array.isArray(full.organizationScopes) ? full.organizationScopes : []);
    } catch (err) {
      console.warn('Could not load organization scopes:', err);
      setSnackbar({ open: true, message: 'Could not load organization scopes for this user.', severity: 'error' });
    }
  };

  const handleCloseStandaloneOrgDialog = () => {
    setOpenStandaloneOrgDialog(false);
    setStandaloneOrgUserId(null);
    setStandaloneOrgUsername('');
    setStandaloneScopes([]);
    setStandaloneSaving(false);
  };

  const handleAddStandaloneScope = () => {
    if (standaloneNewScopeType === 'ALL_MINISTRIES') {
      setStandaloneScopes([{ scopeType: 'ALL_MINISTRIES' }]);
    } else if (standaloneNewScopeType === 'MINISTRY_ALL') {
      const m = (standaloneNewMinistry || '').trim();
      if (!m) {
        setSnackbar({ open: true, message: 'Select or enter a ministry.', severity: 'warning' });
        return;
      }
      setStandaloneScopes([{ scopeType: 'MINISTRY_ALL', ministry: m }]);
    } else {
      const m = (standaloneNewMinistry || '').trim();
      const sd = (standaloneNewStateDept || '').trim();
      if (!m || !sd) {
        setSnackbar({ open: true, message: 'Select ministry and state department.', severity: 'warning' });
        return;
      }
      setStandaloneScopes([{ scopeType: 'STATE_DEPARTMENT_ALL', ministry: m, stateDepartment: sd }]);
    }
    setStandaloneNewAgency(null);
  };

  const handleRemoveStandaloneScope = (index) => {
    setStandaloneScopes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveStandaloneOrgScopes = async () => {
    if (!standaloneOrgUserId) return;
    setStandaloneSaving(true);
    try {
      const payload = standaloneScopes.map((s) => {
        if (s.scopeType === 'AGENCY') return null;
        if (s.scopeType === 'ALL_MINISTRIES') return { scopeType: 'ALL_MINISTRIES' };
        if (s.scopeType === 'MINISTRY_ALL') return { scopeType: 'MINISTRY_ALL', ministry: s.ministry };
        return {
          scopeType: 'STATE_DEPARTMENT_ALL',
          ministry: s.ministry,
          stateDepartment: s.stateDepartment || s.state_department,
        };
      }).filter(Boolean);
      await apiService.updateUser(standaloneOrgUserId, { organizationScopes: payload });
      setSnackbar({ open: true, message: 'Organization access updated.', severity: 'success' });
      handleCloseStandaloneOrgDialog();
      fetchUsers(showPendingOnly);
    } catch (err) {
      console.error(err);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save organization access.',
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
    setOrganizationScopes([]);
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
    if (s.scopeType === 'ALL_MINISTRIES') return 'All Ministries';
    if (s.scopeType === 'MINISTRY_ALL') {
      const m = String(s.ministry || '').trim();
      if (m === '*' || m.toUpperCase() === 'ALL') return 'All Ministries';
      return `Ministry: ${m || '—'}`;
    }
    return `State Department: ${s.ministry || '—'} / ${s.stateDepartment || '—'}`;
  };

  const handleAddOrganizationScope = () => {
    if (newScopeType === 'ALL_MINISTRIES') {
      setOrganizationScopes([{ scopeType: 'ALL_MINISTRIES' }]);
    } else if (newScopeType === 'MINISTRY_ALL') {
      const m = (newScopeMinistry || '').trim();
      if (!m) {
        setSnackbar({ open: true, message: 'Select a ministry.', severity: 'warning' });
        return;
      }
      setOrganizationScopes([{ scopeType: 'MINISTRY_ALL', ministry: m }]);
    } else {
      const m = (newScopeMinistry || '').trim();
      const sd = (newScopeStateDept || '').trim();
      if (!m || !sd) {
        setSnackbar({ open: true, message: 'Select ministry and state department.', severity: 'warning' });
        return;
      }
      setOrganizationScopes([{ scopeType: 'STATE_DEPARTMENT_ALL', ministry: m, stateDepartment: sd }]);
    }
    setNewScopeAgency(null);
  };

  const handleRemoveOrganizationScope = (index) => {
    setOrganizationScopes((prev) => prev.filter((_, i) => i !== index));
  };

  const scopeBuilderStateDepartments = useMemo(() => {
    if (!newScopeMinistry) return [];
    const selectedMinistryNorm = normalizeOrgText(newScopeMinistry);
    const row = ministriesHierarchy.find((m) =>
      normalizeOrgText(m?.name) === selectedMinistryNorm ||
      normalizeOrgText(m?.alias) === selectedMinistryNorm
    );

    let names = (row?.departments || [])
      .map((d) => String(d?.name || d?.departmentName || '').trim())
      .filter(Boolean);

    if (names.length === 0) {
      names = agencies
        .filter((a) => normalizeOrgText(a?.ministry) === selectedMinistryNorm)
        .map((a) => String(a?.state_department || a?.stateDepartment || '').trim())
        .filter(Boolean);
    }

    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [agencies, ministriesHierarchy, newScopeMinistry]);

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
    setUserFormData(prev => {
      if (name === 'password' && currentUserToEdit) {
        // Edit mode: keep confirm password in sync so users don't need to retype it.
        return { ...prev, password: value, confirmPassword: value };
      }
      return { ...prev, [name]: value };
    });
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

  useEffect(() => {
    if (!openUserDialog || !currentUserToEdit || !isSuperAdmin) return;
    const typed = String(userFormData.username || '').trim();
    const original = String(currentUserToEdit.username || '').trim();
    if (!typed || typed.toLowerCase() === original.toLowerCase()) {
      setIsCheckingUsername(false);
      setUserFormErrors((prev) => {
        if (!prev.username) return prev;
        const { username, ...rest } = prev;
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
      } catch (_err) {
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

  const validateUserForm = () => {
    let errors = {};
    const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
    if (!userFormData.username.trim()) errors.username = 'Username is required.';
    if (!userFormData.email.trim()) errors.email = 'Email is required.';
    if (!/\S+@\S+\.\S+/.test(userFormData.email)) errors.email = 'Email is invalid.';
    if (userFormData.phoneNumber && !phoneRegex.test(userFormData.phoneNumber.trim())) {
      errors.phoneNumber = 'Use 07XXXXXXXX or +2547XXXXXXXX';
    }

    if (!currentUserToEdit) {
        // For new users, password is required
        if (!userFormData.password.trim()) errors.password = 'Password is required for new users.';
        else if (userFormData.password.trim().length < 6) errors.password = 'Password must be at least 6 characters.';

        if (!userFormData.confirmPassword.trim()) errors.confirmPassword = 'Please confirm your password.';
        else if (userFormData.password !== userFormData.confirmPassword) errors.confirmPassword = 'Passwords do not match.';

        if (!userFormData.firstName.trim()) errors.firstName = 'First Name is required.';
        if (!userFormData.lastName.trim()) errors.lastName = 'Last Name is required.';
    } else {
        // For existing users, only validate password if it's being changed
        if (userFormData.password.trim()) {
            if (userFormData.password.trim().length < 6) errors.password = 'Password must be at least 6 characters.';
            if (!userFormData.confirmPassword.trim()) errors.confirmPassword = 'Please confirm your password.';
            else if (userFormData.password !== userFormData.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
        }
    }

    setUserFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUserSubmit = async () => {
    if (!validateUserForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    if (isCheckingUsername) {
      setSnackbar({ open: true, message: 'Please wait for username validation to finish.', severity: 'warning' });
      return;
    }
    if (currentUserToEdit && isSuperAdmin) {
      const typed = String(userFormData.username || '').trim();
      const original = String(currentUserToEdit.username || '').trim();
      if (typed && typed.toLowerCase() !== original.toLowerCase()) {
        try {
          const result = await apiService.checkUsernameAvailability(typed, currentUserToEdit.userId);
          if (!result?.available) {
            setUserFormErrors((prev) => ({ ...prev, username: 'This username is already taken.' }));
            setSnackbar({ open: true, message: 'Username is already taken.', severity: 'error' });
            return;
          }
        } catch (_err) {
          setUserFormErrors((prev) => ({ ...prev, username: 'Could not verify username availability right now.' }));
          setSnackbar({ open: true, message: 'Unable to verify username availability. Try again.', severity: 'error' });
          return;
        }
      }
    }

    setLoading(true);
    try {
      // Convert role name to roleId for backend
      const selectedRole = assignableRoles.find(role => role.roleName === userFormData.role) || roles.find(role => role.roleName === userFormData.role);
      const dataToSend = {
        ...userFormData,
        roleId: selectedRole ? selectedRole.roleId : null,
        agency_id: userFormData.agencyId || null,
        state_department: userFormData.stateDepartment || null,
        organizationScopes: organizationScopes.map((s) => {
          if (s.scopeType === 'AGENCY') {
            return null;
          }
          if (s.scopeType === 'ALL_MINISTRIES') {
            return { scopeType: 'ALL_MINISTRIES' };
          }
          if (s.scopeType === 'MINISTRY_ALL') {
            return { scopeType: 'MINISTRY_ALL', ministry: s.ministry };
          }
          return {
            scopeType: 'STATE_DEPARTMENT_ALL',
            ministry: s.ministry,
            stateDepartment: s.stateDepartment || s.state_department,
          };
        }).filter(Boolean),
      };
      
      // Remove fields that backend doesn't expect
      delete dataToSend.role;
      delete dataToSend.confirmPassword;
      delete dataToSend.agencyId;
      delete dataToSend.stateDepartment;

      // Editing organization profile fields on existing users is restricted to Super Admin.
      if (currentUserToEdit && !isSuperAdmin) {
        delete dataToSend.ministry;
        delete dataToSend.state_department;
        delete dataToSend.agency_id;
      }
      // Agency is not editable in Edit User, so never send it on update.
      if (currentUserToEdit) {
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

  const handleResendCredentialsEmail = async (targetRow) => {
    if (!isSuperAdmin) {
      setSnackbar({ open: true, message: 'Only Super Admin can resend credentials email.', severity: 'warning' });
      return;
    }

    const username = targetRow?.username || 'this user';
    const confirmed = window.confirm(`Resend login credentials email to ${username}?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await apiService.resendUserCredentials(targetRow.userId);
      setSnackbar({
        open: true,
        message: result?.message || `Credentials email sent to ${username}.`,
        severity: 'success',
      });
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
    setRoleFormData({ roleName: '', description: '', privilegeIds: [] });
    setRoleFormErrors({});
    setInitialRolePrivilegeIds([]);
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
      privilegeIds: []
    });
    setRoleFormErrors({});

    try {
      const rolePrivileges = await apiService.getRolePrivileges(role.roleId);
      const rows = Array.isArray(rolePrivileges) ? rolePrivileges : [];
      const currentPrivilegeIds = [...new Set(
        rows.map((rp) => rp.privilegeId ?? rp.privilege_id).filter((id) => id != null).map((id) => String(id))
      )];
      setRoleFormData(prev => ({ ...prev, privilegeIds: currentPrivilegeIds }));
      setInitialRolePrivilegeIds(currentPrivilegeIds);
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
    setInitialRolePrivilegeIds([]);
  };

  const handleRoleFormChange = (e) => {
    const { name, value } = e.target;
    setRoleFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateRoleForm = () => {
    let errors = {};
    if (!roleFormData.roleName.trim()) errors.roleName = 'Role Name is required.';
    setRoleFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const synchronizeAssociations = async (parentId, currentIds, newIds, addFn, removeFn, type = 'item') => {
    const idsToAdd = newIds.filter(id => !currentIds.includes(id));
    const idsToRemove = currentIds.filter(id => !newIds.includes(id));

    const results = await Promise.allSettled([
        ...idsToAdd.map(async (id) => {
            try {
                await addFn(parentId, id);
                return { status: 'fulfilled', value: `Added ${type} ID ${id}` };
            } catch (error) {
                console.error(`Failed to add ${type} ID ${id}:`, error);
                return { status: 'rejected', reason: `Failed to add ${type} ID ${id}: ${error.message}` };
            }
        }),
        ...idsToRemove.map(async (id) => {
            try {
                await removeFn(parentId, id);
                return { status: 'fulfilled', value: `Removed ${type} ID ${id}` };
            } catch (error) {
                console.error(`Failed to remove ${type} ID ${id}:`, error);
                return { status: 'rejected', reason: `Failed to remove ${type} ID ${id}: ${error.message}` };
            }
        })
    ]);

    const failedOperations = results.filter(result => result.status === 'rejected');
    if (failedOperations.length > 0) {
        const messages = failedOperations.map(f => f.reason).join('; ');
        throw new Error(`Some ${type} associations failed: ${messages}`);
    }
  };

  const handleRoleSubmit = async () => {
    if (!validateRoleForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }

    setLoading(true);
    let roleId = currentRoleToEdit ? currentRoleToEdit.roleId : null;
    const roleDataToSubmit = { ...roleFormData };
    const privilegeIdsToAssign = roleDataToSubmit.privilegeIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    delete roleDataToSubmit.privilegeIds;

    try {
      if (currentRoleToEdit) {
        if (!hasPrivilege('role.update')) {
          setSnackbar({ open: true, message: 'Permission denied to update role.', severity: 'error' });
          setLoading(false);
          return;
        }
        await apiService.updateRole(roleId, roleDataToSubmit);
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
        console.log('Created role response:', createdRole);
        if (!createdRole || !createdRole.roleId) {
          throw new Error('Role creation succeeded but did not return a valid role ID');
        }
        roleId = createdRole.roleId;
        setSnackbar({ open: true, message: 'Role created successfully!', severity: 'success' });
      }

      if (roleId) {
        await synchronizeAssociations(
          roleId,
          initialRolePrivilegeIds.map(id => parseInt(id, 10)),
          privilegeIdsToAssign,
          apiService.createRolePrivilege,
          apiService.deleteRolePrivilege,
          'privilege'
        );
      }

      handleCloseRoleDialog();
      fetchRoles();
      fetchUsers();
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
      fetchUsers();
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
        const { privilegeId, ...updatedFields } = privilegeFormData;
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
        user.agencyName || user.agency_name || '',
        user.agencyId != null && user.agencyId !== '' ? String(user.agencyId) : '',
        user.agency_id != null && user.agency_id !== '' ? String(user.agency_id) : '',
        ...scopeStrings,
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
      flex: 1,
      minWidth: 170,
      renderCell: ({ row: { role } }) => {
        const roleColors = {
          'admin': colors.redAccent[600],
          'manager': colors.blueAccent[600],
          'data_entry': colors.orange?.[600] || colors.yellowAccent[600],
          'viewer': colors.greenAccent[600],
          'project_lead': colors.purple?.[600] || colors.blueAccent[700],
        };
        return (
          <Box
            width="fit-content"
            maxWidth="100%"
            m="0 auto"
            p="6px 12px"
            display="inline-flex"
            justifyContent="center"
            alignItems="center"
            backgroundColor={roleColors[role?.toLowerCase()] || colors.grey[600]}
            borderRadius="6px"
            sx={{ boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            <Typography color={colors.grey[100]} sx={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'capitalize' }}>
              {role || 'N/A'}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "isActive",
      headerName: "Status",
      width: 130,
      minWidth: 130,
      headerAlign: 'center',
      align: 'center',
      renderCell: ({ row }) => {
        const { isActive, userId, username } = row;
        const canToggle =
          hasPrivilege('user.update') &&
          userId !== user.id &&
          canMdaIctAdminMutateUser(user, row);
        return (
          <Box
            m="0 auto"
            p="6px 12px"
            display="inline-flex"
            justifyContent="center"
            alignItems="center"
            gap={0.5}
            backgroundColor={isActive ? colors.greenAccent[600] : colors.redAccent[600]}
            borderRadius="6px"
            sx={{
              cursor: canToggle ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              minWidth: 'fit-content',
              whiteSpace: 'nowrap',
              '&:hover': canToggle ? {
                transform: 'scale(1.08)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                backgroundColor: isActive ? colors.redAccent[500] : colors.greenAccent[500]
              } : {}
            }}
            onClick={() => { if (canToggle) handleToggleUserStatus(row); }}
            title={
              canToggle
                ? `Click to ${isActive ? 'disable' : 'enable'} user`
                : !hasPrivilege('user.update') || userId === user.id
                  ? isActive
                    ? 'Active'
                    : 'Disabled'
                  : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
            }
          >
            {isActive ? <CheckCircleIcon sx={{ color: colors.grey[100], fontSize: '18px' }} /> : <BlockIcon sx={{ color: colors.grey[100], fontSize: '18px' }} />}
            <Typography color={colors.grey[100]} sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {isActive ? 'Active' : 'Disabled'}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 208,
      sortable: false,
      filterable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => {
        const isCurrentUser = params.row.userId === user.id;
        return (
          <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center" flexWrap="wrap">
            <IconButton
              size="small"
              sx={{
                color: colors.grey[100],
                backgroundColor: colors.greenAccent[700],
                '&:hover': { backgroundColor: colors.greenAccent[600], transform: 'scale(1.1)' },
                transition: 'all 0.2s ease'
              }}
              onClick={() => handleOpenViewDetails(params.row)}
              title="View details"
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
            {hasPrivilege('user.update') && (
              <IconButton
                size="small"
                disabled={!canMdaIctAdminMutateUser(user, params.row)}
                sx={{
                  color: colors.grey[100],
                  backgroundColor: colors.purple?.[700] || colors.blueAccent[800],
                  '&:hover': canMdaIctAdminMutateUser(user, params.row)
                    ? { backgroundColor: colors.purple?.[600] || colors.blueAccent[700], transform: 'scale(1.1)' }
                    : {},
                  transition: 'all 0.2s ease',
                  opacity: canMdaIctAdminMutateUser(user, params.row) ? 1 : 0.45,
                }}
                onClick={() => canMdaIctAdminMutateUser(user, params.row) && handleOpenStandaloneOrgDialog(params.row)}
                title={
                  canMdaIctAdminMutateUser(user, params.row)
                    ? 'Organization access — which agencies & ministries this user may see'
                    : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
                }
              >
                <AccountTreeIcon fontSize="small" />
              </IconButton>
            )}
            {hasPrivilege('user.update') && (
              <IconButton
                size="small"
                disabled={isCurrentUser || !canMdaIctAdminMutateUser(user, params.row)}
                sx={{
                  color: colors.grey[100],
                  backgroundColor: colors.blueAccent[700],
                  '&:hover':
                    !isCurrentUser && canMdaIctAdminMutateUser(user, params.row)
                      ? { backgroundColor: colors.blueAccent[600], transform: 'scale(1.1)' }
                      : {},
                  transition: 'all 0.2s ease',
                  opacity: isCurrentUser || !canMdaIctAdminMutateUser(user, params.row) ? 0.5 : 1,
                }}
                onClick={() =>
                  !isCurrentUser &&
                  canMdaIctAdminMutateUser(user, params.row) &&
                  handleOpenResetPasswordDialog(params.row)
                }
                title={
                  isCurrentUser
                    ? 'Use profile to change your password'
                    : !canMdaIctAdminMutateUser(user, params.row)
                      ? MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
                      : 'Reset Password to reset123'
                }
              >
                <LockResetIcon fontSize="small" />
              </IconButton>
            )}
            {isSuperAdmin && hasPrivilege('user.delete') && (
              <IconButton
                size="small"
                disabled={isCurrentUser}
                sx={{
                  color: colors.grey[100],
                  backgroundColor: colors.redAccent[700],
                  '&:hover': !isCurrentUser ? { backgroundColor: colors.redAccent[600], transform: 'scale(1.1)' } : {},
                  transition: 'all 0.2s ease',
                  opacity: isCurrentUser ? 0.5 : 1,
                }}
                onClick={() => !isCurrentUser && handleOpenDeleteConfirmDialog(params.row.userId, params.row.username)}
                title={
                  isCurrentUser
                    ? 'You cannot delete your own account'
                    : 'Delete User (Super Admin only)'
                }
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
            {isSuperAdmin && hasPrivilege('user.update') && (
              <IconButton
                size="small"
                disabled={!params.row?.email}
                sx={{
                  color: colors.grey[100],
                  backgroundColor: colors.greenAccent[800],
                  '&:hover': params.row?.email ? { backgroundColor: colors.greenAccent[700], transform: 'scale(1.1)' } : {},
                  transition: 'all 0.2s ease',
                  opacity: params.row?.email ? 1 : 0.45,
                }}
                onClick={() => params.row?.email && handleResendCredentialsEmail(params.row)}
                title={params.row?.email ? 'Resend login credentials email (Super Admin only)' : 'User has no email address'}
              >
                <SecurityIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        );
      },
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
          backgroundColor={colors.redAccent[700]}
          borderRadius="6px"
        >
          <Typography color={colors.grey[100]} sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
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
        <IconButton
          size="small"
          sx={{
            color: colors.grey[100],
            backgroundColor: colors.greenAccent[700],
            '&:hover': { backgroundColor: colors.greenAccent[600], transform: 'scale(1.1)' },
            transition: 'all 0.2s ease'
          }}
          onClick={() => handleRestoreVoidedUser(params.row.userId, params.row.username)}
          title="Restore user"
        >
          <CheckCircleIcon fontSize="small" />
        </IconButton>
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
        <Stack direction="row" spacing={1}>
          {hasPrivilege('role.update') && (
            <IconButton sx={{ color: colors.grey[100] }} onClick={() => handleOpenEditRoleDialog(params.row)}>
              <EditIcon />
            </IconButton>
          )}
          {hasPrivilege('role.delete') && (
            <IconButton sx={{ color: colors.redAccent[500] }} onClick={() => handleOpenDeleteRoleConfirm(params.row.roleId, params.row.roleName)}>
              <DeleteIcon />
            </IconButton>
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
        <Stack direction="row" spacing={1}>
          {hasPrivilege('privilege.update') && (
            <IconButton sx={{ color: colors.grey[100] }} onClick={() => handleOpenEditPrivilegeDialog(params.row)}>
              <EditIcon />
            </IconButton>
          )}
          {hasPrivilege('privilege.delete') && (
            <IconButton sx={{ color: colors.redAccent[500] }} onClick={() => handleOpenDeletePrivilegeConfirm(params.row.privilegeId, params.row.privilegeName)}>
              <DeleteIcon />
            </IconButton>
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
                placeholder="Search users by name, email, role, ministry, agency, state department, or org access…"
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
              ? 'Users are grouped by effective access scope, including invalid ministry/department mappings and legacy agency-derived mappings. Search above still filters this list.'
              : 'Grouped by ministry and state department (agency is not used as a section). Expand a section to see users. Search above still filters this list.'}
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
                        <Chip
                          label={row.role || '—'}
                          size="small"
                          sx={{
                            flexShrink: 0,
                            height: 22,
                            fontSize: '0.7rem',
                            textTransform: 'capitalize',
                            width: 'fit-content',
                            maxWidth: 'none',
                            '& .MuiChip-label': { px: 1.1 },
                          }}
                        />
                        <Box
                          onClick={() => { if (canToggle) handleToggleUserStatus(row); }}
                          sx={{
                            cursor: canToggle ? 'pointer' : 'default',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            px: 1,
                            py: 0.25,
                            borderRadius: '6px',
                            backgroundColor: row.isActive ? colors.greenAccent[700] : colors.redAccent[700],
                          }}
                          title={
                            canToggle
                              ? `Click to ${row.isActive ? 'disable' : 'enable'}`
                              : !hasPrivilege('user.update') || isCurrentUser
                                ? row.isActive
                                  ? 'Active'
                                  : 'Disabled'
                                : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
                          }
                        >
                          {row.isActive ? (
                            <CheckCircleIcon sx={{ color: colors.grey[100], fontSize: '16px' }} />
                          ) : (
                            <BlockIcon sx={{ color: colors.grey[100], fontSize: '16px' }} />
                          )}
                          <Typography sx={{ color: colors.grey[100], fontSize: '0.75rem', fontWeight: 600 }}>
                            {row.isActive ? 'Active' : 'Disabled'}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0, ml: { xs: 0, sm: 'auto' } }}>
                          <IconButton size="small" sx={{ color: colors.grey[100] }} onClick={() => handleOpenViewDetails(row)} title="View details">
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                          {hasPrivilege('user.update') && user.id !== row.userId && (
                            <IconButton
                              size="small"
                              disabled={!canMdaIctAdminMutateUser(user, row)}
                              sx={{ color: colors.blueAccent[400] }}
                              onClick={() => canMdaIctAdminMutateUser(user, row) && handleOpenResetPasswordDialog(row)}
                              title={
                                canMdaIctAdminMutateUser(user, row)
                                  ? 'Reset password'
                                  : MDA_ICT_ADMIN_CANNOT_MUTATE_USER_MESSAGE
                              }
                            >
                              <LockResetIcon fontSize="small" />
                            </IconButton>
                          )}
                          {isSuperAdmin && hasPrivilege('user.delete') && (
                            <IconButton
                              size="small"
                              disabled={isCurrentUser}
                              sx={{ color: colors.redAccent[400] }}
                              onClick={() => !isCurrentUser && handleOpenDeleteConfirmDialog(row.userId, row.username)}
                              title={isCurrentUser ? 'You cannot delete your own account' : 'Delete (Super Admin only)'}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                          {isSuperAdmin && hasPrivilege('user.update') && (
                            <IconButton
                              size="small"
                              disabled={!row?.email}
                              sx={{ color: colors.greenAccent[400] }}
                              onClick={() => row?.email && handleResendCredentialsEmail(row)}
                              title={row?.email ? 'Resend login credentials email (Super Admin only)' : 'User has no email address'}
                            >
                              <SecurityIcon fontSize="small" />
                            </IconButton>
                          )}
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
              minHeight: '42px !important',
              maxHeight: '42px !important',
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
            rowHeight={42}
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
            const roleColors = {
              admin: colors.redAccent[600],
              manager: colors.blueAccent[600],
              data_entry: colors.orange?.[600] || colors.yellowAccent?.[600],
              viewer: colors.greenAccent[600],
              project_lead: colors.purple?.[600] || colors.blueAccent[700],
            };
            const roleBg = roleColors[u.role?.toLowerCase()] || colors.grey[600];
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
                          backgroundColor: u.isActive ? colors.greenAccent[600] : colors.redAccent[600],
                          color: colors.grey[100],
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                      {u.role && (
                        <Chip
                          size="small"
                          label={u.role}
                          sx={{
                            height: 22,
                            backgroundColor: roleBg,
                            color: colors.grey[100],
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            textTransform: 'capitalize',
                            '& .MuiChip-label': { px: 1 },
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
                  <DetailRow label="Ministry" value={u.ministry} />
                  <DetailRow label="State Dept." value={u.stateDepartment || u.state_department} />
                  <DetailRow label="Agency" value={u.agencyName} />
                </Grid>
                {Array.isArray(u.organizationScopes) && u.organizationScopes.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
                      Organization access scope
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
          <Alert severity="info" icon={<AccountTreeIcon />} sx={{ mb: 2 }}>
            <strong>Organization access</strong> is configured below (scroll down) or use the purple tree icon in the user table for a dedicated window.
            Empty list on create uses the primary state department as the only scope.
          </Alert>
          <TextField 
            autoFocus 
            margin="dense" 
            name="username" 
            label="Username" 
            type="text" 
            fullWidth 
            variant="outlined" 
            value={userFormData.username} 
            onChange={handleUserFormChange} 
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
            value={userFormData.email} 
            onChange={handleUserFormChange} 
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
            value={userFormData.phoneNumber} 
            onChange={handleUserFormChange} 
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
          <TextField 
            margin="dense" 
            name="firstName" 
            label="First Name" 
            type="text" 
            fullWidth 
            variant="outlined" 
            value={userFormData.firstName} 
            onChange={handleUserFormChange} 
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
            value={userFormData.lastName} 
            onChange={handleUserFormChange} 
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
            value={userFormData.idNumber} 
            onChange={handleUserFormChange} 
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
            value={userFormData.employeeNumber} 
            onChange={handleUserFormChange} 
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
              <TextField 
                margin="dense" 
                name="confirmPassword" 
                label="Confirm Password" 
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
          </FormControl>
          <Autocomplete
            fullWidth
            options={ministries}
            value={userFormData.ministry || null}
            onChange={(event, newValue) => {
              setUserFormData(prev => ({ 
                ...prev, 
                ministry: newValue || '',
                stateDepartment: '', // Clear state department when ministry changes
                agencyId: '' // Clear agency when ministry changes
              }));
              setUserFormErrors(prev => ({ ...prev, ministry: '', stateDepartment: '', agencyId: '' }));
            }}
            loading={loadingAgencies}
            disabled={!!currentUserToEdit && !isSuperAdmin}
            renderInput={(params) => (
              <TextField
                {...params}
                margin="dense"
                label="Ministry"
                required
                error={!!userFormErrors.ministry}
                helperText={userFormErrors.ministry || 'Select the ministry'}
                sx={{ 
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#ffffff',
                    borderRadius: 1.5,
                  },
                }}
              />
            )}
          />
          <Autocomplete
            fullWidth
            options={filteredStateDepartments}
            value={userFormData.stateDepartment || null}
            onChange={(event, newValue) => {
              setUserFormData(prev => ({ 
                ...prev, 
                stateDepartment: newValue || '',
                agencyId: '' // Clear agency when state department changes
              }));
              setUserFormErrors(prev => ({ ...prev, stateDepartment: '', agencyId: '' }));
            }}
            loading={loadingAgencies}
            disabled={(!!currentUserToEdit && !isSuperAdmin) || !userFormData.ministry}
            renderInput={(params) => (
              <TextField
                {...params}
                margin="dense"
                label="State Department"
                required
                error={!!userFormErrors.stateDepartment}
                helperText={userFormErrors.stateDepartment || (userFormData.ministry ? 'Select the state department' : 'Please select a ministry first')}
                sx={{ 
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#ffffff',
                    borderRadius: 1.5,
                  },
                }}
              />
            )}
          />
          {!currentUserToEdit && (
            <Autocomplete
              fullWidth
              options={filteredAgencies}
              value={filteredAgencies.find(agency => 
                (agency.id === userFormData.agencyId || agency.agencyId === userFormData.agencyId)
              ) || null}
              getOptionLabel={(option) => option.agency_name || option.agencyName || ''}
              onChange={(event, newValue) => {
                const agencyId = newValue ? (newValue.id || newValue.agencyId) : '';
                setUserFormData(prev => ({ ...prev, agencyId }));
                setUserFormErrors(prev => ({ ...prev, agencyId: '' }));
              }}
              loading={loadingAgencies}
              disabled={!userFormData.ministry || !userFormData.stateDepartment}
              renderInput={(params) => (
                <TextField
                  {...params}
                  margin="dense"
                  label="Agency (optional)"
                  error={!!userFormErrors.agencyId}
                  helperText={userFormErrors.agencyId || (userFormData.ministry && userFormData.stateDepartment ? 'Select the agency if applicable' : 'Please select a ministry and state department first')}
                  sx={{ 
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: '#ffffff',
                      borderRadius: 1.5,
                    },
                  }}
                />
              )}
            />
          )}

          <Typography id="user-org-scope-section" variant="subtitle2" sx={{ color: colors.blueAccent[300], fontWeight: 700, mb: 1, mt: 1 }}>
            Organization access (projects &amp; directories)
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: colors.grey[300], mb: 1.5 }}>
            Choose one access mode: all ministries and departments, one ministry and all its departments, or one ministry and one specific department.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }} alignItems={{ sm: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 200, bgcolor: '#fff', borderRadius: 1 }}>
              <InputLabel>Scope type</InputLabel>
              <Select
                label="Scope type"
                value={newScopeType}
                onChange={(e) => {
                  setNewScopeType(e.target.value);
                  setNewScopeAgency(null);
                  setNewScopeMinistry(null);
                  setNewScopeStateDept(null);
                }}
              >
                <MenuItem value="ALL_MINISTRIES">All Ministries</MenuItem>
                <MenuItem value="MINISTRY_ALL">Ministry</MenuItem>
                <MenuItem value="STATE_DEPARTMENT_ALL">State Department</MenuItem>
              </Select>
            </FormControl>
            {newScopeType === 'ALL_MINISTRIES' && (
              <TextField
                size="small"
                label="All Ministries"
                value="Enabled"
                disabled
                sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
              />
            )}
            {newScopeType === 'MINISTRY_ALL' && (
              <Autocomplete
                sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
                options={ministries}
                value={newScopeMinistry}
                onChange={(_, v) => setNewScopeMinistry(v)}
                renderInput={(params) => <TextField {...params} label="Ministry" margin="dense" size="small" />}
              />
            )}
            {newScopeType === 'STATE_DEPARTMENT_ALL' && (
              <>
                <Autocomplete
                  sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
                  options={ministries}
                  value={newScopeMinistry}
                  onChange={(_, v) => {
                    setNewScopeMinistry(v);
                    setNewScopeStateDept(null);
                  }}
                  renderInput={(params) => <TextField {...params} label="Ministry" margin="dense" size="small" />}
                />
                <Autocomplete
                  sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
                  options={scopeBuilderStateDepartments}
                  value={newScopeStateDept}
                  onChange={(_, v) => setNewScopeStateDept(v)}
                  disabled={!newScopeMinistry}
                  renderInput={(params) => <TextField {...params} label="State department" margin="dense" size="small" />}
                />
              </>
            )}
            <Button variant="outlined" size="small" onClick={handleAddOrganizationScope} sx={{ height: 40 }}>
              Apply access mode
            </Button>
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
            {organizationScopes.map((s, idx) => (
              <Chip
                key={`${s.scopeType}-${idx}-${s.agencyId || s.ministry || ''}`}
                label={scopeRowLabel(s)}
                onDelete={() => handleRemoveOrganizationScope(idx)}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            ))}
            {organizationScopes.length === 0 && (
              <Typography variant="caption" sx={{ color: colors.grey[500], fontStyle: 'italic' }}>
                No organization access rules added yet.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: colors.primary[400] }}>
          <Button onClick={handleCloseUserDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleUserSubmit} color="primary" variant="contained">{currentUserToEdit ? 'Update User' : 'Create User'}</Button>
        </DialogActions>
      </Dialog>

      {/* Organization access only (no full user form) */}
      <Dialog
        open={openStandaloneOrgDialog}
        onClose={handleCloseStandaloneOrgDialog}
        fullWidth
        maxWidth="md"
        scroll="paper"
      >
        <DialogTitle sx={{ backgroundColor: colors.blueAccent[700], color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountTreeIcon />
          Organization access
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
            Choose one access mode: all ministries and departments, one ministry and all its departments, or one ministry and one specific department.
            Users with the <strong>organization.scope_bypass</strong> privilege are not restricted.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }} alignItems={{ sm: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 200, bgcolor: '#fff', borderRadius: 1 }}>
              <InputLabel>Scope type</InputLabel>
              <Select
                label="Scope type"
                value={standaloneNewScopeType}
                onChange={(e) => {
                  setStandaloneNewScopeType(e.target.value);
                  setStandaloneNewAgency(null);
                  setStandaloneNewMinistry(null);
                  setStandaloneNewStateDept(null);
                }}
              >
                <MenuItem value="ALL_MINISTRIES">All Ministries</MenuItem>
                <MenuItem value="MINISTRY_ALL">Ministry</MenuItem>
                <MenuItem value="STATE_DEPARTMENT_ALL">State Department</MenuItem>
              </Select>
            </FormControl>
            {standaloneNewScopeType === 'ALL_MINISTRIES' && (
              <TextField
                size="small"
                label="All Ministries"
                value="Enabled"
                disabled
                sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
              />
            )}
            {standaloneNewScopeType === 'MINISTRY_ALL' && (
              <Autocomplete
                sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
                options={ministries}
                value={standaloneNewMinistry}
                onChange={(_, v) => setStandaloneNewMinistry(v)}
                renderInput={(params) => <TextField {...params} label="Ministry" margin="dense" size="small" />}
              />
            )}
            {standaloneNewScopeType === 'STATE_DEPARTMENT_ALL' && (
              <>
                <Autocomplete
                  sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
                  options={ministries}
                  value={standaloneNewMinistry}
                  onChange={(_, v) => {
                    setStandaloneNewMinistry(v);
                    setStandaloneNewStateDept(null);
                  }}
                  renderInput={(params) => <TextField {...params} label="Ministry" margin="dense" size="small" />}
                />
                <Autocomplete
                  sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { backgroundColor: '#ffffff' } }}
                  options={standaloneScopeStateDepartments}
                  value={standaloneNewStateDept}
                  onChange={(_, v) => setStandaloneNewStateDept(v)}
                  disabled={!standaloneNewMinistry}
                  renderInput={(params) => <TextField {...params} label="State department" margin="dense" size="small" />}
                />
              </>
            )}
            <Button variant="outlined" size="small" onClick={handleAddStandaloneScope} sx={{ height: 40 }}>
              Apply access mode
            </Button>
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
            {standaloneScopes.map((s, idx) => (
              <Chip
                key={`st-${idx}-${s.scopeType}-${s.agencyId || s.ministry || ''}`}
                label={scopeRowLabel(s)}
                onDelete={() => handleRemoveStandaloneScope(idx)}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            ))}
            {standaloneScopes.length === 0 && (
              <Typography variant="caption" sx={{ color: colors.grey[500], fontStyle: 'italic' }}>
                No explicit organization access rules configured.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, backgroundColor: colors.primary[400] }}>
          <Button onClick={handleCloseStandaloneOrgDialog} color="inherit" disabled={standaloneSaving}>
            Cancel
          </Button>
          <Button onClick={handleSaveStandaloneOrgScopes} color="primary" variant="contained" disabled={standaloneSaving || !standaloneOrgUserId}>
            {standaloneSaving ? 'Saving…' : 'Save access'}
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
          <TextField autoFocus={!currentRoleToEdit} margin="dense" name="roleName" label="Role Name" type="text" fullWidth variant="outlined" value={roleFormData.roleName} onChange={handleRoleFormChange} error={!!roleFormErrors.roleName} helperText={roleFormErrors.roleName} disabled={!!currentRoleToEdit} sx={{ mb: 2 }} />
          <TextField margin="dense" name="description" label="Description" type="text" fullWidth variant="outlined" value={roleFormData.description} onChange={handleRoleFormChange} sx={{ mb: 2 }} />
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
            disabled={!currentRoleToEdit && !isSuperAdmin}
          >
            {currentRoleToEdit ? 'Update Role' : 'Create Role'}
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

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default UserManagementPage;