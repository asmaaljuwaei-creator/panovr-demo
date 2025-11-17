import { CreatePoiList, getPersonalPoiList, GetPoiListResponse, PersonalPoiList } from "../api/personalPoiListApi";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";


//slice for fetch and store 
interface PersonalPoiListState {
  isOpen: boolean;
  formData: CreatePoiList;
  loading: boolean;
  error: string | null;
  lists: PersonalPoiList[];
}

const initialState: PersonalPoiListState = {
  isOpen: false,
  formData: {
    name: '',
    iconName: 'default'
  },
  loading: false,
  error: null,
  lists: []
}

//fetch lists
export const fetchPersonalPoiLists = createAsyncThunk<GetPoiListResponse>(
  '/personalPoi/getLists',
  async () => {
    return await getPersonalPoiList()
  }
)
//slice for create and fetch
const personalPoiListSlice = createSlice({
  name: 'poiList',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
      builder
      .addCase(fetchPersonalPoiLists.pending, (state) => {
      state.loading = true;
      state.error = null;
      state.isOpen = true
    })
    .addCase(fetchPersonalPoiLists.fulfilled, (state, action) => {
      state.loading = false;
      state.isOpen = false;
      state.lists = action.payload.value;
    })
    .addCase(fetchPersonalPoiLists.rejected, (state, action) => {
      state.loading = false;
      state.isOpen = true
      state.error = action.error.message || 'Failed to fetch lists';
    });
  }
});

export default personalPoiListSlice.reducer