import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getPersonalPoiInList, GetPoiInListResponse, PoiDetailsInList } from "../api/personalPoiListApi";

//slice for fetch and store 
interface PersonalPoiInListState {
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  pois: PoiDetailsInList[];
}

const initialState: PersonalPoiInListState = {
  isOpen: false,
  loading: false,
  error: null,
  pois: []
}

//fetch pois in a lists
export const fetchPersonalPoiInLists = createAsyncThunk<GetPoiInListResponse, string>(
  '/personalPoi/getPoiInList',
  async (listId: string) => {
    return await getPersonalPoiInList(listId)
  }
)
//slice for create and fetch
const personalPoiListSlice = createSlice({
  name: 'poiInList',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
      builder
      .addCase(fetchPersonalPoiInLists.pending, (state) => {
      state.loading = true;
      state.error = null;
      state.isOpen = true
    })
    .addCase(fetchPersonalPoiInLists.fulfilled, (state, action) => {
      state.loading = false;
      state.isOpen = false;
       const list = action.payload.value.value;
        if (list) {
          const existsIndex = state.pois.findIndex(p => p.listId === list.listId);
          if (existsIndex >= 0) {
            state.pois[existsIndex] = list;
          } else {
            state.pois.push(list);
          }
        }
    })
    .addCase(fetchPersonalPoiInLists.rejected, (state, action) => {
      state.loading = false;
      state.isOpen = true
      state.error = action.error.message || 'Failed to fetch lists';
    });
  }
});

export default personalPoiListSlice.reducer