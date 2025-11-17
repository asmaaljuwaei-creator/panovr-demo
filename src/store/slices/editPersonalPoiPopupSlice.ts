import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PersonalPoi } from '../api/personalPoiApi';

export interface EditPersonalPoiPopupState {
  isOpen: boolean;
  personalPoi: PersonalPoi | null;
}

const initialState: EditPersonalPoiPopupState = {
  isOpen: false,
  personalPoi: null,
};

const editPersonalPoiPopupSlice = createSlice({
  name: 'editPersonalPoiPopup',
  initialState,
  reducers: {
    openEditPersonalPoiPopup: (state, action: PayloadAction<PersonalPoi>) => {
      state.isOpen = true;
      state.personalPoi = action.payload;
    },
    closeEditPersonalPoiPopup: (state) => {
      state.isOpen = false;
      state.personalPoi = null;
    },
  },
});

export const {
  openEditPersonalPoiPopup,
  closeEditPersonalPoiPopup,
} = editPersonalPoiPopupSlice.actions;

export default editPersonalPoiPopupSlice.reducer;