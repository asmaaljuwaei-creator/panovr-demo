import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import clientApi from "@/axios/clientApi";

// Types for different search result entities
export interface RecentSearchItem {
  id: string;
  type: "poi" | "city" | "district" | "governate" | "region" | "road";
  arabicName: string;
  englishName: string;
  timestamp: number;
  // Additional fields based on type
  arabicCity?: string;
  englishCity?: string;
  arabicDistrict?: string;
  englishDistrict?: string;
  arabicGovernate?: string;
  englishGovernate?: string;
  arabicRegion?: string;
  englishRegion?: string;
  categoryId?: number;
  arabicCategory?: string;
  englishCategory?: string;
  geometry?: string;
}

interface RecentSearchesState {
  items: RecentSearchItem[];
  loading: boolean;
  error: string | null;
}

const initialState: RecentSearchesState = {
  items: [],
  loading: false,
  error: null,
};

// Local storage key
const RECENT_SEARCHES_KEY = "recent_searches";
const MAX_RECENT_ITEMS = 20;

// Helper function to load from localStorage
const loadFromLocalStorage = (): RecentSearchItem[] => {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Filter out items older than 30 days
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return parsed.filter((item: RecentSearchItem) => item.timestamp > thirtyDaysAgo);
    }
  } catch (error) {
    console.warn('Failed to load recent searches from localStorage:', error);
  }
  return [];
};

// Helper function to save to localStorage (DISABLED - using API only)
const saveToLocalStorage = (items: RecentSearchItem[]) => {
  // Local storage disabled - relying on API only
};

// Async thunk for adding recent search (with API call for POIs)
export const addRecentSearch = createAsyncThunk(
  "recentSearches/addRecentSearch",
  async (item: Omit<RecentSearchItem, "timestamp">, { rejectWithValue }) => {
    const searchItem: RecentSearchItem = {
      ...item,
      timestamp: Date.now(),
    };


    // Try to call API for all types (using POI API as a unified endpoint)
    try {
      
      // Use the POI API endpoint for all types, but send the type information
      const apiPayload = {
        poiId: item.id,
        searchType: item.type, // Include the type information
        arabicName: item.arabicName,
        englishName: item.englishName,
        geometry: item.geometry,
        // Include additional metadata based on type
        ...(item.type === 'poi' && { categoryId: item.categoryId }),
        ...(item.type === 'city' && { 
          arabicCity: item.arabicCity,
          englishCity: item.englishCity 
        }),
        ...(item.type === 'district' && { 
          arabicDistrict: item.arabicDistrict,
          englishDistrict: item.englishDistrict 
        }),
        ...(item.type === 'governate' && { 
          arabicGovernate: item.arabicGovernate,
          englishGovernate: item.englishGovernate 
        }),
        ...(item.type === 'region' && { 
          arabicRegion: item.arabicRegion,
          englishRegion: item.englishRegion 
        }),
        ...(item.type === 'road' && { 
          geometry: item.geometry 
        })
      };

      const { data } = await clientApi.post(
        "/api/v1/Poi/AddRecentSelectedPoi",
        apiPayload
      );
      
      if (data.isFailure) {
        // API returned failure - silently continue
      }
    } catch (err: any) {
      // API call failed - silently continue
    }
    return searchItem;
  }
);

// Async thunk for loading recent searches
export const loadRecentSearches = createAsyncThunk(
  "recentSearches/loadRecentSearches",
  async () => {
    return loadFromLocalStorage();
  }
);

const recentSearchesSlice = createSlice({
  name: "recentSearches",
  initialState,
  reducers: {
    removeRecentSearch: (state, action: PayloadAction<{ id: string; type: string }>) => {
      const { id, type } = action.payload;
      state.items = state.items.filter(item => !(item.id === id && item.type === type));
    },
    clearRecentSearches: (state) => {
      state.items = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(addRecentSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addRecentSearch.fulfilled, (state, action) => {
        state.loading = false;
        const newItem = action.payload;
        
        // Remove existing item with same id and type
        state.items = state.items.filter(
          item => !(item.id === newItem.id && item.type === newItem.type)
        );
        
        // Add new item at the beginning
        state.items.unshift(newItem);
        
        // Keep only the most recent items
        state.items = state.items.slice(0, MAX_RECENT_ITEMS);
        
        // Don't save to localStorage - rely on API only
      })
      .addCase(addRecentSearch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(loadRecentSearches.fulfilled, (state, action) => {
        state.items = action.payload;
      });
  },
});

export const { removeRecentSearch, clearRecentSearches } = recentSearchesSlice.actions;
export default recentSearchesSlice.reducer;
