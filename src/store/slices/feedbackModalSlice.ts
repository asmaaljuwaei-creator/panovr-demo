import clientApi from "@/axios/clientApi";
import { getContractConfig } from "@/utils/contractIdManager";
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

// ---- Types ----
export interface FeedbackFormData {
  email: string;
  subject: string;
  type: 0 | 1 | 2; // 0=System issue, 1=Feature Request, 2=General Inquiry
  message: string;
  file?: File | null;
}

export interface FeedbackResponse {
  id: string; // returned feedback ID
  message: string;
}

// ---- Async thunk for submitting feedback ----
export const submitFeedback = createAsyncThunk<
  FeedbackResponse,
  FeedbackFormData,
  { rejectValue: string | object }
>(
  "feedback/submitFeedback",
  async (data, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append("email", data.email);
      formData.append("subject", data.subject);
      formData.append("type", String(data.type));
      formData.append("message", data.message);

      if (data.file) {
        formData.append("file", data.file);
      }

      const config = getContractConfig({ 
        headers: { "Content-Type": "multipart/form-data" } 
      });
      const res = await clientApi.post<FeedbackResponse>(
        "/api/v1/ContactUs/SubmitContactUs",
        formData,
        config
      );

      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

// ---- Redux slice ----
interface FeedbackState {
  loading: boolean;
  feedbackId: string | null;
  error: string | object | null;
  isFeedbackModelOpen: boolean;
}

const initialState: FeedbackState = {
  loading: false,
  feedbackId: null,
  error: null,
  isFeedbackModelOpen: false,
};

const feedbackSlice = createSlice({
  name: "feedback",
  initialState,
  reducers: {
    openFeedbackModal(state) {
      state.isFeedbackModelOpen = true;
    },
    closeFeedbackModal(state) {
      state.isFeedbackModelOpen = false;
    },
    resetFeedback(state) {
      state.feedbackId = null;
      state.error = null;
      state.isFeedbackModelOpen = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitFeedback.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        submitFeedback.fulfilled,
        (state, action: PayloadAction<FeedbackResponse>) => {
          state.loading = false;
          state.feedbackId = action.payload.id;
        }
      )
      .addCase(submitFeedback.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Unknown error";
      });
  },
});

export const { openFeedbackModal, closeFeedbackModal, resetFeedback } =
  feedbackSlice.actions;

export default feedbackSlice.reducer;
