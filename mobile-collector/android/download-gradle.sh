#!/bin/bash
# Downloads Gradle 8.3 into the wrapper cache so "npm run android" doesn't need to fetch it.
# Run from project root: bash android/download-gradle.sh
# Or from android/: bash download-gradle.sh

set -e
CACHE_DIR="$HOME/.gradle/wrapper/dists/gradle-8.3-all/6en3ugtfdg5xnpx44z4qbwgas"
URL="https://services.gradle.org/distributions/gradle-8.3-all.zip"
ZIP="$CACHE_DIR/gradle-8.3-all.zip"

mkdir -p "$CACHE_DIR"
rm -f "$ZIP" "$CACHE_DIR/gradle-8.3-all.zip.part" "$CACHE_DIR/gradle-8.3-all.zip.lck"

echo "Downloading Gradle 8.3 (~150MB) to wrapper cache..."
if command -v wget &>/dev/null; then
  wget -O "$ZIP" "$URL"
elif command -v curl &>/dev/null; then
  curl -L -o "$ZIP" "$URL"
else
  echo "Install wget or curl, or download manually:"
  echo "  1. Open: $URL"
  echo "  2. Save the file as: $ZIP"
  exit 1
fi

if [ -f "$ZIP" ] && unzip -tq "$ZIP" 2>/dev/null; then
  echo "Done. Run: npm run android"
else
  echo "Download may be incomplete or invalid. Try downloading in a browser and save as: $ZIP"
  exit 1
fi
