import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  Linking,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { fetchAssignmentHistory, fetchCleaners, sendReviewRequest, resolveImageUrl, formatDate, formatDuration, fetchClientNotes, saveClientNotes, mergeClients } from '../lib/api';

function timeAgoShort(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const LIST_CONTENT_STYLE = { paddingHorizontal: 20, paddingBottom: 40, gap: 12 };

// Wraps <Image> so we don't recreate a {uri} object on every parent render.
const PhotoImage = React.memo(function PhotoImage({ url, style, resizeMode }) {
  const [source, setSource] = useState({ uri: resolveImageUrl(url) });
  useEffect(() => {
    setSource({ uri: resolveImageUrl(url) });
  }, [url]);
  return <Image source={source} style={style} resizeMode={resizeMode} />;
});

function CleanerFilter({ cleaners, selected, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
      testID="history-cleaner-filter"
    >
      <TouchableOpacity
        style={[styles.chip, !selected && styles.chipActive]}
        onPress={() => onSelect(null)}
        testID="history-filter-all"
      >
        <Text style={[styles.chipText, !selected && styles.chipTextActive]}>All cleaners</Text>
      </TouchableOpacity>
      {cleaners.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={[styles.chip, selected === c.id && styles.chipActive]}
          onPress={() => onSelect(c.id)}
          testID={`history-filter-${c.id}`}
        >
          <Text style={[styles.chipText, selected === c.id && styles.chipTextActive]}>{c.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ViewModeToggle({ mode, onChange }) {
  return (
    <View style={styles.modeToggle} testID="history-mode-toggle">
      <TouchableOpacity
        style={[styles.modeBtn, mode === 'recent' && styles.modeBtnActive]}
        onPress={() => onChange('recent')}
        testID="history-mode-recent"
      >
        <Ionicons name="time" size={13} color={mode === 'recent' ? '#fff' : COLORS.textMuted} />
        <Text style={[styles.modeBtnText, mode === 'recent' && styles.modeBtnTextActive]}>Recent</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modeBtn, mode === 'clients' && styles.modeBtnActive]}
        onPress={() => onChange('clients')}
        testID="history-mode-clients"
      >
        <Ionicons name="people" size={13} color={mode === 'clients' ? '#fff' : COLORS.textMuted} />
        <Text style={[styles.modeBtnText, mode === 'clients' && styles.modeBtnTextActive]}>By Client</Text>
      </TouchableOpacity>
    </View>
  );
}

function clientKey(item) {
  const name = (item.customer_name || 'Unknown').trim().toLowerCase();
  const phone = (item.phone || '').replace(/\D/g, '');
  return `${name}|${phone}`;
}

function groupByClient(items) {
  const map = new Map();
  for (const it of items) {
    const key = clientKey(it);
    if (!map.has(key)) {
      map.set(key, {
        key,
        customer_name: it.customer_name || 'Unknown',
        phone: it.phone || '',
        visits: [],
      });
    }
    map.get(key).visits.push(it);
  }
  // Sort each client's visits newest first, and sort clients by most-recent visit
  const groups = Array.from(map.values()).map((g) => ({
    ...g,
    visits: g.visits.slice().sort(
      (a, b) => new Date(b.completed_at || b.status_updated_at || 0) - new Date(a.completed_at || a.status_updated_at || 0)
    ),
  }));
  groups.sort(
    (a, b) => new Date(b.visits[0]?.completed_at || 0) - new Date(a.visits[0]?.completed_at || 0)
  );
  return groups;
}

function ClientNotesEditor({ customerName, phone, password }) {
  const [notes, setNotes] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchClientNotes(customerName, phone, password)
      .then((r) => {
        if (cancelled) return;
        setNotes(r.notes || '');
        setInitial(r.notes || '');
      })
      .catch((e) => !cancelled && setError(e.message || 'Failed to load notes'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [customerName, phone, password]);

  const dirty = notes !== initial;
  const onSave = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await saveClientNotes(customerName, phone, notes, password);
      setInitial(r.notes || '');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.notesBlock} testID="client-notes-editor">
      <View style={styles.notesHeader}>
        <Ionicons name="document-text" size={13} color={COLORS.gold} />
        <Text style={styles.notesLabel}>Notes for this client</Text>
        {saved ? <Text style={styles.savedTag}>Saved</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.pink} style={styles.notesLoader} />
      ) : (
        <>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Pet allergies, gate code, preferred products, quirks…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            style={styles.notesInput}
            testID="client-notes-input"
          />
          {error ? <Text style={styles.notesError}>{error}</Text> : null}
          {dirty ? (
            <TouchableOpacity
              style={[styles.notesSaveBtn, saving && styles.reviewBtnBusy]}
              onPress={onSave}
              disabled={saving}
              testID="client-notes-save"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#0A0611" />
              ) : (
                <Text style={styles.notesSaveText}>Save notes</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

function MergePickerModal({ visible, sourceGroup, allGroups, onCancel, onPick }) {
  if (!visible) return null;
  const targets = (allGroups || []).filter((g) => g.key !== sourceGroup?.key);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.viewerBackdrop}>
        <TouchableOpacity style={styles.viewerClose} onPress={onCancel} testID="merge-picker-close">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.viewerTitle}>
          Merge "{sourceGroup?.customer_name}" into…
        </Text>
        <Text style={styles.mergeHint}>
          All {sourceGroup?.visits?.length || 0} visits + notes will move to the client you pick.
          Great for cleaning up duplicate spellings.
        </Text>
        <ScrollView contentContainerStyle={styles.viewerScroll} showsVerticalScrollIndicator={false}>
          {targets.length === 0 ? (
            <Text style={styles.viewerEmpty}>No other clients to merge into yet.</Text>
          ) : (
            targets.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={styles.mergeTargetRow}
                onPress={() => onPick(t)}
                testID={`merge-target-${t.key}`}
                activeOpacity={0.85}
              >
                <View style={styles.mergeTargetTextWrap}>
                  <Text style={styles.customer}>{t.customer_name}</Text>
                  <Text style={styles.clientSubtitle}>
                    {t.visits.length} visit{t.visits.length === 1 ? '' : 's'}
                    {t.phone ? ` · ${t.phone}` : ''}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={COLORS.pink} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ClientGroupCard({ group, onOpenPhoto, onSendReview, sendingId, password, allGroups, onMergeDone }) {
  const [expanded, setExpanded] = useState(true);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const totalPhotos = group.visits.reduce((sum, v) => sum + (v.photos?.length || 0), 0);
  const lastVisit = group.visits[0];
  const telHref = `tel:${(group.phone || '').replace(/[^+\d]/g, '')}`;
  return (
    <View style={styles.clientCard} testID={`history-client-${group.key}`}>
      <TouchableOpacity
        style={styles.clientHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
        testID={`history-client-toggle-${group.key}`}
      >
        <View style={styles.clientHeaderMain}>
          <Text style={styles.clientName}>{group.customer_name}</Text>
          <Text style={styles.clientSubtitle}>
            {group.visits.length} visit{group.visits.length === 1 ? '' : 's'} · {totalPhotos} photo{totalPhotos === 1 ? '' : 's'}
            {lastVisit ? ` · last: ${formatDate(lastVisit.completed_at)}` : ''}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      {group.phone ? (
        <TouchableOpacity style={styles.cardRow} onPress={() => Linking.openURL(telHref)}>
          <Ionicons name="call" size={13} color={COLORS.pink} />
          <Text style={[styles.rowText, styles.phoneText]}>{group.phone}</Text>
        </TouchableOpacity>
      ) : null}
      {expanded ? (
        <View style={styles.visitsList}>
          <ClientNotesEditor
            customerName={group.customer_name}
            phone={group.phone}
            password={password}
          />
          {group.visits.map((v) => (
            <View key={v.id} style={styles.visitCard} testID={`history-visit-${v.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.visitDate}>{formatDate(v.completed_at || v.status_updated_at)}</Text>
                <Text style={styles.serviceChip}>{v.service_type}</Text>
              </View>
              <View style={styles.cardRow}>
                <Ionicons name="person" size={12} color={COLORS.violetLight} />
                <Text style={[styles.rowText, styles.rowTextSoft]}>{v.cleaner_name || 'Unknown cleaner'}</Text>
              </View>
              {v.duration_seconds != null ? (
                <View style={styles.cardRow}>
                  <Ionicons name="timer-outline" size={12} color={COLORS.gold} />
                  <Text style={[styles.rowText, styles.rowTextSoft, styles.durationText]}>Job time: {formatDuration(v.duration_seconds)}</Text>
                </View>
              ) : null}
              {v.address ? (
                <View style={styles.cardRow}>
                  <Ionicons name="location" size={12} color={COLORS.textMuted} />
                  <Text style={[styles.rowText, styles.rowTextSoft]} numberOfLines={1}>{v.address}</Text>
                </View>
              ) : null}
              <TouchableOpacity onPress={() => onOpenPhoto(v)} activeOpacity={0.85}>
                <PhotoStrip photos={v.photos} />
              </TouchableOpacity>
              {(v.photos || []).length === 0 ? (
                <Text style={styles.noVisitPhotos}>No photos on this visit.</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.miniReviewBtn, sendingId === v.id && styles.reviewBtnBusy]}
                onPress={() => onSendReview(v)}
                disabled={sendingId === v.id}
                testID={`history-send-review-${v.id}`}
              >
                {sendingId === v.id ? (
                  <ActivityIndicator size="small" color={COLORS.pink} />
                ) : (
                  <>
                    <Ionicons name={v.review_sent_at ? 'send' : 'star'} size={12} color={COLORS.pink} />
                    <Text style={styles.miniReviewBtnText}>
                      {v.review_sent_at ? 'Resend review' : 'Send review link'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.mergeRow}>
            <TouchableOpacity
              style={styles.mergeBtn}
              onPress={() => { setMergeError(''); setMergeOpen(true); }}
              testID={`history-client-merge-${group.key}`}
              activeOpacity={0.85}
            >
              <Ionicons name="git-merge" size={13} color={COLORS.violetLight} />
              <Text style={styles.mergeBtnText}>Merge into another client…</Text>
            </TouchableOpacity>
            {mergeError ? <Text style={styles.notesError}>{mergeError}</Text> : null}
          </View>
        </View>
      ) : null}
      <MergePickerModal
        visible={mergeOpen}
        sourceGroup={group}
        allGroups={allGroups}
        onCancel={() => setMergeOpen(false)}
        onPick={async (target) => {
          if (merging) return;
          setMerging(true);
          setMergeError('');
          try {
            await mergeClients(
              {
                fromName: group.customer_name,
                fromPhone: group.phone,
                intoName: target.customer_name,
                intoPhone: target.phone,
              },
              password,
            );
            setMergeOpen(false);
            if (onMergeDone) onMergeDone();
          } catch (e) {
            setMergeError(e.message || 'Merge failed');
          } finally {
            setMerging(false);
          }
        }}
      />
    </View>
  );
}

function PhotoStrip({ photos }) {
  if (!photos || photos.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
      {photos.map((p) => (
        <View key={p.id} style={styles.photoTile}>
          <PhotoImage url={p.url} style={styles.photoImg} resizeMode="cover" />
          <View style={[styles.kindBadge, p.kind === 'after' && styles.kindBadgeAfter]}>
            <Text style={styles.kindBadgeText}>{p.kind === 'before' ? 'Before' : 'After'}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function HistoryCard({ item, onSendReview, sendingId, onOpenPhoto }) {
  const isSending = sendingId === item.id;
  const beforeCount = (item.photos || []).filter((p) => p.kind === 'before').length;
  const afterCount = (item.photos || []).filter((p) => p.kind === 'after').length;
  const telHref = `tel:${(item.phone || '').replace(/[^+\d]/g, '')}`;
  return (
    <View style={styles.card} testID="history-card">
      <View style={styles.cardTop}>
        <Text style={styles.customer}>{item.customer_name}</Text>
        <Text style={styles.date}>{formatDate(item.completed_at || item.status_updated_at)}</Text>
      </View>
      <View style={styles.cardRow}>
        <Ionicons name="person" size={14} color={COLORS.violetLight} />
        <Text style={styles.rowText}>{item.cleaner_name || 'Unknown cleaner'}</Text>
        <Text style={styles.serviceChip}>{item.service_type}</Text>
      </View>
      {item.duration_seconds != null ? (
        <View style={styles.cardRow} testID={`history-duration-${item.id}`}>
          <Ionicons name="timer-outline" size={14} color={COLORS.gold} />
          <Text style={[styles.rowText, styles.durationText]}>Job time: {formatDuration(item.duration_seconds)}</Text>
        </View>
      ) : null}
      {item.address ? (
        <TouchableOpacity
          style={styles.cardRow}
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(item.address)}`)}
        >
          <Ionicons name="location" size={14} color={COLORS.textMuted} />
          <Text style={[styles.rowText, styles.rowTextSoft]}>{item.address}</Text>
        </TouchableOpacity>
      ) : null}
      {item.phone ? (
        <TouchableOpacity style={styles.cardRow} onPress={() => Linking.openURL(telHref)}>
          <Ionicons name="call" size={14} color={COLORS.pink} />
          <Text style={[styles.rowText, styles.phoneText]}>{item.phone}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Ionicons name="camera" size={12} color={COLORS.textSoft} />
          <Text style={styles.metaChipText}>
            {beforeCount} before · {afterCount} after
          </Text>
        </View>
        {item.review_sent_at ? (
          <View style={[styles.metaChip, styles.reviewSent]} testID="history-review-sent">
            <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
            <Text style={[styles.metaChipText, styles.metaChipTextSuccess]}>
              Review sent {timeAgoShort(item.review_sent_at)}
            </Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity onPress={() => onOpenPhoto(item)} activeOpacity={0.85}>
        <PhotoStrip photos={item.photos} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.reviewBtn, isSending && styles.reviewBtnBusy]}
        onPress={() => onSendReview(item)}
        disabled={isSending}
        testID={`history-send-review-${item.id}`}
      >
        {isSending ? (
          <ActivityIndicator size="small" color={COLORS.pink} />
        ) : (
          <>
            <Ionicons name={item.review_sent_at ? 'send' : 'star'} size={14} color={COLORS.pink} />
            <Text style={styles.reviewBtnText}>
              {item.review_sent_at ? 'Resend review link' : 'Send Google review link'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function PhotoViewer({ item, onClose }) {
  if (!item) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        <TouchableOpacity style={styles.viewerClose} onPress={onClose} testID="history-viewer-close">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.viewerTitle}>
          {item.customer_name} · {item.service_type}
        </Text>
        <ScrollView contentContainerStyle={styles.viewerScroll} showsVerticalScrollIndicator={false}>
          {(item.photos || []).length === 0 ? (
            <Text style={styles.viewerEmpty}>No photos were taken for this job.</Text>
          ) : (
            (item.photos || []).map((p) => (
              <View key={p.id} style={styles.viewerCard}>
                <Text style={styles.viewerKind}>{p.kind === 'before' ? 'Before' : 'After'}</Text>
                <PhotoImage url={p.url} style={styles.viewerImg} resizeMode="contain" />
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AdminHistory({ password }) {
  const [items, setItems] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sendingId, setSendingId] = useState(null);
  const [openPhoto, setOpenPhoto] = useState(null);
  const [mode, setMode] = useState('recent');

  const load = useCallback(async (cleanerId) => {
    try {
      const data = await fetchAssignmentHistory(cleanerId, password);
      setItems(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [password]);

  useEffect(() => {
    fetchCleaners(password)
      .then((data) => setCleaners(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [password]);

  useEffect(() => {
    load(selectedCleaner);
  }, [load, selectedCleaner]);

  const onSendReview = async (assignment) => {
    setError('');
    setNotice('');
    setSendingId(assignment.id);
    try {
      const res = await sendReviewRequest(assignment.id, password);
      setItems((prev) => prev.map((a) => (a.id === assignment.id ? { ...a, review_sent_at: res.review_sent_at } : a)));
      setNotice(
        res.sent_via_sms
          ? `Review SMS sent to ${assignment.customer_name}.`
          : `Review link marked as sent. (Text messages aren't configured in this environment — share the link manually.)`
      );
    } catch (e) {
      setError(e.message || 'Could not send review');
    } finally {
      setSendingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.pink} size="large" />
      </View>
    );
  }

  const groups = mode === 'clients' ? groupByClient(items) : null;

  return (
    <>
      <FlatList
        data={mode === 'clients' ? groups : items}
        keyExtractor={(item) => (mode === 'clients' ? item.key : item.id)}
        contentContainerStyle={LIST_CONTENT_STYLE}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(selectedCleaner);
            }}
            tintColor={COLORS.pink}
          />
        }
        ListHeaderComponent={
          <View>
            <ViewModeToggle mode={mode} onChange={setMode} />
            <CleanerFilter cleaners={cleaners} selected={selectedCleaner} onSelect={setSelectedCleaner} />
            {error ? (
              <Text style={styles.error} testID="history-error">
                {error}
              </Text>
            ) : null}
            {notice ? (
              <Text style={styles.notice} testID="history-notice">
                {notice}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          mode === 'clients' ? (
            <ClientGroupCard
              group={item}
              onOpenPhoto={setOpenPhoto}
              onSendReview={onSendReview}
              sendingId={sendingId}
              password={password}
              allGroups={groups}
              onMergeDone={() => load(selectedCleaner)}
            />
          ) : (
            <HistoryCard
              item={item}
              onSendReview={onSendReview}
              sendingId={sendingId}
              onOpenPhoto={setOpenPhoto}
            />
          )
        }
        ListEmptyComponent={
          <View style={[styles.center, styles.emptyPad]}>
            <MaterialCommunityIcons name="clipboard-check-outline" size={44} color={COLORS.textMuted} />
            <Text style={styles.empty}>
              {selectedCleaner
                ? 'No completed jobs for this cleaner yet.'
                : 'No completed cleans yet — jobs appear here after a cleaner marks them done.'}
            </Text>
          </View>
        }
      />
      <PhotoViewer item={openPhoto} onClose={() => setOpenPhoto(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { paddingBottom: 12, gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.violet, borderColor: COLORS.violet },
  chipText: { color: COLORS.textMuted, fontFamily: FONTS.bodyMedium, fontSize: 12.5 },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  customer: { color: COLORS.text, fontFamily: FONTS.heading, fontSize: 16, flex: 1, marginRight: 8 },
  date: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 11.5, marginTop: 3 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  rowText: { color: COLORS.textSoft, fontFamily: FONTS.body, fontSize: 13, flex: 1 },
  rowTextSoft: { color: COLORS.textSoft },
  phoneText: { color: COLORS.pink, fontFamily: FONTS.bodySemiBold },
  emptyPad: { paddingTop: 60 },
  reviewBtnBusy: { opacity: 0.7 },
  metaChipTextSuccess: { color: COLORS.success },
  serviceChip: {
    color: COLORS.violetLight,
    fontFamily: FONTS.bodySemiBold,
    fontSize: 11.5,
    backgroundColor: 'rgba(179,106,232,0.12)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  durationText: { color: COLORS.gold, fontFamily: FONTS.bodySemiBold },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  metaChipText: { color: COLORS.textSoft, fontFamily: FONTS.bodyMedium, fontSize: 11 },
  reviewSent: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.35)' },
  photoStrip: { paddingTop: 10, gap: 8 },
  photoTile: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  photoImg: { width: '100%', height: '100%' },
  kindBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: 'rgba(10,6,17,0.85)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  kindBadgeAfter: { backgroundColor: 'rgba(74,222,128,0.85)' },
  kindBadgeText: { color: '#fff', fontFamily: FONTS.bodySemiBold, fontSize: 9.5, letterSpacing: 0.5 },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,95,176,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,95,176,0.3)',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  reviewBtnText: { color: COLORS.pink, fontFamily: FONTS.bodySemiBold, fontSize: 13 },
  error: {
    color: COLORS.danger,
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  notice: {
    color: COLORS.success,
    fontFamily: FONTS.bodyMedium,
    fontSize: 12.5,
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  empty: {
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 30,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,6,17,0.96)',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  viewerClose: { position: 'absolute', top: 22, right: 18, padding: 6, zIndex: 2 },
  viewerTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 16,
    marginBottom: 14,
    paddingRight: 40,
  },
  viewerScroll: { gap: 12, paddingBottom: 20 },
  viewerCard: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 10,
  },
  viewerKind: { color: COLORS.textSoft, fontFamily: FONTS.bodySemiBold, fontSize: 12, marginBottom: 8 },
  viewerImg: { width: '100%', height: 260, borderRadius: 10, backgroundColor: COLORS.bg },
  viewerEmpty: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 13.5, textAlign: 'center', marginTop: 40 },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    backgroundColor: COLORS.panelSoft,
    borderRadius: 999,
    padding: 4,
    alignSelf: 'flex-start',
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  modeBtnActive: { backgroundColor: COLORS.violet },
  modeBtnText: { color: COLORS.textMuted, fontFamily: FONTS.bodySemiBold, fontSize: 12 },
  modeBtnTextActive: { color: '#fff' },
  clientCard: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 14,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 6,
  },
  clientHeaderMain: { flex: 1 },
  clientName: { color: COLORS.text, fontFamily: FONTS.heading, fontSize: 17 },
  clientSubtitle: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  visitsList: { gap: 10, marginTop: 10 },
  visitCard: {
    backgroundColor: COLORS.panelSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
  },
  visitDate: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 13.5, flex: 1 },
  noVisitPhotos: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 11.5, fontStyle: 'italic', marginTop: 6 },
  miniReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,95,176,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,95,176,0.3)',
    borderRadius: 10,
    paddingVertical: 7,
    marginTop: 8,
  },
  miniReviewBtnText: { color: COLORS.pink, fontFamily: FONTS.bodySemiBold, fontSize: 11.5 },
  mergeRow: { marginTop: 4 },
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(179,106,232,0.35)',
    backgroundColor: 'rgba(139,47,201,0.1)',
    borderRadius: 10,
    paddingVertical: 8,
  },
  mergeBtnText: { color: COLORS.violetLight, fontFamily: FONTS.bodySemiBold, fontSize: 12 },
  mergeHint: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12, marginBottom: 10, lineHeight: 17 },
  mergeTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  mergeTargetTextWrap: { flex: 1 },
  notesBlock: {
    backgroundColor: 'rgba(224,178,85,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224,178,85,0.28)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 4,
  },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  notesLabel: { color: COLORS.gold, fontFamily: FONTS.bodySemiBold, fontSize: 12, flex: 1 },
  savedTag: { color: COLORS.success, fontFamily: FONTS.bodySemiBold, fontSize: 11 },
  notesLoader: { alignSelf: 'flex-start', marginTop: 2 },
  notesInput: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notesError: { color: COLORS.danger, fontFamily: FONTS.body, fontSize: 11.5, marginTop: 6 },
  notesSaveBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  notesSaveText: { color: '#0A0611', fontFamily: FONTS.bodySemiBold, fontSize: 12.5 },
});
