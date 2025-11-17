import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Updated to support only Arabic and English
export type Locale = 'ar' | 'en';

interface LocaleState {
  currentLocale: Locale;
  isLoading: boolean;
}

// Updated to always default to Arabic, regardless of browser language
const getInitialLocale = (): Locale => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('preferred-locale');
    const supportedLocales: Locale[] = ['ar', 'en'];
    
    if (stored && supportedLocales.includes(stored as Locale)) {
      return stored as Locale;
    }
    
    // Always default to Arabic for first-time users, regardless of browser language
  }
  // Always default to Arabic
  return 'ar';
};

// Helper function to determine if language is RTL
export const isRTLLanguage = (locale: Locale): boolean => {
  return locale === 'ar';
};

const initialState: LocaleState = {
  currentLocale: getInitialLocale(),
  isLoading: true,
};

const localeSlice = createSlice({
  name: 'locale',
  initialState,
  reducers: {
    setLocale: (state, action: PayloadAction<Locale>) => {
      state.currentLocale = action.payload;
      state.isLoading = false;
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('preferred-locale', action.payload);
        
        // Update HTML attributes
        document.documentElement.lang = action.payload;
        document.documentElement.dir = isRTLLanguage(action.payload) ? 'rtl' : 'ltr';
      }
    },
    initializeLocale: (state) => {
      state.isLoading = false;
      
      // Update HTML attributes on initialization
      if (typeof window !== 'undefined') {
        document.documentElement.lang = state.currentLocale;
        document.documentElement.dir = isRTLLanguage(state.currentLocale) ? 'rtl' : 'ltr';
      }
    },
    toggleLocale: (state) => {
      // Simple toggle between Arabic and English only
      const nextLocale: Locale = state.currentLocale === 'ar' ? 'en' : 'ar';
      
      state.currentLocale = nextLocale;
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('preferred-locale', nextLocale);
        
        // Update HTML attributes
        document.documentElement.lang = nextLocale;
        document.documentElement.dir = isRTLLanguage(nextLocale) ? 'rtl' : 'ltr';
      }
    },
  },
});

export const { setLocale, initializeLocale, toggleLocale } = localeSlice.actions;
export default localeSlice.reducer; 