import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

/**
 * RapidCameraModal — a full-screen camera view for cleaners.
 *
 * Design goals:
 *   • Tap the shutter and the photo is captured + uploaded instantly.
 *   • No "Use Photo / Retake" confirmation between shots — the camera stays open.
 *   • Cleaner can rip off 50 shots in a burst.
 *   • Tapping X closes and unmounts the CameraView (frees the sensor).
 *
 * Web note: expo-camera works on web via getUserMedia but is less featureful.
 * We render the same UI; if the permission is denied we render a friendly fallback
 * telling the cleaner to use the (existing) file picker instead.
 */
export default function RapidCameraModal({ visible, kind, onClose, onCapture }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing] = useState('back');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const cameraRef = useRef(null);

  const handleClose = useCallback(() => {
    setCount(0);
    setError('');
    onClose();
  }, [onClose]);

  const handleShutter = useCallback(async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setError('');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      if (photo && photo.uri) {
        // Fire-and-forget upload so the shutter stays responsive.
        // The parent handles the actual API upload + job state update.
        onCapture(photo);
        setCount((c) => c + 1);
      }
    } catch (e) {
      setError(e?.message || 'Capture failed — try again');
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture]);

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible transparent>
        <View style={styles.blackFill}>
          <ActivityIndicator size="large" color={COLORS.pink} />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.blackFill}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} testID="rapid-camera-close">
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.permBox}>
            <Ionicons name="camera" size={48} color={COLORS.pink} />
            <Text style={styles.permTitle}>Camera access needed</Text>
            <Text style={styles.permSub}>
              Tap Allow so you can rapid-snap before/after photos without leaving the app.
            </Text>
            <TouchableOpacity
              style={styles.permBtn}
              onPress={requestPermission}
              testID="rapid-camera-request-perm"
            >
              <Text style={styles.permBtnText}>Allow camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container} testID="rapid-camera-view">
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          {...(Platform.OS === 'web' ? {} : { animateShutter: false })}
        />
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} testID="rapid-camera-close">
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.kindPill}>
            <Text style={styles.kindText}>{kind === 'before' ? 'BEFORE' : 'AFTER'} · {count} snapped</Text>
          </View>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.shutter, busy && styles.shutterBusy]}
            onPress={handleShutter}
            disabled={busy}
            testID="rapid-camera-shutter"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </TouchableOpacity>
          <Text style={styles.tip}>Tap to snap · camera stays open</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  blackFill: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 44,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindPill: {
    backgroundColor: 'rgba(255,95,176,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  kindText: { color: '#fff', fontFamily: FONTS.bodySemiBold, fontSize: 12, letterSpacing: 1 },
  errorText: {
    position: 'absolute',
    bottom: 180,
    left: 20,
    right: 20,
    color: '#fff',
    backgroundColor: 'rgba(224,60,60,0.85)',
    padding: 10,
    borderRadius: 10,
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 999,
    borderWidth: 5,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { opacity: 0.5 },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  tip: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: FONTS.body,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  permBox: {
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  permTitle: { color: '#fff', fontFamily: FONTS.heading, fontSize: 20, marginTop: 6 },
  permSub: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: FONTS.body,
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 8,
  },
  permBtn: {
    backgroundColor: COLORS.pink,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  permBtnText: { color: '#fff', fontFamily: FONTS.bodySemiBold, fontSize: 14 },
});
