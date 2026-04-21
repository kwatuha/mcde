import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import apiService from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('jwtToken'));
    const [mustChangePassword, setMustChangePassword] = useState(localStorage.getItem('mustChangePassword') === 'true');
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const login = useCallback(async (newToken, options = {}) => {
        localStorage.setItem('jwtToken', newToken);
        setToken(newToken);
        const force = options?.forcePasswordChange === true;
        localStorage.setItem('mustChangePassword', force ? 'true' : 'false');
        setMustChangePassword(force);
        try {
            const decodedUser = jwtDecode(newToken);
            setUser(decodedUser.user);
            // console.log("LOGIN: Decoded user from token:", decodedUser.user);
            // console.log("LOGIN: User privileges from token:", decodedUser.user.privileges);
        } catch (error) {
            console.error("Failed to decode token on login:", error);
            localStorage.removeItem('jwtToken');
            setToken(null);
            setUser(null);
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('mustChangePassword');
        setToken(null);
        setMustChangePassword(false);
        setUser(null);
    }, []);

    const completeForcedPasswordChange = useCallback(() => {
        localStorage.setItem('mustChangePassword', 'false');
        setMustChangePassword(false);
    }, []);

    const hasPrivilege = useCallback((privilegeName) => {
        // console.log("CHECK PRIVILEGE: Checking for:", privilegeName);
        // console.log("CHECK PRIVILEGE: User's privileges list:", user?.privileges);
        if (!user || !user.privileges) {
            return false;
        }
        return user.privileges.includes(privilegeName);
    }, [user]);

    useEffect(() => {
        const loadUserFromToken = async () => {
            setLoading(true);
            const storedToken = localStorage.getItem('jwtToken');
            if (storedToken) {
                try {
                    const decoded = jwtDecode(storedToken);
                    if (decoded.exp * 1000 < Date.now()) {
                        console.warn("Token expired. Logging out.");
                        logout();
                    } else {
                        setUser(decoded.user);
                        setToken(storedToken);
                        setMustChangePassword(localStorage.getItem('mustChangePassword') === 'true');
                        // console.log("EFFECT: User loaded from token:", decoded.user);
                        // console.log("EFFECT: User privileges loaded from token:", decoded.user.privileges);
                    }
                } catch (error) {
                    console.error("AuthContext: Error decoding or verifying token:", error);
                    logout();
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        };

        loadUserFromToken();
    }, [logout]);

    // Enforce automatic logout exactly when JWT expires (absolute session timeout).
    useEffect(() => {
        if (!token) return undefined;

        let timeoutId;
        try {
            const decoded = jwtDecode(token);
            const expMs = Number(decoded?.exp || 0) * 1000;
            if (!Number.isFinite(expMs) || expMs <= Date.now()) {
                logout();
                return undefined;
            }

            const msUntilExpiry = expMs - Date.now();
            timeoutId = setTimeout(() => {
                logout();
            }, msUntilExpiry);
        } catch (error) {
            console.error('Failed to decode token for expiry timer:', error);
            logout();
        }

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [token, logout]);

    const contextValue = {
        token,
        user,
        mustChangePassword,
        loading,
        login,
        logout,
        completeForcedPasswordChange,
        hasPrivilege,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    // Don't throw error immediately - return null and let components handle it gracefully
    // This prevents crashes during React StrictMode double renders or hot reloads
    if (!context) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('useAuth called outside AuthProvider. This may happen during development hot reloads.');
        }
        // Return a minimal context object to prevent crashes
        return {
            token: null,
            user: null,
            mustChangePassword: false,
            loading: true,
            login: () => {},
            logout: () => {},
            completeForcedPasswordChange: () => {},
            hasPrivilege: () => false,
        };
    }
    return context;
};