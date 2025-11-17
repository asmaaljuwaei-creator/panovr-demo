"use client";

import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { RootState } from '../store';
import { setMode, setPrimaryColor, setBrandColor, setBackgroundImageUrl, toggleMode, initializeTheme } from '../store/slices/config/themeSlice';

export const useThemeStore = () => {
  const dispatch = useDispatch();
  const { mode, primaryColor, brandColor, backgroundImageUrl, isHydrated } = useSelector((state: RootState) => state.theme);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize theme on mount
  useEffect(() => {
    dispatch(initializeTheme());
    
    // Set loading to false after a short delay to ensure hydration is complete
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [dispatch]);

  // Custom setBrandColor that updates both Redux and localStorage
  const setBrandColorWithPersist = (color: string | null) => {
    dispatch(setBrandColor(color));
    // The Redux action already handles localStorage, but let's ensure it
    if (typeof window !== 'undefined') {
      if (color) {
        localStorage.setItem('brand-color', color);
      } else {
        localStorage.removeItem('brand-color');
      }
    }
  };

  // Custom setBackgroundImageUrl that updates both Redux and localStorage  
  const setBackgroundImageUrlWithPersist = (url: string | null) => {
    dispatch(setBackgroundImageUrl(url));
    // The Redux action already handles localStorage, but let's ensure it
    if (typeof window !== 'undefined') {
      if (url) {
        // Don't store blob URLs in localStorage as they become invalid after refresh
      } else {
        // Don't remove background-image-url as it's not stored anymore
      }
    }
  };

  const isDark = mode === 'dark';

  return {
    mode,
    primaryColor,
    brandColor,
    backgroundImageUrl,
    isDark,
    isHydrated,
    isLoading: isLoading || !isHydrated,
    setMode: (mode: 'light' | 'dark') => dispatch(setMode(mode)),
    setPrimaryColor: (color: string) => dispatch(setPrimaryColor(color)),
    setBrandColor: setBrandColorWithPersist,
    setBackgroundImageUrl: setBackgroundImageUrlWithPersist,
    toggleMode: () => dispatch(toggleMode()),
  };
}; 