#!/bin/bash
# Run this script in your own terminal (not inside Cursor's tool environment) to avoid adb "offline" issues.
# It sets env, starts the emulator, waits for it to be ready, then runs the app.

set -e
cd "$(dirname "$0")"

# Load env (JAVA_HOME, ANDROID_HOME, PATH)
. ./env.sh

# Use SDK adb explicitly
export PATH="$ANDROID_HOME/platform-tools:$PATH"

# Reset adb to avoid "offline" / protocol fault
adb kill-server 2>/dev/null || true
rm -f ~/.android/adb.* 2>/dev/null
adb start-server

# AVD name (change if you use a different one)
AVD="${AVD_NAME:-Medium_Phone_33}"

# Check if emulator is already running and online
if adb devices | grep -q "emulator-5554.*device"; then
  echo "Emulator already online. Running app..."
  npm run android
  exit 0
fi

# Start emulator in background (cold boot for clean adb)
echo "Starting emulator: $AVD (cold boot)..."
"$ANDROID_HOME/emulator/emulator" -avd "$AVD" -no-snapshot-load &
EMU_PID=$!

# Wait for device to be fully booted (up to 3 minutes)
echo "Waiting for emulator to boot..."
for i in $(seq 1 36); do
  sleep 5
  if adb devices | grep -q "emulator-5554.*device"; then
    echo "Emulator is online."
    break
  fi
  echo "  ... still waiting ($((i*5))s)"
  if [ $i -eq 36 ]; then
    echo "Timeout. Emulator may still be booting. Try: adb devices, then npm run android"
    exit 1
  fi
done

# Optional: wait for boot completed
adb wait-for-device
sleep 10

echo "Running app..."
npm run android
