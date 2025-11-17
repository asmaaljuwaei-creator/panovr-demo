"use client";

import { useSelector, useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { RootState } from '../store';
import { setLocale, initializeLocale, toggleLocale, isRTLLanguage, type Locale } from '../store/slices/config/localeSlice';

// Import translations from existing messages structure
import enMessages from '../../messages/en.json';
import arMessages from '../../messages/ar.json';

const messages = {
  ar: arMessages, // Arabic as primary language
  en: enMessages, // English as secondary language
} as const;

export const useLocale = () => {
  const dispatch = useDispatch();
  const { currentLocale, isLoading } = useSelector((state: RootState) => state.locale);

  // Initialize locale on mount
  useEffect(() => {
    if (isLoading) {
      dispatch(initializeLocale());
    }
  }, [isLoading, dispatch]);

  // Enhanced translation function with nested key support
  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = messages[currentLocale];
    
    // Navigate through nested object for current locale
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // If not found in current locale, try English
        value = messages.en;
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = value[k];
          } else {
            // If still not found, return key
            return key;
          }
        }
        break;
      }
    }
    
    // Return the value if it's a string, otherwise return the key
    return typeof value === 'string' ? value : key;
  };

  // Computed values
  const isRTL = isRTLLanguage(currentLocale);
  const direction = isRTL ? 'rtl' : 'ltr';

  // Get language display name
  const getLanguageDisplayName = (locale: Locale): string => {
    const displayNames: Record<Locale, string> = {
      ar: 'العربية',
      en: 'English',
    };
    return displayNames[locale] || locale;
  };

  return {
    currentLocale,
    isLoading,
    isRTL,
    direction,
    t,
    getLanguageDisplayName,
    setLocale: (locale: Locale) => dispatch(setLocale(locale)),
    toggleLocale: () => dispatch(toggleLocale()),
  };
}; 