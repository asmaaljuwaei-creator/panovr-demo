import { POI_TYPES } from "@/constants";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type POIType = typeof POI_TYPES[number];

export interface PoiState {
  enabled: boolean;
  visible: boolean;
  loading: boolean;
}

export type PoisFilterState = Record<POIType, PoiState>;

const makeInitialPoiState = (enabled = false): PoiState => ({
  enabled,
  visible: enabled,
  loading: false,
});

const initialState: PoisFilterState = POI_TYPES.reduce((acc, type) => {
  // Enable 'Public' by default
  acc[type] = makeInitialPoiState(type === "Public");
  return acc;
}, {} as PoisFilterState);

const poisFilterSlice = createSlice({
  name: "poisFilter",
  initialState,
  reducers: {
    toggleFilter(state, action: PayloadAction<POIType>) {
      const type = action.payload;
      const poi = state[type];
      poi.enabled = !poi.enabled;
      poi.visible = poi.enabled;
    },
    setFilters(state, action: PayloadAction<POIType[]>) {
      POI_TYPES.forEach((type) => {
        const poi = state[type];
        const isSelected = action.payload.includes(type);
        poi.enabled = isSelected;
        poi.visible = isSelected;
      });
    },
    selectAll(state) {
      POI_TYPES.forEach((type) => {
        state[type].enabled = true;
        state[type].visible = true;
      });
    },
    deselectAll(state) {
      POI_TYPES.forEach((type) => {
        state[type].enabled = false;
        state[type].visible = false;
        state[type].loading = false;
      });
    },
    setPoiVisible(state, action: PayloadAction<{ type: POIType; visible: boolean }>) {
      const { type, visible } = action.payload;
      state[type].visible = visible;
    },
    enablePOIFilter(state, action: PayloadAction<POIType>) {
      const type = action.payload;
      state[type].enabled = true;
      state[type].visible = true;
    },
    disablePOIFilter(state, action: PayloadAction<POIType>) {
      const type = action.payload;
      state[type].enabled = false;
      state[type].visible = false;
      state[type].loading = false;
    },
    setPOIFilterLoading(state, action: PayloadAction<{ type: POIType; loading: boolean }>) {
      const { type, loading } = action.payload;
      state[type].loading = loading;
    },
  },
});

export const { 
  toggleFilter, 
  setFilters, 
  selectAll, 
  deselectAll, 
  setPoiVisible, 
  enablePOIFilter, 
  disablePOIFilter,
  setPOIFilterLoading
} = poisFilterSlice.actions;

export default poisFilterSlice.reducer;
