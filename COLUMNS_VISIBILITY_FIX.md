# County and Constituency Columns Visibility Fix

## Problem

The deployed version at `http://102.210.149.119:8081/impes/projects` was missing the **County** and **Constituency** columns that exist in the local version, even though:
- ✅ The columns were defined in `projectTableConfig.js` with `show: true`
- ✅ The file was synced correctly to the server
- ❌ The columns were hidden by default due to missing from `defaultVisibleColumns`

## Root Cause

The `defaultVisibleColumns` array in `ProjectManagementPage.jsx` was missing `countyNames` and `constituencyNames`. Even though the columns were defined in the config file with `show: true`, the component's default visibility logic only showed columns listed in `defaultVisibleColumns`.

**Before:**
```javascript
const defaultVisibleColumns = [
  'projectName',
  'status',
  'costOfProject',
  'overallProgress',
  'departmentName',
  'financialYearName',
  'wardNames', // ✅ Had Ward
  // ❌ Missing countyNames
  // ❌ Missing constituencyNames
  'actions'
];
```

**After:**
```javascript
const defaultVisibleColumns = [
  'projectName',
  'status',
  'costOfProject',
  'overallProgress',
  'departmentName',
  'financialYearName',
  'countyNames', // ✅ Added County
  'constituencyNames', // ✅ Added Constituency
  'wardNames', // ✅ Ward
  'actions'
];
```

## Fix Applied

Updated `frontend/src/pages/ProjectManagementPage.jsx`:
1. ✅ Added `countyNames` to `defaultVisibleColumns` (line ~145)
2. ✅ Added `constituencyNames` to `defaultVisibleColumns` (line ~145)
3. ✅ Updated `handleResetColumns` function with the same changes (line ~981)

## Files Changed

- ✅ `frontend/src/pages/ProjectManagementPage.jsx` - Updated defaultVisibleColumns array (2 locations)

## Deployment

After deploying this fix:

1. **Deploy the changes:**
   ```bash
   ./deploy-gprs-server.sh
   ```

2. **Clear browser cache** (important!):
   - Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
   - Or clear localStorage: Open DevTools → Application → Local Storage → Clear

3. **Verify columns appear:**
   - County column should be visible
   - Constituency column should be visible
   - Ward column should still be visible

## Why This Happened

The column configuration has two layers:
1. **Config file** (`projectTableConfig.js`) - Defines all available columns
2. **Component logic** (`ProjectManagementPage.jsx`) - Controls which columns are visible by default

The config file had the columns with `show: true`, but the component's `defaultVisibleColumns` array didn't include them, so they were hidden by default. Users could manually show them via the column visibility menu, but they wouldn't appear automatically.

## Prevention

When adding new columns to `projectTableConfig.js`:
1. ✅ Add the column definition with appropriate `show` value
2. ✅ **Also add it to `defaultVisibleColumns`** if it should be visible by default
3. ✅ Update `handleResetColumns` function to include it

## Current Default Visible Columns

After this fix, the default visible columns are:
- Project Name
- Status
- Budget (costOfProject)
- Progress (overallProgress)
- Department
- Fin. Year
- **County** (NEW)
- **Constituency** (NEW)
- Ward
- Actions
