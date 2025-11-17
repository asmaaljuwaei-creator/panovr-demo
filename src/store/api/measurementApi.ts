import clientApi from '../../axios/clientApi';
import { getContractConfig } from '../../utils/contractIdManager';

// Measurement API interfaces
export interface UploadMeasurementsRequest {
  measurement: string;
}

export interface UploadMeasurementsResponse {
  isSuccess: boolean;
  error?: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// API Function for uploading measurements
export const uploadMeasurements = async (measurementData: string): Promise<UploadMeasurementsResponse> => {
  try {
    // Create form data as required by the API
    const formData = new FormData();
    formData.append('form', JSON.stringify({
      measurement: measurementData
    }));

    const config = getContractConfig({
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    const response = await clientApi.post('/api/v1/OrganizationLayers/UploadMeasurements', formData, config);
    
    return response.data;
    
  } catch (error: any) {
    console.error('❌ Upload Measurements API error:', error);
    
    if (error.response) {
      console.error('📥 Error response:', error.response.data);
      console.error('📊 Status:', error.response.status);
      console.error('📋 Headers:', error.response.headers);
    }
    
    throw error;
  }
};
