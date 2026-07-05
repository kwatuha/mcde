// api/config/countyConfig.js
// County configuration loader for multi-tenant support

const fs = require('fs');
const path = require('path');

/** Used when no county JSON is on disk (e.g. API-only Docker image). */
const BUILTIN_DEFAULT_CONFIG = {
  county: {
    code: 'DEFAULT',
    name: 'Machakos',
    displayName: 'County Government of Machakos',
  },
  organization: {
    name: 'County Government of Machakos',
  },
  branding: {
    systemName: 'Monitoring County Management and Evaluation',
    systemAcronym: 'MCME',
    productName: 'E-CIMES',
    productSubtitle: 'County Integrated Monitoring and Evaluation System',
    loginTitle: 'County Government of Machakos',
    loginSubtitle: 'Monitoring County Management and Evaluation',
    republicLine: 'REPUBLIC OF KENYA',
    logo: {
      admin: 'assets/gpris.png',
      public: 'assets/gpris.png',
    },
  },
};

function getApiRoot() {
  return path.join(__dirname, '..');
}

function getCandidateConfigDirs() {
  const apiRoot = getApiRoot();
  return [
    path.join(__dirname, 'counties'),
    path.join(apiRoot, 'config', 'counties'),
    path.join(apiRoot, '..', 'config', 'counties'),
    path.join(process.cwd(), 'config', 'counties'),
    path.join(process.cwd(), 'api', 'config', 'counties'),
  ];
}

function findCountyConfigPath(countyCode) {
  const code = String(countyCode || 'default').toLowerCase();
  const dirs = [...new Set(getCandidateConfigDirs())];

  for (const dir of dirs) {
    const specific = path.join(dir, `${code}.json`);
    if (fs.existsSync(specific)) return specific;
  }

  if (code !== 'default') {
    for (const dir of dirs) {
      const fallback = path.join(dir, 'default.json');
      if (fs.existsSync(fallback)) return fallback;
    }
  }

  return null;
}

/**
 * Load county configuration
 * Priority: COUNTY_CODE env var > default
 */
function loadCountyConfig() {
  const countyCode = process.env.COUNTY_CODE || 'default';
  const configPath = findCountyConfigPath(countyCode);

  if (configPath) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const name = config?.county?.name || config?.county?.code || countyCode;
      console.log(`✓ Loaded county configuration: ${name} (${config?.county?.code || countyCode}) from ${configPath}`);
      return config;
    } catch (error) {
      console.error(`Error reading county configuration at ${configPath}:`, error.message);
    }
  } else {
    console.warn(`⚠ County config not found for ${countyCode}; using built-in default configuration`);
  }

  return JSON.parse(JSON.stringify(BUILTIN_DEFAULT_CONFIG));
}

/**
 * Get current county configuration (singleton)
 */
let countyConfig = null;

function getCountyConfig() {
  if (!countyConfig) {
    countyConfig = loadCountyConfig();
  }
  return countyConfig;
}

/**
 * Reload county configuration (useful for testing or dynamic switching)
 */
function reloadCountyConfig() {
  countyConfig = null;
  return getCountyConfig();
}

function getProjectRoot() {
  const apiRoot = getApiRoot();
  const repoRoot = path.join(apiRoot, '..');
  const candidates = [repoRoot, apiRoot, process.cwd()];
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, 'config', 'counties'))) return root;
    if (fs.existsSync(path.join(root, 'api', 'config', 'counties'))) return root;
  }
  return apiRoot;
}

function resolveConfigAssetPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const normalized = relativePath.replace(/^\/+/, '');
  const roots = [
    getProjectRoot(),
    getApiRoot(),
    path.join(getApiRoot(), '..'),
    process.cwd(),
  ];
  for (const root of [...new Set(roots)]) {
    const absolute = path.join(root, normalized);
    try {
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) return absolute;
    } catch {
      // try next root
    }
  }
  return null;
}

function getTenantBranding() {
  const config = getCountyConfig();
  const branding = config?.branding || {};
  const organization = config?.organization || {};
  const county = config?.county || {};
  return {
    tenantType: config?.tenantType || 'county',
    systemName: branding.systemName || organization.name || county.displayName || county.name || '',
    systemAcronym: branding.systemAcronym || '',
    productName: branding.productName || '',
    productSubtitle: branding.productSubtitle || '',
    publicPortalName: branding.publicPortalName || '',
    loginTitle: branding.loginTitle || county.displayName || organization.name || county.name || '',
    loginSubtitle: branding.loginSubtitle || branding.systemName || '',
    republicLine: branding.republicLine || 'REPUBLIC OF KENYA',
    logoAdminPath: resolveConfigAssetPath(branding.logo?.admin),
    logoPublicPath: resolveConfigAssetPath(branding.logo?.public || branding.logo?.admin),
  };
}

function resolveTenantLogoPath(kind = 'admin') {
  const branding = getTenantBranding();
  if (kind === 'public' && branding.logoPublicPath) return branding.logoPublicPath;
  if (branding.logoAdminPath) return branding.logoAdminPath;
  return branding.logoPublicPath;
}

module.exports = {
  getCountyConfig,
  reloadCountyConfig,
  loadCountyConfig,
  getProjectRoot,
  resolveConfigAssetPath,
  getTenantBranding,
  resolveTenantLogoPath,
};
