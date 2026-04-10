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
    Container
} from '@mui/material';
import AppFooter from './AppFooter.jsx';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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

    return (
        <>
        <Container
            maxWidth="sm"
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #2196f3 0%, #42a5f5 25%, #1976d2 50%, #1e88e5 75%, #2196f3 100%)',
                py: 2,
                pb: 7,
            }}
        >
            <Card
                sx={{
                    width: '100%',
                    maxWidth: 420,
                    p: 2.5,
                    borderRadius: 4,
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(15px)',
                    border: '1px solid rgba(59, 130, 246, 0.1)',
                    boxShadow: '0 12px 40px rgba(30, 58, 138, 0.15), 0 4px 16px rgba(30, 58, 138, 0.1)',
                    transform: 'translateY(0)',
                    transition: 'all 0.3s ease-in-out',
                    '&:hover': {
                        transform: 'translateY(-6px)',
                        boxShadow: '0 20px 60px rgba(30, 58, 138, 0.2), 0 8px 24px rgba(30, 58, 138, 0.15)'
                    }
                }}
            >
                <CardContent sx={{ p: 0 }}>
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                            <Typography
                                variant="h4"
                                sx={{
                                    fontSize: '2.5rem',
                                    fontWeight: 700,
                                    background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 50%, #64b5f6 100%)',
                                    backgroundClip: 'text',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    letterSpacing: '-0.02em',
                                    mb: 0.5,
                                    fontFamily: '"Montserrat", "Roboto", "Helvetica", "Arial", sans-serif'
                                }}
                            >
                                GPRIS
                            </Typography>
                            <Typography variant="subtitle1" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b', letterSpacing: '0.05em', textTransform: 'none' }}>
                                Government Projects Reporting Information System
                            </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', mt: 1, fontStyle: 'italic', color: '#6b7280' }}>
                            Please Login
                        </Typography>
                    </Box>

                    <Box component="form" onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Username/Email"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            disabled={loading}
                            size="small"
                            sx={{
                                mb: 1.5,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6', borderWidth: 2 }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#1e3a8a', borderWidth: 2 }
                                    }
                                }
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
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6', borderWidth: 2 }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#1e3a8a', borderWidth: 2 }
                                    }
                                }
                            }}
                            variant="outlined"
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={showPassword}
                                        onChange={(e) => setShowPassword(e.target.checked)}
                                    />
                                }
                                label="Show password"
                                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                            />
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                            <FormControlLabel
                                control={<Checkbox size="small" />}
                                label="Remember me"
                                sx={{ fontSize: '0.8rem', '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                            />
                            <Link href="#" sx={{ fontSize: '0.8rem', textDecoration: 'none', color: '#3b82f6', fontWeight: 500, '&:hover': { textDecoration: 'underline', color: '#1e3a8a' } }}>
                                Forgot Password?
                            </Link>
                        </Box>

                        {error && (
                            <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.8rem', py: 0.5 }}>
                                {error}
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            disabled={loading}
                            sx={{
                                py: 1.2,
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                borderRadius: 3,
                                textTransform: 'none',
                                background: 'linear-gradient(45deg, #1e3a8a 30%, #3b82f6 90%)',
                                boxShadow: '0 4px 12px rgba(30, 58, 138, 0.3)',
                                transition: 'all 0.3s ease-in-out',
                                '&:hover': {
                                    background: 'linear-gradient(45deg, #1e40af 30%, #2563eb 90%)',
                                    boxShadow: '0 6px 16px rgba(30, 58, 138, 0.4)',
                                    transform: 'translateY(-2px)'
                                },
                                '&:disabled': {
                                    background: 'linear-gradient(45deg, #bdbdbd 30%, #e0e0e0 90%)',
                                    boxShadow: 'none',
                                    transform: 'none'
                                }
                            }}
                        >
                            {loading ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={18} color="inherit" />
                                    Logging In...
                                </Box>
                            ) : (
                                'Login'
                            )}
                        </Button>

                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5, fontSize: '0.85rem' }}>
                                Don't have an account?
                            </Typography>
                            <Link component={RouterLink} to="/register" sx={{ fontSize: '0.9rem', textDecoration: 'none', color: '#3b82f6', fontWeight: 600, '&:hover': { textDecoration: 'underline', color: '#1e3a8a' } }}>
                                Register here
                            </Link>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        </Container>
        <AppFooter variant="fixed" />
        </>
    );
};

export default Login;
