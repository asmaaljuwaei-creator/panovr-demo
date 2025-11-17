import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import clientApi from "@/axios/clientApi";
import { getContractConfig } from "@/utils/contractIdManager";
import type { RootState } from "../../store";

export type CategoryTypes = {
  id: number;
  arabicName: string;
  englishName: string;
  logo: string;
  parentId: number;
  order: number;
  level: number;
  mapPin: string;
  selectedPin: string;
  sliderPin: string;
};

interface CategoriesState {
  categories: CategoryTypes[];
  isLoading: boolean;
  error: string | null;
  organizationId: string | null;
}

const cachedCategories = (() => {
  try {
    const cached = localStorage.getItem("categoriesCache");
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
      return parsed.categories;
    }
  } catch {
    // ignore errors
  }
  return null;
})();

const initialState: CategoriesState = {
  categories: cachedCategories || [],
  isLoading: false,
  error: null,
  organizationId: null,
};


export const fetchCategories = createAsyncThunk<
  { categories: CategoryTypes[]; organizationId?: string },
  { organizationId?: string },
  { rejectValue: string }
>(
  "categories/fetchCategories",
  async ({ organizationId = undefined }, { rejectWithValue }) => {
    try {
      const config = getContractConfig();
      
      // Debug: Log contract config
      console.log('🔍 GetCategories Config:', config);
      console.log('🔍 Contract ID from localStorage:', localStorage.getItem('selected_contract_id'));
      
      const response = await clientApi.post("/api/v1/Categories/GetCategories", {}, config);

      if (response.data.isSuccess && response.data.value) {
        return {
          categories: response.data.value,
          organizationId,
        };
      } else {
        return rejectWithValue(
          response.data.error?.description || "Failed to fetch categories"
        );
      }
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description ||
          "Network error while fetching categories"
      );
    }
  }
);

const categoriesSlice = createSlice({
  name: "categories",
  initialState,
  reducers: {
    clearCategories(state) {
      state.categories = [];
      state.organizationId = null;
      localStorage.removeItem("categoriesCache");
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.isLoading = false;
        state.categories = action.payload.categories;

        if (action.payload.organizationId !== undefined) {
          state.organizationId = action.payload.organizationId;
        }

        // Save to localStorage (orgId optional)
        try {
          localStorage.setItem(
            "categoriesCache",
            JSON.stringify({
              organizationId: action.payload.organizationId ?? null,
              categories: action.payload.categories,
            })
          );
        } catch (error) {
          console.warn("Failed to cache categories:", error);
        }
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unknown error";
      });
  },
});


// Selector
export const selectCategories = (state: RootState) => state.getCategories;

// Refetch Logic (based on orgId and data presence)
export const shouldRefetchCategoriesBasedOnOrg = (
  state: RootState,
  currentOrgId: string
): boolean => {
  const { organizationId, categories } = state.getCategories;
  return categories.length === 0 || organizationId !== currentOrgId;
};

export const shouldFetchCategories = (): boolean => {
  try {
    const storedData = localStorage.getItem("categoriesCache");

    if (!storedData) return true;

    const parsed = JSON.parse(storedData);
    const { categories } = parsed;

    // Validate that categories is a non-empty array
    if (!Array.isArray(categories) || categories.length === 0) {
      return true;
    }

    // If categories exist and are valid, skip fetch
    return false;
  } catch (error) {
    // Any parsing error or invalid format should trigger a refetch
    return true;
  }
};

export const { clearCategories } = categoriesSlice.actions;
export default categoriesSlice.reducer;

