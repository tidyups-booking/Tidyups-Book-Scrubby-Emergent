import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, GRADIENT } from '../../constants/theme';
import { useBusiness } from '../../lib/business';
import { SectionHeader, Card } from '../../components/ui';

// Stable references — hoisted so LinearGradient doesn't see new object refs every render.
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 1 };
const FLEX1_STYLE = { flex: 1 };

function ContactRow({ icon, title, sub, onPress, testID }) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} testID={testID} style={styles.rowCard}>
      <LinearGradient colors={GRADIENT} start={GRADIENT_START} end={GRADIENT_END} style={styles.rowIcon}>
        {icon}
      </LinearGradient>
      <View style={FLEX1_STYLE}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {onPress ? <Ionicons name="open-outline" size={17} color={COLORS.textMuted} /> : null}
    </TouchableOpacity>
  );
}

export default function ContactScreen() {
  const router = useRouter();
  const { business: CONTACT } = useBusiness();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeader kicker="Get in touch" title="Contact Us" style={{ marginTop: 14 }} />
        <Text style={styles.intro}>Questions, bookings or quotes — we're one tap away.</Text>

        <View style={{ gap: 12 }}>
          <ContactRow
            icon={<Ionicons name="call" size={19} color="#fff" />}
            title={CONTACT.phoneDisplay}
            sub="Call or text — Edmonton line"
            onPress={() => Linking.openURL(CONTACT.phoneTel)}
            testID="contact-phone"
          />
          <ContactRow
            icon={<Ionicons name="headset" size={19} color="#fff" />}
            title={CONTACT.tollFreeDisplay}
            sub={`Toll-free · ${CONTACT.tollFreeSub}`}
            onPress={() => Linking.openURL(CONTACT.tollFreeTel)}
            testID="contact-tollfree"
          />
          <ContactRow
            icon={<Ionicons name="location" size={19} color="#fff" />}
            title={CONTACT.address}
            sub={CONTACT.cityLine}
            onPress={() => Linking.openURL(CONTACT.mapsUrl)}
            testID="contact-address"
          />
          <ContactRow
            icon={<Ionicons name="globe" size={19} color="#fff" />}
            title={CONTACT.website}
            sub="Visit our website"
            onPress={() => Linking.openURL(CONTACT.websiteUrl)}
            testID="contact-website"
          />
        </View>

        <SectionHeader kicker="When we work" title="Business Hours" style={{ marginTop: 32 }} />
        <Card>
          {CONTACT.hours.map((h, i) => (
            <View key={`${h.day}-${i}`} style={[styles.hoursRow, i < CONTACT.hours.length - 1 && styles.hoursDivider]}>
              <Text style={styles.hoursDay}>{h.day}</Text>
              <Text style={[styles.hoursTime, h.time === 'Closed' && { color: COLORS.textMuted }]}>{h.time}</Text>
            </View>
          ))}
        </Card>

        <Text style={styles.serviceArea}>Proudly serving Edmonton & surrounding areas</Text>

        <TouchableOpacity style={styles.staffLink} onPress={() => router.push('/admin')} testID="staff-login-link">
          <Ionicons name="lock-closed" size={13} color={COLORS.textMuted} />
          <Text style={styles.staffLinkText}>Staff Login</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.staffLink, styles.staffLinkTight]} onPress={() => router.push('/cleaner')} testID="cleaner-checkin-link">
          <Ionicons name="navigate" size={13} color={COLORS.textMuted} />
          <Text style={styles.staffLinkText}>Cleaner Check-In</Text>
        </TouchableOpacity>

        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => router.push('/privacy')} testID="footer-privacy-link">
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={() => router.push('/terms')} testID="footer-terms-link">
            <Text style={styles.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={() => router.push('/removerdata')} testID="footer-remove-data-link">
            <Text style={styles.legalLink}>Delete My Data</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.copyright}>© {new Date().getFullYear()} Tidyups Cleaning Inc.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  intro: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 14, marginBottom: 18, marginTop: -6 },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
  },
  rowIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 15 },
  rowSub: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12.5, marginTop: 2 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  hoursDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hoursDay: { color: COLORS.textSoft, fontFamily: FONTS.bodyMedium, fontSize: 14 },
  hoursTime: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 14 },
  serviceArea: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', marginTop: 26 },
  staffLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 26,
    padding: 10,
  },
  staffLinkText: { color: COLORS.textMuted, fontFamily: FONTS.bodyMedium, fontSize: 13 },
  staffLinkTight: { marginTop: 0 },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legalLink: {
    color: COLORS.textSoft,
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  legalSep: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 13 },
  copyright: {
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 10,
  },
});
