/**
 * Modern Theme - Simplified, Single-Mode Theme System
 * 
 * Inspired by the public dashboard's clean color palette.
 * NO dark/light mode complexity - just one beautiful, modern theme.
 * 
 * Easy to customize - change colors directly, no confusing token mappings!
 */

import { createTheme } from '@mui/material/styles';
import { appColorTokens, brand, muiPaletteColors, uiSurfaces } from './colorTokens';

// Re-export for pages that import from modernTheme
export const colors = {
  primary: muiPaletteColors.primary,
  secondary: muiPaletteColors.secondary,
  success: muiPaletteColors.success,
  warning: muiPaletteColors.warning,
  error: muiPaletteColors.error,
  info: muiPaletteColors.info,
  gradients: {
    purple: ['#667eea', '#764ba2'],
    blue: [brand.main, brand.light],
    pink: ['#f093fb', '#f5576c'],
    orange: ['#fa709a', '#fee140'],
    green: ['#30cfd0', '#330867'],
    sunset: ['#ff6e7f', '#bfe9ff'],
  },
  grey: muiPaletteColors.grey,
  background: muiPaletteColors.background,
  text: muiPaletteColors.text,
  divider: muiPaletteColors.divider,
  border: muiPaletteColors.border,
};

// ==================== MUI THEME CONFIGURATION ====================

export const modernTheme = createTheme({
  palette: {
    mode: 'light',  // Always light mode - simple and clean!
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
    background: {
      default: colors.background.default,
      paper: colors.background.paper
    },
    text: {
      primary: colors.text.primary,
      secondary: colors.text.secondary,
      disabled: colors.text.disabled
    },
    divider: colors.divider,
    grey: colors.grey,
    // Custom color additions
    action: {
      active: colors.primary.main,
      hover: colors.background.hover,
      selected: colors.background.selected,
      disabled: colors.text.disabled,
      disabledBackground: colors.background.disabled,
      focus: colors.primary.light
    }
  },
  
  typography: {
    fontFamily: [
      'Montserrat',
      'Roboto',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Arial',
      'sans-serif'
    ].join(','),
    fontSize: 14,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '-0.01562em'
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
      letterSpacing: '-0.00833em'
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '0em'
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '0.00735em'
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: '0em'
    },
    h6: {
      fontSize: '1.125rem',
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: '0.0075em'
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.75,
      letterSpacing: '0.00938em'
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.57,
      letterSpacing: '0.00714em'
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '0.00938em'
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.43,
      letterSpacing: '0.01071em'
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 600,
      lineHeight: 1.75,
      letterSpacing: '0.02857em',
      textTransform: 'none'  // Don't force uppercase
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 1.66,
      letterSpacing: '0.03333em'
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 600,
      lineHeight: 2.66,
      letterSpacing: '0.08333em',
      textTransform: 'uppercase'
    }
  },
  
  shape: {
    borderRadius: 8  // Rounded corners (modern look)
  },
  
  shadows: [
    'none',
    '0px 2px 4px rgba(0,0,0,0.05)',    // 1
    '0px 4px 8px rgba(0,0,0,0.08)',    // 2
    '0px 8px 16px rgba(0,0,0,0.1)',    // 3
    '0px 12px 24px rgba(0,0,0,0.12)',  // 4
    '0px 16px 32px rgba(0,0,0,0.14)',  // 5
    '0px 20px 40px rgba(0,0,0,0.16)',  // 6
    '0px 24px 48px rgba(0,0,0,0.18)',  // 7
    '0px 28px 56px rgba(0,0,0,0.2)',   // 8
    '0px 2px 4px rgba(0,0,0,0.05)',    // 9
    '0px 2px 4px rgba(0,0,0,0.05)',    // 10
    '0px 2px 4px rgba(0,0,0,0.05)',    // 11
    '0px 2px 4px rgba(0,0,0,0.05)',    // 12
    '0px 2px 4px rgba(0,0,0,0.05)',    // 13
    '0px 2px 4px rgba(0,0,0,0.05)',    // 14
    '0px 2px 4px rgba(0,0,0,0.05)',    // 15
    '0px 2px 4px rgba(0,0,0,0.05)',    // 16
    '0px 2px 4px rgba(0,0,0,0.05)',    // 17
    '0px 2px 4px rgba(0,0,0,0.05)',    // 18
    '0px 2px 4px rgba(0,0,0,0.05)',    // 19
    '0px 2px 4px rgba(0,0,0,0.05)',    // 20
    '0px 2px 4px rgba(0,0,0,0.05)',    // 21
    '0px 2px 4px rgba(0,0,0,0.05)',    // 22
    '0px 2px 4px rgba(0,0,0,0.05)',    // 23
    '0px 2px 4px rgba(0,0,0,0.05)',    // 24
  ],
  
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          colorScheme: 'light',
        },
        body: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
          backgroundColor: colors.background.default,
          color: colors.text.primary,
        },
        '#root': {
          minHeight: '100vh',
        },
      },
    },
    // Button customization
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
          padding: '8px 20px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 4px 12px rgba(0,0,0,0.15)'
          }
        },
        contained: {
          '&:hover': {
            boxShadow: `0px 4px 12px ${brand.main}40`,
          },
        },
        containedPrimary: {
          backgroundColor: brand.main,
          color: brand.onPrimary,
          '&:hover': {
            backgroundColor: brand.hover,
          },
        },
      }
    },
    
    // Card customization
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: uiSurfaces.cardShadow,
          border: `1px solid ${uiSurfaces.cardBorder}`,
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: uiSurfaces.cardShadowHover,
          },
        },
      },
    },
    
    // Paper customization
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12
        },
        elevation1: {
          boxShadow: '0px 2px 4px rgba(0,0,0,0.05)'
        },
        elevation2: {
          boxShadow: '0px 4px 8px rgba(0,0,0,0.08)'
        },
        elevation3: {
          boxShadow: '0px 8px 16px rgba(0,0,0,0.1)'
        }
      }
    },
    
    // Chip customization
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500
        }
      }
    },
    
    // TextField customization
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8
          }
        }
      }
    },
    
    // Table customization
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: colors.grey[50],
          color: colors.text.primary
        }
      }
    },
    
    // AppBar customization — full-width top bar (GPRIS strip), no rounded corners
    MuiAppBar: {
      defaultProps: {
        square: true,
      },
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 3px rgba(0,0,0,0.08)',
          borderRadius: 0,
        },
      },
    },
    
    // Drawer customization
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${colors.divider}`,
          boxShadow: 'none'
        }
      }
    }
  }
});

// ==================== UTILITY FUNCTIONS ====================

/**
 * Create a gradient background CSS
 * @param {Array} colors - Array of two colors [start, end]
 * @param {String} direction - Gradient direction (default: '135deg')
 * @returns {String} CSS gradient string
 */
export const createGradient = (gradientColors, direction = '135deg') => {
  return `linear-gradient(${direction}, ${gradientColors[0]} 0%, ${gradientColors[1]} 100%)`;
};

/**
 * Get gradient by name
 * @param {String} name - Name of the gradient (e.g., 'purple', 'blue')
 * @returns {String} CSS gradient string
 */
export const getGradient = (name) => {
  return createGradient(colors.gradients[name] || colors.gradients.purple);
};

/**
 * Get status color based on project status
 * @param {String} status - Project status
 * @returns {String} Color hex code
 */
export const getStatusColor = (status) => {
  const statusMap = {
    'Completed': colors.success.main,
    'Ongoing': colors.info.main,
    'At Risk': colors.warning.main,
    'Stalled': colors.error.main,
    'Not Started': colors.grey[500],
    'Under Procurement': colors.secondary.main,
    'Pending': colors.warning.main,
    'Approved': colors.success.main,
    'Rejected': colors.error.main
  };
  return statusMap[status] || colors.grey[500];
};

/**
 * Alpha blend a color
 * @param {String} color - Hex color
 * @param {Number} alpha - Alpha value (0-1)
 * @returns {String} RGBA color string
 */
export const alphaBlend = (color, alpha) => {
  // Simple hex to rgba converter
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default modernTheme;


