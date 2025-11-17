import clientApi from '../../axios/clientApi';
import { getContractConfig } from '../../utils/contractIdManager';

// Organization POI request interfaces
export interface SearchOrganizationPoiRequest {
  keyword: string;
  pagination: {
    pageNumber: number;
    pageSize: number;
  };
}

// Organization POI response interfaces
export interface OrganizationPoiImage {
  id: string;
  imageURL: string;
  organizationPoiId: string;
}

export interface OrganizationPoi {
  id: string;
  arabicName: string;
  englishName: string;
  description?: string;
  address?: string;
  longitude: number;
  latitude: number;
  scale: number;
  cityId: string | null;
  arabicCity: string;
  englishCity: string;
  districtId: string | null;
  arabicDistrict: string;
  englishDistrict: string;
  governateId: number;
  arabicGovernate: string;
  englishGovernate: string;
  regionId: number;
  arabicRegion: string;
  englishRegion: string;
  categoryId: number;
  arabicCategory: string;
  englishCategory: string;
}

export interface OrganizationPoiItem {
  poi: OrganizationPoi;
  images: OrganizationPoiImage[];
}

export interface SearchOrganizationPoiResponse {
  value: {
    items: OrganizationPoiItem[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// API function to search organization POIs
export const searchOrganizationPoi = async (
  request: SearchOrganizationPoiRequest,
  contractId?: string
): Promise<SearchOrganizationPoiResponse> => {
  try {
    const config = contractId ? 
      getContractConfig({ headers: { 'X-Contract-Id': contractId } }) : 
      getContractConfig();
    const response = await clientApi.post('/api/v1/Poi/SearchOrganizationPoi', request, config);
    
    return response.data;
  } catch (error: any) {
    console.error('Organization POI API error:', error);
    throw error;
  }
};

// Add Organization POI request interface
export interface AddOrganizationPoiRequest {
  englishName: string;
  arabicName: string;
  description: string;
  latitude: string;
  longitude: string;
  address: string;
}

// Add Organization POI response type
export type AddOrganizationPoiResponse = string; // Returns POI ID directly

// Add Organization POI Images request interface
export interface AddOrganizationPoiImagesRequest {
  organizationPoiId: string;
  imageFiles: File[]; // binary files
}

// Update Organization POI request interface
export interface UpdateOrganizationPoiRequest {
  organizationPoiId: string;
  englishName: string;
  arabicName: string;
  description: string;
  latitude: string;
  longitude: string;
  address: string;
}

// Update Organization POI response type
export interface UpdateOrganizationPoiResponse {
  isSuccess: boolean;
  error?: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// Delete Organization POI request interface
export interface DeleteOrganizationPoiRequest {
  organizationPoiId: string;
}

// Get Organization POI Details request interface
export interface GetOrganizationPoiDetailsRequest {
  id: string;
}

// Get Organization POI Details response type
export interface GetOrganizationPoiDetailsResponse {
  value: OrganizationPoiItem;
  isSuccess: boolean;
  error?: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// Delete Organization POI response type
export interface DeleteOrganizationPoiResponse {
  isSuccess: boolean;
  error?: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// API function to add new organization POI
export const addOrganizationPoi = async (
  request: AddOrganizationPoiRequest,
  contractId?: string
): Promise<AddOrganizationPoiResponse> => {
  try {
    const config = contractId ? { headers: { 'X-Contract-Id': contractId } } : {};
    const response = await clientApi.post('/api/v1/Poi/AddOrganizationPoi', request, config);
    
    return response.data;
  } catch (error: any) {
    console.error('Add Organization POI API error:', error);
    throw error;
  }
};

// API function to add organization POI images
export const addOrganizationPoiImages = async (
  request: AddOrganizationPoiImagesRequest,
  contractId?: string
): Promise<any> => {
  try {
    const formData = new FormData();
    
    // Add organizationPoiId field
    formData.append('organizationPoiId', request.organizationPoiId);
    
    // Add each file with indexed field names for ASP.NET Core model binding
    request.imageFiles.forEach((file, index) => {
      formData.append(`imageFiles[${index}]`, file);
    });

    const config = getContractConfig({
      headers: {
        ...(contractId && { 'X-Contract-Id': contractId })
      },
      transformRequest: [(data: any, headers: any) => {
        // Delete Content-Type to let browser set multipart/form-data with boundary
        delete headers['Content-Type'];
        return data;
      }]
    });

    const response = await clientApi.post('/api/v1/Poi/AddOrganizationPoiImages', formData, config);
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// API function to update organization POI
export const updateOrganizationPoi = async (
  request: UpdateOrganizationPoiRequest,
  contractId?: string
): Promise<UpdateOrganizationPoiResponse> => {
  try {
    const config = contractId ? 
      getContractConfig({ headers: { 'X-Contract-Id': contractId } }) : 
      getContractConfig();
    const response = await clientApi.post('/api/v1/Poi/UpdateOrganizationPoi', request, config);
    
    return response.data;
  } catch (error: any) {
    console.error('Update Organization POI API error:', error);
    throw error;
  }
};

// API function to delete organization POI with images
export const deleteOrganizationPoiWithImages = async (
  request: DeleteOrganizationPoiRequest,
  contractId?: string
): Promise<DeleteOrganizationPoiResponse> => {
  try {
    const config = contractId ? 
      getContractConfig({ headers: { 'X-Contract-Id': contractId } }) : 
      getContractConfig();
    const response = await clientApi.post('/api/v1/Poi/DeleteOrganizationPoiWithImages', request, config);
    
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// API function to get organization POI details
export const getOrganizationPoiDetails = async (
  request: GetOrganizationPoiDetailsRequest,
  contractId?: string
): Promise<GetOrganizationPoiDetailsResponse> => {
  try {
    const config = contractId ? 
      getContractConfig({ headers: { 'X-Contract-Id': contractId } }) : 
      getContractConfig();
    const response = await clientApi.get(`/api/v1/Rating/GetOrganizationPoiDetail/${request.id}`, config);
    
    return response.data;
  } catch (error: any) {
    console.error('Get Organization POI Details API error:', error);
    throw error;
  }
};

// Update Organization POI Images request interface
export interface UpdateOrganizationPoiImagesRequest {
  organizationPoiId: string;
  imageFiles: File[]; // New images to replace existing ones
}

// Delete single Organization POI Image request interface
export interface DeleteOrganizationPoiImageRequest {
  poiImageId: string;
}

// API function to update organization POI images (uses AddOrganizationPoiImages which replaces all existing images)
export const updateOrganizationPoiImages = async (
  request: UpdateOrganizationPoiImagesRequest,
  contractId?: string
): Promise<any> => {
  try {
    const formData = new FormData();
    
    // Add organizationPoiId field
    formData.append('organizationPoiId', request.organizationPoiId);
    
    // Add each file with indexed field names for ASP.NET Core model binding
    request.imageFiles.forEach((file, index) => {
      formData.append(`imageFiles[${index}]`, file);
    });

    const config = getContractConfig({
      headers: {
        ...(contractId && { 'X-Contract-Id': contractId })
      },
      transformRequest: [(data: any, headers: any) => {
        // Delete Content-Type to let browser set multipart/form-data with boundary
        delete headers['Content-Type'];
        return data;
      }]
    });

    // Using AddOrganizationPoiImages as backend doesn't have separate update endpoint
    // This will replace all existing images with new ones
    const response = await clientApi.post('/api/v1/Poi/AddOrganizationPoiImages', formData, config);
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// API function to delete a single organization POI image
export const deleteOrganizationPoiImage = async (
  request: DeleteOrganizationPoiImageRequest,
  contractId?: string
): Promise<any> => {
  try {
    const config = contractId ? 
      getContractConfig({ headers: { 'X-Contract-Id': contractId } }) : 
      getContractConfig();
    const response = await clientApi.post('/api/v1/Poi/DeleteOrganizationPoiImage', request, config);
    return response.data;
  } catch (error: any) {
    console.error('Delete Organization POI Image API error:', error);
    throw error;
  }
};

// Function to fetch image as blob and return blob URL
export const fetchImageAsBlob = async (imagePath: string): Promise<string | null> => {
  if (!imagePath) return null;
  
  try {
    const config = getContractConfig({
      responseType: 'blob'
    });
    const response = await clientApi.get(`/api/v1/Images/GetOrganizationLayerImage?imagePath=${imagePath}`, config);
    
    // Create blob URL for the image
    const imageBlob = new Blob([response.data]);
    const imageUrl = URL.createObjectURL(imageBlob);
    
    return imageUrl;
  } catch (error) {
    console.warn('Failed to fetch image:', error);
    return null;
  }
};