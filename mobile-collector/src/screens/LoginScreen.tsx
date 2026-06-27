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

  const errorMessage = (error: any) => {
    const data = error?.response?.data;
    return (
      data?.error ||
      data?.message ||
      (typeof data === 'string' ? data : null) ||
      error?.message ||
      'Request failed'
    );
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
        <Text style={styles.badge}>Machakos County</Text>
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
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    color: THEME.primaryDark,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    overflow: 'hidden',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: THEME.primaryDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: THEME.textMuted,
    marginBottom: 28,
    lineHeight: 22,
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
