"use client";

import clientApi from "@/axios/clientApi";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

interface OTPState {
  OTPUserData: {
    email?: string | null;
  };
  otp: string;
  isOtpVerified: boolean;
  validationResult: string;
  isPending: boolean;
  wasResent: boolean;
}

const initialState: OTPState = {
  OTPUserData: {},
  otp: "",
  isOtpVerified: false,
  validationResult: "",
  isPending: false,
  wasResent: false,
};

export interface ResendOtpRequest {
  email: string;
}

export const resendOtp = createAsyncThunk(
  "otp/resendOtp",
  async (payload: ResendOtpRequest, { rejectWithValue }) => {
    try {
      const response = await clientApi.post("/api/v1/Users/ResendOTPLogin", payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to resend OTP"
      );
    }
  }
);

export const resendResetPasswordOtp = createAsyncThunk(
  "otp/resendResetPasswordOtp",
  async (payload: ResendOtpRequest, { rejectWithValue }) => {
    try {
      const response = await clientApi.post("/api/v1/Users/ResendOTP", payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.error?.description || "Failed to resend OTP"
      );
    }
  }
);

const otpSlice = createSlice({
  name: "OTP",
  initialState,
  reducers: {
    setOTPUserData: (state, action: PayloadAction<any>) => {
      state.OTPUserData = {
        ...(state.OTPUserData || {}),
        ...action.payload,
      };
    },
    setOtp: (state, action: PayloadAction<string>) => {
      state.otp = action.payload;
    },
    setIsOtpVerified: (state, action: PayloadAction<boolean>) => {
      state.isOtpVerified = action.payload;
    },
    setValidationResult: (state, action: PayloadAction<string>) => {
      state.validationResult = action.payload;
    },
    setIsPending: (state, action: PayloadAction<boolean>) => {
      state.isPending = action.payload;
    },
    setWasResent: (state, action: PayloadAction<boolean>) => {
      state.wasResent = action.payload;
    },
    resetOTPStore: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(resendOtp.pending, (state) => {
        state.isPending = true;
        state.validationResult = "";
      })
      .addCase(resendOtp.fulfilled, (state) => {
        state.isPending = false;
        state.validationResult = "";
        state.wasResent = true;
      })
      .addCase(resendOtp.rejected, (state, action) => {
        state.isPending = false;
        state.validationResult = action.payload as string;
      })
      .addCase(resendResetPasswordOtp.pending, (state) => {
        state.isPending = true;
        state.validationResult = "";
      })
      .addCase(resendResetPasswordOtp.fulfilled, (state) => {
        state.isPending = false;
        state.validationResult = "";
        state.wasResent = true;
      })
      .addCase(resendResetPasswordOtp.rejected, (state, action) => {
        state.isPending = false;
        state.validationResult = action.payload as string;
      });
  },
});

export const {
  setOTPUserData,
  setOtp,
  setIsOtpVerified,
  setValidationResult,
  setIsPending,
  resetOTPStore,
} = otpSlice.actions;

export default otpSlice.reducer;
