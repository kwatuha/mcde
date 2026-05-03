// src/api/axiosInstance.js
import axios, { AxiosHeaders } from 'axios';
import { ROUTES } from '../configs/appConfig';

/**
 * @file Centralized Axios instance for making API requests.
 * @description Configures a base URL and includes request/response interceptors
 * for consistent handling of headers (e.g., authentication tokens) and errors.
 */

// Prefer explicit API URL via env (e.g., http://api:3000 in Docker),
// otherwise fall back to Nginx/Vite proxy at /api
const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
    ? import.meta.env.VITE_API_URL
    : '/api';
// const API_BASE_URL = 'http://192.168.100.12:6000/api'; // Ensure this matches your Express API base URL

//const API_BASE_URL = 'http://192.168.100.12:3000/api'; // Intellibibiz Ensure this matches your Express API base URL
// const API_BASE_URL = 'http://192.168.100.28:3000/api'; // Advocate Ensure this matches your Express API base URL

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 60000, // Request timeout in milliseconds (60 seconds for large operations)
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor: Adds Authorization: Bearer token to headers if available in localStorage
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('jwtToken'); // Assuming token is stored as 'jwtToken'
        if (token) {
            config.headers.Authorization = `Bearer ${token}`; // Changed to Bearer token
        }
        // Default instance Content-Type is application/json. For FormData, axios would otherwise
        // stringify the body in transformRequest; browsers must set multipart boundary themselves.
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
            const h = AxiosHeaders.from(config.headers || {});
            h.delete('Content-Type');
            config.headers = h;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor: Logs API errors and re-throws them for component-level handling
axiosInstance.interceptors.response.use(
    (response) => response, // If response is successful, just return it
    (error) => {
        const status = error?.response?.status;
        const requestUrl = String(error?.config?.url || '');
        const isLoginRequest = requestUrl.includes('/auth/login');
        const isExpectedInvalidLogin = isLoginRequest && status === 400;

        // Avoid noisy console errors for expected invalid-login attempts.
        if (isExpectedInvalidLogin) {
            console.info('Login attempt rejected: invalid credentials.');
        } else {
            console.error('API Response Error:', error.response || error.message);
        }
        
        // Handle 401 Unauthorized errors (token expired or invalid)
        if (error.response && error.response.status === 401) {
            console.warn('Token expired or invalid. Clearing local storage...');
            localStorage.removeItem('jwtToken');
            
            // If we're not already on the login page, redirect to login
            const loginPath = '/login';
            if (window.location.pathname !== loginPath && !window.location.pathname.endsWith('/login')) {
                window.location.href = loginPath;
            }
        }
        
        // Helpful context when nginx/Vite returns 502/503 (upstream not listening or wrong port).
        const st = error.response?.status;
        if (st === 502 || st === 503 || st === 504) {
            const hint =
                ' The API process may be down or on a different port than the proxy (nginx proxies /api to 127.0.0.1:3002; start the API with PORT=3002, or align nginx and VITE_PROXY_TARGET).';
            if (error.message && !String(error.message).includes('nginx proxies')) {
                error.message = `${error.message}${hint}`;
            }
        }
        // Reject the full Axios error so callers can use err.response?.status and
        // err.response?.data?.message | .error | .msg (rejecting only response.data breaks that).
        return Promise.reject(error);
    }
);

export default axiosInstance;
