import Geolocation, { GeoError, GeoPosition } from '@react-native-community/geolocation';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { ChecklistLocationAnswer } from '../types/dataCollection';

let configured = false;
let gpsInFlight: Promise<ChecklistLocationAnswer> | null = null;

type GeoOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

export function configureGeolocation(): void {
  if (configured) return;
  configured = true;
  Geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    authorizationLevel: 'whenInUse',
    locationProvider: 'auto',
  });
}

function positionToAnswer(pos: GeoPosition): ChecklistLocationAnswer {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    capturedAt: new Date().toISOString(),
  };
}

function formatGeoError(err: GeoError | Error): string {
  const code = (err as GeoError)?.code;
  if (code === 1) {
    return 'Location permission denied. Enable location for Machakos Collector in Settings → Apps → Permissions.';
  }
  if (code === 2) {
    return 'Location unavailable. Turn on device location (GPS) and try again.';
  }
  if (code === 3) {
    return 'GPS timed out. Move outdoors with a clear sky view, or enable high-accuracy location in phone settings.';
  }
  return err.message || 'Could not get GPS location.';
}

function getCurrentPositionOnce(options: GeoOptions): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/** watchPosition often succeeds on Android when getCurrentPosition times out. */
function watchPositionOnce(options: GeoOptions): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutMs = options.timeout ?? 25000;
    let watchId: number | null = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId != null) Geolocation.clearWatch(watchId);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(Object.assign(new Error('GPS timed out'), { code: 3 })));
    }, timeoutMs);

    watchId = Geolocation.watchPosition(
      (pos) => finish(() => resolve(pos)),
      (err) => finish(() => reject(err)),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        distanceFilter: 0,
        maximumAge: options.maximumAge ?? 0,
        timeout: timeoutMs,
      }
    );
  });
}

async function tryLocate(options: GeoOptions): Promise<GeoPosition> {
  try {
    return await getCurrentPositionOnce(options);
  } catch (firstErr) {
    return watchPositionOnce(options);
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const fineOk = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  if (fineOk) return true;

  const coarseOk = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
  );
  if (coarseOk) return true;

  const fineResult = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location permission',
      message:
        'Machakos Collector needs GPS to capture site coordinates and geotagged photos.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );
  if (fineResult === PermissionsAndroid.RESULTS.GRANTED) return true;

  const coarseResult = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    {
      title: 'Location permission',
      message: 'Approximate location can be used if precise GPS is not allowed.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );
  return coarseResult === PermissionsAndroid.RESULTS.GRANTED;
}

export function promptOpenLocationSettings(): void {
  Alert.alert(
    'Location required',
    'Enable location for this app in your phone settings, then return and tap Capture GPS again.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open settings',
        onPress: () => {
          Linking.openSettings().catch(() => {});
        },
      },
    ]
  );
}

export async function getCurrentLocation(): Promise<ChecklistLocationAnswer> {
  if (gpsInFlight) {
    return gpsInFlight;
  }

  gpsInFlight = (async () => {
    try {
      return await getCurrentLocationInternal();
    } finally {
      gpsInFlight = null;
    }
  })();

  return gpsInFlight;
}

async function getCurrentLocationInternal(): Promise<ChecklistLocationAnswer> {
  configureGeolocation();

  const permitted = await requestLocationPermission();
  if (!permitted) {
    const err = new Error(
      'Location permission denied. Allow location access for Machakos Collector.'
    ) as Error & { code?: number };
    err.code = 1;
    throw err;
  }

  const attempts: GeoOptions[] = [
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 },
  ];

  let lastErr: GeoError | Error | null = null;
  for (const opts of attempts) {
    try {
      const pos = await tryLocate(opts);
      if (
        Number.isFinite(pos.coords.latitude) &&
        Number.isFinite(pos.coords.longitude)
      ) {
        return positionToAnswer(pos);
      }
    } catch (err) {
      lastErr = err as GeoError;
    }
  }

  throw new Error(formatGeoError(lastErr || new Error('Could not get GPS location.')));
}
