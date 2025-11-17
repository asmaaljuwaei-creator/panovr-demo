import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ChildPanelType = 
  | 'personalPoiDetails'
  | 'organizationPoiDetails'
  | 'saved-place-details'
  | 'userProfile'
  | 'imageGallery'
  | 'quickSettings'
  | 'notifications'
  | 'chat'
  | 'documentViewer'
  | 'formEditor'
  | 'dataTable'
  | 'calendar'
  | 'taskList'
  | 'fileManager'
  | 'customContent'
  | "publicPoiDetails"

export interface ChildPanelConfig {
  width?: 'sm' | 'md' | 'lg' | 'xl' | number; // sm=320px, md=480px, lg=640px, xl=800px
  height?: 'auto' | 'full' | 'sm' | 'md' | 'lg' | number; // auto=content, full=100vh, sm=400px, md=600px, lg=800px
  position?: 'right' | 'left' | 'center';
  showCloseButton?: boolean;
  allowClickOutsideToClose?: boolean;
  showBackdrop?: boolean;
  resizable?: boolean;
  draggable?: boolean;
  overlay?: boolean; // If true, shows over everything like a modal
}

export interface ChildPanelHistoryItem {
  type: ChildPanelType;
  title: string;
  data: any;
  timestamp: number;
  config?: ChildPanelConfig;
}

interface ChildPanelState {
  isOpen: boolean;
  history: ChildPanelHistoryItem[];
  currentIndex: number; // Points to current panel in history
}

const initialState: ChildPanelState = {
  isOpen: false,
  history: [],
  currentIndex: -1,
};

const childPanelSlice = createSlice({
  name: "childPanel",
  initialState,
  reducers: {
    openChildPanel: (state, action: PayloadAction<{ type: ChildPanelType; title: string; data?: any; config?: ChildPanelConfig }>) => {
      const newPanel: ChildPanelHistoryItem = {
        type: action.payload.type,
        title: action.payload.title,
        data: action.payload.data || {},
        timestamp: Date.now(),
        config: action.payload.config || {},
      };

      // Check if we're already showing this panel type with same data
      const currentPanel = state.history[state.currentIndex];
      if (state.isOpen && currentPanel?.type === action.payload.type && 
          JSON.stringify(currentPanel.data) === JSON.stringify(action.payload.data)) {
        // Same panel type with same data is already open, don't add to history
        return;
      }

      // If we're not at the end of history, remove everything after current position
      if (state.currentIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.currentIndex + 1);
      }

      // Add new panel to history
      state.history.push(newPanel);
      state.currentIndex = state.history.length - 1;
      state.isOpen = true;
    },

    navigateChildBack: (state) => {
      if (state.currentIndex > 0) {
        state.currentIndex -= 1;
      }
    },

    navigateChildForward: (state) => {
      if (state.currentIndex < state.history.length - 1) {
        state.currentIndex += 1;
      }
    },

    updateCurrentChildPanelData: (state, action: PayloadAction<any>) => {
      if (state.currentIndex >= 0 && state.history[state.currentIndex]) {
        state.history[state.currentIndex].data = {
          ...state.history[state.currentIndex].data,
          ...action.payload,
        };
      }
    },

    closeChildPanel: (state) => {
      state.isOpen = false;
      state.history = [];
      state.currentIndex = -1;
    },

    // For replacing current panel without adding to history
    replaceCurrentChildPanel: (state, action: PayloadAction<{ type: ChildPanelType; title: string; data?: any; config?: ChildPanelConfig }>) => {
      if (state.currentIndex >= 0) {
        state.history[state.currentIndex] = {
          type: action.payload.type,
          title: action.payload.title,
          data: action.payload.data || {},
          timestamp: Date.now(),
          config: action.payload.config || {},
        };
      }
    },
  },
});

export const { 
  openChildPanel, 
  navigateChildBack, 
  navigateChildForward, 
  updateCurrentChildPanelData, 
  closeChildPanel, 
  replaceCurrentChildPanel 
} = childPanelSlice.actions;

export default childPanelSlice.reducer;