// backend/middleware/authenticate.js
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap'; // Use the same secret as in auth.js

module.exports = function (req, res, next) {
    // Get token from header
    // Check for "Authorization" header, which is typically "Bearer TOKEN"
    const authHeader = req.header('Authorization');

    // Check if no Authorization header
    if (!authHeader) {
        return res.status(401).json({ msg: 'No token, authorization denied (Missing Authorization header)' });
    }

    // Extract the token from "Bearer TOKEN" format
    const token = authHeader.split(' ')[1];

    // Check if token is actually present after splitting
    if (!token) {
        return res.status(401).json({ msg: 'Invalid token format, authorization denied (Bearer token missing)' });
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
