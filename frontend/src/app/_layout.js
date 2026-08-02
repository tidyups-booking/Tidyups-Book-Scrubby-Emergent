import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { COLORS } from '../constants/theme';
import { BusinessProvider } from '../lib/business';
import { useLeadAlerts } from '../lib/leadAlerts';

SplashScreen.preventAutoHideAsync().catch(() => {});

const ROOT_STYLE = { flex: 1, backgroundColor: COLORS.bg };
const STACK_SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: COLORS.bg },
};
const MODAL_OPTIONS = { presentation: 'modal' };
const FONT_MAP = {
  Sora_700Bold,
  Sora_800ExtraBold,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
};

export default function RootLayout() {
  useLeadAlerts();
  const [loaded] = useFonts(FONT_MAP);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return <View style={ROOT_STYLE} />;

  return (
    <BusinessProvider>
      <View style={ROOT_STYLE}>
        <StatusBar style="light" />
        <Stack screenOptions={STACK_SCREEN_OPTIONS}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="admin" options={MODAL_OPTIONS} />
          <Stack.Screen name="cleaner" options={MODAL_OPTIONS} />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="removerdata" />
          <Stack.Screen name="terms" />
        </Stack>
      </View>
    </BusinessProvider>
  );
}
