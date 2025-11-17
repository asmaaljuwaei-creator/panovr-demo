import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PersonalPoiType } from '../api/personalPoiApi';

export interface AddPersonalPoiFormData {
  englishName: string;
  arabicName: string;
  type: PersonalPoiType;
  latitude: number | '';
  longitude: number | '';
}

interface AddPersonalPoiPopupState {
  isOpen: boolean;
  formData: AddPersonalPoiFormData;
}

const initialState: AddPersonalPoiPopupState = {
  isOpen: false,
  formData: {
    englishName: '',
    arabicName: '',
    type: PersonalPoiType.Other,
    latitude: '',
    longitude: ''
  }
};

const addPersonalPoiPopupSlice = createSlice({
  name: 'addPersonalPoiPopup',
  initialState,
  reducers: {
    openAddPersonalPoiPopup: (state) => {
      state.isOpen = true;
    },
    closeAddPersonalPoiPopup: (state) => {
      state.isOpen = false;
      // Reset form when closing
      state.formData = {
        englishName: '',
        arabicName: '',
        type: PersonalPoiType.Other,
        latitude: '',
        longitude: ''
      };
    },
    updatePersonalPoiFormData: (state, action: PayloadAction<Partial<AddPersonalPoiFormData>>) => {
      state.formData = { ...state.formData, ...action.payload };
    },
    setPersonalPoiFormData: (state, action: PayloadAction<AddPersonalPoiFormData>) => {
      state.formData = action.payload;
    },
    resetPersonalPoiFormData: (state) => {
      state.formData = {
        englishName: '',
        arabicName: '',
        type: PersonalPoiType.Other,
        latitude: '',
        longitude: ''
      };
    }
  }
});

export const { 
  openAddPersonalPoiPopup, 
  closeAddPersonalPoiPopup, 
  updatePersonalPoiFormData, 
  setPersonalPoiFormData, 
  resetPersonalPoiFormData
} = addPersonalPoiPopupSlice.actions;

export default addPersonalPoiPopupSlice.reducer;