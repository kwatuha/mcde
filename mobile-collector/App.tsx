import React from 'react';
import { StatusBar } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { THEME } from './src/config/api';

const App: React.FC = () => {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.primaryDark} />
      <AppNavigator />
    </>
  );
};

export default App;
