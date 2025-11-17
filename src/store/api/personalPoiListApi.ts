import clientApi from "@/axios/clientApi";
import { getContractConfig } from "@/utils/contractIdManager";

//interfaces and endpoints for personal list
export interface CreatePoiList {
    name: string;
    iconName: string;
}

export interface PersonalPoiList {
    id?: string;
    name: string;
    iconName: string;
}

export interface GetPoiListResponse {
    value: PersonalPoiList[];
    isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  },
  isFailure: boolean;
}

export interface EditPoiListRequest {
    listId: string;
    name: string;
    iconName: string;
}

export const createPersonalPoiList = (requset: CreatePoiList) => {
    //create list name
    try{
        const config = getContractConfig();
        const response = clientApi.post('/api/v1/PersonalPoi/CreatePersonalPoiList', requset, config) 
        return response
    }catch(error){
        console.error('error in creating list name', error)
        return error
    }
}

export const getPersonalPoiList = async (): Promise<GetPoiListResponse> =>{
    //get lists details like name, id, icon (without poi details)
    try{
        const config = getContractConfig();
        const response = await clientApi.post('/api/v1/PersonalPoi/GetUserPersonalPoiLists', '', config) 
        return response.data
    }catch(error){
        console.error('error in getting lists', error)
        throw error
    }
}

export const deletePersonalPoiList = (requset: {listId: string}) => {
    //delete list
    try{
        const config = getContractConfig();
        const response = clientApi.post('/api/v1/PersonalPoi/DeletePersonalPoiList', requset, config) 
        return response
    }catch(error){
        console.error('error in deleting list', error)
        return error
    }
}

export const editPersonalPoiList = (requset: EditPoiListRequest) => {
    //edit list
    try{
        const config = getContractConfig();
        const response = clientApi.put('/api/v1/PersonalPoi/EditPersonalPoiList', requset, config) 
        return response
    }catch(error){
        console.error('error in editing list', error)
        return error
    }
}

// Update list icon only
export interface UpdateListIconRequest {
    listId: string;
    iconName: string;
}

export const updateListIcon = (request: UpdateListIconRequest) => {
    try {
        const config = getContractConfig();
        const response = clientApi.put('/api/v1/PersonalPoi/EditPersonalPoiList', {
            listId: request.listId,
            name: '', // We'll need to get the current name first
            iconName: request.iconName
        }, config);
        return response;
    } catch (error) {
        console.error('error in updating list icon', error);
        return error;
    }
}

// Icon mapping for different icon names - only essential icons
export const getIconByName = (iconName: string) => {
    const iconMap: { [key: string]: string } = {
        'default': '🏠',
        'star': '⭐',
        'heart': '❤️',
        'bookmark': '🔖',
        'flag': '🚩',
        'home': '🏡',
        'work': '💼',
        'food': '🍕',
        'shopping': '🛍️',
        'nature': '🌿',
        'sport': '⚽',
        'hospital': '🏥',
        'school': '🎓',
        'car': '🚗',
        'coffee': '☕',
        'family': '👨‍👩‍👧‍👦',
        'love': '💕'
    };
    
    return iconMap[iconName] || iconMap['default'];
};


//interfaces and endpoints for personal poi inside list
export enum PoiType{
    Public = 1,
    Personal = 2,
    Organization = 3
}

export interface AddPoiToList{
    listId: string;
    poiId: string;
    poiType: PoiType
}

export interface PoiInList{
    poiId: string;
    poiType: PoiType;
    arabicName: string;
    englishName: string;
    latitude: number;
    longitude: number;
    placeType: string | null;
    images: string[]
}

export interface PoiDetailsInList{
    listId: string
    name: string; //list name
    items: PoiInList[];
}


export interface PoiDetailsResponse {
    value: PoiDetailsInList;
    isSuccess: boolean;
    error: {
        errorCode: string;
        description: string;
        errorType: number;
    };
    isFailure: boolean;
}

export interface GetPoiInListResponse {
    value: PoiDetailsResponse;
    isSuccess: boolean;
    error: {
        errorCode: string;
        description: string;
        errorType: number;
    },
    isFailure: boolean;
}

export interface RemovePoiFromList{
    listId: string;
    poiId: string;
}

export const addPoiToList = (requset: AddPoiToList) => {
    //add poi to list  
    try{
        const config = getContractConfig();
        const response = clientApi.post('/api/v1/PersonalPoi/AddPoiToPersonalList', requset, config) 
        return response
    }catch(error){
        console.error('error in adding poi to list', error)
        return error
    }
}

export const getPersonalPoiInList = async (listId: string): Promise<GetPoiInListResponse> =>{
    //get poi in a list
    try{
        const config = getContractConfig({
            params: { listId }
        });
        const response = await clientApi.post('/api/v1/PersonalPoi/GetPersonalPoiListItemsById', '', config) 
        return response.data
    }catch(error){
        console.error('error in getting lists', error)
        throw error
    }
}


export const removePoiFromList = async(requset: RemovePoiFromList) => {
//remove poi from a list
    try{
        const config = getContractConfig();
        const response = await clientApi.post('/api/v1/PersonalPoi/RemovePoiFromPersonalList', requset, config) 
        return response
    }catch(error){
        console.error('error in removing poi to list', error)
        return error
    }
}

// Search Public POIs API
export interface SearchPublicPoisRequest {
    keyword: string;
    pagination: {
        pageNumber: number;
        pageSize: number;
    };
    boundingBox?: {
        minLatitude: number;
        maxLatitude: number;
        minLongitude: number;
        maxLongitude: number;
    };
    scale?: number;
}

export interface SearchPublicPoisAutoCompleteRequest {
    searchText: string;
    latitude: number
    longitude: number
}

export interface PublicPoiSearchResult {
    id: number;
    arabicName: string;
    englishName: string;
    latitude: number;
    longitude: number;
    placeType: string | null;
    // Add other fields as needed based on API response
}

export interface SearchPublicPoisResponse {
    value: {
        items: PublicPoiSearchResult[];
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        pageNumber: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
    };
    isSuccess: boolean;
    error: {
        errorCode: string;
        description: string;
        errorType: number;
    } | null;
    isFailure: boolean;
}

export interface SearchPublicPoisAutoCompleteResponse {
    value: [
    {
        id: number;
        arabicName: string;
        englishName: string;
        latitude: number;
        longitude: number;
        placeType: string | null;
        arabicCity: string;
        englishCity: string;
        categoryId: number;
        searchType: number;
        poiType: number
    }
    ];
    isSuccess: boolean;
    error: {
        errorCode: string;
        description: string;
        errorType: number;
    } | null;
    isFailure: boolean;
}

export const searchPublicPois = async (request: SearchPublicPoisRequest): Promise<SearchPublicPoisResponse> => {
    try {
        const config = getContractConfig();
        const response = await clientApi.post('/api/v1/Poi/SearchPublicPois', request, config);
        return response.data;
    } catch (error) {
        console.error('error in searching public POIs', error);
        throw error;
    }
}

export const searchPublicPoisAutoComplete = async (request: SearchPublicPoisAutoCompleteRequest): Promise<SearchPublicPoisAutoCompleteResponse> => {
    try {
        const config = getContractConfig();
        const response = await clientApi.post('/api/v1/Poi/SearchPoiAutoComplete', request, config);
        return response.data;
    } catch (error) {
        console.error('error in searching public POIs auto complete', error);
        throw error;
    }
}