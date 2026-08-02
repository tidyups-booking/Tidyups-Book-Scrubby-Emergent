import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sendCleanerLocation, stopCleanerSharing, HTTP_UNAUTHORIZED } from './api';

const LOCATION_TIME_INTERVAL_MS = 20000;
const LOCATION_DISTANCE_INTERVAL_M = 40;
const BG_TASK_NAME = 'scrubby-cleaner-location';
const PROFILE_STORAGE_KEY = 'scrubby_cleaner_bg_profile';
const BG_INVALID_FLAG_KEY = 'scrubby_cleaner_bg_pin_invalid';

// Module-scope background task. Runs on native even when the app is backgrounded
// or killed. Reads the cleaner profile from AsyncStorage (we can't pass args to
// TaskManager), then forwards every location update to the backend.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BG_TASK_NAME)) {
  TaskManager.defineTask(BG_TASK_NAME, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data;
    if (!locations || !locations.length) return;
    try {
      const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const profile = JSON.parse(raw);
      if (!profile?.cleaner_id || !profile?.pin) return;
      const latest = locations[locations.length - 1];
      try {
        await sendCleanerLocation(profile.cleaner_id, profile.pin, latest.coords.latitude, latest.coords.longitude);
      } catch (e) {
        // If the backend rejected our PIN (admin rotated it or removed the cleaner),
        // stop the background task, wipe the stored profile, and drop a flag the
        // foreground UI checks on next focus so it can prompt the cleaner to sign in
        // again. Any other error: silently retry on next tick.
        if (e?.code === HTTP_UNAUTHORIZED) {
          try {
            await Location.stopLocationUpdatesAsync(BG_TASK_NAME);
          } catch {}
          await AsyncStorage.multiRemove([PROFILE_STORAGE_KEY, 'scrubby_cleaner_profile']);
          await AsyncStorage.setItem(BG_INVALID_FLAG_KEY, '1');
        }
      }
    } catch {
      // Background task — silent failure, next tick will retry
    }
  });
}

/**
 * useLocationSharing — encapsulates GPS permission, location watch, and PIN-401 handling.
 *
 * Two modes:
 *   • Native (iOS/Android) with Background permission: uses TaskManager + Location.startLocationUpdatesAsync.
 *     Continues to send pings even when the app is backgrounded / phone locked.
 *   • Web / Background permission denied: falls back to Location.watchPositionAsync (foreground only).
 */
export function useLocationSharing(profile) {
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const [error, setError] = useState('');
  const [backgroundActive, setBackgroundActive] = useState(false);
  const watchRef = useRef(null);

  const stopWatch = useCallback(async () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (Platform.OS !== 'web') {
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(BG_TASK_NAME).catch(() => false);
        if (started) {
          await Location.stopLocationUpdatesAsync(BG_TASK_NAME);
        }
        await AsyncStorage.multiRemove([PROFILE_STORAGE_KEY, BG_INVALID_FLAG_KEY]);
      } catch {}
    }
    setSharing(false);
    setBackgroundActive(false);
  }, []);

  // Poll AsyncStorage for the "background PIN invalid" flag so we can surface a
  // user-facing prompt whenever the background task detects a 401.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let cancelled = false;
    const checkFlag = async () => {
      try {
        const flag = await AsyncStorage.getItem(BG_INVALID_FLAG_KEY);
        if (flag && !cancelled) {
          setError('The cleaner PIN was changed — please sign out and check in again.');
          await AsyncStorage.removeItem(BG_INVALID_FLAG_KEY);
          setSharing(false);
          setBackgroundActive(false);
        }
      } catch {}
    };
    checkFlag();
    const t = setInterval(checkFlag, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup only stops the foreground watch on unmount. The background task
      // is intentionally left running so location keeps flowing when the cleaner
      // navigates away or backgrounds the app — the whole point of this feature.
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);

  const sendPing = async (p, coords) => {
    try {
      await sendCleanerLocation(p.cleaner_id, p.pin, coords.latitude, coords.longitude);
      setLastSent(new Date());
      setError('');
    } catch (e) {
      if (e.code === HTTP_UNAUTHORIZED) {
        await stopWatch();
        setError('The cleaner PIN was changed — please sign out and check in again.');
      }
    }
  };

  const start = async () => {
    if (!profile) return;
    setError('');
    setBusy(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) {
        setError('Location permission is required to share your position.');
        return;
      }
      // Kick off one immediate ping so the map updates right away.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await sendPing(profile, pos.coords);

      // Try to enable background updates on native. Web browsers cannot do this.
      let bgOk = false;
      if (Platform.OS !== 'web') {
        try {
          const bg = await Location.requestBackgroundPermissionsAsync();
          bgOk = !!bg?.granted;
        } catch {
          bgOk = false;
        }
      }

      if (bgOk) {
        // Persist the profile so the background task can read it after app is killed.
        await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
          cleaner_id: profile.cleaner_id,
          pin: profile.pin,
        }));
        await Location.startLocationUpdatesAsync(BG_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LOCATION_TIME_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_INTERVAL_M,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Scrubby is sharing your location',
            notificationBody: 'Your dispatcher can see you on the team map.',
            notificationColor: '#8b2fc9',
          },
          pausesUpdatesAutomatically: false,
        });
        setBackgroundActive(true);
      } else {
        // Fallback: foreground-only watch. Stops when app is backgrounded (unavoidable on web).
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: LOCATION_TIME_INTERVAL_MS,
            distanceInterval: LOCATION_DISTANCE_INTERVAL_M,
          },
          (p) => sendPing(profile, p.coords)
        );
      }
      setSharing(true);
    } catch {
      setError('Could not get your location — check GPS is on and try again.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    await stopWatch();
    if (profile) stopCleanerSharing(profile.cleaner_id, profile.pin).catch(() => {});
  };

  const reset = async () => {
    await stopWatch();
    setLastSent(null);
    setError('');
  };

  return { sharing, busy, lastSent, error, setError, start, stop, reset, backgroundActive };
}
