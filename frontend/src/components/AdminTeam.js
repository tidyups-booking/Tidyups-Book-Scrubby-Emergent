import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { fetchCleaners, deleteCleaner, fetchStaffPin, updateStaffPin } from '../lib/api';
import TeamMap from './TeamMap';

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isActive(c) {
  return c.sharing && c.last_seen && Date.now() - new Date(c.last_seen).getTime() < 3 * 60000;
}

async function confirmAsync(title, message) {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function statusText(item, active) {
  if (active) return 'Active now — sharing live location';
  if (item.last_seen) return `Last seen ${timeAgo(item.last_seen)}`;
  return 'Never shared location';
}

const LIST_CONTENT_STYLE = { paddingHorizontal: 20, paddingBottom: 40, gap: 12 };
const MAP_PIN_ROW_STYLE = { paddingHorizontal: 20 };

function CleanerRow({ item, index, onTrack, onDelete }) {
  const active = isActive(item);
  const noLocation = item.lat == null;
  return (
    <View style={styles.row} testID={`admin-cleaner-row-${index}`}>
      <View style={[styles.dot, active ? styles.dotActive : styles.dotIdle]} />
      <View style={styles.rowText}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={[styles.sub, active && styles.subActive]}>{statusText(item, active)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, noLocation && styles.actionBtnDisabled]}
        disabled={noLocation}
        onPress={() => onTrack(item)}
        testID={`admin-cleaner-track-${index}`}
      >
        <Ionicons name="map" size={16} color={COLORS.pink} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, styles.deleteBtn]}
        onPress={() => onDelete(item)}
        testID={`admin-cleaner-delete-${index}`}
      >
        <Ionicons name="trash" size={15} color={COLORS.danger} />
      </TouchableOpacity>
    </View>
  );
}

function PinCard({ pin, setPin, savingPin, onSavePin, isDefault, error, notice }) {
  return (
    <View style={styles.pinCard}>
      <Text style={styles.pinTitle}>Cleaner PIN</Text>
      <Text style={styles.pinHint}>
        Cleaners check in from the Contact tab → "Cleaner Check-In" with this PIN, then share live location while
        driving to a job.
      </Text>
      {isDefault ? (
        <View style={styles.pinWarn} testID="admin-pin-default-warn">
          <Ionicons name="warning" size={14} color={COLORS.gold} />
          <Text style={styles.pinWarnText}>
            Your PIN is still the default. Change it now so only your team can check in.
          </Text>
        </View>
      ) : null}
      <View style={styles.pinRow}>
        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          maxLength={8}
          placeholder="4-8 digits"
          placeholderTextColor={COLORS.placeholder}
          testID="admin-pin-input"
        />
        <TouchableOpacity style={styles.pinSave} onPress={onSavePin} disabled={savingPin} testID="admin-pin-save">
          {savingPin ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.pinSaveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={styles.error} testID="admin-team-error">{error}</Text>
      ) : null}
      {notice ? (
        <Text style={styles.notice} testID="admin-team-notice">{notice}</Text>
      ) : null}
    </View>
  );
}

export default function AdminTeam({ password }) {
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pin, setPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [isDefaultPin, setIsDefaultPin] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('list');

  const load = useCallback(async () => {
    try {
      const data = await fetchCleaners(password);
      setCleaners(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load team');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [password]);

  useEffect(() => {
    load();
    fetchStaffPin(password)
      .then((d) => {
        setPin(d.pin || '');
        setIsDefaultPin(!!d.is_default);
      })
      .catch(() => {});
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load, password]);

  const onSavePin = async () => {
    setSavingPin(true);
    setError('');
    setNotice('');
    try {
      const d = await updateStaffPin(pin.trim(), password);
      setPin(d.pin);
      setIsDefaultPin(!!d.is_default);
      setNotice('PIN updated — cleaners already sharing must check in again with the new PIN.');
    } catch (e) {
      setError(e.message || 'PIN update failed');
    } finally {
      setSavingPin(false);
    }
  };

  const onDelete = async (c) => {
    const ok = await confirmAsync('Remove cleaner?', `${c.name} will be removed from the team list.`);
    if (!ok) return;
    try {
      await deleteCleaner(c.id, password);
      load();
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.pink} size="large" />
      </View>
    );
  }

  const toggle = (
    <View style={styles.viewToggle}>
      <TouchableOpacity
        style={[styles.toggleBtn, view === 'list' && styles.toggleActive]}
        onPress={() => setView('list')}
        testID="admin-team-view-list"
      >
        <Ionicons name="list" size={14} color={view === 'list' ? '#fff' : COLORS.textMuted} />
        <Text style={[styles.toggleText, view === 'list' && styles.toggleTextActive]}>List</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, view === 'map' && styles.toggleActive]}
        onPress={() => setView('map')}
        testID="admin-team-view-map"
      >
        <Ionicons name="map" size={14} color={view === 'map' ? '#fff' : COLORS.textMuted} />
        <Text style={[styles.toggleText, view === 'map' && styles.toggleTextActive]}>Map</Text>
      </TouchableOpacity>
    </View>
  );

  if (view === 'map') {
    return (
      <View style={{ flex: 1 }}>
        <View style={MAP_PIN_ROW_STYLE}>{toggle}</View>
        <TeamMap cleaners={cleaners} />
      </View>
    );
  }

  return (
    <FlatList
      data={cleaners}
      keyExtractor={(item) => item.id}
      contentContainerStyle={LIST_CONTENT_STYLE}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={COLORS.pink}
        />
      }
      ListHeaderComponent={
        <View>
          {toggle}
          <PinCard
            pin={pin}
            setPin={setPin}
            savingPin={savingPin}
            onSavePin={onSavePin}
            isDefault={isDefaultPin}
            error={error}
            notice={notice}
          />
        </View>
      }
      renderItem={({ item, index }) => (
        <CleanerRow
          item={item}
          index={index}
          onTrack={(c) => Linking.openURL(`https://maps.google.com/?q=${c.lat},${c.lng}`)}
          onDelete={onDelete}
        />
      )}
      ListEmptyComponent={
        <View style={[styles.center, styles.emptyPad]}>
          <MaterialCommunityIcons name="account-group-outline" size={44} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>
            No cleaners yet. Share the PIN above with your team — they check in from the Contact tab.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewToggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleActive: { backgroundColor: COLORS.violet, borderColor: COLORS.violet },
  toggleText: { color: COLORS.textMuted, fontFamily: FONTS.bodySemiBold, fontSize: 12.5 },
  toggleTextActive: { color: '#fff' },
  pinCard: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 8,
  },
  pinTitle: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 15, marginBottom: 6 },
  pinHint: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  pinWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(240,199,79,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(240,199,79,0.35)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  pinWarnText: { color: COLORS.gold, fontFamily: FONTS.bodyMedium, fontSize: 12.5, lineHeight: 18, flex: 1 },
  pinRow: { flexDirection: 'row', gap: 10 },
  pinInput: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontFamily: FONTS.bodySemiBold,
    fontSize: 16,
    letterSpacing: 3,
  },
  pinSave: {
    backgroundColor: COLORS.violet,
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSaveText: { color: '#fff', fontFamily: FONTS.bodySemiBold, fontSize: 14 },
  error: {
    color: COLORS.danger,
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  notice: {
    color: COLORS.success,
    fontFamily: FONTS.bodyMedium,
    fontSize: 12.5,
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
  },
  dot: { width: 11, height: 11, borderRadius: 6 },
  dotActive: { backgroundColor: COLORS.success },
  dotIdle: { backgroundColor: COLORS.placeholder },
  rowText: { flex: 1 },
  name: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 15 },
  sub: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12.5, marginTop: 2 },
  subActive: { color: COLORS.success },
  emptyPad: { paddingTop: 50 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.35 },
  deleteBtn: { backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)' },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 30,
  },
});
