// src/utils/dataGridTheme.js
// Centralized DataGrid styling based on the current MUI theme and our Professional tokens

/** CIMES-style grid (tree navigation + light mode); also applied via GlobalStyles in MainLayout. */
export const TREE_LAYOUT_GRID = {
  headerBg: '#003366',
  headerText: '#ffffff',
  headerBorder: 'rgba(255, 255, 255, 0.22)',
  sortIcon: '#90caf9',
  bodyText: '#003366',
  rowOdd: '#f2f2f2',
  rowEven: '#ffffff',
  rowHover: '#e8eef5',
  border: '#e0e0e0',
  link: '#007bff',
  footerBg: '#f8f9fa',
};

/**
 * GlobalStyles selector object — scope under `.mcmes-app-main` (MainLayout content).
 * Use when navigation layout is tree + light mode so all DataGrids align without per-page sx.
 */
export const treeLayoutDataGridGlobalStyles = {
  '.mcmes-app-main .MuiDataGrid-root': {
    border: `1px solid ${TREE_LAYOUT_GRID.border}`,
    borderRadius: '4px',
    color: TREE_LAYOUT_GRID.bodyText,
  },
  '.mcmes-app-main .MuiDataGrid-columnHeaders, .mcmes-app-main .MuiDataGrid-columnHeader, .mcmes-app-main .MuiDataGrid-columnHeaderRow':
    {
      backgroundColor: `${TREE_LAYOUT_GRID.headerBg} !important`,
      borderBottom: `1px solid ${TREE_LAYOUT_GRID.border}`,
      color: `${TREE_LAYOUT_GRID.headerText} !important`,
    },
  '.mcmes-app-main .MuiDataGrid-columnHeaderTitle': {
    color: `${TREE_LAYOUT_GRID.headerText} !important`,
    fontWeight: '700 !important',
  },
  '.mcmes-app-main .MuiDataGrid-columnSeparator': {
    color: `${TREE_LAYOUT_GRID.headerBorder} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-iconSeparator': {
    color: `${TREE_LAYOUT_GRID.headerBorder} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-sortIcon': {
    color: `${TREE_LAYOUT_GRID.sortIcon} !important`,
    opacity: '1 !important',
  },
  '.mcmes-app-main .MuiDataGrid-menuIcon, .mcmes-app-main .MuiDataGrid-menuIcon .MuiSvgIcon-root': {
    color: `${TREE_LAYOUT_GRID.sortIcon} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-columnHeader .MuiSvgIcon-root': {
    color: `${TREE_LAYOUT_GRID.sortIcon} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-cell': {
    borderRight: `1px solid ${TREE_LAYOUT_GRID.border}`,
    borderBottom: `1px solid ${TREE_LAYOUT_GRID.border}`,
    color: `${TREE_LAYOUT_GRID.bodyText} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-row:nth-of-type(odd)': {
    backgroundColor: `${TREE_LAYOUT_GRID.rowOdd} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-row:nth-of-type(even)': {
    backgroundColor: `${TREE_LAYOUT_GRID.rowEven} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-row:hover': {
    backgroundColor: `${TREE_LAYOUT_GRID.rowHover} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-row.Mui-selected': {
    backgroundColor: 'rgba(0, 51, 102, 0.12) !important',
  },
  '.mcmes-app-main .MuiDataGrid-row.Mui-selected:hover': {
    backgroundColor: 'rgba(0, 51, 102, 0.16) !important',
  },
  '.mcmes-app-main .MuiDataGrid-virtualScroller': {
    backgroundColor: TREE_LAYOUT_GRID.rowEven,
  },
  '.mcmes-app-main .MuiDataGrid-footerContainer': {
    backgroundColor: `${TREE_LAYOUT_GRID.footerBg} !important`,
    borderTop: `1px solid ${TREE_LAYOUT_GRID.border}`,
    color: `${TREE_LAYOUT_GRID.bodyText} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-toolbarContainer, .mcmes-app-main .MuiDataGrid-toolbar': {
    backgroundColor: `${TREE_LAYOUT_GRID.footerBg} !important`,
    borderBottom: `1px solid ${TREE_LAYOUT_GRID.border}`,
    color: TREE_LAYOUT_GRID.bodyText,
  },
  '.mcmes-app-main .MuiTablePagination-toolbar, .mcmes-app-main .MuiTablePagination-selectLabel, .mcmes-app-main .MuiTablePagination-displayedRows':
    {
      color: `${TREE_LAYOUT_GRID.bodyText} !important`,
    },
  '.mcmes-app-main .MuiTablePagination-actions .MuiIconButton-root': {
    color: `${TREE_LAYOUT_GRID.bodyText} !important`,
  },
  '.mcmes-app-main .MuiDataGrid-cell a, .mcmes-app-main .MuiDataGrid-cell .MuiLink-root': {
    color: `${TREE_LAYOUT_GRID.link} !important`,
  },

  // --- MUI Table (reports, documents, procurement, import preview, audit trail, ministries, etc.) ---
  '.mcmes-app-main .MuiTable-root': {
    borderCollapse: 'separate',
    borderSpacing: 0,
    width: '100%',
  },
  '.mcmes-app-main .MuiTableHead-root': {
    backgroundColor: `${TREE_LAYOUT_GRID.headerBg} !important`,
  },
  '.mcmes-app-main .MuiTableCell-head, .mcmes-app-main .MuiTableHead-root .MuiTableCell-root': {
    backgroundColor: `${TREE_LAYOUT_GRID.headerBg} !important`,
    color: `${TREE_LAYOUT_GRID.headerText} !important`,
    fontWeight: '700 !important',
    borderBottom: `2px solid ${TREE_LAYOUT_GRID.border} !important`,
    borderRight: `1px solid ${TREE_LAYOUT_GRID.headerBorder} !important`,
  },
  '.mcmes-app-main .MuiTableCell-head:last-of-type, .mcmes-app-main .MuiTableHead-root .MuiTableCell-root:last-of-type':
    {
      borderRight: 'none !important',
    },
  '.mcmes-app-main .MuiTableCell-stickyHeader.MuiTableCell-head': {
    backgroundColor: `${TREE_LAYOUT_GRID.headerBg} !important`,
    backgroundImage: 'none !important',
  },
  '.mcmes-app-main .MuiTableBody-root .MuiTableCell-root': {
    borderColor: `${TREE_LAYOUT_GRID.border} !important`,
    color: `${TREE_LAYOUT_GRID.bodyText}`,
    borderRight: `1px solid ${TREE_LAYOUT_GRID.border}`,
    borderBottom: `1px solid ${TREE_LAYOUT_GRID.border}`,
  },
  '.mcmes-app-main .MuiTableBody-root .MuiTableRow-root:nth-of-type(odd)': {
    backgroundColor: `${TREE_LAYOUT_GRID.rowOdd} !important`,
  },
  '.mcmes-app-main .MuiTableBody-root .MuiTableRow-root:nth-of-type(even)': {
    backgroundColor: `${TREE_LAYOUT_GRID.rowEven} !important`,
  },
  '.mcmes-app-main .MuiTableBody-root .MuiTableRow-root:hover': {
    backgroundColor: `${TREE_LAYOUT_GRID.rowHover} !important`,
  },
  '.mcmes-app-main .MuiTableBody-root .MuiTableCell-root a, .mcmes-app-main .MuiTableBody-root .MuiTableCell-root .MuiLink-root':
    {
      color: `${TREE_LAYOUT_GRID.link} !important`,
    },
  '.mcmes-app-main .MuiTablePagination-root': {
    borderTop: `1px solid ${TREE_LAYOUT_GRID.border}`,
    backgroundColor: `${TREE_LAYOUT_GRID.footerBg} !important`,
    color: `${TREE_LAYOUT_GRID.bodyText} !important`,
  },
  '.mcmes-app-main .MuiTablePagination-toolbar, .mcmes-app-main .MuiTablePagination-selectLabel, .mcmes-app-main .MuiTablePagination-displayedRows':
    {
      color: `${TREE_LAYOUT_GRID.bodyText} !important`,
    },
  '.mcmes-app-main .MuiTablePagination-actions .MuiIconButton-root': {
    color: `${TREE_LAYOUT_GRID.bodyText} !important`,
  },
};

export function getThemedDataGridSx(theme, colors, overrides = {}) {
  const isLight = theme.palette.mode === 'light';
  const { _stickyHeaderTop = 0, _isTreeLayout = false, ...restOverrides } = overrides;
  const stickyTop = typeof _stickyHeaderTop === 'number' ? `${_stickyHeaderTop}px` : _stickyHeaderTop;

  if (_isTreeLayout && isLight) {
    const G = TREE_LAYOUT_GRID;
    return {
      borderRadius: '4px',
      border: `1px solid ${G.border}`,
      '& .MuiDataGrid-root': { border: 'none', color: G.bodyText },
      '& .MuiDataGrid-cell': {
        borderRight: `1px solid ${G.border}`,
        borderBottom: `1px solid ${G.border}`,
        color: `${G.bodyText} !important`,
        fontSize: 13,
        lineHeight: 1.45,
      },
      '& .MuiDataGrid-columnHeaders': {
        backgroundColor: `${G.headerBg} !important`,
        borderBottom: `1px solid ${G.border}`,
        minHeight: '48px',
        height: '48px',
        position: 'sticky',
        top: stickyTop,
        zIndex: 10,
      },
      '& .MuiDataGrid-columnHeader': {
        backgroundColor: `${G.headerBg} !important`,
      },
      '& .MuiDataGrid-columnHeaderTitle': {
        color: `${G.headerText} !important`,
        fontWeight: 700,
      },
      '& .MuiDataGrid-columnSeparator, & .MuiDataGrid-iconSeparator': {
        color: `${G.headerBorder} !important`,
      },
      '& .MuiDataGrid-sortIcon': {
        color: `${G.sortIcon} !important`,
        opacity: 1,
      },
      '& .MuiDataGrid-menuIcon, & .MuiDataGrid-columnHeader .MuiSvgIcon-root': {
        color: `${G.sortIcon} !important`,
      },
      '& .MuiDataGrid-columnHeaderTitleContainer': {
        paddingRight: '40px',
      },
      '& .MuiDataGrid-iconButtonContainer': {
        color: `${G.sortIcon}`,
      },
      '& .MuiDataGrid-virtualScroller': {
        backgroundColor: G.rowEven,
      },
      '& .MuiDataGrid-row:nth-of-type(odd)': {
        backgroundColor: `${G.rowOdd} !important`,
      },
      '& .MuiDataGrid-row:nth-of-type(even)': {
        backgroundColor: `${G.rowEven} !important`,
      },
      '& .MuiDataGrid-row:hover': {
        backgroundColor: `${G.rowHover} !important`,
      },
      '& .MuiDataGrid-row.Mui-selected': {
        backgroundColor: 'rgba(0, 51, 102, 0.12) !important',
      },
      '& .MuiDataGrid-toolbar, & .MuiDataGrid-toolbarContainer': {
        backgroundColor: `${G.footerBg} !important`,
        borderBottom: `1px solid ${G.border}`,
        borderRadius: 0,
      },
      '& .MuiDataGrid-footerContainer': {
        borderTop: `1px solid ${G.border}`,
        backgroundColor: `${G.footerBg} !important`,
        color: G.bodyText,
      },
      '& .MuiTablePagination-toolbar, & .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
        color: `${G.bodyText} !important`,
      },
      '& .MuiTablePagination-actions .MuiSvgIcon-root, & .MuiTablePagination-actions .MuiIconButton-root': {
        color: G.bodyText,
      },
      '& .MuiDataGrid-cell a, & .MuiDataGrid-cell .MuiLink-root': {
        color: `${G.link} !important`,
      },
      ...restOverrides,
    };
  }

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

    // Toolbar (v8 slot) + legacy container — square corners (grid root still rounds outer frame via parent sx)
    '& .MuiDataGrid-toolbar': {
      borderRadius: 0,
    },
    // Toolbar sits under mainContent; cancel top radius if theme or wrapper added it
    '& .MuiDataGrid-mainContent > .MuiDataGrid-toolbar': {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
    '& .MuiDataGrid-toolbarContainer': {
      p: 1,
      borderBottom: `1px solid ${isLight ? '#e0e7ff' : 'transparent'}`,
      backgroundColor: `${isLight ? colors.blueAccent[100] : 'transparent'}`,
      borderRadius: 0,
    },
    // MUI TablePagination toolbar = MuiToolbar-root + MuiTablePagination-toolbar — square corners
    '& .MuiDataGrid-footerContainer .MuiToolbar-root': {
      borderRadius: 0,
    },
    '& .MuiDataGrid-root .MuiToolbar-root': {
      borderRadius: 0,
    },

    // Footer / pagination – ensure labels and text are visible
    '& .MuiDataGrid-footerContainer': {
      borderTop: 'none',
      backgroundColor: `${isLight ? theme.palette.grey[50] : colors.blueAccent[700]} !important`,
      color: isLight ? theme.palette.text.primary : '#ffffff',
    },
    '& .MuiTablePagination-toolbar': {
      borderRadius: 0,
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



