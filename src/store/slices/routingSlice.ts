import { RouteSegment } from "@/components/layout/panels/routing";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface RoutePoint {
  lng?: number;
  lat?: number;
  type?: 'start' | 'end';
  address?: string;
}

export interface RouteResult {
  id: string;
  startPoint: RoutePoint | null;
  endPoint: RoutePoint | null;
  geojson: any;
  geometry?: any;
  features?: RouteSegment[];
  totalDistance?: number;
  totalDuration?: number;
  total_distance_m?: number;
  total_duration_sec?: number;
  total_duration_min?: number;
  travel_description?: string;
  travel_description_ar?: string;
  travel_time_formatted?: string;
}

export type RoutingMode = 'select-start' | 'select-end' | null;

interface RoutesState {
  mainRoute: RouteResult | null;
  alternativeRoute: RouteResult | null; // store multiple alternatives
  selectedAlternative: RouteResult | null; // when user clicks on one
  selectedRouteId: string | null;
  isLoading: boolean;
  error: string | null;
  routingMode: RoutingMode;
  startPoint: RoutePoint | null;
  endPoint: RoutePoint | null;
  routes: RouteResult[];
}

const initialState: RoutesState = {
  mainRoute: null,
  alternativeRoute: null,
  selectedAlternative: null,
  selectedRouteId:  null,
  isLoading: false,
  error:  null,
  routingMode: null,
  startPoint: null,
  endPoint: null,
  routes: []
};

// Payload type for setRoutes
interface SetRoutesPayload {
  mainRoute?: RouteResult | null;
  alternativeRoute?: RouteResult | null;
  routes?: RouteResult[];
  selectedAlternativeId?: string | null;
  startPoint?: RoutePoint | null;
  endPoint?: RoutePoint | null;
}

const routesSlice = createSlice({
  name: "routes",
  initialState,
  reducers: {
    setMainRoute: (state, action: PayloadAction<RouteResult | null>) => {
      state.mainRoute = action.payload;
      state.selectedRouteId = action.payload?.id!;
    },
    setAlternativeRoute: (state, action: PayloadAction<RouteResult | null>) => {
      state.alternativeRoute = action.payload;
    },
    // selectAlternative: (state, action: PayloadAction<string>) => {
    //   state.selectedAlternative = state.alternativeRoute.find(
    //     (r) => r.id === action.payload
    //   ) || null;
    //   state.selectedRouteId = action.payload;
    // },
    replaceMainWithAlternative: (state) => {
      if (state.alternativeRoute) {
        state.mainRoute = state.alternativeRoute;
        state.startPoint = state.alternativeRoute.startPoint;
        state.endPoint = state.alternativeRoute.endPoint;
        state.selectedRouteId = state.mainRoute.id;
        state.alternativeRoute = null;
      }
    },
    setRoutingMode: (state, action: PayloadAction<RoutingMode>) => {
      state.routingMode = action.payload;
    },
    setStartPoint: (state, action: PayloadAction<RoutePoint | null>) => {
      state.startPoint = action.payload;
    },
    setEndPoint: (state, action: PayloadAction<RoutePoint | null>) => {
      state.endPoint = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearRoutes: (state) => {
      state.mainRoute = null;
      state.alternativeRoute = null;
      state.selectedAlternative = null;
      state.selectedRouteId = null;
      state.isLoading = false;
      state.error = null;
      state.routingMode = null;
      state.startPoint = null;
      state.endPoint = null;
    },
    setRoutes: (state, action: PayloadAction<SetRoutesPayload | RouteResult[]>) => {
      if (Array.isArray(action.payload)) {
        // handle array use-case
        if (action.payload.length === 0) {
          state.mainRoute = null;
          state.alternativeRoute = null;
          state.selectedRouteId = null;
          state.startPoint = null;
          state.endPoint = null;
        } else {
          // first item is main route, second (if any) is alternative
          state.mainRoute = action.payload[0];
          state.selectedRouteId = action.payload[0]?.id || null;
          state.startPoint = action.payload[0]?.startPoint || null;
          state.endPoint = action.payload[0]?.endPoint || null;
          state.alternativeRoute = action.payload[1] || null;
        }
        return;
      }

      // handle object case
      const { mainRoute, alternativeRoute, startPoint, endPoint } = action.payload;

      if (mainRoute !== undefined) {
        state.mainRoute = mainRoute;
        state.selectedRouteId = mainRoute ? mainRoute.id : null;
        state.startPoint = mainRoute?.startPoint || null;
        state.endPoint = mainRoute?.endPoint || null;
      }

      if (alternativeRoute !== undefined) {
        state.alternativeRoute = alternativeRoute;
      }

      if (startPoint !== undefined) {
        state.startPoint = startPoint;
        if (state.mainRoute && startPoint) state.mainRoute.startPoint = startPoint;
      }

      if (endPoint !== undefined) {
        state.endPoint = endPoint;
        if (state.mainRoute && endPoint) state.mainRoute.endPoint = endPoint;
      }
    },

    setSelectedRouteId: (state, action: PayloadAction<string | null>) => {
      state.selectedRouteId = action.payload;
    },
    removeRoute: (state, action: PayloadAction<string>) => {
      if (state.mainRoute?.id === action.payload) {
        state.mainRoute = null;
        state.selectedRouteId = null;
      }

      if (state.alternativeRoute?.id === action.payload) {
        state.alternativeRoute = null;
      }
    }
  }
})

export const {
  setMainRoute,
  setAlternativeRoute,
  replaceMainWithAlternative,
  setRoutingMode,
  setStartPoint,
  setEndPoint,
  setRoutes,
  setSelectedRouteId,
  setLoading,
  setError,
  clearRoutes,
  removeRoute
} = routesSlice.actions;

export default routesSlice.reducer;