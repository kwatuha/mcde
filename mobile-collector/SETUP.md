# Mobile App Setup Guide

## Prerequisites

1. **Node.js 18+** - Install from [nodejs.org](https://nodejs.org/)
2. **React Native CLI** - Install globally:
   ```bash
   npm install -g react-native-cli
   ```
3. **Android Studio** - Download from [developer.android.com](https://developer.android.com/studio)
4. **Java Development Kit (JDK) 17+** - Usually comes with Android Studio

## Initial Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure API Endpoint

Edit `src/config/api.ts` and update the `API_BASE_URL`:

- **Android Emulator**: Use `http://10.0.2.2:3003` (this maps to localhost)
- **Physical Device**: Use your computer's IP address, e.g., `http://192.168.1.100:3003`
- **Production**: Use your production server URL

To find your computer's IP address:
- Linux/Mac: `ifconfig` or `ip addr`
- Windows: `ipconfig`

### 3. Android Setup

1. Open Android Studio
2. Install Android SDK (API 23+)
3. Create an Android Virtual Device (AVD) or connect a physical device
4. Enable Developer Options and USB Debugging on physical devices

### 4. Run the App

#### Start Metro Bundler
```bash
npm start
```

#### Run on Android (in a new terminal)
```bash
npm run android
```

## Building for Production

### Generate Release APK

```bash
cd android
./gradlew assembleRelease
```

The APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

### Generate Release AAB (for Play Store)

```bash
cd android
./gradlew bundleRelease
```

The AAB will be located at:
`android/app/build/outputs/bundle/release/app-release.aab`

## Troubleshooting

### Metro Bundler Issues
```bash
npm start -- --reset-cache
```

### Android Build Issues
```bash
cd android
./gradlew clean
cd ..
npm run android
```

### Clear All Caches
```bash
rm -rf node_modules
npm install
cd android
./gradlew clean
cd ..
```

### Network Connection Issues

If the app can't connect to the API:
1. Check that the API server is running
2. Verify the API_BASE_URL in `src/config/api.ts`
3. For emulator: Use `10.0.2.2` instead of `localhost`
4. For physical device: Ensure device and computer are on the same network
5. Check firewall settings

## Development Notes

- The app stores authentication tokens in AsyncStorage
- API calls automatically include the auth token in headers
- The app handles token expiration and redirects to login
- All API endpoints match the main web application

## Features

### Ward Rounds
- View active admissions
- Filter by ward
- Record patient vitals
- View admission details

### Asset Verification
- List critical assets
- Search assets by name or tag
- Verify assets with timestamp
- View verification history

## API Integration

The app uses the same API as the web application:
- Base URL: Configured in `src/config/api.ts`
- Authentication: JWT tokens
- Endpoints: `/api/inpatient/*` and `/api/assets/*`

## Deployment

The mobile app is completely independent:
- Own dependencies in `package.json`
- Separate build process
- Can be deployed separately from the web app
- No server-side changes needed
