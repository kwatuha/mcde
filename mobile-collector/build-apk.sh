#!/bin/bash
# Build the debug APK only (no emulator/device needed).
# Install later: adb install android/app/build/outputs/apk/debug/app-debug.apk
# Or drag the APK onto the emulator when it's running.

set -e
cd "$(dirname "$0")"
. ./env.sh
export PATH="$ANDROID_HOME/platform-tools:$PATH"

echo "Building debug APK..."
cd android
./gradlew assembleDebug --no-daemon
cd ..

APK="android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  echo "Done. APK: $APK"
  echo "To install: adb install $APK"
  echo "Or start the emulator from Android Studio, then run: npm run android"
else
  echo "Build failed or APK not found."
  exit 1
fi
