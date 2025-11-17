import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// Helper function to generate unique ID with fallback
const generateUniqueId = (): string => {
  // Try crypto.randomUUID first (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      console.warn('crypto.randomUUID failed, using fallback:', error);
    }
  }
  
  // Fallback for older browsers
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${randomStr}`;
};

export type ToastNotificationType = "info" | "success" | "error" | "warning";

export interface ToastNotificationItem {
  id: string;
  toastNotificationType: ToastNotificationType;
  titleToastNotification?: string;
  descriptionToastNotification: string;
  durationToastNotification: number;
}

interface ToastNotificationState {
  toastNotifications: ToastNotificationItem[];
}

const initialState: ToastNotificationState = {
  toastNotifications: [],
};

const toastNotificationSlice = createSlice({
  name: "toastNotification",
  initialState,
  reducers: {
    setToastNotificationProps: (
      state,
      action: PayloadAction<{
        type: ToastNotificationType;
        title?: string;
        description: string;
        open: boolean;
        duration?: number;
      }>
    ) => {
      const { type, title = "", description, open, duration = 3 } =
        action.payload;

      if (open) {
        state.toastNotifications.push({
          id: generateUniqueId(), // Use our helper function
          toastNotificationType: type,
          titleToastNotification: title,
          descriptionToastNotification: description,
          durationToastNotification: duration,
        });
      }
    },

    removeToastNotification: (state, action: PayloadAction<string>) => {
      state.toastNotifications = state.toastNotifications.filter(
        (toast) => toast.id !== action.payload
      );
    },

    clearToastNotifications: (state) => {
      state.toastNotifications = [];
    },
  },
});

export const {
  setToastNotificationProps,
  removeToastNotification,
  clearToastNotifications,
} = toastNotificationSlice.actions;

export default toastNotificationSlice.reducer;
