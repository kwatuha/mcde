// backend/middleware/authenticate.js
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap'; // Use the same secret as in auth.js

module.exports = function (req, res, next) {
    const authHeader = req.header('Authorization');
    let token = null;

    if (authHeader) {
        token = authHeader.split(' ')[1];
    } else if (
        req.method === 'GET' &&
        (req.path.endsWith('/mobile-app/download') || req.originalUrl.startsWith('/api/mobile-app/download'))
    ) {
        // Browser file downloads cannot send Authorization; allow signed-in staff link download.
        const q = req.query.access_token;
        token = typeof q === 'string' ? q : Array.isArray(q) ? q[0] : null;
    }

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied (Missing Authorization header)' });
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, JWT_SECRET); // Verify the token using your secret
        console.log('Decoded token:', decoded); // Debug log

        // Handle different token structures
        // Some tokens might have user info directly, others might have it nested under 'user'
        if (decoded.user) {
            req.user = decoded.user;
        } else if (decoded.userId) {
            // If token has userId directly, use the decoded object as user
            req.user = decoded;
        } else {
            console.error('Invalid token structure:', decoded);
            return res.status(401).json({ msg: 'Invalid token structure' });
        }
        
        // Log user info for debugging (without sensitive data)
        console.log('Authenticated user:', {
            id: req.user.id,
            username: req.user.username,
            roleName: req.user.roleName || req.user.role,
            privilegesCount: req.user.privileges ? req.user.privileges.length : 0,
            hasPrivileges: !!req.user.privileges
        });
        next(); // Proceed to the next middleware/route handler
    } catch (err) {
        // If token is invalid (e.g., expired, tampered)
        console.error('Token verification failed:', err.message);
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
