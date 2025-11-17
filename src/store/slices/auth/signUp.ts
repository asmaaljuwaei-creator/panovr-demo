import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import clientApi from '../../../axios/clientApi';

// Define the signup form data interface
export interface SignUpFormData {
  // Step 1: Personal Information
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string;
  lastNameAr: string;
  gender: string;
  dateOfBirth: string;
  
  // Step 2: Account Information
  email: string;
  phone: string;
  organizationCode: string;
  password: string;
  confirmPassword: string;
  
  // Step 3: Verification
  verificationCode: string;
}

// API data format for CheckOrgUserData
interface CheckOrgUserDataPayload {
  email: string;
  firstNameAr: string;
  lastNameAr: string;
  firstNameEn: string;
  lastNameEn: string;
  password: string;
  gender: number;
  dateOfBirth: string; // Simple date string format "YYYY-MM-DD"
  mobile: string;
  orgCode: string;
}

// API data format for RegisterOrgUser
interface RegisterOrgUserPayload extends CheckOrgUserDataPayload {
  otp: string;
}

// Define the signup state interface
export interface SignUpState {
  currentStep: number;
  formData: SignUpFormData;
  isLoading: boolean;
  error: string | null;
  isEmailVerified: boolean;
  isDataChecked: boolean;
}

// Initial state
const initialState: SignUpState = {
  currentStep: 1,
  formData: {
    firstNameEn: '',
    lastNameEn: '',
    firstNameAr: '',
    lastNameAr: '',
    gender: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    organizationCode: '',
    password: '',
    confirmPassword: '',
    verificationCode: '',
  },
  isLoading: false,
  error: null,
  isEmailVerified: false,
  isDataChecked: false,
};

// Helper function to transform form data to API format
const transformFormToApiData = (formData: SignUpFormData): CheckOrgUserDataPayload => {
  // Validate and parse date
  const dateOfBirth = new Date(formData.dateOfBirth);
  if (isNaN(dateOfBirth.getTime())) {
    throw new Error('Invalid date of birth provided');
  }
  
  // Validate required fields
  if (!formData.email || !formData.firstNameEn || !formData.lastNameEn || 
      !formData.firstNameAr || !formData.lastNameAr || !formData.password || 
      !formData.phone || !formData.organizationCode || !formData.gender) {
    throw new Error('All fields are required');
  }

  // Format phone number with + prefix
  let mobile = formData.phone.trim();
  if (!mobile.startsWith('+')) {
    mobile = '+' + mobile;
  }

  // Format date as YYYY-MM-DD string
  const dateString = dateOfBirth.toISOString().split('T')[0];

  const payload = {
    email: formData.email.trim(),
    firstNameAr: formData.firstNameAr.trim(),
    lastNameAr: formData.lastNameAr.trim(),
    firstNameEn: formData.firstNameEn.trim(),
    lastNameEn: formData.lastNameEn.trim(),
    password: formData.password,
    gender: formData.gender === 'male' ? 1 : formData.gender === 'female' ? 2 : 1, // Default to male if unclear
    dateOfBirth: dateString,
    mobile: mobile,
    orgCode: formData.organizationCode.trim(),
  };

  // Log the payload for debugging
  
  
  return payload;
};

// Async thunk for checking org user data (Step 2)
export const checkOrgUserData = createAsyncThunk(
  'signUp/checkOrgUserData',
  async (formData: SignUpFormData, { rejectWithValue }) => {
    try {
      const apiData = transformFormToApiData(formData);
      
      
              const response = await clientApi.post('/api/v1/Users/CheckOrgUserData', apiData);
      return response.data;
    } catch (error: any) {
      // Enhanced error logging
      console.error('API Error Details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data,
        }
      });
      
      // Return more detailed error message
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          error.response?.data?.title ||
                          error.message || 
                          'Data validation failed';
      
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk for registering org user (Step 3)
export const registerOrgUser = createAsyncThunk(
  'signUp/registerOrgUser',
  async (formData: SignUpFormData, { rejectWithValue }) => {
    try {
      const apiData = transformFormToApiData(formData);
      const registerData: RegisterOrgUserPayload = {
        ...apiData,
        otp: formData.verificationCode,
      };
      const response = await clientApi.post('/api/v1/Users/RegisterOrgUser', registerData);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Registration failed');
    }
  }
);

// Create the signup slice
const signUpSlice = createSlice({
  name: 'signUp',
  initialState,
  reducers: {
    // Update form data
    updateFormData: (state, action: PayloadAction<Partial<SignUpFormData>>) => {
      state.formData = { ...state.formData, ...action.payload };
    },
    
    // Navigate between steps
    nextStep: (state) => {
      if (state.currentStep < 3) {
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
      state.error = null;
  },
  
  // Reset data checked state (for back navigation)
  resetDataChecked: (state) => {
    state.isDataChecked = false;
    state.error = null;
  },
  
  // Reset signup state
  resetSignUp: () => {
    return initialState;
  },
  },
  extraReducers: (builder) => {
    // Handle org user data check (Step 2)
    builder
      .addCase(checkOrgUserData.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(checkOrgUserData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isDataChecked = true;
        state.currentStep = 3; // Move to verification step
      })
      .addCase(checkOrgUserData.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
    
    // Handle org user registration (Step 3)
    builder
      .addCase(registerOrgUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerOrgUser.fulfilled, (state) => {
        state.isLoading = false;
        state.isEmailVerified = true;
        // Registration completed successfully
      })
      .addCase(registerOrgUser.rejected, (state, action) => {
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
  resetDataChecked,
  resetSignUp,
} = signUpSlice.actions;

// Export reducer
export default signUpSlice.reducer;
