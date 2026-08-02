import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';

// Stable style/option objects — defined at module scope so React doesn't see
// a new reference every render (avoids unnecessary re-renders of the tab bar).
const TAB_BAR_STYLE = {
  backgroundColor: COLORS.panel,
  borderTopColor: COLORS.border,
  borderTopWidth: 1,
  height: 62,
  paddingBottom: 8,
  paddingTop: 6,
};
const TAB_BAR_LABEL_STYLE = { fontFamily: FONTS.bodyMedium, fontSize: 11 };
const TAB_SCENE_STYLE = { backgroundColor: COLORS.bg };
const SCREEN_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: COLORS.pink,
  tabBarInactiveTintColor: '#7A6C8E',
  tabBarStyle: TAB_BAR_STYLE,
  tabBarLabelStyle: TAB_BAR_LABEL_STYLE,
  sceneStyle: TAB_SCENE_STYLE,
};

// Stable tabBarIcon renderers — hoisted so `options={...}` gets the same
// function reference every render.
const renderHomeIcon = ({ color, focused }) => (
  <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
);
const renderServicesIcon = ({ color, focused }) => (
  <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={22} color={color} />
);
const renderQuoteIcon = ({ color, focused }) => (
  <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} />
);
const renderGalleryIcon = ({ color, focused }) => (
  <Ionicons name={focused ? 'images' : 'images-outline'} size={22} color={color} />
);
const renderContactIcon = ({ color, focused }) => (
  <Ionicons name={focused ? 'call' : 'call-outline'} size={22} color={color} />
);
const renderStaffIcon = ({ color, focused }) => (
  <Ionicons name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'} size={22} color={color} />
);

const HOME_OPTIONS = { title: 'Home', tabBarButtonTestID: 'tab-home', tabBarIcon: renderHomeIcon };
const SERVICES_OPTIONS = { title: 'Services', tabBarButtonTestID: 'tab-services', tabBarIcon: renderServicesIcon };
const QUOTE_OPTIONS = { title: 'Get Quote', tabBarButtonTestID: 'tab-quote', tabBarIcon: renderQuoteIcon };
const GALLERY_OPTIONS = { title: 'Gallery', tabBarButtonTestID: 'tab-gallery', tabBarIcon: renderGalleryIcon };
const CONTACT_OPTIONS = { title: 'Contact', tabBarButtonTestID: 'tab-contact', tabBarIcon: renderContactIcon };
const STAFF_OPTIONS = { title: 'Staff', tabBarButtonTestID: 'tab-staff', tabBarIcon: renderStaffIcon };

export default function TabsLayout() {
  return (
    <Tabs screenOptions={SCREEN_OPTIONS}>
      <Tabs.Screen name="index" options={HOME_OPTIONS} />
      <Tabs.Screen name="services" options={SERVICES_OPTIONS} />
      <Tabs.Screen name="quote" options={QUOTE_OPTIONS} />
      <Tabs.Screen name="gallery" options={GALLERY_OPTIONS} />
      <Tabs.Screen name="contact" options={CONTACT_OPTIONS} />
      <Tabs.Screen name="staff" options={STAFF_OPTIONS} />
    </Tabs>
  );
}
