import clientApi from "@/axios/clientApi";
import { getContractConfig } from "@/utils/contractIdManager";

interface SubmittionsRequest  {
  pagination: {
    pageNumber: number;
    pageSize: number
  }
}

export enum SubmissionStatus {
  Pending = 1,
  Approved = 2,
  Rejected = 3
}

export interface SubmittionsItems {
  id: string;
  arabicName: string;
  englishName: string;
  longitude: number;
  latitude: number;
  submissionDate: string;
  status: SubmissionStatus; 
  approvalDate: string | null;
  rejectionComment: string | null;
  imagesURL: string[];
}

export interface SubmittionsResponse {
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  } | null;
  isFailure: boolean;
  value: {
    items: SubmittionsItems[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
}


export const getSubmittions = async (request: SubmittionsRequest): Promise<SubmittionsResponse> => {
  try{
    const config = getContractConfig();
    const response = await clientApi.post(`/api/v1/Poi/GetSubmissions`, request, config);
    return response.data;
  }catch(error){
    console.error('Getting Submittions:', error);
    throw error;
  }
}