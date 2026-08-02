import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { CONTACT } from '../constants/data';
import { fetchAppSettings, resolveImageUrl } from './api';

const BusinessContext = createContext({ business: CONTACT, logoUrl: null, refresh: async () => {} });

function mapSettings(s) {
  return {
    phoneDisplay: s.phone_display,
    phoneTel: s.phone_tel,
    tollFreeDisplay: s.tollfree_display,
    tollFreeSub: s.tollfree_sub,
    tollFreeTel: s.tollfree_tel,
    address: s.address,
    cityLine: s.city_line,
    mapsUrl: s.maps_url,
    website: s.website,
    websiteUrl: s.website_url,
    hours: Array.isArray(s.hours) && s.hours.length ? s.hours : CONTACT.hours,
  };
}

export function BusinessProvider({ children }) {
  const [business, setBusiness] = useState(CONTACT);
  const [logoUrl, setLogoUrl] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchAppSettings();
      setBusiness(mapSettings(s));
      setLogoUrl(s.logo_url ? resolveImageUrl(s.logo_url) : null);
    } catch (e) {
      if (__DEV__) console.warn('Business settings fetch failed, using defaults:', e.message || e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ business, logoUrl, refresh }), [business, logoUrl, refresh]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export const useBusiness = () => useContext(BusinessContext);
