import { createSlice } from "@reduxjs/toolkit";


interface AddRatingPopup {
  isOpen: boolean;
  value?: number; 
  comment?: string;
}

const initialState: AddRatingPopup = {
  isOpen: false,
  value: 1,
  comment: ''
}

const addRatingPopupSlice = createSlice({
  name: 'addRatingPopup',
  initialState,
  reducers: {
  openRatingPopup: (state) => {
    state.isOpen = true;
  },
  closeRatingPopup: (state) => {
    state.isOpen = false;  
    state.value = 1;
    state.comment = ''
  },
  clearRatingPopup: (state) => {
    state.value = 1;
    state.comment = ''
  }
  }
})

export const {openRatingPopup, closeRatingPopup, clearRatingPopup} = addRatingPopupSlice.actions;
export default addRatingPopupSlice.reducer