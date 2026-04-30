// src/components/Login.jsx
import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import apiService from '../api';
import {
    Box,
    Card,
    CardContent,
    TextField,
    Button,
    Typography,
    FormControlLabel,
    Checkbox,
    Link,
    Alert,
    CircularProgress,
    Container,
    IconButton,
    InputAdornment,
    Stack,
    useTheme,
    alpha,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import gprisLogo from '../assets/gpris.png';

/** Login page palette — ICT.go.ke top bar blue (#005a9a) and shades */
const micde = {
    brand: '#005a9a',
    brandHover: '#00477d',
    brandMuted: '#5a92c4',
    brandDark: '#003559',
    brandLight: '#0f6fb4',
    pageBgTop: '#e8f4fc',
    pageBgMid: '#f8fafc',
    pageBgBottom: '#f0f4f8',
    textPrimary: '#1c1917',
    textSecondary: '#44403c',
    textMuted: '#78716c',
    borderLight: 'rgba(0, 90, 154, 0.14)',
    inputBg: '#fafafa',
    inputBgHover: '#f4f4f5',
};

const Login = () => {
    const theme = useTheme();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setInfoMessage('');
        setLoading(true);
        console.log('Login.jsx: Attempting login with username:', username);
        try {
            const data = await apiService.auth.login(username, password);
            console.log('Login.jsx: Login API response data:', data);

            if (data && data.token) {
                console.log('Login.jsx: Token received, calling AuthContext login:', data.token);
                login(data.token, { forcePasswordChange: data.forcePasswordChange === true });
                if (data.forcePasswordChange === true) {
                    navigate('/force-password-change', { replace: true });
                } else {
                    console.log('Login.jsx: Login successful, navigating to dashboard.');
                    navigate('/', { replace: true });
                }
            } else {
                setError('Login successful, but no token property received in response.');
                console.error('Login.jsx: Login successful, but no token property in response data:', data);
            }
        } catch (err) {
            console.error('Login.jsx: Error caught during login API call:', err);
            const errorMessage = err?.error || err?.message || (typeof err === 'string' ? err : 'Login failed. Please check your credentials.');
            setError(errorMessage);
        } finally {
            setLoading(false);
            console.log('Login.jsx: Login attempt finished. Loading set to false.');
        }
    };

    const handleForgotPassword = async () => {
        const email = window.prompt('Enter your account email to receive a reset password:');
        if (!email || !String(email).trim()) return;

        setError('');
        setInfoMessage('');
        try {
            const data = await apiService.auth.forgotPassword(String(email).trim());
            setInfoMessage(data?.message || 'If the email exists, a password reset message has been sent.');
        } catch (err) {
            const errorMessage = err?.error || err?.message || 'Could not process password reset request.';
            setError(errorMessage);
        }
    };

    const fontStack = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif';
    const primary = theme.palette.primary.main;
    const shortScreen = {
        '@media (max-height: 720px)': {
            py: { xs: 0.75, sm: 1 },
        },
        '@media (max-height: 640px)': {
            py: 0.5,
        },
    };

    return (
        <Box
            sx={{
                minHeight: '100dvh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: { xs: 1.25, sm: 2 },
                px: 2,
                position: 'relative',
                overflow: 'hidden',
                boxSizing: 'border-box',
                ...shortScreen,
                bgcolor: '#f1f5f9',
                backgroundImage: `
                    radial-gradient(ellipse 120% 80% at 50% -30%, ${alpha(primary, 0.18)}, transparent 55%),
                    radial-gradient(ellipse 70% 50% at 100% 100%, ${alpha('#38bdf8', 0.12)}, transparent 50%),
                    linear-gradient(180deg, #f8fafc 0%, #f1f5f9 45%, #e2e8f0 100%)
                `,
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `repeating-linear-gradient(
                        -12deg,
                        transparent,
                        transparent 40px,
                        ${alpha(theme.palette.common.black, 0.02)} 40px,
                        ${alpha(theme.palette.common.black, 0.02)} 41px
                    )`,
                    pointerEvents: 'none',
                },
            }}
        >
            <Container
                maxWidth="sm"
                sx={{
                    position: 'relative',
                    zIndex: 1,
                    py: 0,
                }}
            >
            <Card
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 440,
                    p: 0,
                    overflow: 'hidden',
                    borderRadius: 3,
                    background: '#ffffff',
                    border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
                    boxShadow: `
                        0 1px 2px ${alpha(theme.palette.common.black, 0.04)},
                        0 12px 40px ${alpha(primary, 0.12)},
                        0 4px 24px ${alpha(theme.palette.common.black, 0.06)}
                    `,
                }}
            >
                <CardContent sx={{ p: 0 }}>
                    <Stack
                        spacing={{ xs: 1.25, sm: 1.5 }}
                        alignItems="center"
                        sx={{ mb: { xs: 1.5, sm: 2 }, px: { xs: 2, sm: 2.5 }, pt: { xs: 2, sm: 2.5 } }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {!logoFailed ? (
                                <Box
                                    component="img"
                                    src={gprisLogo}
                                    alt="MCME — Monitoring County Management and Evaluation"
                                    onError={() => setLogoFailed(true)}
                                    sx={{
                                        maxWidth: '100%',
                                        width: { xs: 188, sm: 216 },
                                        height: { xs: 188, sm: 216 },
                                        objectFit: 'contain',
                                        mb: 0.75,
                                        display: 'block',
                                        '@media (max-height: 720px)': {
                                            height: 160,
                                            width: 160,
                                        },
                                        '@media (max-height: 640px)': {
                                            height: 136,
                                            width: 136,
                                        },
                                    }}
                                />
                            ) : (
                                <Typography
                                    variant="h5"
                                    component="h1"
                                    sx={{
                                        fontFamily: fontStack,
                                        fontWeight: 800,
                                        color: theme.palette.primary.dark,
                                        letterSpacing: '0.04em',
                                        textTransform: 'uppercase',
                                        mb: 0.5,
                                    }}
                                >
                                    County Government of Machakos
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ textAlign: 'center', width: '100%', px: { xs: 0.5, sm: 1 } }}>
                            <Typography
                                component="p"
                                sx={{
                                    m: 0,
                                    fontWeight: 700,
                                    color: theme.palette.primary.main,
                                    fontFamily: fontStack,
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase',
                                    fontSize: { xs: '1rem', sm: '1.125rem' },
                                    lineHeight: 1.3,
                                }}
                            >
                                County Government of Machakos
                            </Typography>
                            <Box
                                aria-hidden
                                sx={{
                                    width: { xs: 56, sm: 64 },
                                    height: 3,
                                    mt: { xs: 0.9, sm: 1.1 },
                                    mb: { xs: 0.45, sm: 0.6 },
                                    mx: 'auto',
                                    borderRadius: 1.5,
                                    background: `linear-gradient(90deg, ${alpha(primary, 0.15)} 0%, ${primary} 45%, ${alpha(primary, 0.15)} 100%)`,
                                }}
                            />
                            <Typography
                                variant="h4"
                                component="p"
                                sx={{
                                    m: 0,
                                    fontWeight: 700,
                                    color: theme.palette.grey[900],
                                    fontFamily: fontStack,
                                    letterSpacing: '0.06em',
                                    fontSize: { xs: '1.5rem', sm: '1.75rem' },
                                    lineHeight: 1.15,
                                    mt: { xs: 0.25, sm: 0.5 },
                                }}
                            >
                                E-CIMES
                            </Typography>
                            <Box
                                sx={{
                                    mt: { xs: 1, sm: 1.125 },
                                    mx: 'auto',
                                    maxWidth: 400,
                                    px: { xs: 1.5, sm: 2 },
                                    py: { xs: 1, sm: 1.25 },
                                    borderRadius: 2,
                                    bgcolor: alpha(primary, 0.06),
                                    border: `1px solid ${alpha(primary, 0.14)}`,
                                }}
                            >
                                <Typography
                                    component="p"
                                    sx={{
                                        m: 0,
                                        textAlign: 'center',
                                        fontSize: { xs: '0.8125rem', sm: '0.9375rem' },
                                        lineHeight: 1.55,
                                        fontWeight: 400,
                                        color: theme.palette.grey[700],
                                        letterSpacing: '0.025em',
                                        fontFamily: fontStack,
                                    }}
                                >
                                    Electronic County Integrated
                                    <br />
                                    Monitoring &amp; Evaluation System
                                </Typography>
                            </Box>
                        </Box>
                    </Stack>

                    <Box component="form" onSubmit={handleSubmit} sx={{ px: { xs: 2.25, sm: 3 }, pb: { xs: 2.25, sm: 3 } }}>
                        <TextField
                            fullWidth
                            label="Username / Email"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            disabled={loading}
                            size="small"
                            sx={{
                                mb: 1.5,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 1,
                                    backgroundColor: micde.inputBg,
                                    fontFamily: fontStack,
                                    '&:hover': {
                                        backgroundColor: micde.inputBgHover,
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: micde.brandMuted },
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: '#fff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: micde.brand, borderWidth: '2px' },
                                    },
                                },
                                '& .MuiInputLabel-root.Mui-focused': { color: micde.brand },
                            }}
                            variant="outlined"
                        />
                        <TextField
                            fullWidth
                            label="Password"
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => e.target.value.length <= 50 ? setPassword(e.target.value) : null}
                            required
                            disabled={loading}
                            size="small"
                            sx={{
                                mb: 1.5,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 1,
                                    backgroundColor: micde.inputBg,
                                    fontFamily: fontStack,
                                    '&:hover': {
                                        backgroundColor: micde.inputBgHover,
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: micde.brandMuted },
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: '#fff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: micde.brand, borderWidth: '2px' },
                                    },
                                },
                                '& .MuiInputLabel-root.Mui-focused': { color: micde.brand },
                            }}
                            variant="outlined"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            edge="end"
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            disabled={loading}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                            <FormControlLabel
                                control={<Checkbox size="small" sx={{ color: micde.brand, '&.Mui-checked': { color: micde.brand } }} />}
                                label="Remember me"
                                sx={{ fontSize: '0.8rem', '& .MuiFormControlLabel-label': { fontSize: '0.8rem', color: micde.textSecondary, fontFamily: fontStack } }}
                            />
                            <Link
                                component="button"
                                type="button"
                                onClick={handleForgotPassword}
                                disabled={loading}
                                sx={{
                                    fontSize: '0.82rem',
                                    textDecoration: 'none',
                                    color: micde.brand,
                                    fontWeight: 700,
                                    fontFamily: fontStack,
                                    background: 'none',
                                    border: 0,
                                    p: 0,
                                    cursor: 'pointer',
                                    '&:hover': { textDecoration: 'underline', color: micde.brandDark },
                                }}
                            >
                                Forgot password?
                            </Link>
                        </Box>

                        {infoMessage && (
                            <Alert severity="success" sx={{ mb: 1.5, fontSize: '0.8rem', py: 0.5, fontFamily: fontStack }}>
                                {infoMessage}
                            </Alert>
                        )}

                        {error && (
                            <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.8rem', py: 0.5, fontFamily: fontStack }}>
                                {error}
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            disabled={loading}
                            sx={{
                                py: 1.15,
                                fontSize: '1rem',
                                fontWeight: 700,
                                borderRadius: 1,
                                textTransform: 'none',
                                fontFamily: fontStack,
                                bgcolor: micde.brand,
                                color: '#fff',
                                boxShadow: 'none',
                                '&:hover': {
                                    bgcolor: micde.brandHover,
                                    boxShadow: '0 4px 14px rgba(0, 90, 154, 0.35)',
                                },
                                '&:disabled': {
                                    bgcolor: '#a8a29e',
                                    color: '#f5f5f4',
                                },
                            }}
                        >
                            {loading ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={18} color="inherit" />
                                    Signing in…
                                </Box>
                            ) : (
                                'Sign in'
                            )}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 2.5, pt: 2, borderTop: `1px solid ${micde.borderLight}` }}>
                            <Typography variant="body2" sx={{ color: micde.textMuted, mb: 0.5, fontSize: '0.8125rem', fontFamily: fontStack }}>
                                Need an account?
                            </Typography>
                            <Link component={RouterLink} to="/register" sx={{ fontSize: '0.9rem', textDecoration: 'none', color: micde.brand, fontWeight: 700, fontFamily: fontStack, '&:hover': { textDecoration: 'underline', color: micde.brandDark } }}>
                                Register
                            </Link>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
            </Container>
        </Box>
    );
};

export default Login;
