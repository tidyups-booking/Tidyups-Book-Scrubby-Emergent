import React, { useState, useCallback } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS, GRADIENT, GRADIENT_START, GRADIENT_END_D } from '../../constants/theme';
import { STATS, TRUST_BADGES, WHY_US, TESTIMONIALS } from '../../constants/data';
import { fetchAppImages, resolveImageUrl } from '../../lib/api';
import { getLastQuote } from '../../lib/lastQuote';
import { useBusiness } from '../../lib/business';
import { GradientButton, OutlineButton, SectionHeader, Card, Chip } from '../../components/ui';

const STAT_COLORS = [COLORS.gold, COLORS.pink, COLORS.violetLight];
const TOP_EDGES = ['top'];
const H_SCROLL_CONTENT = { gap: 12, paddingRight: 20 };
const SECTION_MT_32 = { marginTop: 32 };
const CTA_OUTLINE_STYLE = { backgroundColor: 'rgba(10,6,17,0.85)', borderColor: 'rgba(255,255,255,0.25)' };

const PromoImage = React.memo(function PromoImage({ url, fit }) {
  const source = React.useMemo(() => ({ uri: resolveImageUrl(url) }), [url]);
  return <Image source={source} style={styles.promoImg} resizeMode={fit === 'contain' ? 'contain' : 'cover'} />;
});

export default function HomeScreen() {
  const router = useRouter();
  const [promos, setPromos] = useState([]);
  const [lastQuote, setLastQuote] = useState(null);
  const { business, logoUrl } = useBusiness();

  useFocusEffect(
    useCallback(() => {
      fetchAppImages()
        .then((data) => setPromos(Array.isArray(data) ? data : []))
        .catch(() => {});
      getLastQuote().then(setLastQuote);
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe} edges={TOP_EDGES}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Image source={logoUrl ? { uri: logoUrl } : require('../../../assets/images/logo.png')} style={styles.logoImg} resizeMode="contain" />
            <View>
              <Text style={styles.brandName}>TIDYUPS</Text>
              <Text style={styles.brandSub}>Cleaning Service Inc</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.dispatchBtn} onPress={() => router.push('/admin')} testID="dispatch-btn">
            <MaterialCommunityIcons name="clipboard-account" size={15} color="#fff" />
            <Text style={styles.dispatchBtnText}>Dispatch</Text>
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle} testID="hero-title">
            Sparkling spaces,{'\n'}
            <Text style={styles.pinkAccent}>zero hassle.</Text>
          </Text>
          <Text style={styles.heroSub}>
            Leave The Mess To Us! Edmonton's trusted residential & commercial cleaning crew — insured, eco-friendly and 5-star rated.
          </Text>
          <GradientButton
            title="Get Free Quote"
            testID="home-cta-quote"
            icon={<Ionicons name="sparkles" size={18} color="#fff" />}
            onPress={() => router.push('/quote')}
            style={styles.mb12}
          />
          <OutlineButton
            title={`Call ${business.phoneDisplay}`}
            testID="home-cta-call"
            icon={<Ionicons name="call" size={18} color={COLORS.pink} />}
            onPress={() => Linking.openURL(business.phoneTel)}
          />
          <TouchableOpacity
            style={styles.staffCta}
            onPress={() => router.push('/admin')}
            activeOpacity={0.85}
            testID="home-staff-login"
          >
            <View style={styles.staffCtaIcon}>
              <MaterialCommunityIcons name="shield-account" size={22} color={COLORS.violetLight} />
            </View>
            <View style={styles.staffCtaText}>
              <Text style={styles.staffCtaTitle}>Staff Login</Text>
              <Text style={styles.staffCtaSub}>Dispatch board · cleaner check-in · job history</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={COLORS.violetLight} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cleanerCta}
            onPress={() => router.push('/cleaner')}
            activeOpacity={0.85}
            testID="home-cleaner-checkin"
          >
            <View style={styles.cleanerCtaIcon}>
              <MaterialCommunityIcons name="broom" size={22} color={COLORS.pink} />
            </View>
            <View style={styles.staffCtaText}>
              <Text style={styles.staffCtaTitle}>Cleaner Check-in</Text>
              <Text style={styles.staffCtaSub}>Start shift · see jobs · snap before/after photos</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={COLORS.pink} />
          </TouchableOpacity>
        </View>

        {/* Book Again (returning customers) */}
        {lastQuote ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.bookAgainCard}
            onPress={() => router.push({ pathname: '/quote', params: { bookAgain: Date.now() } })}
            testID="book-again-card"
          >
            <LinearGradient colors={GRADIENT} start={GRADIENT_START} end={GRADIENT_END_D} style={styles.bookAgainIcon}>
              <Ionicons name="repeat" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.whyContent}>
              <Text style={styles.bookAgainTitle}>Welcome back, {lastQuote.name.split(' ')[0]}!</Text>
              <Text style={styles.bookAgainSub} numberOfLines={1}>
                Book your {lastQuote.service_type} again — details prefilled.
              </Text>
            </View>
            <View style={styles.bookAgainBtn} testID="book-again-btn">
              <Ionicons name="arrow-forward" size={17} color={COLORS.pink} />
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Banner */}
        <Image source={require('../../../assets/images/banner.jpg')} style={styles.banner} resizeMode="cover" />

        {/* Stats */}
        <View style={styles.statsRow} testID="stats-row">
          {STATS.map((s, i) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={[styles.statValue, { color: STAT_COLORS[i] }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Trust badges */}
        <View style={styles.badgeRow}>
          {TRUST_BADGES.map((b) => (
            <Chip
              key={b.label}
              label={b.label}
              icon={<MaterialCommunityIcons name={b.icon} size={14} color={COLORS.gold} />}
            />
          ))}
        </View>

        {/* Promotions (dynamic, admin-managed) */}
        {promos.length > 0 ? (
          <View>
            <SectionHeader kicker="Latest offers" title="Promotions" style={SECTION_MT_32} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={H_SCROLL_CONTENT}>
              {promos.map((img, idx) => (
                <TouchableOpacity key={img.id} activeOpacity={0.9} onPress={() => router.push('/gallery')} testID={`promo-card-${idx}`}>
                  <PromoImage url={img.url} fit={img.fit} />
                  {img.label ? (
                    <View style={styles.promoLabelWrap}>
                      <Text style={styles.promoLabel} numberOfLines={1}>
                        {img.label}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Why us */}
        <SectionHeader kicker="Why Tidyups" title="Cleaning you can count on" style={SECTION_MT_32} />
        <View style={styles.whyStack}>
          {WHY_US.map((w) => (
            <Card key={w.title} style={styles.whyCard}>
              <LinearGradient colors={GRADIENT} start={GRADIENT_START} end={GRADIENT_END_D} style={styles.whyIcon}>
                <MaterialCommunityIcons name={w.icon} size={20} color="#fff" />
              </LinearGradient>
              <View style={styles.whyContent}>
                <Text style={styles.whyTitle}>{w.title}</Text>
                <Text style={styles.whyDesc}>{w.desc}</Text>
              </View>
            </Card>
          ))}
        </View>

        {/* Testimonials */}
        <SectionHeader kicker="Reviews" title="What clients say" style={SECTION_MT_32} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={H_SCROLL_CONTENT}>
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} style={styles.reviewCard}>
              <View style={styles.starsRow}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Ionicons key={i} name="star" size={14} color={COLORS.gold} />
                ))}
              </View>
              <Text style={styles.reviewText}>"{t.text}"</Text>
              <Text style={styles.reviewName}>
                {t.name} <Text style={styles.reviewArea}>· {t.area}</Text>
              </Text>
            </Card>
          ))}
        </ScrollView>

        {/* Bottom CTA */}
        <LinearGradient colors={GRADIENT} start={GRADIENT_START} end={GRADIENT_END_D} style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>Ready for a spotless space?</Text>
          <Text style={styles.ctaSub}>Free quotes. No obligation. Fast replies.</Text>
          <OutlineButton
            title="Request My Free Quote"
            testID="bottom-cta-quote"
            style={CTA_OUTLINE_STYLE}
            icon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
            onPress={() => router.push('/quote')}
          />
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoImg: { width: 44, height: 44 },
  brandName: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 17, letterSpacing: 1 },
  brandSub: { color: COLORS.textMuted, fontFamily: FONTS.bodyMedium, fontSize: 10, letterSpacing: 0.5 },
  dispatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.violet,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  dispatchBtnText: { color: '#fff', fontFamily: FONTS.bodySemiBold, fontSize: 13 },
  hero: { marginTop: 18 },
  heroTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 38, lineHeight: 44, marginBottom: 14 },
  heroSub: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 15, lineHeight: 23, marginBottom: 22 },
  bookAgainCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: 'rgba(255,95,176,0.35)',
    borderRadius: 18,
    padding: 14,
    marginTop: 20,
  },
  bookAgainIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bookAgainTitle: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 15 },
  bookAgainSub: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12.5, marginTop: 2 },
  bookAgainBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255,95,176,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,95,176,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    width: '100%',
    height: 170,
    borderRadius: 20,
    marginTop: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 18,
    paddingVertical: 18,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FONTS.display, fontSize: 26 },
  statLabel: { color: COLORS.textMuted, fontFamily: FONTS.bodyMedium, fontSize: 11, marginTop: 4, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  promoImg: {
    width: 290,
    height: 210,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
  },
  promoLabelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,6,17,0.75)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  promoLabel: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 13 },
  whyCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  whyIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  whyTitle: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 15 },
  whyDesc: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 13, marginTop: 2, lineHeight: 19 },
  reviewCard: { width: 280 },
  starsRow: { flexDirection: 'row', gap: 3, marginBottom: 10 },
  reviewText: { color: COLORS.textSoft, fontFamily: FONTS.body, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  reviewName: { color: COLORS.text, fontFamily: FONTS.bodySemiBold, fontSize: 13 },
  ctaCard: { borderRadius: 24, padding: 24, marginTop: 32 },
  ctaTitle: { color: '#fff', fontFamily: FONTS.display, fontSize: 22, marginBottom: 6 },
  ctaSub: { color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.body, fontSize: 14, marginBottom: 18 },
  whyContent: { flex: 1 },
  whyStack: { gap: 12 },
  reviewArea: { color: COLORS.textMuted, fontFamily: FONTS.body },
  pinkAccent: { color: COLORS.pink },
  mb12: { marginBottom: 12 },
  staffCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(139,47,201,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(179,106,232,0.35)',
  },
  staffCtaIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(139,47,201,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffCtaText: { flex: 1 },
  staffCtaTitle: { color: COLORS.text, fontFamily: FONTS.heading, fontSize: 16 },
  staffCtaSub: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  cleanerCta: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,95,176,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,95,176,0.32)',
  },
  cleanerCtaIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,95,176,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
