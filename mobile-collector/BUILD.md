# Build & Run Guide – Kiplombe HMIS Mobile

This app is the mobile companion for **asset verification** and **ward rounds**. Follow these steps to build and run it.

## Quick: set environment then run

If Java 17 and Android SDK are already installed, set env and run:

```bash
cd /home/dev/dev/mobile
. ./env.sh
npm start
# In another terminal:
. ./env.sh
npm run android
```

The `env.sh` script sets `JAVA_HOME` and `ANDROID_HOME` so the build can find them.

### Confirm device is connected and authorized

Before running the app on your phone, check that the computer sees it and it’s authorized:

**1. Plug in the phone** with a data-capable USB cable (not charge-only).

**2. On the phone:** Enable **Developer options** and **USB debugging**  
(Settings → About phone → tap “Build number” 7 times, then Settings → Developer options → USB debugging).

**3. In a terminal on your computer:**
```bash
source ~/.bashrc
adb devices
```

**4. Check the output:**

- **`R58R811ZKAM    device`** → Connected and authorized. You can run `npm run android:device`.
- **`R58R811ZKAM    unauthorized`** → Phone is connected but not authorized.  
  - Unlock the phone and look for the **“Allow USB debugging?”** dialog.  
  - Tap **Allow** (and optionally “Always allow from this computer”).  
  - If you don’t see the dialog: unplug the cable, on the phone go to **Developer options** → **Revoke USB debugging authorizations**, then plug in again and accept the dialog.
- **Empty list or no device** → Cable/port, or USB debugging not enabled. Try another cable/port and run `adb devices` again.
- **`no permissions (user ... is not in the plugdev group)`** → On Linux, add your user to the `plugdev` group:
  ```bash
  sudo usermod -aG plugdev $USER
  ```
  Then **log out and log back in** (or reboot) so the group change applies. Unplug and replug the phone, then run `adb devices` again.

**5. Ensure the same adb is used** (optional):
```bash
echo $ANDROID_HOME
$ANDROID_HOME/platform-tools/adb devices
```

If `adb` is not from `ANDROID_HOME`, run `source ~/.bashrc` (or `. ./env.sh`) so `ANDROID_HOME` and `PATH` are set, then run `npm run android:device` in the same terminal.

### Run on a connected phone (don't launch emulator)

If your phone is connected via USB with USB debugging enabled, use:

```bash
cd ~/dev/mobile
. ./env.sh
npm run android:device
```

That installs and runs the app on the first connected device (your phone) and **does not** start the emulator.  
To use the emulator instead, start it from Android Studio first, then run the same command (it will pick the emulator if it's the only device, or use `npx react-native run-android --deviceId=emulator-5554`).

### "Ensure Metro is running" after installing the APK

The **debug** APK does not contain the JavaScript bundle. It loads it from **Metro** on your computer. If you installed the APK manually (e.g. `adb install app-debug.apk`) and open the app, you'll see **"Ensure Metro is running"** until the device can reach Metro.

**Do this:**

1. **Start Metro** on your computer (in the project folder):
   ```bash
   cd /home/dev/dev/mobile
   . ./env.sh
   npm start
   ```
   Leave this terminal open (Metro keeps running).

2. **Connect the phone via USB** and forward the Metro port so the app can reach it:
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```

3. **Open the app** on the phone (or reload: shake device → Reload, or press `r` in the Metro terminal).

If the phone is on the **same Wi‑Fi** as the computer and you don't use USB, you may need to set the bundler URL in the app (Dev menu → Settings → Debug server host) to `YOUR_COMPUTER_IP:8081`. Using USB + `adb reverse` is usually simpler.

**For a standalone build** (no Metro, e.g. to share the APK): use a **release** build and bundle the JS; see **Production build (APK)** below.

### Try a release build (no Metro) – does it affect development?

You can build and install a **release** APK to see how the app behaves without Metro (e.g. after you disconnect or close the dev server). **It does not interfere with your development setup.**

- **Release** and **debug** are separate build types. Building release does not change your project or Metro.
- Installing the release APK just replaces the app on the device. When you want to develop again, run `npm run android` (or `npm run android:device`); that installs the **debug** build over the same app and you’re back to normal (Metro, reload, etc.).

**Build and install release (optional script):**

```bash
cd /home/dev/dev/mobile
. ./env.sh
npm run android:release
```

The release APK is at `android/app/build/outputs/apk/release/app-release.apk`. To install it on a connected device:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Then open the app on the device; it will run without Metro. To return to development, run `npm run android` (or `npm run android:device`) again so the debug build is installed.

### "Import and export may only appear at top level" (navigation / Metro)

If the app loads but you see a redbox error like **"import and export may only appear at top level"**, Metro is likely resolving **ES module** entry points from dependencies (e.g. @react-navigation) that Hermes doesn’t handle well.

**Applied fix:** `metro.config.js` is set to prefer the **CommonJS** build of packages by using `resolverMainFields: ['main', 'react-native', 'module']`, so Metro picks `main` (CommonJS) when available instead of the `react-native` (source/ESM) field.

**If it still happens:** clear Metro’s cache and restart:
```bash
npx react-native start --reset-cache
```
Then reload the app (shake device → Reload, or `r` in the Metro terminal).

### If adb shows "device offline"

Run everything in **one terminal on your machine** (not inside an automated tool) so adb and the emulator share the same session:

```bash
cd ~/dev/mobile
bash run-android.sh
```

That script resets adb, starts the emulator (Medium_Phone_33), waits until it’s online, then runs `npm run android`. If you use a different AVD name, run: `AVD_NAME=Your_AVD_Name bash run-android.sh`.

### Emulator stuck at "still waiting" on 64-bit Linux – install 32-bit libs

On 64-bit Ubuntu/Debian/Pop!_OS, the emulator (and some SDK tools) need 32-bit compatibility libraries. Without them the emulator may not boot properly and the script stays at "still waiting".

**1. Enable 32-bit architecture and install the libraries:**

```bash
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install -y libc6:i386 libncurses5:i386 libstdc++6:i386 lib32z1 libbz2-1.0:i386
```

**2. If `libncurses5:i386` is not found** (e.g. on Ubuntu 22.04+), try:

```bash
sudo apt-get install -y libc6:i386 libncurses6:i386 libstdc++6:i386 lib32z1 libbz2-1.0:i386
```

Or only the ones that exist:

```bash
sudo apt-get install -y libc6:i386 libstdc++6:i386 lib32z1
```

**3. (Optional) For faster emulator, install KVM:**

```bash
sudo apt-get install -y qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils
# Add your user to the kvm group:
sudo usermod -aG kvm $USER
# Log out and back in (or reboot) for the group to apply
```

After installing the 32-bit libs, run `bash run-android.sh` again.

### If the emulator never goes "device" (stays offline)

**Option A – Start emulator from Android Studio**  
1. Open **Android Studio** → **Device Manager** (or **Tools** → **Device Manager**).  
2. Click **Run** (▶) on your AVD (e.g. Medium_Phone_33) and wait until the Android home screen is fully up.  
3. In a terminal (on your machine):  
   ```bash
   cd ~/dev/mobile
   . ./env.sh
   adb devices
   ```  
   You should see `emulator-5554   device`.  
4. Then run: `npm run android`.

**Option B – Build APK, install when emulator is online**  
1. Build the app without a device:  
   ```bash
   cd ~/dev/mobile
   bash build-apk.sh
   ```  
2. Start the emulator from Android Studio (as in Option A).  
3. When `adb devices` shows **device**, either:  
   - Run `npm run android`, or  
   - Install the APK: `adb install android/app/build/outputs/apk/debug/app-debug.apk`

## What’s already done

- **Dependencies**: `npm install` is done.
- **Metro**: Start with `npm start` (or it starts automatically with `npm run android`).
- **Gradle wrapper**: The missing `gradlew` and `gradle-wrapper.jar` were added so the Android project can build.

## What you need installed

1. **Node.js 18+** – already used for `npm install`.
2. **JDK 17** – required for the Android build.
3. **Android SDK** – for building and running the app (emulator or device).

### 1. Install JDK 17 (Linux)

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk

# Set for current session (adjust path if your JDK is elsewhere)
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

### 2. Install Android Studio & SDK

1. Install [Android Studio](https://developer.android.com/studio).
2. In Android Studio: **Settings → Appearance & Behavior → System Settings → Android SDK**:
   - Install **Android SDK Platform** (API 34 or 33).
   - Install **Android SDK Build-Tools**.
   - Install **Android SDK Command-line Tools**.
3. Set environment variables (add to `~/.bashrc` or run before building):

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/tools
```

### 3. Device or emulator

- **Physical device**: Enable **Developer options** and **USB debugging**, then connect via USB.
- **Emulator**: In Android Studio, **Tools → Device Manager**, create an AVD and start it.

## Build and run

With JDK 17 and Android SDK installed and `JAVA_HOME` (and optionally `ANDROID_HOME`) set:

```bash
cd /home/dev/dev/mobile

# Terminal 1: start Metro (optional; npm run android can start it)
npm start

# Terminal 2: build and run on device/emulator
npm run android
```

This will:

1. Build the Android app with Gradle.
2. Install the debug APK on the connected device or running emulator.
3. Launch the app and connect it to Metro for live reload.

## API configuration

- Edit **`src/config/api.ts`** to set `API_BASE_URL`:
  - **Emulator**: `http://10.0.2.2:3003` (already set for dev).
  - **Physical device**: your machine’s IP, e.g. `http://192.168.1.100:3003`.
  - **Production**: your HMIS server URL.

## Production build (APK)

```bash
cd android
./gradlew assembleRelease
```

APK path: `android/app/build/outputs/apk/release/app-release.apk`.

## Version control (Git) – push to GitHub

The project uses **`.gitignore`** so that build outputs, secrets, and tooling caches are not committed. Tracked by default:

- **Committed:** Source code (`src/`), `package.json`, `patches/`, `android/` (except `build/`, `local.properties`, `.cxx/`), config (e.g. `src/config/api.ts`), `env.sh` (paths only), `BUILD.md`, `README.md`, `metro.config.js`, `index.js`, `App.tsx`, etc.
- **Ignored:** `node_modules/`, `build/`, `android/app/build/`, `android/build/`, `*.apk`, `*.aab`, `.gradle`, `local.properties`, `.env*` (if you add env files with secrets), `.idea`, `.cursor/`, `.metro/`, logs, and other entries in `.gitignore`.

**First-time setup and push to `git@github.com:kwatuha/kipsysmobile.git`:**

```bash
cd /home/dev/dev/mobile

# 1. Initialize repo (if not already)
git init

# 2. Add the remote
git remote add origin git@github.com:kwatuha/kipsysmobile.git

# 3. Stage all files (respects .gitignore; node_modules, build outputs, etc. are excluded)
git add .

# 4. Review what will be committed
git status

# 5. Commit
git commit -m "Initial commit: Kiplombe HMIS mobile (ward rounds + asset verification)"

# 6. Use main branch and push
git branch -M main
git push -u origin main
```

**If the repo already has content (e.g. README on GitHub):** use `git pull origin main --rebase` (or `--allow-unrelated-histories` if needed), then `git push -u origin main`.

**Release keystore:** For production signing, use a **release keystore** and do **not** commit it. Add e.g. `android/app/my-release-key.keystore` to `.gitignore` and configure `signingConfigs.release` in `android/app/build.gradle` to use it (see Android docs). The project currently uses the debug keystore for release builds for simplicity.

## Gradle and Android Studio – use one consistent setup

This project is set up to use **Gradle 8.3** and **Android Gradle Plugin (AGP) 8.1.1** everywhere. They are compatible and match React Native 0.73’s expectations.

| Component | Version | Where it’s set |
|-----------|---------|----------------|
| **Gradle** | 8.3 | `android/gradle/wrapper/gradle-wrapper.properties` (`distributionUrl`) |
| **Android Gradle Plugin** | 8.1.1 | `android/build.gradle` (`androidGradlePluginVersion` / classpath) |

**Why the “not compatible” or second-build issues happen**  
Android Studio may suggest or apply a different Gradle or AGP version (e.g. Gradle 8.4+ or AGP 8.3+). If only one of them is upgraded, or if the IDE uses a different Gradle than the wrapper, you get version mismatches and flaky builds.

**What to do**

1. **Use the project’s Gradle wrapper in Android Studio**  
   - **File → Settings** (or **Android Studio → Preferences** on macOS)  
   - **Build, Execution, Deployment → Build Tools → Gradle**  
   - Under **Gradle Projects**, select **android**, then set **Distribution** to **Wrapper** (not “Specified location” or a different option).  
   - That makes Android Studio use the same Gradle 8.3 as the command line (from `android/gradle/wrapper/gradle-wrapper.properties`).

2. **Don’t accept Gradle/AGP upgrade prompts**  
   When Android Studio says “Gradle or AGP update available”, choose **Don’t remind me** or **Skip** for this project so it keeps using 8.3 and 8.1.1. If you later want to upgrade, change both together (e.g. Gradle 8.4 + AGP 8.3) and test.

3. **Build from the command line**  
   `./gradlew assembleDebug` and `npm run android` use the wrapper, so they always use Gradle 8.3. If the IDE has been changed, sync again with **File → Sync Project with Gradle Files** after ensuring the wrapper is used.

**If you already upgraded in Android Studio**  
Revert to the project versions: restore `android/gradle/wrapper/gradle-wrapper.properties` and `android/build.gradle` from git (or set `distributionUrl` to `gradle-8.3-all.zip` and AGP to `8.1.1`), then **File → Invalidate Caches / Restart** and sync.

## If Gradle download fails (SSL or "zip END header not found")

The wrapper needs `gradle-8.3-all.zip` (~191MB). If the automatic download fails:

**Option A – Browser (recommended)**  
1. Open: **https://services.gradle.org/distributions/gradle-8.3-all.zip**  
2. Save the file.  
3. Put it in the wrapper cache (create the folder if needed):
   ```bash
   mkdir -p ~/.gradle/wrapper/dists/gradle-8.3-all/6en3ugtfdg5xnpx44z4qbwgas
   mv ~/Downloads/gradle-8.3-all.zip ~/.gradle/wrapper/dists/gradle-8.3-all/6en3ugtfdg5xnpx44z4qbwgas/
   ```
4. Run again: `npm run android`

**Option B – Script (if wget/curl work)**  
```bash
cd ~/dev/mobile
bash android/download-gradle.sh
```
Wait until it finishes, then run `npm run android`.

---

## Android build: BaseReactPackage / gesture-handler / screens errors

If the Android build fails with **Unresolved reference: BaseReactPackage** or **ViewManagerWithGeneratedInterface** in `react-native-gesture-handler` or `react-native-screens`, it is a known compatibility issue with React Native 0.73.

**Cause:** **BaseReactPackage** was introduced in React Native **0.74**. On RN 0.73, only **TurboReactPackage** / **ReactPackage** exist. Newer gesture-handler (e.g. 2.24+) use `BaseReactPackage`, so they fail to compile on 0.73.

**Applied fix (in this repo):**
1. **Pin `react-native-gesture-handler` to 2.14.0** (in `package.json` + overrides). 2.14.0 extends **ReactPackage** and compiles with RN 0.73.
2. **Patches** (in `patches/`, applied by `postinstall`):
   - **react-native-gesture-handler**: use `api "com.facebook.react:react-android:${REACT_NATIVE_VERSION}"` so the right React Native classes are on the classpath.
   - **react-native-screens**: use `implementation 'com.facebook.react:react-android:+'`.

**Do not** bump gesture-handler to 2.24+ or screens to much newer versions without upgrading React Native to 0.74+.

**Other options:**
1. **Build from Android Studio**  
   Open the `android` folder in Android Studio and use **Build → Make Project** or **Run**. Studio sometimes resolves the React Native dependency correctly.
2. **Upgrade React Native and libraries**  
   Consider upgrading to a newer React Native (e.g. 0.76+) and compatible versions of `react-native-gesture-handler` and `react-native-screens` (see their docs for RN 0.73+).
3. **Use a pre-built APK**  
   If you have a working build on another machine, copy the built APK to the phone and install with `adb install app-debug.apk`.

## Gradle deprecation warning (Gradle 9.0)

If you see: **"Deprecated Gradle features were used in this build, making it incompatible with Gradle 9.0"** — that’s expected with the current Gradle 8.3 + React Native / Android plugin setup. The deprecations usually come from plugins (React Native, AGP, or node_modules libraries), not from this project’s scripts.

**To list each deprecation** (to see which script or plugin triggers it):

```bash
cd android && ./gradlew assembleDebug --warning-mode all
```

**To hide the message** (build is unchanged; only the notice is suppressed), add to `android/gradle.properties`:

```properties
org.gradle.warning.mode=none
```

Other options: `summary` (default — shows the one-line notice) or `all` (lists each deprecation; same as `--warning-mode all`). Fixing the warnings would require updating React Native, the Android Gradle Plugin, or patching third‑party build scripts when you upgrade to Gradle 9.

## Quick check

After setting `JAVA_HOME` and Android SDK:

```bash
echo $JAVA_HOME
java -version
adb devices
```

If these work, `npm run android` should be able to build and run the app.
