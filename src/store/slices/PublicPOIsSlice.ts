import { getContractHeaders } from "@/utils/contractIdManager";
import { encryptedApiRequest } from "@/utils/encryptedApi";
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

// Types for request and response
interface Pagination {
  pageNumber: number;
  pageSize: number;
}

export interface FetchPoisPayload {
  scale: number;
  boundingBox: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  }
  pagination: Pagination;
}
export interface FetchPoisWithOutScalePayload {
  boundingBox: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  }
  pagination: Pagination;
}
interface PoiItem {
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
}

interface PoiResponse {
  items: PoiItem[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

interface ApiError {
  errorCode: string;
  description: string;
  errorType: number;
}

interface ApiResponse<T> {
  isSuccess: boolean;
  error: ApiError | null;
  isFailure: boolean;
  value: T;
}

interface PoiState extends PoiResponse {
  loading: boolean;
  error: string | null;
}

// Initial state
const initialState: PoiState = {
  items: [],
  totalCount: 0,
  pageNumber: 0,
  pageSize: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false,
  loading: false,
  error: null,
};

export const fetchPublicPOIsSlice = createAsyncThunk<
  PoiResponse,
  FetchPoisPayload, 
  { rejectValue: string } 
>(
  "poi/GetPoisByBoundingBox",
  async (payload, { rejectWithValue }) => {
    try {
      // Use encrypted API route instead of direct API call
      const headers = getContractHeaders();
      const response = await encryptedApiRequest<ApiResponse<PoiResponse>>(
        "/api/poi/get-pois-by-bounding-box",
        payload,
        { headers }
      );

      if (!response.isSuccess) {
        return rejectWithValue(response.error?.description || "Unknown error");
      }

      return response.value;
    } catch (error: any) {
      const description =
        typeof error?.response?.data?.error?.description === "string"
          ? error.response.data.error.description
          : error?.message || "Failed to fetch POIs";

      return rejectWithValue(description);
    }
  }
);

export const fetchPublicPOIsWithOutScaleSlice = createAsyncThunk<
  PoiResponse,
  FetchPoisWithOutScalePayload, 
  { rejectValue: string } 
>(
  "poi/GetPoisByBoundingBox",
  async (payload, { rejectWithValue }) => {
    try {
      // Use encrypted API route instead of direct API call
      const headers = getContractHeaders();
      const response = await encryptedApiRequest<ApiResponse<PoiResponse>>(
        "/api/poi/get-pois-by-bounding-box",
        payload,
        { headers }
      );

      if (!response.isSuccess) {
        return rejectWithValue(response.error?.description || "Unknown error");
      }

      return response.value;
    } catch (error: any) {
      const description =
        typeof error?.response?.data?.error?.description === "string"
          ? error.response.data.error.description
          : error?.message || "Failed to fetch POIs";

      return rejectWithValue(description);
    }
  }
);


const publicPOIsSlice = createSlice({
  name: "pois",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPublicPOIsSlice.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchPublicPOIsSlice.fulfilled,
        (state, action: PayloadAction<PoiResponse>) => {
          state.loading = false;
          Object.assign(state, action.payload);
        }
      )
      .addCase(fetchPublicPOIsSlice.rejected, (state, action) => {
        state.loading = false;
        if (typeof action.payload === "string") {
          state.error = action.payload;
        } else {
          state.error = "Failed to fetch POIs";
        }
      });
  },
});

export default publicPOIsSlice.reducer;
