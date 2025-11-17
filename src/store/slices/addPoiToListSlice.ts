import { createSlice, PayloadAction } from "@reduxjs/toolkit";


interface AddPoiToListPopupState {
  isOpen: boolean;
  isPoisOpen?: boolean;
  listId?: string
}

const initialState: AddPoiToListPopupState = {
  isOpen: false,
  isPoisOpen: false,
  listId: ''
};

const addPoiToListPopupSlice = createSlice({
  name: "addPoiToListPopup",
  initialState,
  reducers: {
    openListsPopup: (state) => {
      state.isOpen = true;
      state.isPoisOpen = false;
    },
    closeListsPopup: (state) => {
      state.isOpen = false;
      state.isPoisOpen = false;
    },
    openPoiInListPage: (state, action) => {
      state.isOpen = false;
      state.isPoisOpen = true;
      state.listId = action.payload
    },
    closePoiInListPage: (state) => {
      state.isOpen = false;
      state.isPoisOpen = false;
    }
  },
});

export const { openListsPopup, closeListsPopup, openPoiInListPage, closePoiInListPage } = addPoiToListPopupSlice.actions;

export default addPoiToListPopupSlice.reducer;