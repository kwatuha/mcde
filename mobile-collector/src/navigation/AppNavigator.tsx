import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';

import apiService from '../services/api';
import LoginScreen from '../screens/LoginScreen';
import TemplatesScreen from '../screens/TemplatesScreen';
import SubmissionsScreen from '../screens/SubmissionsScreen';
import NewVisitScreen from '../screens/NewVisitScreen';
import { STORAGE_KEYS, THEME } from '../config/api';

export const AuthContext = React.createContext<{ logout: () => Promise<void> } | null>(
  null
);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      tabBarActiveTintColor: THEME.primary,
      tabBarInactiveTintColor: '#999',
      headerShown: false,
    }}
  >
    <Tab.Screen
      name="Checklists"
      component={TemplatesScreen}
      options={{ title: 'Checklists' }}
    />
    <Tab.Screen
      name="Submissions"
      component={SubmissionsScreen}
      options={{ title: 'Visits' }}
    />
  </Tab.Navigator>
);

const AppNavigator: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      setIsAuthenticated(!!token);
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await apiService.logout();
    setIsAuthenticated(false);
  }, []);

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
              {() => <LoginScreen onLoginSuccess={checkAuth} />}
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
