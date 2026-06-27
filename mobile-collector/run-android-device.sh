#!/bin/bash
# Run the app on the first connected device (phone or emulator) without launching an emulator.
# Use this when your phone is connected via USB so it won't try to start the emulator.

set -e
cd "$(dirname "$0")"
. ./env.sh
export PATH="$ANDROID_HOME/platform-tools:$PATH"

echo "Checking connected devices..."
adb devices -l
echo ""

# Only use lines that end with "device" (authorized). Skip "unauthorized" and "offline".
DEVICE=$(adb devices | grep -E '[[:space:]]+device$' | head -1 | awk '{print $1}')
if [ -z "$DEVICE" ]; then
  if adb devices | grep -q unauthorized; then
    echo "Device is connected but NOT AUTHORIZED."
    echo "On your phone: unlock the screen and tap 'Allow' on the 'Allow USB debugging?' dialog."
    echo "If you don't see it: unplug USB, revoke USB debugging authorizations in Developer options, then plug in again."
  else
    echo "No device or emulator connected. Connect a phone (USB debugging) or start an emulator."
  fi
  exit 1
fi
echo "Using device: $DEVICE"
# Ensure Gradle and the React Native CLI use the same adb (avoid "No Android device connected")
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# Verify again right before run (device can drop or become unauthorized)
if ! adb devices | grep -qE "^${DEVICE}[[:space:]]+device$"; then
  echo "Device $DEVICE is no longer available or authorized. Run 'adb devices' and check."
  exit 1
fi
npx react-native run-android --deviceId "$DEVICE"
