import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { getRatingbyPoiId, PoiReviewsResponse, PoiUserReview } from "../api/RatingApi"

export interface PoiReviewsState {
  loading: boolean;
  error: string | null;
  totalAvgRating: number;
  ratingByScale: Record<number, number>;
  reviews: PoiUserReview[];
}

const initialState: PoiReviewsState = {
  loading: false,
  error: null,
  totalAvgRating: 0,
  ratingByScale: {},
  reviews: [],
};


//get all reviews
export const fetchPoisReviews = createAsyncThunk<PoiReviewsResponse, string>(
  '/poiReview/getReviews',
  async (poiId: string) => {
    return await getRatingbyPoiId(poiId)
  }
)

const poiReviewsSlice = createSlice({
    name: 'fetchReviews',
    initialState,
    reducers: {
      clearReviews: (state) => {
        state.reviews = []
        state.totalAvgRating = 0
      }
    },
    extraReducers: (builder) => {
        builder
        .addCase(fetchPoisReviews.pending, (state) => {
        state.loading = true;
        state.error = null;
        })
        .addCase(fetchPoisReviews.fulfilled, (state, action) => {
            state.loading = false;
      const { user, totalAvgRating, ratingByScale } = action.payload.value;

        state.totalAvgRating = totalAvgRating;
        state.ratingByScale = ratingByScale || {};

        if (user && user.length > 0) {
          // push new reviews, avoiding duplicates by userId
          user.forEach((review) => {
            const existsIndex = state.reviews.findIndex((r) => r.userId === review.userId);
            if (existsIndex >= 0) {
              state.reviews[existsIndex] = review;
            } else {
              state.reviews.push(review);
            }
          });
        }
        })
        .addCase(fetchPoisReviews.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch reviews';
        });
    }
})

export const {clearReviews} = poiReviewsSlice.actions
export default poiReviewsSlice.reducer
