import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import apiService from '../services/api';
import { THEME } from '../config/api';
import { LoginOtpChallenge } from '../types/dataCollection';

interface Props {
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpChallenge, setOtpChallenge] = useState<LoginOtpChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const errorMessage = (error: any) => {
    const data = error?.response?.data;
    const status = error?.response?.status;
    const serverMsg =
      data?.error ||
      data?.message ||
      (typeof data === 'string' ? data : null);
    if (serverMsg) return serverMsg;
    if (status === 401 || status === 400) {
      return 'Invalid username or password.';
    }
    if (error?.message?.includes('Network Error')) {
      return 'Cannot reach the server. Check mobile data/Wi‑Fi and that the app uses http://84.247.128.58:8084';
    }
    return error?.message || 'Request failed';
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Missing fields', 'Enter username and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiService.login(username.trim(), password);
      if (result.kind === 'otp') {
        setOtpChallenge(result.challenge);
        Alert.alert(
          'Verification code',
          result.challenge.message ||
            `Enter the code sent via ${result.challenge.otpChannel || 'SMS/email'}.`
        );
        return;
      }
      onLoginSuccess?.();
    } catch (error: any) {
      Alert.alert('Login failed', errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpChallenge?.otpChallengeId || !otpCode.trim()) {
      Alert.alert('Missing code', 'Enter the verification code.');
      return;
    }
    setLoading(true);
    try {
      await apiService.verifyOtp(otpChallenge.otpChallengeId, otpCode.trim());
      setOtpChallenge(null);
      setOtpCode('');
      onLoginSuccess?.();
    } catch (error: any) {
      Alert.alert('Verification failed', errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.orgName}>County Government of Machakos</Text>
        <Text style={styles.title}>Field Collector</Text>
        <Text style={styles.subtitle}>
          Download checklists and collect monitoring visit data offline.
        </Text>

        {!otpChallenge ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Username or email"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.otpHint}>
              {otpChallenge.maskedPhone
                ? `Code sent to ${otpChallenge.maskedPhone}`
                : 'Enter the verification code'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              keyboardType="number-pad"
              maxLength={8}
              value={otpCode}
              onChangeText={setOtpCode}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify & continue</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => {
                setOtpChallenge(null);
                setOtpCode('');
              }}
            >
              <Text style={styles.linkText}>Back to login</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 12,
  },
  orgName: {
    alignSelf: 'center',
    textAlign: 'center',
    color: THEME.primaryDark,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: THEME.primaryDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: THEME.textMuted,
    marginBottom: 28,
    lineHeight: 22,
    textAlign: 'center',
  },
  form: { gap: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  passwordToggleText: {
    color: THEME.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  otpHint: { color: THEME.textMuted, fontSize: 14, marginBottom: 4 },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: THEME.primary, fontWeight: '600' },
});

export default LoginScreen;
