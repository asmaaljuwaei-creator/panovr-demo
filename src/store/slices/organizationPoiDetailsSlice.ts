import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { getOrganizationPoiDetails, OrganizationPoiItem, GetOrganizationPoiDetailsRequest } from '../api/organizationPoiApi';
import { RootState } from '../index';

interface OrganizationPoiDetailsState {
  selectedOrganizationPoi: OrganizationPoiItem | null;
  loading: boolean;
  error: string | null;
}

const initialState: OrganizationPoiDetailsState = {
  selectedOrganizationPoi: null,
  loading: false,
  error: null,
};

// Async thunk to fetch organization POI details
export const fetchOrganizationPoiDetails = createAsyncThunk(
  'organizationPoiDetails/fetchOrganizationPoiDetails',
  async (request: GetOrganizationPoiDetailsRequest, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const contractId = state.login.selectedContract;
      
      const response = await getOrganizationPoiDetails(request, contractId || undefined);
      if (response.isSuccess && response.value) {
        return response.value;
      } else {
        return rejectWithValue(response.error?.description || 'Failed to fetch organization POI details');
      }
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.error?.description ||
        'Failed to fetch organization POI details'
      );
    }
  }
);

const organizationPoiDetailsSlice = createSlice({
  name: 'organizationPoiDetails',
  initialState,
  reducers: {
    clearOrganizationPoiDetails: (state) => {
      state.selectedOrganizationPoi = null;
      state.error = null;
    },
    setOrganizationPoiDetails: (state, action: PayloadAction<OrganizationPoiItem>) => {
      state.selectedOrganizationPoi = action.payload;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrganizationPoiDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrganizationPoiDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedOrganizationPoi = action.payload;
        state.error = null;
      })
      .addCase(fetchOrganizationPoiDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.selectedOrganizationPoi = null;
      });
  },
});

export const { clearOrganizationPoiDetails, setOrganizationPoiDetails } = organizationPoiDetailsSlice.actions;
export default organizationPoiDetailsSlice.reducer;
