import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, Linking, ActivityIndicator, Platform, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { uploadAssignmentPhoto, deleteAssignmentPhoto, resolveImageUrl, formatDuration } from '../lib/api';
import RapidCameraModal from './RapidCameraModal';

// Live-updating job timer. Shows "1h 12m" once the cleaner marks "Cleaning".
// Re-renders every 30s so cleaners can see progress accumulating.
function JobTimer({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;
  const secs = Math.max(0, Math.floor((now - started) / 1000));
  return (
    <View style={styles.timerRow}>
      <Ionicons name="timer-outline" size={13} color={COLORS.gold} />
      <Text style={styles.timerText}>On the clock: {formatDuration(secs) || '0s'}</Text>
    </View>
  );
}

const JOB_STEPS = [
  { key: 'on_the_way', label: 'On my way', icon: 'car' },
  { key: 'cleaning', label: 'Cleaning', icon: 'sparkles' },
  { key: 'done', label: 'Done', icon: 'checkmark-circle' },
];

async function confirmRemovePhoto() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && window.confirm('Remove this photo?');
  }
  return new Promise((resolve) => {
    Alert.alert('Remove photo?', 'This will delete the photo from the job.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

const PhotoThumb = React.memo(function PhotoThumb({ url }) {
  const source = useMemo(() => ({ uri: resolveImageUrl(url) }), [url]);
  return <Image source={source} style={styles.thumb} resizeMode="cover" />;
});

function PhotoRow({ job, kind, cleaner, onJobChange, setError }) {
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const photos = (job.photos || []).filter((p) => p.kind === kind);
  const label = kind === 'before' ? 'Before' : 'After';

  // The rapid camera fires `uploadOne` many times in flight. We hold the LATEST job
  // snapshot in a ref so each concurrent completion appends to fresh state instead of
  // overwriting via a stale closure — otherwise photos taken during a burst get lost
  // until the next poll refresh (reviewer-found lost-update bug).
  const jobRef = useRef(job);
  useEffect(() => { jobRef.current = job; }, [job]);

  // Called every time the rapid-camera modal captures a shot. Uploads in the
  // background so the shutter stays responsive for the next tap.
  const uploadOne = useCallback(async (asset) => {
    try {
      const photo = await uploadAssignmentPhoto(job.id, kind, cleaner.cleaner_id, cleaner.pin, asset);
      const latest = jobRef.current;
      const next = { ...latest, photos: [...(latest.photos || []), photo] };
      jobRef.current = next; // update ref eagerly so concurrent completions see the append
      onJobChange(next);
    } catch (e) {
      setError(e.message || 'One photo failed to upload — keep shooting');
    }
  }, [job.id, kind, cleaner, onJobChange, setError]);

  const onAdd = async () => {
    setError('');
    if (Platform.OS !== 'web') {
      // Native: open the rapid-fire custom camera. Cleaner taps shutter,
      // photo auto-uploads in the background, camera stays open.
      setCameraOpen(true);
      return;
    }
    // Web: gallery multi-select (browsers don't let us build a persistent camera view).
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 50,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      setBusy(true);
      const uploaded = [];
      for (const asset of result.assets) {
        try {
          const photo = await uploadAssignmentPhoto(job.id, kind, cleaner.cleaner_id, cleaner.pin, asset);
          uploaded.push(photo);
        } catch (e) {
          setError(e.message || 'One or more photos failed to upload');
        }
      }
      if (uploaded.length) {
        onJobChange({ ...job, photos: [...(job.photos || []), ...uploaded] });
      }
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (photo) => {
    const ok = await confirmRemovePhoto();
    if (!ok) return;
    try {
      await deleteAssignmentPhoto(job.id, photo.id, cleaner.cleaner_id, cleaner.pin);
      onJobChange({ ...job, photos: (job.photos || []).filter((p) => p.id !== photo.id) });
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  };

  return (
    <View style={styles.photoBlock} testID={`cleaner-photo-${kind}`}>
      <View style={styles.photoHeader}>
        <Text style={styles.photoLabel}>
          {label} photos{photos.length > 0 ? ` (${photos.length})` : ''}
        </Text>
        <TouchableOpacity
          style={styles.photoAdd}
          onPress={onAdd}
          disabled={busy}
          testID={`cleaner-photo-add-${kind}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.pink} />
          ) : (
            <>
              <Ionicons name={Platform.OS === 'web' ? 'cloud-upload' : 'camera'} size={14} color={COLORS.pink} />
              <Text style={styles.photoAddText}>
                {photos.length > 0
                  ? (Platform.OS === 'web' ? 'Add more' : 'Snap another')
                  : (Platform.OS === 'web' ? 'Upload' : 'Snap')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      {photos.length === 0 ? (
        <Text style={styles.noPhotos}>No {label.toLowerCase()} photos yet.</Text>
      ) : (
        <View style={styles.thumbRow}>
          {photos.map((p) => (
            <TouchableOpacity key={p.id} style={styles.thumbWrap} onLongPress={() => onRemove(p)} activeOpacity={0.85}>
              <PhotoThumb url={p.url} />
              <TouchableOpacity
                style={styles.thumbRemove}
                onPress={() => onRemove(p)}
                testID={`cleaner-photo-remove-${p.id}`}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <RapidCameraModal
        visible={cameraOpen}
        kind={kind}
        onClose={() => setCameraOpen(false)}
        onCapture={uploadOne}
      />
    </View>
  );
}

export default function CleanerJobs({ jobs, onStatus, cleaner, onJobChange, setError, requirePhotos }) {
  const [busyJobId, setBusyJobId] = useState(null);
  const handleStatus = async (job, key) => {
    if (busyJobId) return;
    setBusyJobId(job.id);
    try {
      await onStatus(job, key);
    } finally {
      setBusyJobId(null);
    }
  };
  return (
    <View style={styles.jobsSection}>
      <Text style={styles.jobsTitle}>Your Jobs</Text>
      {jobs.length === 0 ? (
        <Text style={styles.noJobs} testID="cleaner-no-jobs">
          No jobs assigned right now — check back later.
        </Text>
      ) : (
        jobs.map((job, index) => {
          const photos = job.photos || [];
          const hasBefore = photos.some((p) => p.kind === 'before');
          const hasAfter = photos.some((p) => p.kind === 'after');
          const doneBlocked = requirePhotos && !(hasBefore && hasAfter);
          return (
          <View key={job.id} style={styles.jobCard} testID={`cleaner-job-${index}`}>
            <View style={styles.jobTop}>
              <Text style={styles.jobName}>{job.customer_name}</Text>
              <Text style={styles.jobService}>{job.service_type}</Text>
            </View>
            {job.started_at && job.status !== 'done' ? <JobTimer startedAt={job.started_at} /> : null}
            {job.address ? (
              <TouchableOpacity
                style={styles.jobRow}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(job.address)}`)}
                testID={`cleaner-job-address-${index}`}
              >
                <Ionicons name="location" size={15} color={COLORS.pink} />
                <Text style={[styles.jobRowText, styles.jobAddressText]}>{job.address}</Text>
              </TouchableOpacity>
            ) : null}
            {job.phone ? (
              <TouchableOpacity
                style={styles.jobRow}
                onPress={() => Linking.openURL(`tel:${(job.phone || '').replace(/[^+\d]/g, '')}`)}
                testID={`cleaner-job-phone-${index}`}
              >
                <Ionicons name="call" size={15} color={COLORS.textMuted} />
                <Text style={styles.jobRowText}>{job.phone}</Text>
              </TouchableOpacity>
            ) : null}
            {job.preferred_date ? (
              <View style={styles.jobRow}>
                <Ionicons name="calendar" size={15} color={COLORS.textMuted} />
                <Text style={styles.jobRowText}>Preferred: {job.preferred_date}</Text>
              </View>
            ) : null}
            {job.message ? <Text style={styles.jobMessage}>"{job.message}"</Text> : null}
            {job.client_notes ? (
              <View style={styles.clientNotesBox} testID={`cleaner-client-notes-${index}`}>
                <View style={styles.clientNotesHead}>
                  <Ionicons name="bookmark" size={12} color={COLORS.gold} />
                  <Text style={styles.clientNotesTitle}>Client notes</Text>
                </View>
                <Text style={styles.clientNotesText}>{job.client_notes}</Text>
              </View>
            ) : null}
            {cleaner ? (
              <>
                <PhotoRow job={job} kind="before" cleaner={cleaner} onJobChange={onJobChange} setError={setError} />
                <PhotoRow job={job} kind="after" cleaner={cleaner} onJobChange={onJobChange} setError={setError} />
              </>
            ) : null}
            <View style={styles.statusRow}>
              {JOB_STEPS.map((s) => {
                const active = job.status === s.key;
                const isDoneStep = s.key === 'done';
                const blocked = isDoneStep && doneBlocked;
                const disabled = busyJobId === job.id || blocked;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.statusBtn, active && styles.statusBtnActive, disabled && styles.statusBtnDisabled]}
                    onPress={() => handleStatus(job, s.key)}
                    disabled={disabled}
                    testID={`cleaner-job-${s.key}-${index}`}
                  >
                    {busyJobId === job.id && s.key === 'done' ? (
                      <ActivityIndicator size="small" color={active ? '#0A0611' : COLORS.textSoft} />
                    ) : (
                      <Ionicons
                        name={blocked ? 'lock-closed' : s.icon}
                        size={14}
                        color={active ? '#0A0611' : COLORS.textSoft}
                      />
                    )}
                    <Text style={[styles.statusBtnText, active && styles.statusBtnTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {doneBlocked ? (
              <Text style={styles.doneHint} testID={`cleaner-done-hint-${index}`}>
                📸 Add {!hasBefore ? 'a before' : ''}{!hasBefore && !hasAfter ? ' and ' : ''}{!hasAfter ? 'an after' : ''} photo above to unlock Done.
              </Text>
            ) : null}
          </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  jobsSection: { marginTop: 32, alignSelf: 'stretch' },
  jobsTitle: {
    color: COLORS.gold,
    fontFamily: FONTS.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  noJobs: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 13.5 },
  jobCard: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  jobTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  jobName: { color: COLORS.text, fontFamily: FONTS.heading, fontSize: 16, flex: 1 },
  jobService: { color: COLORS.violetLight, fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: 2 },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  jobRowText: { color: COLORS.textSoft, fontFamily: FONTS.body, fontSize: 13.5, flex: 1 },
  jobMessage: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 13, fontStyle: 'italic', marginTop: 4, lineHeight: 18 },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: 'rgba(224,178,85,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(224,178,85,0.28)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  timerText: { color: COLORS.gold, fontFamily: FONTS.bodySemiBold, fontSize: 12 },
  clientNotesBox: {
    marginTop: 10,
    backgroundColor: 'rgba(224,178,85,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(224,178,85,0.3)',
    borderRadius: 10,
    padding: 10,
  },
  clientNotesHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  clientNotesTitle: {
    color: COLORS.gold,
    fontFamily: FONTS.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  clientNotesText: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, lineHeight: 18 },
  photoBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  photoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  photoLabel: { color: COLORS.textSoft, fontFamily: FONTS.bodySemiBold, fontSize: 12.5, letterSpacing: 0.5 },
  photoAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,95,176,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,95,176,0.3)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  photoAddText: { color: COLORS.pink, fontFamily: FONTS.bodySemiBold, fontSize: 11.5 },
  noPhotos: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12, fontStyle: 'italic' },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(10,6,17,0.9)',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  statusBtnActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  statusBtnDisabled: { opacity: 0.55 },
  jobAddressText: { color: COLORS.pink, fontFamily: FONTS.bodySemiBold },
  statusBtnText: { color: COLORS.textSoft, fontFamily: FONTS.bodySemiBold, fontSize: 11.5 },
  statusBtnTextActive: { color: '#0A0611' },
  doneHint: {
    marginTop: 8,
    color: COLORS.gold,
    fontFamily: FONTS.bodyMedium,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
