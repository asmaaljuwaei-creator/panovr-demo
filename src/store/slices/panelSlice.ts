import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type PanelType = 'measurement' | 'drawing' | 'routing' | 'search' | 'poiDetails' | 'profile' | 'layers' | 'organizationPoi' | 'missingPlace' | 'save' | 'history' | 'analysis3D' | 'spatialAnalysis';

export interface PanelHistoryItem {
  type: PanelType;
  title: string;
  data: any;
  timestamp: number;
}

interface PanelState {
  isOpen: boolean;
  history: PanelHistoryItem[];
  currentIndex: number; // Points to current panel in history
  previousType: PanelType | null;
}

const initialState: PanelState = {
  isOpen: false,
  history: [],
  currentIndex: -1,
  previousType: null
};

const panelSlice = createSlice({
  name: "panel",
  initialState,
  reducers: {
    openPanel: (state, action: PayloadAction<{ type: PanelType; title: string; data?: any }>) => {
      const newPanel: PanelHistoryItem = {
        type: action.payload.type,
        title: action.payload.title,
        data: action.payload.data || {},
        timestamp: Date.now(),
      };

      // Check if we're already showing this panel type
      const currentPanel = state.history[state.currentIndex];
      if (state.isOpen && currentPanel?.type === action.payload.type) {
        // Same panel type is already open, don't add to history
        return;
      }
      state.previousType = currentPanel?.type ?? null;
      // If we're not at the end of history, remove everything after current position
      if (state.currentIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.currentIndex + 1);
      }

      // Add new panel to history
      state.history.push(newPanel);
      state.currentIndex = state.history.length - 1;
      state.isOpen = true;
    },

    navigateBack: (state) => {
      if (state.currentIndex > 0) {
        state.currentIndex -= 1;
      }
    },

    navigateForward: (state) => {
      if (state.currentIndex < state.history.length - 1) {
        state.currentIndex += 1;
      }
    },

    updateCurrentPanelData: (state, action: PayloadAction<any>) => {
      if (state.currentIndex >= 0 && state.history[state.currentIndex]) {
        state.history[state.currentIndex].data = {
          ...state.history[state.currentIndex].data,
          ...action.payload,
        };
      }
    },

    closePanel: (state) => {
      state.isOpen = false;
      state.history = [];
      state.currentIndex = -1;
      state.previousType = null;
    },

    // For replacing current panel without adding to history (e.g., tool selection within same panel)
    replaceCurrentPanel: (state, action: PayloadAction<{ type: PanelType; title: string; data?: any }>) => {
      if (state.currentIndex >= 0) {
        state.history[state.currentIndex] = {
          type: action.payload.type,
          title: action.payload.title,
          data: action.payload.data || {},
          timestamp: Date.now(),
        };
      }
    },
  },
});

export const { 
  openPanel, 
  navigateBack, 
  navigateForward, 
  updateCurrentPanelData, 
  closePanel, 
  replaceCurrentPanel 
} = panelSlice.actions;

export default panelSlice.reducer; 