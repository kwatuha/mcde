// api/config/countyConfig.js
// County configuration loader for multi-tenant support

const fs = require('fs');
const path = require('path');

/**
 * Load county configuration
 * Priority: COUNTY_CODE env var > default
 */
function loadCountyConfig() {
  const countyCode = process.env.COUNTY_CODE || 'default';
  const configPath = path.join(__dirname, '../../config/counties', `${countyCode.toLowerCase()}.json`);
  
  let config;
  
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(configData);
      console.log(`✓ Loaded county configuration: ${config.county.name} (${config.county.code})`);
    } else {
      // Fallback to default
      const defaultPath = path.join(__dirname, '../../config/counties/default.json');
      if (fs.existsSync(defaultPath)) {
        const defaultData = fs.readFileSync(defaultPath, 'utf8');
        config = JSON.parse(defaultData);
        console.log(`⚠ County config not found for ${countyCode}, using default configuration`);
      } else {
        throw new Error('Default county configuration not found');
      }
    }
  } catch (error) {
    console.error('Error loading county configuration:', error);
    throw error;
  }
  
  return config;
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
  return path.join(__dirname, '../..');
}

function resolveConfigAssetPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const normalized = relativePath.replace(/^\/+/, '');
  const absolute = path.join(getProjectRoot(), normalized);
  try {
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? absolute : null;
  } catch {
    return null;
  }
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




