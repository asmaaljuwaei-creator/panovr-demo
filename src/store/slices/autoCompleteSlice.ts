import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import clientApi from "@/axios/clientApi";
import { AxiosError } from "axios";
import { POI_TYPE, SEARCH_TYPE } from "@/constants";

// Response
export interface POIAutoCompleteTypes {
  id: string;
  englishName: string;
  arabicName: string;
  longitude: number;
  latitude: number;
  arabicCity: string;
  englishCity: string;
  searchType: keyof typeof SEARCH_TYPE;
  categoryId: number;
  poiType: keyof typeof POI_TYPE;
}

export interface DistrictAutoCompleteTypes {
  id: number;
  arabicName: string;
  englishName: string;
  arabicCity: string;
  englishCity: string;
  searchType: number;
}

export interface CityAutoCompleteTypes {
  id: number;
  arabicName: string;
  englishName: string;
  searchType: number;
}

export interface GovernateAutoCompleteTypes {
  id: number;
  arabicName: string;
  englishName: string;
  searchType: number;
}

export interface RoadAutoCompleteTypes {
  id: number;
  arabicName: string;
  englishName: string;
  searchType: number;
}

export interface RegionAutoCompleteTypes {
  id: number;
  arabicName: string;
  englishName: string;
  searchType: number;
}

export interface AutoCompleteResponse<T> {
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  } | null;
  isFailure: boolean;
  value: T[];
}

// Request
interface AutoCompleteRequest {
  searchText: string;
}

interface POIAutoCompleteRequest {
  searchText: string;
  latitude: number;
  longitude: number;
}

interface EntityState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

interface AutoCompleteState {
  districts: EntityState<DistrictAutoCompleteTypes>;
  cities: EntityState<CityAutoCompleteTypes>;
  governates: EntityState<GovernateAutoCompleteTypes>;
  roads: EntityState<RoadAutoCompleteTypes>;
  regions: EntityState<RegionAutoCompleteTypes>;
  pois: EntityState<POIAutoCompleteTypes>;
}

const initialState: AutoCompleteState = {
  districts: { data: [], loading: false, error: null },
  cities: { data: [], loading: false, error: null },
  governates: { data: [], loading: false, error: null },
  regions: { data: [], loading: false, error: null },
  roads: { data: [], loading: false, error: null },
  pois: { data: [], loading: false, error: null },
};

// THUNKS
type ApiThunkConfig<TRequest, TResponse> = {
  typePrefix: string;
  url: string;
};

function createAutoCompleteThunk<TRequest, TResponse>({
  typePrefix,
  url,
}: ApiThunkConfig<TRequest, TResponse>) {
  return createAsyncThunk<TResponse, TRequest>(
    typePrefix,
    async (payload, { rejectWithValue }) => {
      try {
        const response = await clientApi.post<TResponse>(url, payload);
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError<any>;
        return rejectWithValue(
          axiosError.response?.data?.error?.description ||
            `Failed to fetch autocomplete for ${typePrefix}`
        );
      }
    }
  );
}

export const fetchDistrictAutoComplete = createAutoCompleteThunk<
  AutoCompleteRequest,
  AutoCompleteResponse<DistrictAutoCompleteTypes>
>({
  typePrefix: "autocomplete/fetchDistrict",
  url: "/api/v1/Districts/SearchDistrictAutoComplete",
});

export const fetchCityAutoComplete = createAutoCompleteThunk<
  AutoCompleteRequest,
  AutoCompleteResponse<CityAutoCompleteTypes>
>({
  typePrefix: "autocomplete/fetchCity",
  url: "/api/v1/Cities/SearchCityAutoComplete",
});

export const fetchGovernateAutoComplete = createAutoCompleteThunk<
  AutoCompleteRequest,
  AutoCompleteResponse<GovernateAutoCompleteTypes>
>({
  typePrefix: "autocomplete/fetchGovernate",
  url: "/api/v1/Governates/SearchGovernateAutoComplete",
});

export const fetchRoadAutoComplete = createAutoCompleteThunk<
  AutoCompleteRequest,
  AutoCompleteResponse<RoadAutoCompleteTypes>
>({
  typePrefix: "autocomplete/fetchRoad",
  url: "/api/v1/Regions/SearchRoadAutoComplete",
});

export const fetchRegionAutoComplete = createAutoCompleteThunk<
  AutoCompleteRequest,
  AutoCompleteResponse<RegionAutoCompleteTypes>
>({
  typePrefix: "autocomplete/fetchRegion",
  url: "/api/v1/Regions/SearchRegionAutoComplete",
});

export const fetchPoiAutoComplete = createAutoCompleteThunk<
  POIAutoCompleteRequest,
  AutoCompleteResponse<POIAutoCompleteTypes>
>({
  typePrefix: "autocomplete/fetchPoi",
  url: "/api/v1/Poi/SearchPoiAutoComplete",
});

// SLICE
const autoCompleteSlice = createSlice({
  name: "autoComplete",
  initialState,
  reducers: {
    clearAutoComplete: () => initialState,
  },
  extraReducers: (builder) => {
    // Districts
    builder
      .addCase(fetchDistrictAutoComplete.pending, (state) => {
        state.districts.loading = true;
        state.districts.error = null;
      })
      .addCase(fetchDistrictAutoComplete.fulfilled, (state, action) => {
        state.districts.data = action.payload.value;
        state.districts.loading = false;
      })
      .addCase(fetchDistrictAutoComplete.rejected, (state, action) => {
        state.districts.error = action.payload as string;
        state.districts.loading = false;
      });

    // Cities
    builder
      .addCase(fetchCityAutoComplete.pending, (state) => {
        state.cities.loading = true;
        state.cities.error = null;
      })
      .addCase(fetchCityAutoComplete.fulfilled, (state, action) => {
        state.cities.data = action.payload.value;
        state.cities.loading = false;
      })
      .addCase(fetchCityAutoComplete.rejected, (state, action) => {
        state.cities.error = action.payload as string;
        state.cities.loading = false;
      });

    // Governates
    builder
      .addCase(fetchGovernateAutoComplete.pending, (state) => {
        state.governates.loading = true;
        state.governates.error = null;
      })
      .addCase(fetchGovernateAutoComplete.fulfilled, (state, action) => {
        state.governates.data = action.payload.value;
        state.governates.loading = false;
      })
      .addCase(fetchGovernateAutoComplete.rejected, (state, action) => {
        state.governates.error = action.payload as string;
        state.governates.loading = false;
      });

    // Regions
    builder
      .addCase(fetchRegionAutoComplete.pending, (state) => {
        state.regions.loading = true;
        state.regions.error = null;
      })
      .addCase(fetchRegionAutoComplete.fulfilled, (state, action) => {
        state.regions.data = action.payload.value;
        state.regions.loading = false;
      })
      .addCase(fetchRegionAutoComplete.rejected, (state, action) => {
        state.regions.error = action.payload as string;
        state.regions.loading = false;
      });

    // Roads
    builder
      .addCase(fetchRoadAutoComplete.pending, (state) => {
        state.roads.loading = true;
        state.roads.error = null;
      })
      .addCase(fetchRoadAutoComplete.fulfilled, (state, action) => {
        state.roads.data = action.payload.value;
        state.roads.loading = false;
      })
      .addCase(fetchRoadAutoComplete.rejected, (state, action) => {
        state.roads.error = action.payload as string;
        state.roads.loading = false;
      });

    // POIs
    builder
      .addCase(fetchPoiAutoComplete.pending, (state) => {
        state.pois.loading = true;
        state.pois.error = null;
      })
      .addCase(fetchPoiAutoComplete.fulfilled, (state, action) => {
        state.pois.data = action.payload.value;
        state.pois.loading = false;
      })
      .addCase(fetchPoiAutoComplete.rejected, (state, action) => {
        state.pois.error = action.payload as string;
        state.pois.loading = false;
      });
  },
});

export const { clearAutoComplete } = autoCompleteSlice.actions;
export default autoCompleteSlice.reducer;
