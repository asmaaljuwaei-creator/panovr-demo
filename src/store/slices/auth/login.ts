"use client";

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import clientApi from "../../../axios/clientApi";
import {
  getLoggedInUserDetails,
  getUserPermissions,
  organizePermissions,
  type UserDetailsResponse,
  type OrganizedPermissions,
} from "../../api/userApi";
import { setTokenSetTime } from "../../../utils/auth";
import { setUserOrgBranding } from "@/utils";
import { fetchCategories, shouldFetchCategories } from "../getCategoriesSlice";

// Define interfaces for the API response
export interface PreUserLoginInfo {
  firstNameEnglish: string;
  lastNameEnglish: string;
  firstNameArabic: string;
  lastNameArabic: string;
  email: string;
}

export interface PreUserLoginOrganization {
  arabicName: string;
  englishName: string;
  lightModeLogo: {
    value: string;
  } | null;
  darkModeLogo: {
    value: string;
  } | null;
  background: {
    value: string;
  };
  color: {
    value: string;
  };
}

export interface CaptureEmailResponse {
  value: {
    preUserLoginInfo: PreUserLoginInfo;
    preUserLoginOrganization: PreUserLoginOrganization;
  };
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// Define the login form data interface
export interface LoginFormData {
  email: string;
  password: string;
  verificationCode?: string
}

// Define interface for ValidatePassword API response
export interface ValidatePasswordResponse {
  value: any; // The API may return different data structure
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

//validate for errors
export interface ValidatePasswordErrorResponse {
  type: string;
  title: string;
  status: number;           
  detail: string;      
  errors: string | null; 
}

//define interface for ValidatePasswordOtp api
export interface LoginOtpRequest {
  email: string;
  password: string;
  otp?: string;
}

export interface LoginOtpResponse {
  value: {
    access_token: string,
    token_type: string,
    expires_in: number,
    refresh_token: string
  },
 isSuccess: boolean;
  error: {
    errorCode: string,
    description: string,
    errorType: number
  },
  isFailure: boolean
}
// Define the login state interface
export interface LoginState {
  currentStep: number; // 1 = email, 2 = password, 3 = contract selection
  formData: LoginFormData;
  userInfo: PreUserLoginInfo | null;
  organizationInfo: PreUserLoginOrganization | null;
  backgroundImageUrl: string | null;
  logoImageUrl: string | null;
  darkModeLogoUrl: string | null;
  isLoading: boolean;
  error: ValidatePasswordErrorResponse | null | string;
  isEmailCaptured: boolean;
  isAuthenticated: boolean;
  // User details from GetLoggedInUserDetails API
  userDetails: UserDetailsResponse["value"] | null;
  selectedContract: string | null;
  selectedContractBasemapURL: string | null;
  // User permissions for the selected contract
  userPermissions: string[] | null;
  organizedPermissions: OrganizedPermissions | null;
  permissionsLastFetchedAt: number | null; // Timestamp of last permissions fetch
  userDetailsLastFetchedAt: number | null; // Timestamp of last user details fetch
}

// Initial state
const initialState: LoginState = {
  currentStep: 1,
  formData: {
    email: "",
    password: "",
    verificationCode: ""
  },
  userInfo: null,
  organizationInfo: null,
  backgroundImageUrl: null,
  logoImageUrl: null,
  darkModeLogoUrl: null,
  isLoading: false,
  error: null,
  isEmailCaptured: false,
  isAuthenticated: false,
  userDetails: null,
  selectedContract: null,
  selectedContractBasemapURL: null,
  userPermissions: null,
  organizedPermissions: null,
  permissionsLastFetchedAt: null,
  userDetailsLastFetchedAt: null,
};

// Async thunk for capturing email
export const captureEmail = createAsyncThunk(
  "login/captureEmail",
  async (email: string, { rejectWithValue }) => {
    try {
      const response = await clientApi.post("/api/v1/users/CaptureEmail", {
        email,
      });
      return response.data as CaptureEmailResponse;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message ||
          `This account doesn't exsit. please register and try again`
      );
    }
  }
);

// Async thunk for fetching background image
export const fetchBackgroundImage = createAsyncThunk(
  "login/fetchBackgroundImage",
  async (imagePath: string, { rejectWithValue }) => {
    try {
      const response = await clientApi.get(
        `/api/v1/Images/GetUserOrganizationProfileImages?imagePath=${imagePath}`,
        {
          responseType: "blob",
        }
      );

      // Create blob URL for immediate use
      const imageBlob = new Blob([response.data]);
      const imageUrl = URL.createObjectURL(imageBlob);

      // Don't save blob URL to localStorage as it becomes invalid after refresh
      // The background path is already stored in organization_background_path

      return imageUrl;
    } catch (error: any) {
      console.error('Background image fetch error:', error);
      console.error('Error response:', error.response);
      console.error('Error config:', error.config);
      return rejectWithValue(
        error.response?.data?.message || error.message || "Background image fetch failed"
      );
    }
  }
);

// Async thunk for fetching organization logo
export const fetchOrganizationLogo = createAsyncThunk(
  "login/fetchOrganizationLogo",
  async (imagePath: string, { rejectWithValue }) => {
    try {
      const response = await clientApi.get(
        `/api/v1/Images/GetUserOrganizationProfileImages?imagePath=${imagePath}`,
        {
          responseType: "blob",
        }
      );

      // Create blob URL for the image
      const imageBlob = new Blob([response.data]);
      const imageUrl = URL.createObjectURL(imageBlob);

      return imageUrl;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Logo image fetch failed"
      );
    }
  }
);

// Async thunk for fetching dark mode organization logo
export const fetchDarkModeOrganizationLogo = createAsyncThunk(
  "login/fetchDarkModeOrganizationLogo",
  async (imagePath: string, { rejectWithValue }) => {
    try {
      const response = await clientApi.get(
        `/api/v1/Images/GetUserOrganizationProfileImages?imagePath=${imagePath}`,
        {
          responseType: "blob",
        }
      );

      // Create blob URL for the image
      const imageBlob = new Blob([response.data]);
      const imageUrl = URL.createObjectURL(imageBlob);

      return imageUrl;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Dark mode logo image fetch failed"
      );
    }
  }
);


// Async thunk for login with password
export const loginWithPassword = createAsyncThunk<
  ValidatePasswordResponse,           // success type
  LoginFormData,                      // input type
  { rejectValue: ValidatePasswordErrorResponse } // error type
>(
  "login/loginWithPassword",
  async (loginData, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<ValidatePasswordResponse>(
        "/api/v1/Users/ValidatePassword",
        {
          email: loginData.email,
          password: loginData.password
        }
      );
      
      if (!response.data.isSuccess) {
        // Handle API-level errors (where isSuccess is false but status is 200)
        const apiError: ValidatePasswordErrorResponse = {
          type: response.data.error?.errorType?.toString() || "API_ERROR",
          title: "Login Failed",
          status: 400,
          detail: response.data.error?.description || "Invalid email or password",
          errors: null,
        };
        return rejectWithValue(apiError);
      }
      
      return response.data;
    } catch (error: any) {
      // Handle network errors or HTTP errors
      const apiError: ValidatePasswordErrorResponse = {
        type: error.response?.data?.error?.errorType?.toString() || "NETWORK_ERROR",
        title: error.response?.data?.title || "Network Error",
        status: error.response?.status || 500,
        detail: error.response?.data?.detail || 
               error.response?.data?.message || 
               error.message || 
               "Failed to connect to the server. Please check your connection and try again.",
        errors: error.response?.data?.errors || null,
      };
      return rejectWithValue(apiError);
    }
  }
);


// Async thunk for login with otp
export const loginWithOtp = createAsyncThunk<
  LoginOtpResponse,           // success type
  LoginOtpRequest,                      // input type
  { rejectValue: ValidatePasswordErrorResponse } // error type
>(
  "login/loginWithOTP",
  async (loginData, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<LoginOtpResponse>(
        "/api/v1/Users/ValidatePasswordOtp",
        {
          email: loginData.email,
          password: loginData.password,
          otp: loginData.otp
        }
      );
      
      if (!response.data.isSuccess) {
        // Handle API-level errors (where isSuccess is false but status is 200)
        const apiError: ValidatePasswordErrorResponse = {
          type: response.data.error?.errorType?.toString() || "API_ERROR",
          title: "Login Failed",
          status: 400,
          detail: response.data.error?.description || "Invalid email, password, or OTP",
          errors: null,
        };
        return rejectWithValue(apiError);
      }
      
      return response.data;
    } catch (error: any) {
      // Handle network errors or HTTP errors
      const apiError: ValidatePasswordErrorResponse = {
        type: error.response?.data?.error?.errorType?.toString() || "NETWORK_ERROR",
        title: error.response?.data?.title || "Network Error",
        status: error.response?.status || 500,
        detail: error.response?.data?.detail || 
               error.response?.data?.message || 
               error.message || 
               "Failed to connect to the server. Please check your connection and try again.",
        errors: error.response?.data?.errors || null,
      };
      return rejectWithValue(apiError);
    }
  }
);


// Async thunk for fetching user details
export const fetchUserDetails = createAsyncThunk(
  "login/fetchUserDetails",
  async (_, { dispatch, getState, rejectWithValue }) => {
    try {
      const response = await getLoggedInUserDetails();
      
      // Only fetch categories if contract ID exists
      const contractId = localStorage.getItem('selected_contract_id');
      if (contractId && shouldFetchCategories()) {
        console.log('✅ Fetching categories with contract ID:', contractId);
        dispatch(fetchCategories({}));
      } else if (!contractId) {
        console.log('⏭️ Skipping fetchCategories - no contract ID yet');
      }
      
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description ||
          error.response?.data?.message ||
          "Failed to fetch user details"
      );
    }
  }
);

// Async thunk for fetching user permissions
export const fetchUserPermissions = createAsyncThunk(
  "login/fetchUserPermissions",
  async (contractId: string, { rejectWithValue }) => {
    try {
      const response = await getUserPermissions(contractId);
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description ||
          error.response?.data?.message ||
          "Failed to fetch user permissions"
      );
    }
  }
);

// Initialize organization data from API (for page refresh scenarios)
export const initializeOrganizationData = createAsyncThunk(
  "login/initializeOrganizationData",
  async (email: string, { dispatch, rejectWithValue }) => {
    try {
      // Re-fetch organization data using the email from userDetails or localStorage
      const response = await dispatch(captureEmail(email) as any);

      if (captureEmail.fulfilled.match(response)) {
        // If organization has logos, fetch them
        const orgInfo = response.payload.value?.preUserLoginOrganization;
        if (orgInfo?.lightModeLogo?.value) {
          dispatch(fetchOrganizationLogo(orgInfo.lightModeLogo.value));
        }
        if (orgInfo?.darkModeLogo?.value) {
          dispatch(fetchDarkModeOrganizationLogo(orgInfo.darkModeLogo.value));
        }
      }

      return response.payload;
    } catch (error) {
      console.warn("Failed to initialize organization data:", error);
      return rejectWithValue("Failed to fetch organization data");
    }
  }
);

// Create the login slice
const loginSlice = createSlice({
  name: "login",
  initialState,
  reducers: {
    // Update form data
    updateFormData: (state, action: PayloadAction<Partial<LoginFormData>>) => {
      state.formData = { ...state.formData, ...action.payload };
    },

    // Navigate between steps
    nextStep: (state) => {
      if (state.currentStep < 2) {
        state.currentStep += 1;
      }
    },

    previousStep: (state) => {
      if (state.currentStep > 1) {
        state.currentStep -= 1;
      }
    },

    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },

    // Clear error
    clearError: (state) => {
      state.error = null
    },

    // Reset login state
    resetLogin: () => {
      return ;
    },


    // Set selected contract
    setSelectedContract: (
      state,
      action: PayloadAction<{ id: string; basemapURL: string }>
    ) => {
      state.selectedContract = action.payload.id;
      state.selectedContractBasemapURL = action.payload.basemapURL;
      // Store contract data in cookies for middleware access (removed localStorage to save space)
      if (typeof window !== "undefined") {
        localStorage.setItem("selected_contract_id", action.payload.id);
        // NOTE: Removed localStorage for 'selected_contract_basemap_url' to save browser storage space

        // Set in cookie for middleware access
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        const isSecure = window.location.protocol === "https:";
        const secureFlag = isSecure ? "; secure" : "";
        const sameSitePolicy = isSecure ? "strict" : "lax"; // Use lax for development, strict for production
        document.cookie = `selected_contract_id=${
          action.payload.id
        }; expires=${expiryDate.toUTCString()}; path=/${secureFlag}; samesite=${sameSitePolicy}`;
      }
    },

    // Initialize selected contract from localStorage (for page refresh scenarios)
    initializeSelectedContractFromStorage: (state) => {
      if (typeof window !== "undefined") {
        const contractId = localStorage.getItem("selected_contract_id");
        // NOTE: No longer reading basemap URL from localStorage to save storage space
        // The basemap URL will need to be re-fetched from API if needed after page refresh

        if (contractId) {
          state.selectedContract = contractId;
          // basemap URL will be set when contract data is re-fetched
        }
      }
    },

    // Clear permissions
    clearPermissions: (state) => {
      state.userPermissions = null;
      state.organizedPermissions = null;
    },

    // Clear all auth data on logout
    clearAuthData: (state) => {
      state.userPermissions = null;
      state.organizedPermissions = null;
      state.permissionsLastFetchedAt = null;
      state.userDetailsLastFetchedAt = null;
      state.selectedContract = null;
      state.selectedContractBasemapURL = null;
      state.userDetails = null;
      state.isAuthenticated = false;
      // Clear localStorage
      if (typeof window !== "undefined") {
        // Clear brand colors first
        import("../../../utils/clearUserOrgBranding").then(({ default: clearUserOrgBranding }) => {
          clearUserOrgBranding();
        });
        
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("token_type");
        localStorage.removeItem("expires_in");
        localStorage.removeItem("selected_contract_id");
        localStorage.removeItem("token_set_time");
        localStorage.removeItem("organization_logo_url");
        localStorage.removeItem("organization_branding");
        localStorage.removeItem("brand-color");
        // Don't remove background-image-url as it's not stored anymore
        // NOTE: No longer storing these in localStorage to save browser storage space:
        // - selected_contract_basemap_url (large, can be re-fetched)

        // Clear cookies (for both secure/non-secure and strict/lax versions)
        document.cookie =
          "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie =
          "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure;";
        document.cookie =
          "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=strict;";
        document.cookie =
          "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict;";
        document.cookie =
          "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax;";
        document.cookie =
          "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie =
          "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure;";
        document.cookie =
          "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=strict;";
        document.cookie =
          "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict;";
        document.cookie =
          "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax;";
        document.cookie =
          "selected_contract_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie =
          "selected_contract_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure;";
        document.cookie =
          "selected_contract_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=strict;";
        document.cookie =
          "selected_contract_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict;";
        document.cookie =
          "selected_contract_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax;";
      }
    },
  },
  extraReducers: (builder) => {
    // Handle email capture
    builder
      .addCase(captureEmail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(captureEmail.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.isSuccess) {
          state.userInfo = action.payload.value.preUserLoginInfo;
          state.organizationInfo =
            action.payload.value.preUserLoginOrganization;
          state.isEmailCaptured = true;

          // Store only essential branding data in localStorage for immediate availability
          if (typeof window !== "undefined") {
            const orgInfo = action.payload.value.preUserLoginOrganization;

            // Store essential branding data (small, frequently needed)
            const essentialBranding = {
              englishName: orgInfo.englishName,
              arabicName: orgInfo.arabicName,
              logoPath: orgInfo.lightModeLogo?.value || null,
              darkModeLogoPath: orgInfo.darkModeLogo?.value || null,
              backgroundPath: orgInfo.background?.value || null,
            };

            localStorage.setItem(
              "organization_branding",
              JSON.stringify(essentialBranding)
            );

            // Store background path separately for immediate access
            if (orgInfo.background?.value) {
              localStorage.setItem("organization_background_path", orgInfo.background.value);
            }
          }
        } else {
          state.error =
            action.payload.error.description ||
            `This account doesn't exsit. please register and try again`;
        }
      })
      .addCase(captureEmail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Handle background image fetch
    builder
      .addCase(fetchBackgroundImage.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchBackgroundImage.fulfilled, (state, action) => {
        state.isLoading = false;
        // Store blob URL for immediate use
        state.backgroundImageUrl = action.payload;

        state.currentStep = 2; // Move to password step after background is loaded
      })
      .addCase(fetchBackgroundImage.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        // Even if background fails, allow proceeding to step 2
        state.currentStep = 2;
      });

    // Handle organization logo fetch
    builder
      .addCase(fetchOrganizationLogo.pending, () => {
        // Don't set loading for logo as it's secondary
      })
      .addCase(fetchOrganizationLogo.fulfilled, (state, action) => {
        state.logoImageUrl = action.payload;
        // Persist logo URL in localStorage for use in sidebar and other components
        if (typeof window !== "undefined") {
          localStorage.setItem("organization_logo_url", action.payload);
        }
      })
      .addCase(fetchOrganizationLogo.rejected, (state, action) => {
        // Logo fetch failure is not critical, just log it
        console.warn("Logo fetch failed:", action.payload);
      });

    // Handle dark mode organization logo fetch
    builder
      .addCase(fetchDarkModeOrganizationLogo.pending, () => {
        // Don't set loading for logo as it's secondary
      })
      .addCase(fetchDarkModeOrganizationLogo.fulfilled, (state, action) => {
        state.darkModeLogoUrl = action.payload;
        // Persist dark mode logo URL in localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("organization_dark_logo_url", action.payload);
        }
      })
      .addCase(fetchDarkModeOrganizationLogo.rejected, (state, action) => {
        // Dark mode logo fetch failure is not critical, just log it
        console.warn("Dark mode logo fetch failed:", action.payload);
      });

    // Handle password login
    builder
      .addCase(loginWithPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithPassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;

        if (action.payload?.value) {
          // Move to step 3 for otp
          state.currentStep = 3;
        }
      })
      .addCase(loginWithPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || {
          type: "UNKNOWN_ERROR",
          title: "Login Failed",
          status: 500,
          detail: "An unexpected error occurred. Please try again.",
          errors: null,
        };
      });

    // Handle otp login
    builder
      .addCase(loginWithOtp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithOtp.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        
        if (action.payload?.value) {
          state.isAuthenticated = true;

          // Store tokens in localStorage
          const { access_token, refresh_token, token_type, expires_in } = action.payload.value;
          
          localStorage.setItem("access_token", access_token);
          localStorage.setItem("refresh_token", refresh_token);
          localStorage.setItem("token_type", token_type);
          localStorage.setItem("expires_in", expires_in.toString());

          //Set token timestamp for expiration tracking
          setTokenSetTime();

          // Also set tokens in cookies for middleware access
          if (typeof document !== "undefined") {
            // Set access token cookie (expires in hours from API response)
            const expiresInMs = expires_in * 1000;
            const expiryDate = new Date(Date.now() + expiresInMs);
            const isSecure = window.location.protocol === "https:";
            const secureFlag = isSecure ? "; secure" : "";
            const sameSitePolicy = isSecure ? "strict" : "lax";

            document.cookie = `access_token=${access_token}; expires=${expiryDate.toUTCString()}; path=/${secureFlag}; samesite=${sameSitePolicy}`;
            document.cookie = `refresh_token=${refresh_token}; expires=${expiryDate.toUTCString()}; path=/${secureFlag}; samesite=${sameSitePolicy}`;
          }

          // Move to step 4 for contract selection
          state.currentStep = 4;
        }
      })
      .addCase(loginWithOtp.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || {
          type: "UNKNOWN_ERROR",
          title: "Login Failed",
          status: 500,
          detail: "An unexpected error occurred. Please try again.",
          errors: null,
        };
      }
    );

    // Handle user details fetch
    builder
      .addCase(fetchUserDetails.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUserDetails.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.isSuccess && action.payload.value) {
          state.userDetails = action.payload.value;
          state.userDetailsLastFetchedAt = Date.now();
          
          // Ensure we have valid color value
          const color = action.payload.value?.organization?.color;
          
          // Only set color branding here, background image will be handled by useBackgroundImageManager
          if (color) {
            try {
              setUserOrgBranding(color);
            } catch (error) {
              console.error('Error setting user organization branding:', error);
            }
          }

          // Background image fetching is now handled by useBackgroundImageManager hook
        } else {
          state.error =
            action.payload.error.description || "Failed to fetch user details";
        }
      })
      .addCase(fetchUserDetails.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Handle user permissions fetch
    builder
      .addCase(fetchUserPermissions.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUserPermissions.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.isSuccess && action.payload.value) {
          state.userPermissions = action.payload.value;
          state.organizedPermissions = organizePermissions(
            action.payload.value
          );
          state.permissionsLastFetchedAt = Date.now();
        } else {
          state.error =
            action.payload.error.description ||
            "Failed to fetch user permissions";
        }
      })
      .addCase(fetchUserPermissions.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

// Export actions
export const {
  updateFormData,
  nextStep,
  previousStep,
  setCurrentStep,
  clearError,
  resetLogin,
  setSelectedContract,
  initializeSelectedContractFromStorage,
  clearPermissions,
  clearAuthData,
} = loginSlice.actions;

// initializeOrganizationData is already exported above

// Export reducer
export default loginSlice.reducer;
