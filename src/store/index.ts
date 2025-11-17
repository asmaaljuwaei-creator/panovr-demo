import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { 
  persistStore, 
  persistReducer,
  createTransform,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import baseLayerReducer from "./slices/baseLayerSlice";
import themeReducer from "./slices/config/themeSlice";
import localeReducer from "./slices/config/localeSlice";
import signUpReducer from "./slices/auth/signUp";
import loginReducer from "./slices/auth/login";
import otpReducer from "./slices/auth/OTP";
import resetPasswordReducer from "./slices/auth/ResetPassword";
import toastNotificationReducer from "./slices/toastNotificationSlice";
import panelReducer from "./slices/panelSlice";
import searchResultsReducer from "./slices/searchResultsSlice";
import mapReducer from "./slices/mapSlice";
import poisFilterReducer from "./slices/poisFilterSlice";
import autoCompleteReducer from "./slices/autoCompleteSlice";
import recentSelectedPOIReducer from "./slices/recentSelectedPOISlice";
import recentSearchesReducer from "./slices/recentSearchesSlice";
import selectedSearchResultReducer from "./slices/selectedSearchResultSlice";
import layersReducer from "./slices/layersSlice";
import getCategoriesReducer from "./slices/getCategoriesSlice";
import publicPOIsReducer from "./slices/PublicPOIsSlice";
import addPlacePopupReducer from "./slices/addPlacePopupSlice";
import addPersonalPoiPopupReducer from "./slices/addPersonalPoiPopupSlice";
import editPersonalPoiPopupReducer from "./slices/editPersonalPoiPopupSlice";
import dropPinDetailsReducer from "./slices/dropPinDetailsSlice";
import personalPoiListReducer from "./slices/personalPoiListSlice"
import personalPoiListPopupReducer from "./slices/personalPoiListPopupSlice"
import addPublicPOIReducer from "./slices/addPublicPOISlice";
import addPoiToListPopupReducer from "./slices/addPoiToListSlice";
import childPanelReducer from "./slices/childPanelSlice";
import addRatingPopupReducer from './slices/addRatingPopupSlice'
import poiReviewsSliceReducer from './slices/reviewSlice'
import feedbackModalReducer from './slices/feedbackModalSlice'
import personalPoiDetailsReducer from './slices/personalPoiDetailsSlice'
import organizationPoiDetailsReducer from './slices/organizationPoiDetailsSlice'
import mapViewReducer from './slices/mapViewSlice';

import { mapTransform } from './transforms/mapTransform';
import routingReducer from './slices/routingSlice'
// Create a transform to only persist specific fields from login slice
const loginTransform = createTransform(
  // transform state on its way to being serialized and persisted
  (inboundState: any, key) => {
    if (key === 'login') {
      // Only persist these specific fields
      return {
        userPermissions: inboundState.userPermissions,
        organizedPermissions: inboundState.organizedPermissions,
        selectedContract: inboundState.selectedContract,
        permissionsLastFetchedAt: inboundState.permissionsLastFetchedAt,
        userDetails: inboundState.userDetails,
        userDetailsLastFetchedAt: inboundState.userDetailsLastFetchedAt
      };
    }
    return inboundState;
  },
  // transform state being rehydrated
  (outboundState: any, key) => {
    if (key === 'login') {
      // Merge persisted fields with initial state
      return {
        ...loginReducer(undefined, { type: '@@INIT' }), // Get initial state
        ...outboundState // Override with persisted fields
      };
    }
    return outboundState;
  },
  // define which reducers this transform gets called for
  { whitelist: ['login'] }
);

const rootReducer = combineReducers({
  theme: themeReducer,
  locale: localeReducer,
  baseLayer: baseLayerReducer,
  signUp: signUpReducer,
  login: loginReducer,
  otp: otpReducer,
  resetPassword: resetPasswordReducer,
  toastNotification: toastNotificationReducer,
  panel: panelReducer,
  searchResults: searchResultsReducer,
  map: mapReducer,
  poisFilter: poisFilterReducer,
  autoComplete: autoCompleteReducer,
  recentSelectedPOI: recentSelectedPOIReducer,
  recentSearches: recentSearchesReducer,
  selectedSearchResult: selectedSearchResultReducer,
  layers: layersReducer,
  getCategories: getCategoriesReducer,
  publicPOIs: publicPOIsReducer,
  addPlacePopup: addPlacePopupReducer,
  addPersonalPoiPopup: addPersonalPoiPopupReducer,
  editPersonalPoiPopup: editPersonalPoiPopupReducer,
  dropPinDetails: dropPinDetailsReducer,
  personalPoiList: personalPoiListReducer,
  personalPoiListPopup: personalPoiListPopupReducer,
  addPublicPOI: addPublicPOIReducer,
  addPoiToListPopup: addPoiToListPopupReducer,
  childPanel: childPanelReducer,
  addRatingPopup: addRatingPopupReducer,
  fetchReviews: poiReviewsSliceReducer,
  feedbackModal: feedbackModalReducer,
  personalPoiDetails: personalPoiDetailsReducer,
  organizationPoiDetails: organizationPoiDetailsReducer,
  routing: routingReducer,
  mapView: mapViewReducer,
});

// Configure persistence
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['login', 'map'], // Persist login and map slices
  transforms: [loginTransform, mapTransform]
};

// Using 'any' type here due to redux-persist TypeScript limitations
// The persistReducer adds additional properties that cause type conflicts
const persistedReducer = persistReducer(persistConfig as any, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore redux-persist actions
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER, 'map/setMapInstance'],
        // Ignore paths that contain non-serializable data
        ignoredPaths: ['map.mapInstance', 'map.mapInstance.values_', 'map.mapInstance.layergroup']
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;