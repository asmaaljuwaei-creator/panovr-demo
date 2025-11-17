import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type MapViewMode = '2D' | '3D';

interface MapViewState {
  mode: MapViewMode;
}

const initialState: MapViewState = {
  mode: '2D',
};

const mapViewSlice = createSlice({
  name: 'mapView',
  initialState,
  reducers: {
    setMapViewMode: (state, action: PayloadAction<MapViewMode>) => {
      state.mode = action.payload;
    },
  },
});

export const { setMapViewMode } = mapViewSlice.actions;
export default mapViewSlice.reducer;
