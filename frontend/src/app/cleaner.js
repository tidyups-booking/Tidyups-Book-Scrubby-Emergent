import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { checkinCleaner, fetchCleanerJobs, setAssignmentStatus, fetchAppSettings, HTTP_UNAUTHORIZED } from '../lib/api';
import { useLocationSharing } from '../lib/useLocationSharing';
import { GradientButton, OutlineButton } from '../components/ui';
import CleanerJobs from '../components/CleanerJobs';

const PROFILE_KEY = 'tidyups_cleaner';
const JOBS_POLL_INTERVAL_MS = 60000;
const PIN_CHANGED_MESSAGE = 'The cleaner PIN was changed — please sign out and check in again.';

function CheckinForm({ name, setName, pin, setPin, busy, error, onCheckin, onClose }) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} testID="cleaner-close">
        <Ionicons name="close" size={22} color={COLORS.textMuted} />
      </TouchableOpacity>
      <MaterialCommunityIcons name="map-marker-account" size={52} color={COLORS.pink} style={styles.headerIcon} />
      <Text style={styles.title}>Cleaner Check-In</Text>
      <Text style={styles.sub}>Enter your name and the team PIN to share your location with dispatch.</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={COLORS.placeholder}
        testID="cleaner-name-input"
      />
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="Cleaner PIN"
        placeholderTextColor={COLORS.placeholder}
        keyboardType="number-pad"
        secureTextEntry
        testID="cleaner-pin-input"
      />
      {error ? (
        <Text style={styles.error} testID="cleaner-error">
          {error}
        </Text>
      ) : null}
      <GradientButton title="Check In" onPress={onCheckin} loading={busy} testID="cleaner-checkin-btn" style={styles.checkinBtn} />
    </View>
  );
}

function SharingStatus({ sharing, profile, lastSent, busy, error, onStart, onStop }) {
  const firstName = profile.name.split(' ')[0];
  return (
    <View style={styles.statusBlock}>
      <View style={[styles.statusDot, sharing ? styles.dotLive : styles.dotIdle]} />
      <Text style={styles.title} testID="cleaner-status">
        {sharing ? "You're live!" : `Hi, ${firstName}!`}
      </Text>
      <Text style={styles.sub}>
        {sharing
          ? `Dispatch can see your live location.${lastSent ? ` Last update ${lastSent.toLocaleTimeString()}.` : ''} Keep this screen open while you travel.`
          : 'Tap below when you head to a job site so dispatch can see you on the way.'}
      </Text>

      {error ? (
        <Text style={styles.error} testID="cleaner-error">
          {error}
        </Text>
      ) : null}

      {sharing ? (
        <OutlineButton
          title="Stop Sharing"
          testID="cleaner-stop-btn"
          icon={<Ionicons name="stop-circle" size={18} color={COLORS.danger} />}
          onPress={onStop}
          style={styles.stopBtn}
        />
      ) : (
        <GradientButton
          title="Start Sharing Location"
          testID="cleaner-start-btn"
          loading={busy}
          icon={<Ionicons name="navigate" size={18} color="#fff" />}
          onPress={onStart}
          style={styles.startBtn}
        />
      )}
    </View>
  );
}

export default function CleanerScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkinError, setCheckinError] = useState('');
  const [jobs, setJobs] = useState([]);
  const [jobsError, setJobsError] = useState('');
  const [requirePhotos, setRequirePhotos] = useState(false);
  const location = useLocationSharing(profile);

  const loadJobs = useCallback(async (p) => {
    if (!p) return;
    try {
      const data = await fetchCleanerJobs(p.cleaner_id, p.pin);
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e.code === HTTP_UNAUTHORIZED) {
        setJobs([]);
        setJobsError(PIN_CHANGED_MESSAGE);
      } else if (__DEV__) {
        console.warn('Jobs load failed:', e.message || e);
      }
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    loadJobs(profile);
    const timer = setInterval(() => loadJobs(profile), JOBS_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [profile, loadJobs]);

  useEffect(() => {
    // Fetch the "photo required to mark Done" toggle so we can gray out the Done
    // button when photos are missing. Polled once per minute so admin changes propagate.
    let cancelled = false;
    const load = () => {
      fetchAppSettings()
        .then((s) => !cancelled && setRequirePhotos(!!s.require_photos_for_done))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY)
      .then((raw) => {
        if (raw) setProfile(JSON.parse(raw));
      })
      .finally(() => setChecking(false));
  }, []);

  const onCheckin = async () => {
    if (!name.trim() || !pin.trim()) {
      setCheckinError('Enter your name and the cleaner PIN.');
      return;
    }
    setCheckinBusy(true);
    setCheckinError('');
    try {
      const res = await checkinCleaner(name.trim(), pin.trim());
      const p = { cleaner_id: res.cleaner_id, name: res.name, pin: pin.trim() };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      setProfile(p);
    } catch (e) {
      setCheckinError(e.message || 'Check-in failed');
    } finally {
      setCheckinBusy(false);
    }
  };

  const onJobStatus = async (job, status) => {
    setJobsError('');
    try {
      await setAssignmentStatus(job.id, profile.cleaner_id, profile.pin, status);
      if (status === 'done') {
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      } else {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status } : j)));
      }
    } catch (e) {
      setJobsError(e.message || 'Could not update status');
    }
  };

  const onJobChange = (updated) => {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  };

  const onSignout = async () => {
    location.stop();
    location.reset();
    await AsyncStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setName('');
    setPin('');
    setCheckinError('');
    setJobs([]);
    setJobsError('');
  };

  if (checking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.pink} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <CheckinForm
          name={name}
          setName={setName}
          pin={pin}
          setPin={setPin}
          busy={checkinBusy}
          error={checkinError}
          onCheckin={onCheckin}
          onClose={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const dashboardError = location.error || jobsError;
  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity style={[styles.closeBtn, styles.closeBtnTop]} onPress={() => router.back()} testID="cleaner-close">
        <Ionicons name="close" size={22} color={COLORS.textMuted} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.scrollWrap} showsVerticalScrollIndicator={false}>
        <SharingStatus
          sharing={location.sharing}
          profile={profile}
          lastSent={location.lastSent}
          busy={location.busy}
          error={dashboardError}
          onStart={location.start}
          onStop={location.stop}
        />

        <CleanerJobs jobs={jobs} onStatus={onJobStatus} cleaner={profile} onJobChange={onJobChange} setError={setJobsError} requirePhotos={requirePhotos} />

        <TouchableOpacity style={styles.signout} onPress={onSignout} testID="cleaner-signout">
          <Text style={styles.signoutText}>Sign out ({profile.name})</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  closeBtn: { position: 'absolute', top: 18, right: 18, padding: 8 },
  closeBtnTop: { zIndex: 10 },
  headerIcon: { marginBottom: 16 },
  title: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 26, marginBottom: 8 },
  sub: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 21 },
  statusBlock: { alignItems: 'center' },
  statusDot: { width: 16, height: 16, borderRadius: 8, marginBottom: 16 },
  dotLive: { backgroundColor: COLORS.success },
  dotIdle: { backgroundColor: COLORS.placeholder },
  input: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 15,
    marginBottom: 14,
  },
  checkinBtn: { alignSelf: 'stretch', marginTop: 6 },
  startBtn: { alignSelf: 'stretch' },
  stopBtn: { alignSelf: 'stretch', borderColor: 'rgba(248,113,113,0.4)' },
  error: {
    color: COLORS.danger,
    fontFamily: FONTS.bodyMedium,
    fontSize: 13.5,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  signout: { marginTop: 22, padding: 8 },
  signoutText: { color: COLORS.textMuted, fontFamily: FONTS.bodyMedium, fontSize: 13 },
  scrollWrap: { paddingHorizontal: 24, paddingTop: 70, paddingBottom: 40 },
});
