import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Map } from 'ol';

interface MapState {
  mapInstance: Map | null;
  center: [number, number] | null; // [longitude, latitude]
  zoom: number | null;
  scale: number | null;
  isRestored: boolean; // لتجنب استعادة الحالة أكثر من مرة
}

const initialState: MapState = {
  mapInstance: null,
  center: null,
  zoom: null,
  scale: null,
  isRestored: false,
};

export const mapSlice = createSlice({
  name: 'map',
  initialState,
  reducers: {
    setMapInstance(state, action: PayloadAction<Map>) {
      state.mapInstance = action.payload;
    },
    setMapCenter(state, action: PayloadAction<[number, number]>) {
      state.center = action.payload;
    },
    setMapZoom(state, action: PayloadAction<number>) {
      state.zoom = action.payload;
    },
    setMapScale(state, action: PayloadAction<number>) {
      state.scale = action.payload;
    },
    setMapState(state, action: PayloadAction<{ center: [number, number]; zoom: number; scale: number }>) {
      state.center = action.payload.center;
      state.zoom = action.payload.zoom;
      state.scale = action.payload.scale;
    },
    setMapRestored(state, action: PayloadAction<boolean>) {
      state.isRestored = action.payload;
    },
    clearMapState(state) {
      state.center = null;
      state.zoom = null;
      state.scale = null;
      state.isRestored = false;
    },
    resetMapRestored(state) {
      state.isRestored = false;
    },
  },
});

export const { 
  setMapInstance, 
  setMapCenter, 
  setMapZoom, 
  setMapScale, 
  setMapState, 
  setMapRestored, 
  clearMapState,
  resetMapRestored
} = mapSlice.actions;
export default mapSlice.reducer;