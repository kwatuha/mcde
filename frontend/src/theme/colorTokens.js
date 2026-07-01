/**
 * Single source of truth for app colors.
 * Tuned for consistent appearance across monitors (sRGB, no pastel button fills).
 * Brand blue matches Login / ICT.go.ke (#005A9A).
 */

/** Official county / GPRIS brand blues */
export const brand = {
  main: '#005A9A',
  hover: '#00477D',
  dark: '#003559',
  light: '#0F6FB4',
  muted: '#5A92C4',
  surface: '#E8F4FC',
  surfaceStrong: '#D4EBFA',
  onPrimary: '#FFFFFF',
};

/**
 * Token object consumed by legacy `tokens('light')` call sites.
 * Grey scale: lower numbers = darker (matches existing page usage).
 */
export const appColorTokens = {
  grey: {
    100: '#1A202C',
    200: '#2D3748',
    300: '#4A5568',
    400: '#718096',
    500: '#A0AEC0',
    600: '#CBD5E0',
    700: '#E2E8F0',
    800: '#EDF2F7',
    900: '#F7FAFC',
  },
  primary: {
    100: brand.dark,
    200: brand.dark,
    300: brand.hover,
    400: '#FFFFFF',
    500: brand.main,
    600: brand.hover,
    700: brand.light,
    800: brand.muted,
    900: brand.surface,
  },
  blueAccent: {
    50: brand.surface,
    100: brand.surfaceStrong,
    200: '#B8D9F0',
    300: brand.muted,
    400: brand.light,
    500: brand.main,
    600: brand.hover,
    700: brand.dark,
    800: '#002840',
    900: '#001A2E',
  },
  greenAccent: {
    50: '#E8F5E9',
    100: '#C8E6C9',
    200: '#A5D6A7',
    300: '#81C784',
    400: '#66BB6A',
    500: '#2E7D32',
    600: '#1B5E20',
    700: '#145214',
    800: '#0D3D10',
    900: '#062808',
  },
  redAccent: {
    100: '#2C100F',
    200: '#58201E',
    300: '#832F2C',
    400: '#AF3F3B',
    500: '#C62828',
    600: '#B71C1C',
    700: '#991B1B',
    800: '#7F1D1D',
    900: '#F8DCDB',
  },
  orange: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#E65100',
    600: '#D84315',
    700: '#BF360C',
    800: '#9A3412',
    900: '#7C2D12',
  },
  purple: {
    50: '#F3E5F5',
    100: '#E1BEE7',
    200: '#CE93D8',
    300: '#BA68C8',
    400: '#AB47BC',
    500: '#7B1FA2',
    600: '#6A1B9A',
    700: '#4A148C',
    800: '#38006B',
    900: '#1A002E',
  },
  yellowAccent: {
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
};

/** MUI palette-friendly export */
export const muiPaletteColors = {
  primary: {
    light: brand.light,
    main: brand.main,
    dark: brand.dark,
    darker: '#002840',
    contrastText: brand.onPrimary,
  },
  secondary: {
    light: '#BA68C8',
    main: '#7B1FA2',
    dark: '#4A148C',
    contrastText: '#FFFFFF',
  },
  success: {
    light: '#66BB6A',
    main: '#2E7D32',
    dark: '#1B5E20',
    contrastText: '#FFFFFF',
  },
  warning: {
    light: '#FFB74D',
    main: '#E65100',
    dark: '#BF360C',
    contrastText: '#FFFFFF',
  },
  error: {
    light: '#E57373',
    main: '#C62828',
    dark: '#B71C1C',
    contrastText: '#FFFFFF',
  },
  info: {
    light: brand.light,
    main: brand.main,
    dark: brand.dark,
    contrastText: '#FFFFFF',
  },
  background: {
    default: '#F5F7FA',
    paper: '#FFFFFF',
    hover: '#EDF2F7',
    selected: brand.surface,
    disabled: '#FAFAFA',
  },
  text: {
    primary: '#1A202C',
    secondary: '#4A5568',
    disabled: '#A0AEC0',
    hint: '#718096',
    white: '#FFFFFF',
  },
  divider: '#E2E8F0',
  border: {
    light: '#E2E8F0',
    main: '#CBD5E0',
    dark: '#A0AEC0',
  },
  grey: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
};

/** Solid borders/shadows — avoid ultra-low alpha that vanish on some displays */
export const uiSurfaces = {
  cardBorder: '#E2E8F0',
  cardShadow: '0 2px 8px rgba(0, 0, 0, 0.10)',
  cardShadowHover: '0 8px 24px rgba(0, 0, 0, 0.14)',
  subtleFill: '#F4F6F8',
  overlayScrim: 'rgba(0, 53, 89, 0.45)',
};
