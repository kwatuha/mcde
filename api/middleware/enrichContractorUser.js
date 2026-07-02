const contractorAuth = require('../services/contractorAuthService');

/**
 * Refresh contractorId / contractorProfile on each API request so access checks
 * work after admin links a user account (without forcing re-login).
 */
module.exports = async function enrichContractorUser(req, res, next) {
    if (!req.user) return next();
    try {
        const roleName = req.user.roleName || req.user.role || '';
        const privileges = req.user.privileges || [];
        const contractorLike = contractorAuth.isContractorRole(roleName)
            || privileges.includes('contractor.portal')
            || req.user.contractorId != null;
        if (contractorLike) {
            req.user = await contractorAuth.enrichUserWithContractor(req.user);
        }
        next();
    } catch (error) {
        console.warn('enrichContractorUser:', error.message);
        next();
    }
};
