import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface BaseLayerState {
  selectedLayer: string;
}

const initialState: BaseLayerState = {
  selectedLayer: "default",
};

const baseLayerSlice = createSlice({
  name: "baseLayer",
  initialState,
  reducers: {
    setSelectedLayer: (state, action: PayloadAction<string>) => {
      state.selectedLayer = action.payload;
    },
  },
});

export const { setSelectedLayer } = baseLayerSlice.actions;
export default baseLayerSlice.reducer;
