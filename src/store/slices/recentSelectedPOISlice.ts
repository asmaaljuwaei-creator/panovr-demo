// src/features/poi/types.ts
export interface PaginationOptions {
  pageNumber: number;
  pageSize: number;
}

export interface POIRecentSelectedPOITypes {
  id: string;
  arabicName: string;
  englishName: string;
  longitude: number;
  latitude: number;
  scale: number;
  cityId: number;
  arabicCity: string;
  englishCity: string;
  districtId: number;
  arabicDistrict: string;
  englishDistrict: string;
  governateId: number;
  arabicGovernate: string;
  englishGovernate: string;
  regionId: number;
  arabicRegion: string;
  englishRegion: string;
  categoryId: number;
  arabicCategory: string;
  englishCategory: string;
  images: string[];
  poiType: keyof typeof POI_TYPE;
  ratingDto: {
    averageRating: number;
    totalRatings: number;
    totalReviews: number;
    reviews: any[];
  };
}

export interface PoiResponse {
  items: POIRecentSelectedPOITypes[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface BaseResponse<T> {
  isSuccess: boolean;
  isFailure: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  } | null;
  value: T;
}

import clientApi from "@/axios/clientApi";
import { POI_TYPE } from "@/constants";
// src/features/poi/poiSlice.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
interface PoiState {
  pois: POIRecentSelectedPOITypes[];
  loading: boolean;
  error: string | null;
}

const initialState: PoiState = {
  pois: [],
  loading: false,
  error: null,
};

// Thunks
export const fetchRecentPois = createAsyncThunk(
  "poi/fetchRecentPois",
  async (pagination: PaginationOptions, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<BaseResponse<PoiResponse>>(
        "/api/v1/Poi/GetRecentSelectedPoisByUserId",
        { paginationOptions: pagination }
      );
      if (response.data.isFailure) {
        throw new Error(response.data.error?.description);
      }
      return response.data.value.items;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description ||
          error.message ||
          "Failed to fetch recent POIs"
      );
    }
  }
);

export const addRecentPoi = createAsyncThunk(
  "poi/addRecentPoi",
  async (poiId: string, { rejectWithValue }) => {
    try {
      const { data }: { data: BaseResponse<{}> } = await clientApi.post(
        "/api/v1/Poi/AddRecentSelectedPoi",
        { poiId }
      );
      
      if (data.isFailure) {
        throw new Error(data.error?.description || 'API returned failure');
      }
      return poiId;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error?.description || err.message);
    }
  }
);

export const deleteRecentPoi = createAsyncThunk(
  "poi/deleteRecentPoi",
  async (poiId: string, { rejectWithValue }) => {
    try {
      const { data }: { data: BaseResponse<{}> } = await clientApi.post(
        "/api/v1/Poi/DeleteRecentSelectedPoi",
        { poiId }
      );
      if (data.isFailure) throw new Error(data.error?.description);
      return poiId;
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  }
);

// Slice
const recentSelectedPOISlice = createSlice({
  name: "poi",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecentPois.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRecentPois.fulfilled, (state, action) => {
        state.loading = false;
        state.pois = action.payload;
      })
      .addCase(fetchRecentPois.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(addRecentPoi.pending, (state) => {
        // Clear any previous errors when starting a new request
        state.error = null;
      })
      .addCase(addRecentPoi.fulfilled, (state, action) => {
        // Successfully added POI to recent history
        state.error = null;
      })
      .addCase(addRecentPoi.rejected, (state, action) => {
        // Log the error but don't break the UI
        state.error = action.payload as string;
      })
      .addCase(deleteRecentPoi.fulfilled, (state, action) => {
        state.pois = state.pois.filter((poi) => poi.id !== action.payload);
      });
  },
});

export default recentSelectedPOISlice.reducer;
