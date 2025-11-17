import clientApi from '../../axios/clientApi';
import { getContractConfig } from '../../utils/contractIdManager';

// Personal POI types enum
export enum PersonalPoiType {
  Other = 0,
  Home = 1,
  Work = 2
}

// Personal POI interfaces
export interface PersonalPoi {
  id: string;
  englishName: string;
  arabicName: string;
  latitude: number;
  longitude: number;
  type: PersonalPoiType;
}

export interface GetMyPlacesResponse {
  value: PersonalPoi[];
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

export interface AddPersonalPoiRequest {
  englishName: string;
  arabicName: string;
  latitude: string;
  longitude: string;
  type: number; // Send as number instead of enum
}

export interface UpdatePersonalPoiRequest {
  id: string;
  englishName: string;
  arabicName: string;
  latitude: string;
  longitude: string;
  type: number; // Send as number instead of enum
}

export interface DeletePersonalPoiRequest {
  poiId: string;
}

export interface GetPersonalPoiDetailsRequest {
  id: string;
}

export interface GetPersonalPoiDetailsResponse {
  value: PersonalPoi;
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// API Functions
export const getMyPlaces = async (): Promise<GetMyPlacesResponse> => {
  try {
    const config = getContractConfig();
    const response = await clientApi.post('/api/v1/PersonalPoi/GetMyPlaces', '', config);
    return response.data;
  } catch (error: any) {
    console.error('Get My Places API error:', error);
    throw error;
  }
};

export const getPersonalPoiDetails = async (request: GetPersonalPoiDetailsRequest): Promise<GetPersonalPoiDetailsResponse> => {
  try {
    console.log('getPersonalPoiDetails: Making API call to /api/v1/PersonalPoi/GetPersonalPoiDetails with:', request);
    const config = getContractConfig();
    const response = await clientApi.post('/api/v1/PersonalPoi/GetPersonalPoiDetails', request, config);
    console.log('getPersonalPoiDetails: API response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Get Personal POI Details API error:', error);
    console.error('Request data was:', JSON.stringify(request, null, 2));
    throw error;
  }
};

export const addPersonalPoi = async (request: AddPersonalPoiRequest): Promise<any> => {
  try {
    // Log the request data for debugging
    const config = getContractConfig();
    const response = await clientApi.post('/api/v1/PersonalPoi/AddPersonalPoi', request, config);
    return response.data;
  } catch (error: any) {
    console.error('❌ Add Personal POI API error:', error);
    console.error('📤 Request data was:', JSON.stringify(request, null, 2));
    if (error.response) {
      console.error('📥 Error response:', error.response.data);
      console.error('📊 Status:', error.response.status);
    }
    throw error;
  }
};

export const updatePersonalPoi = async (request: UpdatePersonalPoiRequest): Promise<any> => {
  try {
    const config = getContractConfig();
    const response = await clientApi.put('/api/v1/PersonalPoi/EditPersonalPoi', request, config);
    return response.data;
  } catch (error: any) {
    console.error('Update Personal POI API error:', error);
    throw error;
  }
};

export const deletePersonalPoi = async (request: DeletePersonalPoiRequest): Promise<any> => {
  try {
    // Log the request data for debugging
    const config = getContractConfig();
    const response = await clientApi.post('/api/v1/PersonalPoi/DeletePersonalPoi', request, config);
    return response.data;
  } catch (error: any) {
    console.error('Delete Personal POI API error:', error);
    console.error('Request data was:', JSON.stringify(request, null, 2));
    throw error;
  }
};