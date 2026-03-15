// src/utils/dataGridTheme.js
// Centralized DataGrid styling based on the current MUI theme and our Professional tokens

export function getThemedDataGridSx(theme, colors, overrides = {}) {
  const isLight = theme.palette.mode === 'light';
  const { _stickyHeaderTop = 0, ...restOverrides } = overrides;
  const stickyTop = typeof _stickyHeaderTop === 'number' ? `${_stickyHeaderTop}px` : _stickyHeaderTop;

  return {
    // Frame
    borderRadius: '12px',
    border: `1px solid ${isLight ? theme.palette.grey[300] : colors.blueAccent[700]}`,

    // Root and cells
    '& .MuiDataGrid-root': { border: 'none' },
    '& .MuiDataGrid-cell': {
      borderBottom: 'none',
      color: isLight ? theme.palette.text.primary : undefined,
      fontSize: 13,
      lineHeight: 1.4,
    },

    // Header – subtle tint and clear border; ties to brand without dominating
    '& .MuiDataGrid-columnHeaders': {
      backgroundColor: isLight
        ? `rgba(25, 118, 210, 0.04) !important`  // very subtle primary blue tint
        : `${colors.blueAccent[800]} !important`,
      borderBottom: `1.5px solid ${isLight ? theme.palette.grey[300] : 'rgba(255,255,255,0.12)'}`,
      minHeight: '48px',
      height: '48px',
      position: 'sticky',
      top: stickyTop,
      zIndex: 10,
    },
    '& .MuiDataGrid-columnHeader': {
      backgroundColor: isLight
        ? `rgba(25, 118, 210, 0.04) !important`
        : `${colors.blueAccent[800]} !important`,
      position: 'relative',
    },
    '& .MuiDataGrid-columnHeaderTitle': {
      color: `${isLight ? theme.palette.text.primary : 'rgba(255,255,255,0.9)'} !important`,
      fontWeight: 600,
      letterSpacing: 0.2,
      textTransform: 'none',
      lineHeight: 1.2,
    },
    '& .MuiDataGrid-columnSeparator': {
      color: `${isLight ? theme.palette.grey[300] : colors.grey[300]} !important`,
    },
    // Avoid text overlap with icons
    '& .MuiDataGrid-columnHeaderTitleContainer': {
      paddingRight: '40px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      alignItems: 'center',
    },
    // Icons
    '& .MuiDataGrid-iconButtonContainer, & .MuiDataGrid-menuIcon': {
      position: 'absolute',
      right: 6,
      top: '50%',
      transform: 'translateY(-50%)',
      visibility: 'hidden',
      opacity: 0.9,
      color: isLight ? theme.palette.text.secondary : 'rgba(255,255,255,0.9)',
    },
    '& .MuiDataGrid-columnHeader:hover .MuiDataGrid-iconButtonContainer, & .MuiDataGrid-columnHeader:hover .MuiDataGrid-menuIcon': {
      visibility: 'visible',
      opacity: 1,
    },
    '& .MuiDataGrid-sortIcon': {
      position: 'absolute',
      right: 28,
      top: '50%',
      transform: 'translateY(-50%)',
      opacity: 1,
      color: isLight ? theme.palette.text.secondary : 'rgba(255,255,255,0.9)',
      pointerEvents: 'none',
      zIndex: 1,
    },

    // Body
    '& .MuiDataGrid-virtualScroller': {
      backgroundColor: isLight ? theme.palette.background.paper : colors.primary[400],
    },
    '& .MuiDataGrid-row:hover': {
      backgroundColor: `${isLight ? '#f5f8ff' : '#101827'} !important`,
    },
    '& .MuiDataGrid-row:nth-of-type(odd)': {
      backgroundColor: `${isLight ? '#fbfdff' : 'transparent'} !important`,
    },

    // Toolbar
    '& .MuiDataGrid-toolbarContainer': {
      p: 1,
      borderBottom: `1px solid ${isLight ? '#e0e7ff' : 'transparent'}`,
      backgroundColor: `${isLight ? colors.blueAccent[100] : 'transparent'}`,
    },

    // Footer / pagination – ensure labels and text are visible
    '& .MuiDataGrid-footerContainer': {
      borderTop: 'none',
      backgroundColor: `${isLight ? theme.palette.grey[50] : colors.blueAccent[700]} !important`,
      color: isLight ? theme.palette.text.primary : '#ffffff',
    },
    '& .MuiTablePagination-toolbar': {
      color: isLight ? theme.palette.text.primary : '#ffffff',
    },
    '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
      color: 'inherit !important',
    },
    '& .MuiTablePagination-select': {
      color: 'inherit !important',
    },
    '& .MuiTablePagination-actions .MuiSvgIcon-root, & .MuiTablePagination-actions .MuiIconButton-root': {
      color: isLight ? theme.palette.text.primary : '#ffffff',
    },
    '& .MuiDataGrid-footerContainer .MuiInputBase-root': {
      color: 'inherit !important',
      '& .MuiSvgIcon-root': { color: 'inherit !important' },
    },

    // Merge custom overrides last (excluding internal _stickyHeaderTop)
    ...restOverrides,
  };
}



