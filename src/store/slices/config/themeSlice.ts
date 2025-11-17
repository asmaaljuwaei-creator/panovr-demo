import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ThemeState {
  mode: 'light' | 'dark';
  primaryColor: string;
  brandColor: string | null;
  backgroundImageUrl: string | null;
  isHydrated: boolean;
}

// Always start with light mode for SSR consistency
// The actual theme will be set after hydration
const getInitialTheme = (): 'light' | 'dark' => {
  // Always return light for SSR consistency
  // We'll update this after hydration
  return 'light';
};

const initialState: ThemeState = {
  mode: getInitialTheme(),
  primaryColor: '#2563eb',
  brandColor: null,
  backgroundImageUrl: null,
  isHydrated: false,
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setMode: (state, action: PayloadAction<'light' | 'dark'>) => {
      // Check if we're on an auth page
      const isAuthPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/auth');
      
      // Force light theme on auth pages
      const actualMode = isAuthPage ? 'light' : action.payload;
      
      state.mode = actualMode;
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('preferred-theme', actualMode);
        
        // Update HTML class for immediate CSS changes
        document.documentElement.className = actualMode;
      }
    },
    setPrimaryColor: (state, action: PayloadAction<string>) => {
      state.primaryColor = action.payload;
    },
    setBrandColor: (state, action: PayloadAction<string | null>) => {
      state.brandColor = action.payload;
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        if (action.payload) {
          localStorage.setItem('brand-color', action.payload);
        } else {
          localStorage.removeItem('brand-color');
        }
      }
    },
    setBackgroundImageUrl: (state, action: PayloadAction<string | null>) => {
      state.backgroundImageUrl = action.payload;
      
      // Don't persist blob URLs to localStorage as they become invalid after refresh
      // Only save the path, blob URL will be recreated when needed
    },
    toggleMode: (state) => {
      // Check if we're on an auth page
      const isAuthPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/auth');
      
      // Don't toggle on auth pages - always stay light
      if (isAuthPage) {
        state.mode = 'light';
        if (typeof window !== 'undefined') {
          localStorage.setItem('preferred-theme', 'light');
          document.documentElement.className = 'light';
        }
        return;
      }
      
      const newMode = state.mode === 'light' ? 'dark' : 'light';
      state.mode = newMode;
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('preferred-theme', newMode);
        
        // Update HTML class for immediate CSS changes
        document.documentElement.className = newMode;
      }
    },
    initializeTheme: (state) => {
      // Only run on client after hydration
      if (typeof window !== 'undefined' && !state.isHydrated) {
        // Check if we're on an auth page
        const isAuthPage = window.location.pathname.startsWith('/auth');
        
        // Get theme from localStorage or default to light
        const stored = localStorage.getItem('preferred-theme');
        const preferredTheme = (stored && ['light', 'dark'].includes(stored)) 
          ? stored as 'light' | 'dark' 
          : 'light';
        
        // Get brand color from localStorage
        const storedBrandColor = localStorage.getItem('brand-color');
        
        // Force light theme on auth pages
        const actualTheme = isAuthPage ? 'light' : preferredTheme;
        
        state.mode = actualTheme;
        state.brandColor = storedBrandColor;
        // Don't restore background image URL from localStorage as blob URLs become invalid
        state.isHydrated = true;
        
        // Apply theme to HTML
        document.documentElement.className = actualTheme;
        
        // If on auth page, also update localStorage
        if (isAuthPage && stored !== 'light') {
          localStorage.setItem('preferred-theme', 'light');
        }
        
        // Note: Brand color application is now handled by useBrandColorSync hook
        // to avoid circular dependencies
      }
    },
    clearBrandColors: (state) => {
      state.brandColor = null;
      state.backgroundImageUrl = null;
      
      if (typeof window !== 'undefined') {
        localStorage.removeItem('brand-color');
        // Don't remove background-image-url as it's not stored anymore
      }
    },
  },
});

export const { setMode, setPrimaryColor, setBrandColor, setBackgroundImageUrl, toggleMode, initializeTheme, clearBrandColors } = themeSlice.actions;
export default themeSlice.reducer; 