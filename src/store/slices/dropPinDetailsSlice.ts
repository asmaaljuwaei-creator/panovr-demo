import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import clientApi from "@/axios/clientApi";

export interface PointDetailsRequest {
  longitude: number;
  latitude: number;
}

export interface PointDetailsResponse {
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
  arabicRoad: string;
  englishRoad: string;
}

export interface PointDetailsTypes extends PointDetailsResponse {
  longitude: number;
  latitude: number;
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

interface DropPinDetailsState {
  pointDetails: PointDetailsTypes | null;
  longitude: number | null;
  latitude: number | null;
  loading: boolean;
  error: string | null;
}

const initialState: DropPinDetailsState = {
  pointDetails: null,
  longitude: null,
  latitude: null,
  loading: false,
  error: null,
};

export const fetchDropPinDetails = createAsyncThunk(
  "dropPinDetails/fetchDropPinDetails",
  async (payload: PointDetailsRequest, { rejectWithValue }) => {
    try {
      const { data } = await clientApi.post<BaseResponse<PointDetailsResponse>>(
        "/api/v1/Poi/GetPointDetails",
        payload
      );

      if (data.isFailure) {
        throw new Error(
          data.error?.description || "Failed to fetch drop pin details"
        );
      }
      return {
        ...data.value,
        longitude: payload.longitude,
        latitude: payload.latitude,
      };
    } catch (error: any) {
      let message = "Failed to fetch drop pin details";

      if (error.response?.data) {
        message = error.response.data.detail || message;
      } else if (error.message) {
        message = error.message;
      }

      return rejectWithValue(message);
    }
  }
);

const dropPinDetailsSlice = createSlice({
  name: "dropPinDetails",
  initialState,
  reducers: {
    clearDropPinDetails: (state) => {
      state.pointDetails = null;
      state.error = null;
      state.loading = false;
    },
    setDropPinDetails: (state, action) => {
      state.pointDetails = action.payload.pointDetails;
      state.loading = action.payload.loading;
      state.error = action.payload.error || null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDropPinDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDropPinDetails.fulfilled, (state, action) => {
        state.loading = false;

        state.pointDetails = action.payload as PointDetailsTypes;
      })
      .addCase(fetchDropPinDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.pointDetails = null;
        state.longitude = null;
        state.latitude = null; 
      });
  },
});

export const { clearDropPinDetails, setDropPinDetails } = dropPinDetailsSlice.actions;
export default dropPinDetailsSlice.reducer;
