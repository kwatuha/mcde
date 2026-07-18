import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';

import apiService, { AuthUser } from '../services/api';
import LoginScreen from '../screens/LoginScreen';
import ForcePasswordChangeScreen from '../screens/ForcePasswordChangeScreen';
import TemplatesScreen from '../screens/TemplatesScreen';
import SubmissionsScreen from '../screens/SubmissionsScreen';
import NewVisitScreen from '../screens/NewVisitScreen';
import ExecutiveHomeScreen from '../screens/ExecutiveHomeScreen';
import AttentionScreen from '../screens/AttentionScreen';
import PortfolioByStatusScreen from '../screens/PortfolioByStatusScreen';
import FinanceSnapshotScreen from '../screens/FinanceSnapshotScreen';
import ExecutiveProjectsScreen from '../screens/ExecutiveProjectsScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import ExecutiveMoreScreen from '../screens/ExecutiveMoreScreen';
import MainTabBar from '../components/MainTabBar';
import { THEME } from '../config/api';
import { refreshCatalog } from '../services/syncService';
import { getAppMode } from '../utils/roleUtils';

export const AuthContext = React.createContext<{ logout: () => Promise<void> } | null>(
  null
);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const FieldTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <MainTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen
      name="Checklists"
      component={TemplatesScreen}
      options={{ title: 'Checklists', tabBarLabel: 'Checklists' }}
    />
    <Tab.Screen
      name="Submissions"
      component={SubmissionsScreen}
      options={{ title: 'Visits', tabBarLabel: 'My visits' }}
    />
  </Tab.Navigator>
);

const ExecutiveTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <MainTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen
      name="Home"
      component={ExecutiveHomeScreen}
      options={{ title: 'Briefing', tabBarLabel: 'Briefing' }}
    />
    <Tab.Screen
      name="Attention"
      component={AttentionScreen}
      options={{ title: 'Attention', tabBarLabel: 'Attention' }}
    />
    <Tab.Screen
      name="Projects"
      component={ExecutiveProjectsScreen}
      options={{ title: 'Projects', tabBarLabel: 'Projects' }}
    />
    <Tab.Screen
      name="More"
      component={ExecutiveMoreScreen}
      options={{ title: 'More', tabBarLabel: 'More' }}
    />
  </Tab.Navigator>
);

const AppNavigator: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const session = await apiService.resumeSession();
      setIsAuthenticated(session.authenticated);
      setMustChangePassword(session.mustChangePassword);
      if (session.authenticated) {
        setUser(await apiService.getUserData());
      } else {
        setUser(null);
      }
    } catch {
      setIsAuthenticated(false);
      setMustChangePassword(false);
      setUser(null);
    }
  }, []);

  const handleLoginSuccess = useCallback(async (options?: { mustChangePassword?: boolean }) => {
    if (options?.mustChangePassword) {
      setIsAuthenticated(true);
      setMustChangePassword(true);
      setUser(await apiService.getUserData());
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
    setUser(null);
  }, []);

  useEffect(() => {
    apiService.setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setMustChangePassword(false);
      setUser(null);
    });
    return () => apiService.setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return;
    const mode = getAppMode(user);
    if (mode === 'field') {
      refreshCatalog().catch(() => {});
    }
  }, [isAuthenticated, mustChangePassword, user]);

  if (isAuthenticated === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  const mode = getAppMode(user);

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
                    apiService.getUserData().then(setUser).catch(() => {});
                    if (getAppMode(user) === 'field') {
                      refreshCatalog().catch(() => {});
                    }
                  }}
                  onLogout={logout}
                />
              )}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen
                name="MainTabs"
                component={mode === 'executive' ? ExecutiveTabs : FieldTabs}
              />
              {mode === 'executive' ? (
                <>
                  <Stack.Screen name="Finance" component={FinanceSnapshotScreen} />
                  <Stack.Screen name="Portfolio" component={PortfolioByStatusScreen} />
                  <Stack.Screen name="Performance" component={PerformanceScreen} />
                </>
              ) : (
                <Stack.Screen
                  name="NewVisit"
                  component={NewVisitScreen}
                  options={{
                    headerShown: false,
                    presentation: 'card',
                  }}
                />
              )}
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
};

export default AppNavigator;
