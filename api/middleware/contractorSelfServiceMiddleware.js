const { isAdminLikeRequester } = require('../utils/roleUtils');
const contractorAuth = require('../services/contractorAuthService');

/**
 * Authorize contractor portal actions:
 * - admins bypass
 * - staff with any listed privilege
 * - contractor user accessing their own :contractorId (profile link + assignment checked in route)
 */
function contractorSelfService(optionalStaffPrivileges = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(403).json({ error: 'Access denied. Insufficient authentication or user data.' });
        }
        if (isAdminLikeRequester(req.user)) return next();

        const privs = req.user.privileges || [];
        if (optionalStaffPrivileges.some((p) => privs.includes(p))) return next();

        const contractorId = req.params.contractorId;
        if (
            contractorId
            && contractorAuth.isContractorLikeUser(req.user)
            && contractorAuth.callerCanAccessContractor(req, contractorId)
        ) {
            return next();
        }

        return res.status(403).json({
            error: 'Access denied. You do not have the necessary privileges to perform this action.',
        });
    };
}

module.exports = { contractorSelfService };
