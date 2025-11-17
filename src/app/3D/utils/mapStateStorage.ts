/**
 * Map state storage key
 */
const MAP_STATE_KEY = 'neoMap_state';

/**
 * Map state interface
 */
export interface MapState {
  center: [number, number]; // [lon, lat]
  zoom: number;
  scale: number | null;
}

/**
 * Get map state from localStorage
 */
export const getMapStateFromLocalStorage = (): MapState | null => {
  try {
    const stored = localStorage.getItem(MAP_STATE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      if (state?.center && state?.zoom !== undefined) {
        return {
          center: state.center,
          zoom: state.zoom,
          scale: state.scale
        };
      }
    }
  } catch (error) {
    console.error('Error reading map state from localStorage:', error);
  }
  return null;
};

/**
 * Update map state in localStorage
 */
export const updateMapStateInLocalStorage = (lat: number, lon: number, zoom: number): void => {
  try {
    localStorage.setItem(
      MAP_STATE_KEY,
      JSON.stringify({
        center: [lon, lat],
        zoom,
        scale: null
      })
    );
  } catch (error) {
    console.error('Error saving map state to localStorage:', error);
  }
};

/**
 * Clear map state from localStorage
 */
export const clearMapStateFromLocalStorage = (): void => {
  try {
    localStorage.removeItem(MAP_STATE_KEY);
  } catch (error) {
    console.error('Error clearing map state from localStorage:', error);
  }
};
