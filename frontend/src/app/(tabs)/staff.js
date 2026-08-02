import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';

const CONTENT_STYLE = { padding: 20, paddingBottom: 40, gap: 16 };

export default function StaffHubScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={CONTENT_STYLE} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>STAFF PORTAL</Text>
          <Text style={styles.title}>Who are you signing in as?</Text>
          <Text style={styles.subtitle}>
            Pick your role to jump into the right tools. Everything is password- or PIN-protected.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.hubCard, styles.adminCard]}
          onPress={() => router.push('/admin')}
          activeOpacity={0.85}
          testID="staff-hub-admin"
        >
          <View style={[styles.hubIcon, styles.adminIcon]}>
            <MaterialCommunityIcons name="shield-account" size={30} color={COLORS.violetLight} />
          </View>
          <View style={styles.hubText}>
            <Text style={styles.hubTitle}>Owner / Admin Login</Text>
            <Text style={styles.hubSub}>
              Dispatch board · lead alerts · team map · history · business settings
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={COLORS.violetLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.hubCard, styles.cleanerCard]}
          onPress={() => router.push('/cleaner')}
          activeOpacity={0.85}
          testID="staff-hub-cleaner"
        >
          <View style={[styles.hubIcon, styles.cleanerIcon]}>
            <MaterialCommunityIcons name="broom" size={30} color={COLORS.pink} />
          </View>
          <View style={styles.hubText}>
            <Text style={styles.hubTitle}>Cleaner Check-in</Text>
            <Text style={styles.hubSub}>
              Start your shift · see your jobs · take before/after photos · mark done
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={COLORS.pink} />
        </TouchableOpacity>

        <Text style={styles.footNote} testID="staff-hub-footnote">
          Customers looking for a quote? Head back to Home or Get Quote — the whole booking flow is public.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { marginBottom: 8 },
  eyebrow: {
    color: COLORS.pink,
    fontFamily: FONTS.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: { color: COLORS.text, fontFamily: FONTS.heading, fontSize: 26, lineHeight: 32 },
  subtitle: {
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 6,
  },
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  adminCard: {
    backgroundColor: 'rgba(139,47,201,0.12)',
    borderColor: 'rgba(179,106,232,0.35)',
  },
  cleanerCard: {
    backgroundColor: 'rgba(255,95,176,0.1)',
    borderColor: 'rgba(255,95,176,0.35)',
  },
  hubIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminIcon: { backgroundColor: 'rgba(139,47,201,0.22)' },
  cleanerIcon: { backgroundColor: 'rgba(255,95,176,0.18)' },
  hubText: { flex: 1 },
  hubTitle: { color: COLORS.text, fontFamily: FONTS.heading, fontSize: 17 },
  hubSub: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  footNote: {
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 17,
  },
});
