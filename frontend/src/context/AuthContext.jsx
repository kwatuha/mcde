import React, {
    createContext,
    useState,
    useEffect,
    useContext,
    useCallback,
    useMemo,
} from 'react';
import { jwtDecode } from 'jwt-decode';
import { Alert, Snackbar } from '@mui/material';
import apiService from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('jwtToken'));
    const [mustChangePassword, setMustChangePassword] = useState(localStorage.getItem('mustChangePassword') === 'true');
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(60);
    const [showIdleWarning, setShowIdleWarning] = useState(false);
    const [showIdleLoggedOutNotice, setShowIdleLoggedOutNotice] = useState(false);

    const login = useCallback(async (newToken, options = {}) => {
        localStorage.setItem('jwtToken', newToken);
        setToken(newToken);
        const force = options?.forcePasswordChange === true;
        localStorage.setItem('mustChangePassword', force ? 'true' : 'false');
        setMustChangePassword(force);
        try {
            const decodedUser = jwtDecode(newToken);
            let sessionUser = decodedUser.user;
            try {
                const refreshed = await apiService.auth.getMe();
                if (refreshed?.user) {
                    sessionUser = { ...sessionUser, ...refreshed.user };
                }
            } catch (refreshErr) {
                console.warn('Could not refresh session user after login:', refreshErr?.message || refreshErr);
            }
            setUser(sessionUser);
            return sessionUser;
        } catch (error) {
            console.error("Failed to decode token on login:", error);
            localStorage.removeItem('jwtToken');
            setToken(null);
            setUser(null);
            return null;
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
                        let sessionUser = decoded.user;
                        setToken(storedToken);
                        setMustChangePassword(localStorage.getItem('mustChangePassword') === 'true');
                        try {
                            const refreshed = await apiService.auth.getMe();
                            if (refreshed?.user) {
                                sessionUser = { ...sessionUser, ...refreshed.user };
                            }
                        } catch (refreshErr) {
                            console.warn('Could not refresh session user:', refreshErr?.message || refreshErr);
                        }
                        setUser(sessionUser);
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

    useEffect(() => {
        const loadSessionPolicy = async () => {
            if (!token) return;
            try {
                const data = await apiService.auth.getSessionPolicy();
                const mins = parseInt(String(data?.idleTimeoutMinutes), 10);
                if (Number.isFinite(mins) && mins > 0) {
                    setIdleTimeoutMinutes(mins);
                }
            } catch (error) {
                // Keep default if policy is unavailable.
                console.warn('Falling back to default idle timeout policy:', error?.message || error);
            }
        };
        loadSessionPolicy();
    }, [token]);

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

    // Idle timeout: if no activity is detected for configured period, auto logout.
    // Throttle activity handling so keydown/mousemove do not clear/reschedule timers on every event
    // (that caused noticeable input lag across the app).
    useEffect(() => {
        if (!token || !idleTimeoutMinutes || idleTimeoutMinutes < 1) return undefined;

        const idleMs = idleTimeoutMinutes * 60 * 1000;
        const warningLeadMs = 60 * 1000; // show warning 1 minute before logout
        let timeoutId;
        let warningTimeoutId;

        const scheduleIdleExpiry = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (warningTimeoutId) clearTimeout(warningTimeoutId);
            setShowIdleWarning(false);

            if (idleMs > warningLeadMs) {
                warningTimeoutId = setTimeout(() => {
                    setShowIdleWarning(true);
                }, idleMs - warningLeadMs);
            }

            timeoutId = setTimeout(() => {
                setShowIdleWarning(false);
                setShowIdleLoggedOutNotice(true);
                logout();
            }, idleMs);
        };

        const ACTIVITY_THROTTLE_MS = 750;
        let lastActivityHandledAt = 0;

        const onUserActivity = () => {
            const now = Date.now();
            if (now - lastActivityHandledAt < ACTIVITY_THROTTLE_MS) return;
            lastActivityHandledAt = now;
            scheduleIdleExpiry();
        };

        const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, onUserActivity, { passive: true });
        });

        scheduleIdleExpiry();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (warningTimeoutId) clearTimeout(warningTimeoutId);
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, onUserActivity);
            });
        };
    }, [token, idleTimeoutMinutes, logout]);

    const contextValue = useMemo(
        () => ({
            token,
            user,
            mustChangePassword,
            loading,
            idleTimeoutMinutes,
            login,
            logout,
            completeForcedPasswordChange,
            hasPrivilege,
        }),
        [
            token,
            user,
            mustChangePassword,
            loading,
            idleTimeoutMinutes,
            login,
            logout,
            completeForcedPasswordChange,
            hasPrivilege,
        ]
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
            <Snackbar
                open={showIdleWarning}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                autoHideDuration={null}
                onClose={() => setShowIdleWarning(false)}
            >
                <Alert
                    severity="warning"
                    variant="filled"
                    onClose={() => setShowIdleWarning(false)}
                    sx={{ width: '100%' }}
                >
                    You will be logged out in 1 minute due to inactivity.
                </Alert>
            </Snackbar>
            <Snackbar
                open={showIdleLoggedOutNotice}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                autoHideDuration={5000}
                onClose={() => setShowIdleLoggedOutNotice(false)}
            >
                <Alert
                    severity="info"
                    variant="filled"
                    onClose={() => setShowIdleLoggedOutNotice(false)}
                    sx={{ width: '100%' }}
                >
                    You were logged out due to Inactivity
                </Alert>
            </Snackbar>
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