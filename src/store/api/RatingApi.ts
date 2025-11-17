import clientApi from "@/axios/clientApi";
import { getContractConfig } from "@/utils/contractIdManager";

export type RatingType = 1 | 2 | 3 | 4 | 5

export interface AddRatingApi {
  poiId: string;
  value: number; 
  comment?: string | null;
  userId: string;
  userName: string;
  userEmail: string
}

export interface PoiUserReview {
  userId: string;
  userName: string;
  userEmail: string;
  rating: number;
  comments: string;
}

export interface PoiReviewsResponse {
  value: {
    totalAvgRating: number;
    ratingByScale: {
      [scale: number]: number;
    },
    user: [
      {
        userId: string;
        userName: string;
        userEmail: string;
        rating: number;
        comments: string
      }
    ]
  };
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

export interface GetRatingsbyUserRequest {
  pagination: {
    pageNumber: number,
    pageSize: number
  }
}

export interface GetRatingsbyUserResponse {
  value: {
    items: [
      {
        id: string;
        poiId: string;
        rating: number;
        comment: string;
        submissionDate: string
        status: number
      }
    ],
    totalCount: number,
    pageNumber: number,
    pageSize: number,
    totalPages: number,
    hasPreviousPage: boolean,
    hasNextPage: boolean
  }
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

export const AddRating = (requset: AddRatingApi) => {
  //add rating
  try{
    const config = getContractConfig();
    const response = clientApi.post('/api/v1/Rating/AddRating', requset, config) 
    return response
  }catch(error){
    console.error('error in adding rating', error)
    return error
  }
}

export const getRatingbyPoiId = async (poiId: string): Promise<PoiReviewsResponse>  => {
  //get ratings by poi id
  try{
    const config = getContractConfig();
    const response = await clientApi.get(`/api/v1/Rating/GetRatingByPoiId/${poiId}`, config) 
    return response.data
  }catch(error){
    console.error('error in getting ratings', error)
    throw error
  }
}

export const getRatingbyUserId = async (request: GetRatingsbyUserRequest): Promise<GetRatingsbyUserResponse>  => {
  //get ratings by user id
  try{
    const config = getContractConfig();
    const response = await clientApi.post(`/api/v1/Rating/GetRatingsByUserId`, request, config) 
    return response.data
  }catch(error){
    console.error('error in getting ratings', error)
    throw error
  }
}