import { AppRegistry } from 'react-native';
import App from './App';
import { configureGeolocation } from './src/utils/locationCapture';
import { name as appName } from './app.json';

configureGeolocation();

AppRegistry.registerComponent(appName, () => App);
