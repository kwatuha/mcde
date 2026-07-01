// api/routes/countyConfigRoutes.js
// API routes for accessing county configuration

const express = require('express');
const router = express.Router();
const { getCountyConfig, getTenantBranding, resolveTenantLogoPath } = require('../config/countyConfig');
const { resolveCountyLogoPath } = require('../utils/countyLogo');

/**
 * @route GET /api/county-config
 * @description Get current county configuration (public info only)
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    const config = getCountyConfig();
    const branding = getTenantBranding();

    const publicConfig = {
      tenantType: config.tenantType || 'county',
      county: config.county,
      organization: config.organization,
      labels: config.labels,
      features: config.features,
      branding: {
        systemName: branding.systemName,
        systemAcronym: branding.systemAcronym,
        productName: branding.productName,
        productSubtitle: branding.productSubtitle,
        publicPortalName: branding.publicPortalName,
        loginTitle: branding.loginTitle,
        loginSubtitle: branding.loginSubtitle,
        republicLine: branding.republicLine,
        hasLogo: Boolean(resolveTenantLogoPath('admin') || resolveCountyLogoPath()),
      },
    };

    res.status(200).json(publicConfig);
  } catch (error) {
    console.error('Error fetching county configuration:', error);
    res.status(500).json({ message: 'Error fetching county configuration', error: error.message });
  }
});

/**
 * @route GET /api/county-config/logo
 * @description Serve tenant logo for login and public pages
 * @access Public
 */
router.get('/logo', (req, res) => {
  try {
    const logoPath = resolveTenantLogoPath('admin') || resolveCountyLogoPath();
    if (!logoPath) {
      return res.status(404).json({ message: 'Tenant logo not configured.' });
    }
    return res.sendFile(logoPath);
  } catch (error) {
    console.error('Error serving tenant logo:', error);
    return res.status(500).json({ message: 'Error serving tenant logo', error: error.message });
  }
});

module.exports = router;
