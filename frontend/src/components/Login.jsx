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
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import gprisLogo from '../assets/gpris.png';

/** Login page palette — ICT.go.ke top bar blue (#005a9a) and shades */
const micde = {
    brand: '#005a9a',
    brandHover: '#00477d',
    brandMuted: '#5a92c4',
    brandDark: '#003559',
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
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
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

    const fontStack = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif';

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: `linear-gradient(165deg, ${micde.pageBgTop} 0%, ${micde.pageBgMid} 42%, ${micde.pageBgBottom} 100%)`,
                pt: 0,
                pb: 3,
            }}
        >
            <Container
                maxWidth="sm"
                sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 3,
                }}
            >
            <Card
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 440,
                    p: { xs: 2.25, sm: 3 },
                    borderRadius: 2,
                    background: '#ffffff',
                    border: `1px solid ${micde.borderLight}`,
                    boxShadow: '0 4px 24px rgba(0, 90, 154, 0.08), 0 1px 3px rgba(0,0,0,0.06)',
                }}
            >
                <CardContent sx={{ p: 0 }}>
                    <Box sx={{ textAlign: 'center', mb: 2.5 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 1.5 }}>
                            {!logoFailed ? (
                                <Box
                                    component="img"
                                    src={gprisLogo}
                                    alt="GPRIS — Government Projects Reporting Information System"
                                    onError={() => setLogoFailed(true)}
                                    sx={{
                                        maxWidth: '100%',
                                        width: 'auto',
                                        height: 'auto',
                                        maxHeight: { xs: 76, sm: 92 },
                                        objectFit: 'contain',
                                        mb: 1.25,
                                        display: 'block',
                                    }}
                                />
                            ) : (
                                <Typography
                                    variant="h5"
                                    component="h1"
                                    sx={{
                                        fontFamily: fontStack,
                                        fontWeight: 800,
                                        color: micde.textPrimary,
                                        letterSpacing: '-0.02em',
                                        mb: 1.25,
                                    }}
                                >
                                    GPRIS
                                </Typography>
                            )}
                            <Typography
                                variant="body2"
                                component="p"
                                sx={{
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    color: micde.textSecondary,
                                    fontFamily: fontStack,
                                    mt: 0,
                                    lineHeight: 1.45,
                                    maxWidth: 360,
                                    mx: 'auto',
                                }}
                            >
                                Government Projects Reporting Information System
                            </Typography>
                        </Box>
                    </Box>

                    <Box component="form" onSubmit={handleSubmit}>
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
                        </Box>

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
