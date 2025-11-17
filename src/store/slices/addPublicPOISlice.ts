import clientApi from "@/axios/clientApi";
import { getContractConfig } from "@/utils/contractIdManager";
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

// ---- Types ----
export interface WorkingHoursRange {
  start: { hour: string; minute: string };
  end: { hour: string; minute: string };
}

export interface POIData {
  englishName: string;
  arabicName: string;
  longitude: number;
  latitude: number;
  categoryId: number;
  description: string;
  WH: Record<string, WorkingHoursRange[]>;
}

// ✅ Backend now just returns the POI id as string
export type POIResponse = string;

export interface AddPublicPoiWithImagesArgs {
  poiData: POIData;
  imageFiles: File[];
}

export interface AddPublicPoiWithImagesResult {
  poiId: string;
  imageResponse: any;
}

// ---- Thunk for POI integration ----
export const addPublicPoiWithImages = createAsyncThunk<
  AddPublicPoiWithImagesResult,
  AddPublicPoiWithImagesArgs,
  { rejectValue: string | object }
>(
  "poi/addPublicPoiWithImages",
  async ({ poiData, imageFiles }, { rejectWithValue }) => {
    try {
      const config = getContractConfig();
      const poiRes = await clientApi.post<POIResponse>(
        "/api/v1/Poi/AddPublicPoi",
        poiData,
        config
      );

      const publicPoiId = poiRes.data;
      if (!publicPoiId || typeof publicPoiId !== "string") {
        return rejectWithValue("Failed to add POI: invalid response");
      }

      let imgRes: any = null;

      if (imageFiles && imageFiles.length > 0) {
        const formData = new FormData();
        formData.append("publicPoiId", publicPoiId);

        // append with indexed keys for ASP.NET Core model binding
        imageFiles.forEach((file, index) =>
          formData.append(`imageFiles[${index}]`, file)
        );

        // build request config
        const imageConfig = getContractConfig({
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        imgRes = await clientApi.post(
          "/api/v1/Poi/AddPublicPoiImages",
          formData,
          imageConfig
        );
      }

      return {
        poiId: publicPoiId,
        imageResponse: imgRes?.data ?? null,
      };
    } catch (err: any) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);


// ---- Combined Slice ----
interface PoiState {
  loading: boolean;
  poiId: string | null;
  imageResponse: any;
  error: string | object | null;
  isAddPublicPOIOpen: boolean;
}

const initialState: PoiState = {
  loading: false,
  poiId: null,
  imageResponse: null,
  error: null,
  isAddPublicPOIOpen: false,
};

const addPublicPOISlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    openAddPublicPOIModal(state) {
      state.isAddPublicPOIOpen = true;
    },
    closeAddPublicPOIModal(state) {
      state.isAddPublicPOIOpen = false;
    },
    resetAddPublicPOIModal(state) {
      state.isAddPublicPOIOpen = false;
      state.poiId = null;
      state.imageResponse = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(addPublicPoiWithImages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        addPublicPoiWithImages.fulfilled,
        (state, action: PayloadAction<AddPublicPoiWithImagesResult>) => {
          state.loading = false;
          state.poiId = action.payload.poiId;
          state.imageResponse = action.payload.imageResponse;
        }
      )
      .addCase(addPublicPoiWithImages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Unknown error";
      });
  },
});

export const {
  openAddPublicPOIModal,
  closeAddPublicPOIModal,
  resetAddPublicPOIModal,
} = addPublicPOISlice.actions;

export default addPublicPOISlice.reducer;
