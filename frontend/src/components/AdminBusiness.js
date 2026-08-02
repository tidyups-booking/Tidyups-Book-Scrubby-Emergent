import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { fetchAppSettings, updateAppSettings, uploadLogo, resetLogo, resolveImageUrl, changeAdminPassword, previewOwnerDigest, sendOwnerDigestNow } from '../lib/api';
import { GradientButton } from './ui';
import { useBusiness } from '../lib/business';

const DEFAULT_LOGO = require('../../assets/images/logo.png');
const SCROLL_CONTENT = { paddingHorizontal: 20, paddingBottom: 40 };
const HOUR_DAY_STYLE = { flex: 1.3 };
const HOUR_TIME_STYLE = { flex: 1 };
const SMALL_BTN_START = { alignSelf: 'flex-start' };
const SMALL_BTN_ADD_ROW = { alignSelf: 'flex-start', marginTop: 4 };
const MIN_PW_LEN = 6;

function Field({ label, value, onChangeText, placeholder, testID, keyboardType, secure }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.placeholder}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        autoCapitalize="none"
        testID={testID}
      />
    </View>
  );
}

function LogoCard({ logoUrl, logoBusy, onPickLogo, onResetLogo }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Logo</Text>
      <View style={styles.logoRow}>
        <Image
          source={logoUrl ? { uri: resolveImageUrl(logoUrl) } : DEFAULT_LOGO}
          style={styles.logoPreview}
          resizeMode="contain"
          testID="admin-logo-preview"
        />
        <View style={styles.logoActions}>
          <TouchableOpacity style={styles.smallBtn} onPress={onPickLogo} disabled={logoBusy} testID="admin-logo-upload">
            {logoBusy ? (
              <ActivityIndicator size="small" color={COLORS.pink} />
            ) : (
              <Ionicons name="cloud-upload-outline" size={15} color={COLORS.textSoft} />
            )}
            <Text style={styles.smallBtnText}>Upload new logo</Text>
          </TouchableOpacity>
          {logoUrl ? (
            <TouchableOpacity style={styles.smallBtn} onPress={onResetLogo} disabled={logoBusy} testID="admin-logo-reset">
              <Ionicons name="refresh" size={15} color={COLORS.textSoft} />
              <Text style={styles.smallBtnText}>Reset to default</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ContactDetailsCard({ form, set }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Contact Details</Text>
      <Field label="Phone number" value={form.phone_display} onChangeText={set('phone_display')} placeholder="(780) 718-5092" testID="admin-biz-phone" keyboardType="phone-pad" />
      <Field label="Toll-free (display)" value={form.tollfree_display} onChangeText={set('tollfree_display')} placeholder="(833) TIDY-UPS" testID="admin-biz-tollfree" />
      <Field label="Toll-free (number)" value={form.tollfree_sub} onChangeText={set('tollfree_sub')} placeholder="+1 (833) 843-9877" testID="admin-biz-tollfree-num" keyboardType="phone-pad" />
      <Field label="Street address" value={form.address} onChangeText={set('address')} placeholder="6510 Gateway Boulevard Suite 1020" testID="admin-biz-address" />
      <Field label="City / province / postal" value={form.city_line} onChangeText={set('city_line')} placeholder="Edmonton, AB T6H 5Z5" testID="admin-biz-city" />
      <Field label="Website" value={form.website} onChangeText={set('website')} placeholder="tidyupscleaning.com" testID="admin-biz-website" />
    </View>
  );
}

function ReviewRequestsCard({ form, set }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Review Requests</Text>
      <Text style={styles.reviewHint}>
        When a cleaner marks a job as done, we'll text this link to the customer so they can leave a Google review. Grab
        your business's Google review URL from your Business Profile.
      </Text>
      <Field
        label="Google review link"
        value={form.review_url}
        onChangeText={set('review_url')}
        placeholder="https://g.page/r/..."
        testID="admin-biz-review-url"
      />
    </View>
  );
}

function PhotoRequirementCard({ form, set }) {
  const enabled = !!form.require_photos_for_done;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Photo Requirements</Text>
      <Text style={styles.reviewHint}>
        When ON, cleaners can't mark a job Done until they've uploaded at least one <Text style={styles.emphasis}>before</Text>
        {' '}and one <Text style={styles.emphasis}>after</Text> photo. Great for insurance protection and consistent proof-of-work.
      </Text>
      <TouchableOpacity
        style={[styles.toggleRow, enabled && styles.toggleRowOn]}
        onPress={() => set('require_photos_for_done')(!enabled)}
        activeOpacity={0.85}
        testID="admin-biz-require-photos-toggle"
      >
        <View style={styles.toggleTextWrap}>
          <Text style={styles.toggleLabel}>Require before + after photo to mark Done</Text>
          <Text style={styles.toggleSubLabel}>
            {enabled ? 'Enforcing on every job' : 'Off — cleaners can mark Done anytime'}
          </Text>
        </View>
        <View style={[styles.switch, enabled && styles.switchOn]}>
          <View style={[styles.switchKnob, enabled && styles.switchKnobOn]} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

function DigestCard({ password }) {
  const [preview, setPreview] = useState(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const onPreview = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await previewOwnerDigest(password);
      setPreview(r.body || '');
      setTo(r.to || '');
    } catch (e) {
      setError(e.message || 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const onSend = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await sendOwnerDigestNow(password);
      setPreview(r.body || preview);
      setNotice('Digest SMS sent.');
    } catch (e) {
      setError(e.message || 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="admin-biz-digest-card">
      <Text style={styles.cardTitle}>Owner Nightly Digest</Text>
      <Text style={styles.reviewHint}>
        Auto-sent as an SMS at 9pm local time to your owner phone (env <Text style={styles.emphasis}>DIGEST_TO_NUMBER</Text>) with today's leads,
        jobs done, and any missed reviews. Preview it here anytime, or fire one now for testing.
      </Text>
      <View style={styles.digestButtonRow}>
        <TouchableOpacity
          style={[styles.smallBtn, SMALL_BTN_ADD_ROW, styles.digestBtnFlex]}
          onPress={onPreview}
          disabled={busy}
          testID="admin-biz-digest-preview"
        >
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.textSoft} />
          ) : (
            <Ionicons name="eye" size={15} color={COLORS.textSoft} />
          )}
          <Text style={styles.smallBtnText}>Preview digest</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.smallBtn, styles.digestSendBtn, styles.digestBtnFlex]}
          onPress={onSend}
          disabled={busy}
          testID="admin-biz-digest-send-now"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#0A0611" />
          ) : (
            <Ionicons name="send" size={15} color="#0A0611" />
          )}
          <Text style={styles.digestSendBtnText}>Send now</Text>
        </TouchableOpacity>
      </View>
      {to ? (
        <Text style={styles.digestMeta} testID="admin-biz-digest-to">To: {to}</Text>
      ) : null}
      {preview ? (
        <View style={styles.digestPreview} testID="admin-biz-digest-preview-body">
          <Text style={styles.digestPreviewText}>{preview}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.notesError}>{error}</Text> : null}
      {notice ? <Text style={styles.digestNotice}>{notice}</Text> : null}
    </View>
  );
}

function HoursRow({ row, index, setHour, onRemove }) {
  return (
    <View style={styles.hourRow}>
      <TextInput
        style={[styles.input, HOUR_DAY_STYLE]}
        value={row.day}
        onChangeText={(v) => setHour(index, 'day', v)}
        placeholder="Day"
        placeholderTextColor={COLORS.placeholder}
        testID={`admin-biz-hours-day-${index}`}
      />
      <TextInput
        style={[styles.input, HOUR_TIME_STYLE]}
        value={row.time}
        onChangeText={(v) => setHour(index, 'time', v)}
        placeholder="Time"
        placeholderTextColor={COLORS.placeholder}
        testID={`admin-biz-hours-time-${index}`}
      />
      <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(index)} testID={`admin-biz-hours-remove-${index}`}>
        <Ionicons name="trash" size={15} color={COLORS.danger} />
      </TouchableOpacity>
    </View>
  );
}

function BusinessHoursCard({ hours, setHour, onRemoveHour, onAddHour }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Business Hours</Text>
      {hours.map((h, i) => (
        <HoursRow key={h._key || `row-${i}`} row={h} index={i} setHour={setHour} onRemove={onRemoveHour} />
      ))}
      <TouchableOpacity style={[styles.smallBtn, SMALL_BTN_ADD_ROW]} onPress={onAddHour} testID="admin-biz-hours-add">
        <Ionicons name="add" size={16} color={COLORS.textSoft} />
        <Text style={styles.smallBtnText}>Add row</Text>
      </TouchableOpacity>
    </View>
  );
}

function DispatchPasswordCard({ newPw, setNewPw, confirmPw, setConfirmPw, pwBusy, onChangePassword }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Dispatch Password</Text>
      <Field label="New password" value={newPw} onChangeText={setNewPw} placeholder="At least 6 characters" testID="admin-pw-new" secure />
      <Field label="Confirm new password" value={confirmPw} onChangeText={setConfirmPw} placeholder="Repeat new password" testID="admin-pw-confirm" secure />
      <TouchableOpacity style={[styles.smallBtn, SMALL_BTN_START]} onPress={onChangePassword} disabled={pwBusy} testID="admin-pw-save">
        {pwBusy ? (
          <ActivityIndicator size="small" color={COLORS.pink} />
        ) : (
          <Ionicons name="key" size={15} color={COLORS.textSoft} />
        )}
        <Text style={styles.smallBtnText}>Update password</Text>
      </TouchableOpacity>
    </View>
  );
}

function formToSettings(s) {
  return {
    phone_display: s.phone_display || '',
    tollfree_display: s.tollfree_display || '',
    tollfree_sub: s.tollfree_sub || '',
    address: s.address || '',
    city_line: s.city_line || '',
    website: s.website || '',
    review_url: s.review_url || '',
    require_photos_for_done: !!s.require_photos_for_done,
    hours: (Array.isArray(s.hours) ? s.hours : []).map((h, i) => ({ ...h, _key: `row-${i}` })),
  };
}

export default function AdminBusiness({ password, onPasswordChanged }) {
  const { refresh } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [form, setForm] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    fetchAppSettings()
      .then((s) => {
        setForm(formToSettings(s));
        setLogoUrl(s.logo_url || null);
      })
      .catch(() => setError('Failed to load business details'))
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setHour = (idx, key, value) =>
    setForm((f) => ({ ...f, hours: f.hours.map((h, i) => (i === idx ? { ...h, [key]: value } : h)) }));
  const onRemoveHour = (idx) =>
    setForm((f) => ({ ...f, hours: f.hours.filter((_, i) => i !== idx) }));
  const onAddHour = () =>
    setForm((f) => ({ ...f, hours: [...f.hours, { day: '', time: '', _key: `row-new-${Date.now()}` }] }));

  const onSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateAppSettings({ ...form, hours: form.hours.map(({ day, time }) => ({ day, time })) }, password);
      await refresh();
      setSuccess('Saved — changes are now live everywhere in the app.');
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onPickLogo = async () => {
    setError('');
    setSuccess('');
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError('Photo library permission is required.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      setLogoBusy(true);
      const s = await uploadLogo(result.assets[0], password);
      setLogoUrl(s.logo_url || null);
      await refresh();
      setSuccess('Logo updated.');
    } catch (e) {
      setError(e.message || 'Logo upload failed');
    } finally {
      setLogoBusy(false);
    }
  };

  const onResetLogo = async () => {
    setLogoBusy(true);
    setError('');
    setSuccess('');
    try {
      await resetLogo(password);
      setLogoUrl(null);
      await refresh();
      setSuccess('Logo reset to default.');
    } catch (e) {
      setError(e.message || 'Reset failed');
    } finally {
      setLogoBusy(false);
    }
  };

  const onChangePassword = async () => {
    setError('');
    setSuccess('');
    const pw1 = newPw.trim();
    if (pw1.length < MIN_PW_LEN) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (pw1 !== confirmPw.trim()) {
      setError('Passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      await changeAdminPassword(pw1, password);
      setNewPw('');
      setConfirmPw('');
      if (onPasswordChanged) await onPasswordChanged(pw1);
      setSuccess('Dispatch password updated — the app now uses your new password.');
    } catch (e) {
      setError(e.message || 'Password update failed');
    } finally {
      setPwBusy(false);
    }
  };

  if (loading || !form) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.pink} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={SCROLL_CONTENT} showsVerticalScrollIndicator={false}>
      <LogoCard logoUrl={logoUrl} logoBusy={logoBusy} onPickLogo={onPickLogo} onResetLogo={onResetLogo} />
      <ContactDetailsCard form={form} set={set} />
      <ReviewRequestsCard form={form} set={set} />
      <PhotoRequirementCard form={form} set={set} />
      <DigestCard password={password} />
      <BusinessHoursCard
        hours={form.hours}
        setHour={setHour}
        onRemoveHour={onRemoveHour}
        onAddHour={onAddHour}
      />
      <DispatchPasswordCard
        newPw={newPw}
        setNewPw={setNewPw}
        confirmPw={confirmPw}
        setConfirmPw={setConfirmPw}
        pwBusy={pwBusy}
        onChangePassword={onChangePassword}
      />

      {error ? (
        <Text style={styles.error} testID="admin-biz-error">
          {error}
        </Text>
      ) : null}
      {success ? (
        <Text style={styles.success} testID="admin-biz-success">
          {success}
        </Text>
      ) : null}
      <GradientButton title="Save Changes" onPress={onSave} loading={saving} testID="admin-biz-save" />
      <Text style={styles.hint}>These details power the Home call button and the entire Contact tab.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 15, marginBottom: 14 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoActions: { flex: 1, gap: 8 },
  logoPreview: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  smallBtnText: { color: COLORS.textSoft, fontFamily: FONTS.bodyMedium, fontSize: 13 },
  field: { marginBottom: 12 },
  fieldLabel: { color: COLORS.textMuted, fontFamily: FONTS.bodyMedium, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 14,
  },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: COLORS.danger,
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  success: {
    color: COLORS.success,
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  hint: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12, marginTop: 12, textAlign: 'center' },
  reviewHint: {
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -4,
  },
  emphasis: { color: COLORS.gold, fontFamily: FONTS.bodySemiBold },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  toggleRowOn: { borderColor: 'rgba(224,178,85,0.55)', backgroundColor: 'rgba(224,178,85,0.06)' },
  toggleTextWrap: { flex: 1 },
  toggleLabel: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 13.5 },
  toggleSubLabel: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 11.5, marginTop: 3 },
  switch: {
    width: 44,
    height: 26,
    borderRadius: 999,
    backgroundColor: COLORS.borderStrong,
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: COLORS.gold },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  switchKnobOn: { alignSelf: 'flex-end' },
  digestButtonRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  digestBtnFlex: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  digestSendBtn: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  digestSendBtnText: { color: '#0A0611', fontFamily: FONTS.bodySemiBold, fontSize: 13 },
  digestMeta: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 11.5, marginTop: 10 },
  digestPreview: {
    marginTop: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
  },
  digestPreviewText: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 19 },
  digestNotice: {
    color: COLORS.success,
    fontFamily: FONTS.bodyMedium,
    fontSize: 12,
    marginTop: 8,
  },
  notesError: { color: COLORS.danger, fontFamily: FONTS.body, fontSize: 12, marginTop: 8 },
});
