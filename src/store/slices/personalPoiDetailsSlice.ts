import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { getPersonalPoiDetails, PersonalPoi, GetPersonalPoiDetailsRequest } from '../api/personalPoiApi';

interface PersonalPoiDetailsState {
  selectedPersonalPoi: PersonalPoi | null;
  loading: boolean;
  error: string | null;
}

const initialState: PersonalPoiDetailsState = {
  selectedPersonalPoi: null,
  loading: false,
  error: null,
};

// Async thunk to fetch personal POI details
export const fetchPersonalPoiDetails = createAsyncThunk(
  'personalPoiDetails/fetchPersonalPoiDetails',
  async (request: GetPersonalPoiDetailsRequest, { rejectWithValue }) => {
    try {
      console.log('fetchPersonalPoiDetails: Starting API call with request:', request);
      const response = await getPersonalPoiDetails(request);
      console.log('fetchPersonalPoiDetails: API response received:', response);
      if (response.isSuccess && response.value) {
        console.log('fetchPersonalPoiDetails: Success, returning value:', response.value);
        return response.value;
      } else {
        console.error('fetchPersonalPoiDetails: API returned error:', response.error);
        return rejectWithValue(response.error?.description || 'Failed to fetch personal POI details');
      }
    } catch (error: any) {
      console.error('fetchPersonalPoiDetails: Exception caught:', error);
      return rejectWithValue(
        error?.response?.data?.error?.description ||
        'Failed to fetch personal POI details'
      );
    }
  }
);

const personalPoiDetailsSlice = createSlice({
  name: 'personalPoiDetails',
  initialState,
  reducers: {
    clearPersonalPoiDetails: (state) => {
      state.selectedPersonalPoi = null;
      state.error = null;
    },
    setPersonalPoiDetails: (state, action: PayloadAction<PersonalPoi>) => {
      state.selectedPersonalPoi = action.payload;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPersonalPoiDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPersonalPoiDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedPersonalPoi = action.payload;
        state.error = null;
      })
      .addCase(fetchPersonalPoiDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.selectedPersonalPoi = null;
      });
  },
});

export const { clearPersonalPoiDetails, setPersonalPoiDetails } = personalPoiDetailsSlice.actions;
export default personalPoiDetailsSlice.reducer;
