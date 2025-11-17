"use client";

import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import clientApi from "@/axios/clientApi";
import { MainAPIResponseTypes } from "../../../types"

// Request/response interfaces
export interface ResetPasswordRequest {
  email: string;
}

export type ResetPasswordResponse = MainAPIResponseTypes<number>

export interface ValidateOtpRequest {
  email: string;
  code: string;
  otpServiceType: number;
}

export type ValidateOtpResponse = MainAPIResponseTypes<Record<string, never>>;

export interface ValidateResetPasswordOtpRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export type ValidateResetPasswordOtpResponse = MainAPIResponseTypes<Record<string, never>>

// Slice state interface
interface ResetPasswordState {
  isLoading: boolean;
  isSuccess: boolean;
  isFailure: boolean;
  error: string | null;
  hasRequested: boolean;
  currentStep: number;

  hasValidatedOtp: boolean;
  isOtpSuccess: boolean;
  isOtpFailure: boolean;

  isResetConfirmed: boolean;
  isResetFailed: boolean;
}

// Initial state
const initialState: ResetPasswordState = {
  isLoading: false,
  isSuccess: false,
  isFailure: false,
  error: null,
  hasRequested: false,
  currentStep: 1,

  hasValidatedOtp: false,
  isOtpSuccess: false,
  isOtpFailure: false,

  isResetConfirmed: false,
  isResetFailed: false,
};

// Thunks

export const resetPassword = createAsyncThunk(
  "resetPassword/requestReset",
  async (payload: ResetPasswordRequest, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<ResetPasswordResponse>(
                  "/api/v1/Users/ResetPassword",
        payload
      );
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Reset password failed"
      );
    }
  }
);

export const validateOtp = createAsyncThunk(
  "resetPassword/validateOtp",
  async (payload: ValidateOtpRequest, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<ValidateOtpResponse>(
                  "/api/v1/Users/ValidateOtp",
        payload
      );
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "OTP validation failed"
      );
    }
  }
);

export const validateResetPasswordOtp = createAsyncThunk(
  "resetPassword/confirmNewPassword",
  async (payload: ValidateResetPasswordOtpRequest, { rejectWithValue }) => {
    try {
      const response = await clientApi.post<ValidateResetPasswordOtpResponse>(
                  "/api/v1/Users/ValidateResetPasswordOtp",
        payload
      );
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description ||
          "Password reset confirmation failed"
      );
    }
  }
);

// Slice
const resetPasswordSlice = createSlice({
  name: "resetPassword",
  initialState,
  reducers: {
    clearResetPasswordState: (state) => {
      Object.assign(state, initialState);
    },
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
    setStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Step 1: Request reset
    builder
      .addCase(resetPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.hasRequested = true;
      })
      .addCase(resetPassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isSuccess = action.payload.isSuccess;
        state.isFailure = action.payload.isFailure;
        state.hasRequested = true;
        if (action.payload.error?.description) {
          state.error = action.payload.error.description;
        }
      })
      .addCase(resetPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.isFailure = true;
        state.error = action.payload as string;
        state.hasRequested = true;
      });

    // Step 2: Validate OTP
    builder
      .addCase(validateOtp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.hasValidatedOtp = false;
        state.isOtpSuccess = false;
        state.isOtpFailure = false;
      })
      .addCase(validateOtp.fulfilled, (state, action) => {
        state.isLoading = false;
        state.hasValidatedOtp = true;
        state.isOtpSuccess = action.payload.isSuccess;
        state.isOtpFailure = action.payload.isFailure;
        if (action.payload.error?.description) {
          state.error = action.payload.error.description;
        }
          state.currentStep = 2;

      })
      .addCase(validateOtp.rejected, (state, action) => {
        state.isLoading = false;
        state.hasValidatedOtp = true;
        state.isOtpFailure = true;
        state.error = action.payload as string;
      });

    // Step 3: Confirm new password
    builder
      .addCase(validateResetPasswordOtp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.isResetConfirmed = false;
        state.isResetFailed = false;
      })
      .addCase(validateResetPasswordOtp.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isResetConfirmed = action.payload.isSuccess;
        state.isResetFailed = action.payload.isFailure;
        if (action.payload.error?.description) {
          state.error = action.payload.error.description;
        }
          state.currentStep = 3;
      })
      .addCase(validateResetPasswordOtp.rejected, (state, action) => {
        state.isLoading = false;
        state.isResetFailed = true;
        state.error = action.payload as string;
      });
  },
});

export const { clearResetPasswordState, nextStep, previousStep, setStep } =
  resetPasswordSlice.actions;

export default resetPasswordSlice.reducer;
