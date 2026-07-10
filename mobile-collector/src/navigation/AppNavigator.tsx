import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';

import apiService from '../services/api';
import LoginScreen from '../screens/LoginScreen';
import ForcePasswordChangeScreen from '../screens/ForcePasswordChangeScreen';
import TemplatesScreen from '../screens/TemplatesScreen';
import SubmissionsScreen from '../screens/SubmissionsScreen';
import NewVisitScreen from '../screens/NewVisitScreen';
import MainTabBar from '../components/MainTabBar';
import { THEME } from '../config/api';
import { refreshCatalog } from '../services/syncService';

export const AuthContext = React.createContext<{ logout: () => Promise<void> } | null>(
  null
);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <MainTabBar {...props} />}
    screenOptions={{
      headerShown: false,
    }}
  >
    <Tab.Screen
      name="Checklists"
      component={TemplatesScreen}
      options={{
        title: 'Checklists',
        tabBarLabel: 'Checklists',
      }}
    />
    <Tab.Screen
      name="Submissions"
      component={SubmissionsScreen}
      options={{
        title: 'Visits',
        tabBarLabel: 'My visits',
      }}
    />
  </Tab.Navigator>
);

const AppNavigator: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const session = await apiService.resumeSession();
      setIsAuthenticated(session.authenticated);
      setMustChangePassword(session.mustChangePassword);
    } catch {
      setIsAuthenticated(false);
      setMustChangePassword(false);
    }
  }, []);

  const handleLoginSuccess = useCallback(async (options?: { mustChangePassword?: boolean }) => {
    if (options?.mustChangePassword) {
      setIsAuthenticated(true);
      setMustChangePassword(true);
      return;
    }
    await checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await apiService.logout();
    setIsAuthenticated(false);
    setMustChangePassword(false);
  }, []);

  useEffect(() => {
    apiService.setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setMustChangePassword(false);
    });
    return () => apiService.setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return;
    refreshCatalog().catch(() => {});
  }, [isAuthenticated, mustChangePassword]);

  if (isAuthenticated === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Login">
              {() => <LoginScreen onLoginSuccess={handleLoginSuccess} />}
            </Stack.Screen>
          ) : mustChangePassword ? (
            <Stack.Screen name="ForcePasswordChange">
              {() => (
                <ForcePasswordChangeScreen
                  onPasswordChanged={() => {
                    setMustChangePassword(false);
                    refreshCatalog().catch(() => {});
                  }}
                  onLogout={logout}
                />
              )}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen
                name="NewVisit"
                component={NewVisitScreen}
                options={{
                  headerShown: false,
                  presentation: 'card',
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
};

export default AppNavigator;
