import clientApi from '../../axios/clientApi';

// Route request interface
export interface RouteRequest {
  startLng: number;
  startLat: number;
  endLng: number;
  endLat: number;
}

// Route response interface
export interface RouteResponse {
  isSuccess?: boolean;
  error?: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure?: boolean;
  value?: any; // GeoJSON route data
  total_distance_m?: number;
  total_duration_sec?: number;
  // Allow for direct GeoJSON response
  [key: string]: any;
}

// API function to get route between two points
export const getRoute = async (routeRequest: RouteRequest, contractId?: string): Promise<RouteResponse> => {
  try {
    const config: any = {
      timeout: 5000 // 5 seconds timeout for main route
    };
    
    // Only add headers if contractId is provided
    if (contractId) {
      config.headers = {
        'X-Contract-Id': contractId
      };
    }

    const response = await clientApi.post('/api/v1/Routing/FindRouteWithCorrectStepar', routeRequest, config);
    
    return response.data;
  } catch (error: any) {
    console.error('Routing API error:', error);
    throw error;
  }
};

// API function to get alternative route between two points
export const getAlternativeRoute = async (routeRequest: RouteRequest, contractId?: string): Promise<RouteResponse> => {
  try {
    const config: any = {
      timeout: 30000 // 30 seconds timeout for alternative route
    };
    
    // Only add headers if contractId is provided
    if (contractId) {
      config.headers = {
        'X-Contract-Id': contractId
      };
    }

    const response = await clientApi.post('/api/v1/Routing/FindAlternativeWithCorrectStepar', routeRequest, config);
    
    return response.data;
  } catch (error: any) {
    console.error('Alternative routing API error:', error);
    throw error;
  }
}; 