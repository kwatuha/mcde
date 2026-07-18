# CIMES Mobile (Android)

County mobile app for **executive briefing** and **offline field data collection**, against the CIMES web platform.

## Who sees what

| Role type | Home experience |
|-----------|-----------------|
| Executive Viewer, Executive Supervisor, County Viewer, Chief Officer, Sector M&E, finance/audit reviewers, admins | **Briefing**, Attention, Projects, Finance, Status, Performance |
| Field / monitoring collectors | **Checklists** and **My visits** (offline collection) |

Checklists are still created in the web app (**Monitoring → Checklists & visits**). Field staff download templates dynamically — no app update needed when forms change.

## Features

### Executive (v1.1)

- County **executive briefing** (delivery health, at-risk, absorption, payment gap)
- **Attention** inbox (my tasks + open escalations)
- **Portfolio by status**
- **Finance** snapshot
- **Project** search + read-only detail
- **Department / sub-county** performance

### Field collection

- Sign in with county credentials (including SMS/email OTP when required)
- Download checklist templates and project list for offline use
- Dynamic form renderer (yes/no, text, number, select, photo, GPS, …)
- Auto-save visit drafts; queue submissions offline; sync when online
- Geotagged photos; submit monitoring visits to ward review

## API configuration

Production builds use **https://cimes.machakos.go.ke** (`src/config/api.ts`).

| Environment | `API_BASE_URL` |
|-------------|----------------|
| **Production (default)** | `https://cimes.machakos.go.ke` |
| Android emulator + local API | `http://10.0.2.2:3002` |
| Monitoring host (legacy / other deploy) | `https://monitoring.icskenya.co.ke` |

The app identifies itself as `cimes-mobile` (`X-Client-App` / `clientApp`). The server also accepts the legacy `machakos-collector` id.

## Prerequisites

- Node.js 18+
- JDK 17
- Android SDK (API 34)

See `BUILD.md` for Android setup.

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

App icon is generated from `api/assets/gpris.png` (see previous docs in `BUILD.md`).

## Version

`APP_VERSION` in `src/config/api.ts` (currently **1.1.1**). Bump when publishing a new APK via the staff mobile-app release flow.
