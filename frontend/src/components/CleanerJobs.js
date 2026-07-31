import React, { useState, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, Linking, ActivityIndicator, Platform, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { uploadAssignmentPhoto, deleteAssignmentPhoto, resolveImageUrl } from '../lib/api';

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
  const photos = (job.photos || []).filter((p) => p.kind === kind);
  const label = kind === 'before' ? 'Before' : 'After';

  const onAdd = async () => {
    setError('');
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is required to snap photos.');
          return;
        }
      }
      const result = Platform.OS === 'web'
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      setBusy(true);
      const photo = await uploadAssignmentPhoto(job.id, kind, cleaner.cleaner_id, cleaner.pin, result.assets[0]);
      onJobChange({ ...job, photos: [...(job.photos || []), photo] });
    } catch (e) {
      setError(e.message || 'Photo upload failed');
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
        <Text style={styles.photoLabel}>{label} photos</Text>
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
              <Text style={styles.photoAddText}>{Platform.OS === 'web' ? 'Upload' : 'Snap'}</Text>
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
    </View>
  );
}

export default function CleanerJobs({ jobs, onStatus, cleaner, onJobChange, setError }) {
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
        jobs.map((job, index) => (
          <View key={job.id} style={styles.jobCard} testID={`cleaner-job-${index}`}>
            <View style={styles.jobTop}>
              <Text style={styles.jobName}>{job.customer_name}</Text>
              <Text style={styles.jobService}>{job.service_type}</Text>
            </View>
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
            {cleaner ? (
              <>
                <PhotoRow job={job} kind="before" cleaner={cleaner} onJobChange={onJobChange} setError={setError} />
                <PhotoRow job={job} kind="after" cleaner={cleaner} onJobChange={onJobChange} setError={setError} />
              </>
            ) : null}
            <View style={styles.statusRow}>
              {JOB_STEPS.map((s) => {
                const active = job.status === s.key;
                const disabled = busyJobId === job.id;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.statusBtn, active && styles.statusBtnActive, disabled && styles.statusBtnDisabled]}
                    onPress={() => handleStatus(job, s.key)}
                    disabled={disabled}
                    testID={`cleaner-job-${s.key}-${index}`}
                  >
                    {disabled && s.key === 'done' ? (
                      <ActivityIndicator size="small" color={active ? '#0A0611' : COLORS.textSoft} />
                    ) : (
                      <Ionicons name={s.icon} size={14} color={active ? '#0A0611' : COLORS.textSoft} />
                    )}
                    <Text style={[styles.statusBtnText, active && styles.statusBtnTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))
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
});
