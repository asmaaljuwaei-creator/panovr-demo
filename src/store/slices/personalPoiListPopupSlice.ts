import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CreatePoiList, PersonalPoiList } from '../api/personalPoiListApi';

//slices for create/edit popup
interface PersonalPoiPopupState {
  mode: 'create' | 'edit' | null;
  isOpen: boolean;
  formData: PersonalPoiList;
}

const initialState: PersonalPoiPopupState = {
  mode: null,
  isOpen: false,
  formData: { name: '', iconName: 'default' }
};

const personalPoiPopupSlice = createSlice({
  name: 'poiPopup',
  initialState,
  reducers: {
    openCreateListPopup: (state) => {
      state.isOpen = true;
      state.mode = 'create';
      state.formData = { name: '', iconName: 'default' };
    },
    openEditListPopup: (state, action: PayloadAction<PersonalPoiList>) => {
      state.isOpen = true;
      state.mode = 'edit';
      state.formData = action.payload;
    },
    closeListPopup: (state) => {
      state.isOpen = false;
      state.mode = null;
      state.formData = { name: '', iconName: 'default' };
    },
    updateFormData: (state, action: PayloadAction<Partial<CreatePoiList>>) => {
      state.formData = { ...state.formData, ...action.payload };
    }
  }
});

export const { openCreateListPopup, openEditListPopup, closeListPopup, updateFormData } = personalPoiPopupSlice.actions;

export default personalPoiPopupSlice.reducer;
