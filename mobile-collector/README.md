# Machakos Collector (Android)

Mobile app for **offline-capable checklist data collection** against the Machakos County web platform.

Checklists are created in the web app (**Monitoring → Checklists & visits**). This app downloads those templates and renders them dynamically — no app update needed when forms change.

## Features (v1)

- Sign in with Machakos credentials (including SMS/email OTP)
- Download checklist templates and project list for offline use
- Dynamic form renderer for all web field types: yes/no, text, textarea, number, select, multi-select, **photo**, **GPS location**
- Auto-save visit drafts locally while filling a form
- Queue submissions when offline; sync from **Checklists → Sync**
- **Geotagged photos** — camera/gallery capture with optional GPS; uploads on submit or sync
- View submitted and queued visits

## API configuration

Edit `src/config/api.ts`:

| Environment | `API_BASE_URL` |
|-------------|----------------|
| Production server | `http://84.247.128.58:8084` |
| Android emulator + local API | `http://10.0.2.2:3002` |
| Physical device on LAN | `http://YOUR_PC_IP:3002` or `:8084` |

The app calls the same REST API as the web frontend (`/api/auth/*`, `/api/data-collection/*`, `/api/projects`).

**Login OTP:** The mobile app identifies itself as `machakos-collector`. By default the server skips the email/SMS OTP step for this app (`MOBILE_COLLECTOR_BYPASS_LOGIN_OTP=true` in `api/.env`). Set `MOBILE_COLLECTOR_BYPASS_LOGIN_OTP=false` if you want field staff to complete OTP when it is enabled on their user account.

## Prerequisites

- Node.js 18+
- JDK 17
- Android SDK (API 34)
- USB debugging enabled for physical devices

See `BUILD.md` for detailed Android setup (copied from the original mobile scaffold).

## Install & run

```bash
cd mobile-collector
npm install
npm start          # Metro bundler (separate terminal)
npm run android    # emulator
# or
npm run android:device
```

Release APK:

```bash
npm run android:release
# Output: android/app/build/outputs/apk/release/app-release.apk
```

App icon (Machakos coat of arms) is generated from `api/assets/gpris.png`:

```bash
python3 scripts/generate-android-icons.py
```

## Project structure

```
src/
  components/ChecklistFormRenderer.tsx   # Maps template JSON → native fields
  screens/
    LoginScreen.tsx                      # Login + OTP
    TemplatesScreen.tsx                  # Download & pick checklists
    NewVisitScreen.tsx                   # Fill form + submit/queue
    SubmissionsScreen.tsx                # History + pending queue
  services/
    api.ts                               # Machakos REST client
    offlineStore.ts                      # AsyncStorage cache & outbox
    syncService.ts                       # Download catalog + upload queue
  types/dataCollection.ts
```

## How it connects to Machakos

1. Admin creates a template in `DataCollectionToolsPage` → stored in `data_collection_templates.structure` (JSONB).
2. Mobile sync downloads templates via `GET /api/data-collection/templates`.
3. `ChecklistFormRenderer` reads `structure.sections[].items[]` and renders native inputs.
4. Answers are saved as `{ [itemId]: value }` — same shape as web `ChecklistFormFields`.
5. Submit posts to `POST /api/data-collection/submissions` (server validates required fields).

## Publish to servers (automated)

**One command (MCmes + monitoring, single build):**

```bash
chmod +x deploy/release-mobile-app-all.sh
./deploy/release-mobile-app-all.sh --version 1.0.2 --notes "Login and icon fixes"
```

Per server:

```bash
./deploy/release-mobile-app-mcmes.sh --version 1.0.1 --notes "Bug fixes"
./deploy/release-mobile-app-monitoring.sh --version 1.0.1 --notes "Bug fixes"
```

The release script sets `APP_VERSION` in `src/config/api.ts`, builds the APK, copies it to each server, and registers it in the database. Staff see a dashboard notification; the app prompts for an update after sign-in when a newer version is published.

Options: `--skip-build`, `--apk PATH`, `--local-only` (this machine only).

### Do users need to reinstall?

| Change type | Reinstall APK? |
|-------------|----------------|
| Server login, OTP, passwords, API fixes | **No** — takes effect immediately |
| Web portal download page | **No** — refresh browser |
| New app icon, login screen text, in-app update prompt | **Yes** — publish new APK; staff download from **Mobile app (Android)** |

There is no silent auto-update (Play Store / OTA). Field staff install the new APK over the old one from the staff portal when you publish a release.

## Roadmap

- SQLite for larger offline datasets
- NetInfo connectivity indicator
- Inspection-linked checklists (pick/create inspection from mobile)
- Play Store / MDM distribution

## Origin

Forked from `/home/dev/dev/mobile` (Kiplombe HMIS ward rounds scaffold). Rebranded and rebuilt for Machakos data collection.
