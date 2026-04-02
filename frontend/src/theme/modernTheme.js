/**
 * Modern Theme - Simplified, Single-Mode Theme System
 * 
 * Inspired by the public dashboard's clean color palette.
 * NO dark/light mode complexity - just one beautiful, modern theme.
 * 
 * Easy to customize - change colors directly, no confusing token mappings!
 */

import { createTheme } from '@mui/material/styles';

// ==================== COLOR PALETTE ====================
// All colors clearly defined - change these to customize your theme!

export const colors = {
  // Primary Brand Colors (Blues)
  primary: {
    light: '#64b5f6',      // Light blue
    main: '#1976d2',       // Main blue (from public dashboard)
    dark: '#1565c0',       // Dark blue
    darker: '#0d47a1',     // Darker blue
    contrastText: '#ffffff'
  },
  
  // Secondary Accent Colors (Purples)
  secondary: {
    light: '#ba68c8',      // Light purple
    main: '#9c27b0',       // Main purple (used in ward tab)
    dark: '#7b1fa2',       // Dark purple
    contrastText: '#ffffff'
  },
  
  // Success Colors (Greens)
  success: {
    light: '#81c784',      // Light green
    main: '#4caf50',       // Main green
    dark: '#388e3c',       // Dark green
    contrastText: '#ffffff'
  },
  
  // Warning Colors (Oranges/Ambers)
  warning: {
    light: '#ffb74d',      // Light orange
    main: '#ff9800',       // Main orange
    dark: '#f57c00',       // Dark orange
    contrastText: '#000000'
  },
  
  // Error Colors (Reds)
  error: {
    light: '#e57373',      // Light red
    main: '#f44336',       // Main red
    dark: '#d32f2f',       // Dark red
    contrastText: '#ffffff'
  },
  
  // Info Colors (Cyans)
  info: {
    light: '#4fc3f7',      // Light cyan
    main: '#29b6f6',       // Main cyan
    dark: '#0288d1',       // Dark cyan
    contrastText: '#ffffff'
  },
  
  // Gradient Colors (for cards, headers, etc.)
  gradients: {
    purple: ['#667eea', '#764ba2'],      // Purple gradient
    blue: ['#4facfe', '#00f2fe'],        // Blue gradient
    pink: ['#f093fb', '#f5576c'],        // Pink gradient
    orange: ['#fa709a', '#fee140'],      // Orange gradient
    green: ['#30cfd0', '#330867'],       // Green gradient
    sunset: ['#ff6e7f', '#bfe9ff'],      // Sunset gradient
  },
  
  // Neutral/Grey Scale
  grey: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eeeeee',
    300: '#e0e0e0',
    400: '#bdbdbd',
    500: '#9e9e9e',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121'
  },
  
  // Background Colors
  background: {
    default: '#f5f7fa',        // Main app background (light grey-blue)
    paper: '#ffffff',          // Card/paper background (white)
    hover: '#f0f2f5',          // Hover state background
    selected: '#e3f2fd',       // Selected item background
    disabled: '#fafafa'        // Disabled state background
  },
  
  // Text Colors
  text: {
    primary: '#1a202c',        // Main text (dark grey)
    secondary: '#718096',      // Secondary text (medium grey)
    disabled: '#cbd5e0',       // Disabled text (light grey)
    hint: '#a0aec0',           // Hint text
    white: '#ffffff',          // White text (for dark backgrounds)
  },
  
  // Divider & Border Colors
  divider: '#e2e8f0',
  border: {
    light: '#e2e8f0',
    main: '#cbd5e0',
    dark: '#a0aec0'
  }
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
            boxShadow: '0px 4px 12px rgba(0,0,0,0.15)'
          }
        }
      }
    },
    
    // Card customization
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0px 8px 24px rgba(0,0,0,0.12)'
          }
        }
      }
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
    
    // AppBar customization
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 3px rgba(0,0,0,0.08)'
        }
      }
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


