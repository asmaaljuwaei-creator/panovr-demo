import clientApi from "@/axios/clientApi";
import { POI_TYPE } from "@/constants";
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

interface Pagination {
  pageNumber: number;
  pageSize: number;
}

interface FetchParams {
  keyword: string;
  pagination: Pagination;
  boundingBox: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
  scale?: number;
}

interface ModifiedMainAPIResponseTypes<T> {
  /** Indicates if the API call was successful */
  isSuccess: boolean;

  /** Details about the error, if any occurred */
  error: {
    /** Error code as a string */
    errorCode: string;
    /** Description of the error */
    description: string;
    /** Numeric code representing the error type */
    errorType: number;
  } | null;

  /** Indicates if the API call failed */
  isFailure: boolean;

  /** The main payload of the API response */
  value: {
    items: T[];
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    pageNumber: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

// Define interfaces for each type of data (simplified for brevity)
export interface DistrictSearchResultTypes {
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
}
export interface CitySearchResultTypes {
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
}
export interface GovernateSearchResultTypes {
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
}
export interface RegionSearchResultTypes {
  id: number;
  arabicName: string;
  englishName: string;
  shapeLength: number;
  shapeArea: number;
  geometry: string;
  centerGeometry: string;
}
export interface RoadSearchResultTypes {
  arabicName: string;
  englishName: string;
  geometry: string;
}
export interface POISearchResultTypes {
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

export const fetchDistricts = createAsyncThunk(
  "geoData/fetchDistricts",
  async (payload: FetchParams, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<
        ModifiedMainAPIResponseTypes<DistrictSearchResultTypes>
      >("/api/v1/Districts/SearchDistricts", {
        ...payload,
        pagination: {
          pageNumber: payload.pagination.pageNumber,
          pageSize: payload.pagination.pageSize,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to fetch districts"
      );
    }
  }
);

export const fetchCities = createAsyncThunk(
  "geoData/fetchCities",
  async (payload: FetchParams, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<
        ModifiedMainAPIResponseTypes<CitySearchResultTypes>
      >("/api/v1/Cities/SearchCities", {
        ...payload,
        pagination: {
          pageNumber: payload.pagination.pageNumber,
          pageSize: payload.pagination.pageSize,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to fetch cities"
      );
    }
  }
);

export const fetchGovernates = createAsyncThunk(
  "geoData/fetchGovernates",
  async (payload: FetchParams, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<
        ModifiedMainAPIResponseTypes<GovernateSearchResultTypes>
      >("/api/v1/Governates/SearchGovernates", {
        ...payload,
        pagination: {
          pageNumber: payload.pagination.pageNumber,
          pageSize: payload.pagination.pageSize,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to fetch governates"
      );
    }
  }
);

export const fetchRegions = createAsyncThunk(
  "geoData/fetchRegions",
  async (payload: FetchParams, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<
        ModifiedMainAPIResponseTypes<RegionSearchResultTypes>
      >("/api/v1/Regions/SearchRegions", {
        ...payload,
        pagination: {
          pageNumber: payload.pagination.pageNumber,
          pageSize: payload.pagination.pageSize,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to fetch regions"
      );
    }
  }
);

export const fetchRoads = createAsyncThunk(
  "geoData/fetchRoads",
  async (payload: FetchParams, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<
        ModifiedMainAPIResponseTypes<RoadSearchResultTypes>
      >("/api/v1/Regions/SearchRoads", {
        ...payload,
        pagination: {
          pageNumber: payload.pagination.pageNumber,
          pageSize: payload.pagination.pageSize,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to fetch roads"
      );
    }
  }
);

export const fetchPois = createAsyncThunk(
  "geoData/fetchPois",
  async (payload: FetchParams, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<
        ModifiedMainAPIResponseTypes<POISearchResultTypes>
      >("/api/v1/Poi/SearchPublicPois", {
        ...payload,
        pagination: {
          pageNumber: payload.pagination.pageNumber,
          pageSize: payload.pagination.pageSize,
        },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to fetch POIs"
      );
    }
  }
);

interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

interface FetchPoisByCategoryParams {
  categoryId: number;
  boundingBox: BoundingBox;
  scale: number;
  pagination: Pagination;
}

export const fetchPoisByCategory = createAsyncThunk(
  "geoData/fetchPoisByCategory",
  async (payload: FetchPoisByCategoryParams, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<
        ModifiedMainAPIResponseTypes<POISearchResultTypes>
      >("/api/v1/Poi/GetByCategory", {
        ...payload,
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description ||
          "Failed to fetch POIs by category"
      );
    }
  }
);

interface EntityState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  pageNumber?: number;
}
interface POIState extends EntityState<POISearchResultTypes> {
  pageNumber?: number;
  boundingBox?: BoundingBox;
  scale?: number;
  searchKeyword?: string;
  searchedByCategory?: boolean;
  searchedCategoryId?: number | null;
  isFirstRender: boolean;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  totalCount?: number;
  totalPages?: number;
}

interface GeoDataState {
  governates: EntityState<GovernateSearchResultTypes>;
  districts: EntityState<DistrictSearchResultTypes>;
  cities: EntityState<CitySearchResultTypes>;
  regions: EntityState<RegionSearchResultTypes>;
  roads: EntityState<RoadSearchResultTypes>;
  pois: POIState;
}

const initialState: GeoDataState = {
  districts: { data: [], loading: false, error: null },
  cities: { data: [], loading: false, error: null },
  governates: { data: [], loading: false, error: null },
  regions: { data: [], loading: false, error: null },
  roads: { data: [], loading: false, error: null },
  pois: {
    data: [],
    loading: false,
    error: null,
    pageNumber: 1,
    boundingBox: undefined,
    scale: undefined,
    searchKeyword: "",
    searchedByCategory: false,
    searchedCategoryId: null,
    isFirstRender: false,
    hasNextPage: true,
    hasPreviousPage: false,
    totalCount: 0,
    totalPages: 0,
  },
};

const searchResultsSlice = createSlice({
  name: "searchResultsSlice",
  initialState,
  reducers: {
    clearSearchResultsStore: () => initialState,
    resetIsFirstRender: (state) => {
      state.pois.isFirstRender = false;
    },
  },
  extraReducers: (builder) => {
    // Districts
    builder
      .addCase(fetchDistricts.pending, (state) => {
        state.districts.loading = true;
        state.districts.error = null;
      })
      .addCase(fetchDistricts.fulfilled, (state, action) => {
        state.districts.data = action.payload.value.items;
        state.districts.loading = false;
      })
      .addCase(fetchDistricts.rejected, (state, action) => {
        state.districts.error = action.payload as string;
        state.districts.loading = false;
      });

    // Cities
    builder
      .addCase(fetchCities.pending, (state) => {
        state.cities.loading = true;
        state.cities.error = null;
      })
      .addCase(fetchCities.fulfilled, (state, action) => {
        state.cities.data = action.payload.value.items;
        state.cities.loading = false;
      })
      .addCase(fetchCities.rejected, (state, action) => {
        state.cities.error = action.payload as string;
        state.cities.loading = false;
      });

    // Governates
    builder
      .addCase(fetchGovernates.pending, (state) => {
        state.governates.loading = true;
        state.governates.error = null;
      })
      .addCase(fetchGovernates.fulfilled, (state, action) => {
        state.governates.data = action.payload.value.items;
        state.governates.loading = false;
      })
      .addCase(fetchGovernates.rejected, (state, action) => {
        state.governates.error = action.payload as string;
        state.governates.loading = false;
      });

    // Regions
    builder
      .addCase(fetchRegions.pending, (state) => {
        state.regions.loading = true;
        state.regions.error = null;
      })
      .addCase(fetchRegions.fulfilled, (state, action) => {
        state.regions.data = action.payload.value.items;
        state.regions.loading = false;
      })
      .addCase(fetchRegions.rejected, (state, action) => {
        state.regions.error = action.payload as string;
        state.regions.loading = false;
      });

    // Roads
    builder
      .addCase(fetchRoads.pending, (state) => {
        state.roads.loading = true;
        state.roads.error = null;
      })
      .addCase(fetchRoads.fulfilled, (state, action) => {
        state.roads.data = action.payload.value.items;
        state.roads.loading = false;
      })
      .addCase(fetchRoads.rejected, (state, action) => {
        state.roads.error = action.payload as string;
        state.roads.loading = false;
      });

    // POIs
    builder
      .addCase(fetchPois.pending, (state) => {
        state.pois.loading = true;
        state.pois.error = null;
      })
      .addCase(fetchPois.fulfilled, (state, action) => {
        const newItems = action.payload.value.items;
        const { boundingBox, scale, keyword } = action.meta.arg;

        if (state.pois.pageNumber && newItems.length > 0) {
          if (state.pois.pageNumber === 1) {
            state.pois.data = newItems;
            state.pois.isFirstRender = true;
          } else {
            const existingIds = new Set(state.pois.data.map((poi) => poi.id));
            const filteredItems = newItems.filter(
              (poi) => !existingIds.has(poi.id)
            );
            state.pois.data = [...state.pois.data, ...filteredItems];
            state.pois.isFirstRender = false;
          }

          state.pois.pageNumber = (state.pois.pageNumber ?? 1) + 1;
        }

        state.pois.hasNextPage = action.payload.value.hasNextPage;
        state.pois.hasPreviousPage = action.payload.value.hasPreviousPage;
        state.pois.totalCount = action.payload.value.totalCount;
        state.pois.totalPages = action.payload.value.totalPages;

        state.pois.boundingBox = {
          minLatitude: boundingBox.minLatitude,
          maxLatitude: boundingBox.maxLatitude,
          minLongitude: boundingBox.minLongitude,
          maxLongitude: boundingBox.maxLongitude,
        };
        state.pois.scale = scale;
        state.pois.searchedByCategory = false;
        state.pois.searchKeyword = keyword;

        state.pois.loading = false;
      })

      .addCase(fetchPois.rejected, (state, action) => {
        state.pois.error = action.payload as string;
        state.pois.loading = false;
        state.pois.isFirstRender = false;
      });

    builder
      .addCase(fetchPoisByCategory.pending, (state) => {
        state.pois.loading = true;
        state.pois.error = null;
      })
      .addCase(fetchPoisByCategory.fulfilled, (state, action) => {
        const { boundingBox, scale, categoryId } = action.meta.arg;
        const newItems = action.payload.value.items;

        if (state.pois.pageNumber && newItems.length > 0) {
          if (state.pois.pageNumber === 1) {
            state.pois.data = newItems;
            state.pois.isFirstRender = true;
          } else {
            const existingIds = new Set(state.pois.data.map((poi) => poi.id));
            const filteredItems = newItems.filter(
              (poi) => !existingIds.has(poi.id)
            );
            state.pois.data = [...state.pois.data, ...filteredItems];
            state.pois.isFirstRender = false;
          }
          state.pois.pageNumber = (state.pois.pageNumber ?? 1) + 1;
        }

        state.pois.hasNextPage = action.payload.value.hasNextPage;
        state.pois.hasPreviousPage = action.payload.value.hasPreviousPage;
        state.pois.totalCount = action.payload.value.totalCount;
        state.pois.totalPages = action.payload.value.totalPages;

        state.pois.loading = false;
        state.pois.boundingBox = boundingBox;
        state.pois.scale = scale;
        state.pois.searchedByCategory = true;
        state.pois.searchedCategoryId = categoryId;
      })

      .addCase(fetchPoisByCategory.rejected, (state, action) => {
        state.pois.error = action.payload as string;
        state.pois.loading = false;
        state.pois.isFirstRender = false;
      });
  },
});

export const { clearSearchResultsStore, resetIsFirstRender } =
  searchResultsSlice.actions;
export default searchResultsSlice.reducer;
