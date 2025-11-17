import clientApi from "@/axios/clientApi";
import { searchResultsTypes } from "@/types";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RoadSearchResultTypes } from "./searchResultsSlice";
import { POI_TYPE } from "@/constants";

// --- New Interfaces for requests and responses ---

// Generic error interface
interface ApiError {
  errorCode: string;
  description: string;
  errorType: number;
}

// 1. District Details
export interface DistrictDetailsRequest {
  id: number;
}

export interface DistrictDetailsResponse {
  isSuccess: boolean;
  error: ApiError;
  isFailure: boolean;
  value: {
    id: number;
    arabicName: string;
    englishName: string;
    cityId: number;
    arabicCity: string;
    englishCity: string;
    governId: number;
    arabicGovernate: string;
    englishGovernate: string;
    regionId: number;
    arabicRegion: string;
    englishRegion: string;
    shapeLength: number;
    shapeArea: number;
    geometry: string;
    centerGeometry: string;
  };
}

// 2. City Details
export interface CityDetailsRequest {
  id: number;
}

export interface CityDetailsResponse {
  isSuccess: boolean;
  error: ApiError;
  isFailure: boolean;
  value: {
    id: number;
    arabicName: string;
    englishName: string;
    governId: number;
    arabicGovernate: string;
    englishGovernate: string;
    regionId: number;
    arabicRegion: string;
    englishRegion: string;
    shapeLength: number;
    shapeArea: number;
    geometry: string;
    centerGeometry: string;
  };
}

// 3. Governate Details
export interface GovernateDetailsRequest {
  id: number;
}

export interface GovernateDetailsResponse {
  isSuccess: boolean;
  error: ApiError;
  isFailure: boolean;
  value: {
    id: number;
    arabicName: string;
    englishName: string;
    regionId: number;
    arabicRegion: string;
    englishRegion: string;
    shapeLength: number;
    shapeArea: number;
    geometry: string;
    centerGeometry: string;
  };
}

// 4. Region Details
export interface RegionDetailsRequest {
  id: number;
}

export interface RegionDetailsResponse {
  isSuccess: boolean;
  error: ApiError;
  isFailure: boolean;
  value: {
    id: number;
    arabicName: string;
    englishName: string;
    shapeLength: number;
    shapeArea: number;
    geometry: string;
    centerGeometry: string;
  };
}

// 5. POI Details
export interface POIDetailsRequest {
  id: string;
  silent?: boolean; //in case wont display error message
}

export interface POIDetailsResponse {
  value: {
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
  };
  isSuccess: boolean;
  error: ApiError;
  isFailure: boolean;
}

// --- Union type for selected result ---
export type SelectedSearchResult =
  | { type: "district"; id: number }
  | { type: "city"; id: number }
  | { type: "governate"; id: number }
  | { type: "region"; id: number }
  | { type: "poi"; id: string }
  | { type: "road"; data: RoadSearchResultTypes };

// --- State interface ---
interface SelectedSearchResultState {
  selected: SelectedSearchResult | null;
  details: any | null;
  loading: boolean;
  error: string | null;
  preventFitView: boolean; 
}

const initialSelectedSearchResultState: SelectedSearchResultState = {
  selected: null,
  details: null,
  loading: false,
  error: null,
  preventFitView: false,
};

// --- Async thunks ---
export const fetchDistrictDetails = createAsyncThunk(
  "selectedSearchResult/fetchDistrictDetails",
  async (payload: DistrictDetailsRequest, { rejectWithValue }) => {
    try {
      const res = await clientApi.post<DistrictDetailsResponse>(
        "/api/v1/Districts/GetDistrictDetails",
        payload
      );
      return res.data.value;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.error?.description ||
          "Failed to fetch district details"
      );
    }
  }
);

export const fetchCityDetails = createAsyncThunk(
  "selectedSearchResult/fetchCityDetails",
  async (payload: CityDetailsRequest, { rejectWithValue }) => {
    try {
      const res = await clientApi.post<CityDetailsResponse>(
        "/api/v1/Cities/GetCityDetails",
        payload
      );
      return res.data.value;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.error?.description ||
          "Failed to fetch city details"
      );
    }
  }
);

export const fetchGovernateDetails = createAsyncThunk(
  "selectedSearchResult/fetchGovernateDetails",
  async (payload: GovernateDetailsRequest, { rejectWithValue }) => {
    try {
      const res = await clientApi.post<GovernateDetailsResponse>(
        "/api/v1/Governates/GetGovernateDetails",
        payload
      );
      return res.data.value;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.error?.description ||
          "Failed to fetch governate details"
      );
    }
  }
);

export const fetchRegionDetails = createAsyncThunk(
  "selectedSearchResult/fetchRegionDetails",
  async (payload: RegionDetailsRequest, { rejectWithValue }) => {
    try {
      const res = await clientApi.post<RegionDetailsResponse>(
        "/api/v1/Regions/GetRegionDetails",
        payload
      );
      return res.data.value;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.error?.description ||
          "Failed to fetch region details"
      );
    }
  }
);

export const fetchPOIDetails = createAsyncThunk(
  "selectedSearchResult/fetchPOIDetails",
  async (payload: POIDetailsRequest, { rejectWithValue }) => {
    try {
      const res = await clientApi.post<POIDetailsResponse>(
        "/api/v1/Poi/GetPublicPoiDetails",
        payload
      );
      return res.data.value;
    } catch (error: any) {
      if (!payload.silent) {
       return rejectWithValue(
        error?.response?.data?.error?.description ||
          "Failed to fetch POI details"
      );
      }
      return null
    }
  }
);

// ADD this to your existing slice file

interface FetchSelectedSearchParams {
  type: searchResultsTypes;
  id: string | number;
}

export const fetchSelectedSearchResult = createAsyncThunk(
  "selectedSearchResult/fetchSelectedSearchResult",
  async ({ type, id }: FetchSelectedSearchParams, { rejectWithValue }) => {
    try {
      switch (type) {
        case "district": {
          const res = await clientApi.post<DistrictDetailsResponse>(
            "/api/v1/Districts/GetDistrictDetails",
            { id }
          );
          return { type, data: res.data.value };
        }
        case "city": {
          const res = await clientApi.post<CityDetailsResponse>(
            "/api/v1/Cities/GetCityDetails",
            { id }
          );
          return { type, data: res.data.value };
        }
        case "governate": {
          const res = await clientApi.post<GovernateDetailsResponse>(
            "/api/v1/Governates/GetGovernateDetails",
            { id }
          );
          return { type, data: res.data.value };
        }
        case "region": {
          const res = await clientApi.post<RegionDetailsResponse>(
            "/api/v1/Regions/GetRegionDetails",
            { id }
          );
          return { type, data: res.data.value };
        }
        case "poi": {
          const res = await clientApi.post<POIDetailsResponse>(
            "/api/v1/Poi/GetPublicPoiDetails",
            { id }
          );
          return { type, data: res.data.value };
        }
        default:
          throw new Error("Invalid type");
      }
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.error?.description || "Failed to fetch details"
      );
    }
  }
);

// --- Slice ---
const selectedSearchResultSlice = createSlice({
  name: "selectedSearchResult",
  initialState: initialSelectedSearchResultState,
  reducers: {
    setSelectedSearchResult: (
      state,
      action: PayloadAction<SelectedSearchResult>
    ) => {
      state.selected = action.payload;
      state.details = action.payload;
      state.error = null;
      state.loading = false;
    },
    clearSelectedSearchResult: (state) => {
      state.selected = null;
      state.details = null;
      state.error = null;
      state.loading = false;
      state.preventFitView = false;
    },
    setPreventFitView: (state, action: PayloadAction<boolean>) => {
      state.preventFitView = action.payload;
    },
    setSelectedSearchResultWithDetails: (
      state,
      action: PayloadAction<{ selected: SelectedSearchResult; details: any }>
    ) => {
      state.selected = action.payload.selected;
      state.details = action.payload.details;
      state.error = null;
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSelectedSearchResult.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSelectedSearchResult.fulfilled, (state, action) => {
        state.loading = false;
        state.details = action.payload.data;

        const { type, data } = action.payload;

        switch (type) {
          case "district":
          case "city":
          case "governate":
          case "region":
            state.selected = {
              type,
              id: data.id as number,
            };
            break;
          case "poi":
            state.selected = {
              type,
              id: data.id as string,
            };
            break;
        }
      })

      .addCase(fetchSelectedSearchResult.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // District
      .addCase(fetchDistrictDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDistrictDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.details = action.payload;
      })
      .addCase(fetchDistrictDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // City
      .addCase(fetchCityDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCityDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.details = action.payload;
      })
      .addCase(fetchCityDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Governate
      .addCase(fetchGovernateDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGovernateDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.details = action.payload;
      })
      .addCase(fetchGovernateDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Region
      .addCase(fetchRegionDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRegionDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.details = action.payload;
      })
      .addCase(fetchRegionDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // POI
      .addCase(fetchPOIDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPOIDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.details = action.payload;
      })
      .addCase(fetchPOIDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setSelectedSearchResult,
  clearSelectedSearchResult,
  setPreventFitView,
  setSelectedSearchResultWithDetails,
} = selectedSearchResultSlice.actions;

export default selectedSearchResultSlice.reducer;
