import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface NewPlaceFormData {
  name: string;
  description: string;
  category: string;
  location: { lat: number; lng: number } | null;
  address?: string;
  photos: File[];
}

export interface EditPlaceFormData {
  id: string;
  englishName: string;
  arabicName: string;
  description: string;
  address: string;
  latitude: string;
  longitude: string;
  photos: File[];
  existingImages?: { id: string; imageURL: string }[]; // Existing POI images
}

interface AddPlacePopupState {
  isOpen: boolean;
  mode: 'add' | 'edit';
  formData: NewPlaceFormData;
  editData: EditPlaceFormData | null;
  shouldRefreshPanel: boolean; // Flag to trigger panel refresh after edit
  refreshTimestamp: number; // Timestamp to force refresh
}

const initialState: AddPlacePopupState = {
  isOpen: false,
  mode: 'add',
  formData: {
    name: '',
    description: '',
    category: '',
    location: null,
    address: '',
    photos: []
  },
  editData: null,
  shouldRefreshPanel: false,
  refreshTimestamp: 0
};

const addPlacePopupSlice = createSlice({
  name: 'addPlacePopup',
  initialState,
  reducers: {
    openAddPlacePopup: {
      reducer: (state, action: PayloadAction<{ mode?: 'add' | 'edit'; data?: EditPlaceFormData } | undefined>) => {
        state.isOpen = true;
        state.mode = action.payload?.mode || 'add';
        if (action.payload?.mode === 'edit' && action.payload?.data) {
          state.editData = action.payload.data;
        } else {
          state.editData = null;
        }
      },
      prepare: (payload?: { mode?: 'add' | 'edit'; data?: EditPlaceFormData }) => ({
        payload
      })
    },
    openAddPlacePopupForEdit: (state, action: PayloadAction<EditPlaceFormData>) => {
      state.isOpen = true;
      state.mode = 'edit';
      state.editData = action.payload;
    },
    closeAddPlacePopup: (state) => {
      state.isOpen = false;
      state.mode = 'add';
      state.editData = null;
      state.shouldRefreshPanel = false;
      // Reset form when closing
      state.formData = {
        name: '',
        description: '',
        category: '',
        location: null,
        address: '',
        photos: []
      };
    },
    updateFormData: (state, action: PayloadAction<Partial<NewPlaceFormData>>) => {
      state.formData = { ...state.formData, ...action.payload };
    },
    setFormData: (state, action: PayloadAction<NewPlaceFormData>) => {
      state.formData = action.payload;
    },
    resetFormData: (state) => {
      state.formData = {
        name: '',
        description: '',
        category: '',
        location: null,
        address: '',
        photos: []
      };
    },
    setEditData: (state, action: PayloadAction<EditPlaceFormData>) => {
      state.editData = action.payload;
    },
    updateEditData: (state, action: PayloadAction<Partial<EditPlaceFormData>>) => {
      if (state.editData) {
        state.editData = { ...state.editData, ...action.payload };
      }
    },
    triggerPanelRefresh: (state) => {
      state.shouldRefreshPanel = true;
      state.refreshTimestamp = Date.now(); // Force new timestamp
    },
    clearPanelRefreshFlag: (state) => {
      state.shouldRefreshPanel = false;
      state.refreshTimestamp = 0;
    }
  }
});

export const { 
  openAddPlacePopup, 
  openAddPlacePopupForEdit,
  closeAddPlacePopup, 
  updateFormData, 
  setFormData, 
  resetFormData,
  setEditData,
  updateEditData,
  triggerPanelRefresh,
  clearPanelRefreshFlag
} = addPlacePopupSlice.actions;

export default addPlacePopupSlice.reducer;