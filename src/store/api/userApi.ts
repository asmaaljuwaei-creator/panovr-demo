import clientApi from '../../axios/clientApi';
import { getContractConfig } from '../../utils/contractIdManager';

// User details response interfaces
export interface UserDetailsResponse {
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
  value: {
    user: {
      userId: string;
      email: string;
      fistNameAr: string;
      lastNameAr: string;
      firstNameEn: string;
      lastNameEn: string;
      mobile: string;
      gender: string;
      dateOfBirth: {
        year: number;
        month: number;
        day: number;
        dayOfWeek: number;
        dayOfYear: number;
        dayNumber: number;
      };
      lastLogin: string;
      username: string;
      userSignupStatus: string;
      userPhotoUrl: string;
      userType: {
        id: string;
        name: string;
        description: string;
      };
    };
    organization: {
      englishName: string;
      arabicName: string;
      shortcutName: string;
      orgCode: string;
      commercialRegistrationNumber: string;
      color: string;
      backgroundImage: string;
    };
    contracts: Array<{
      id: string;
      title: string;
      startDate: string; // API returns date as "YYYY-MM-DD" string
      endDate: string;   // API returns date as "YYYY-MM-DD" string
      contractNumber: string;
      basemapURL: string;
    }>;
  };
}

// User permissions response interface
export interface UserPermissionsResponse {
  value: string[]; // Array of permission strings like "drawing:import", "adding-layer:view"
  isSuccess: boolean;
  error: {
    errorCode: string;
    description: string;
    errorType: number;
  };
  isFailure: boolean;
}

// Organized permissions interface for easier consumption
export interface OrganizedPermissions {
  [feature: string]: {
    actions: string[];
    hasView: boolean;
    hasCreate: boolean;
    hasDelete: boolean;
    hasImport: boolean;
    hasExport: boolean;
    hasRead: boolean;
    hasAdd: boolean;
    hasEdit: boolean;
    hasUpdate: boolean;
    hasGet: boolean;
    hasSearch: boolean;
    hasUpload: boolean;
    hasDownload: boolean;
    isAlwaysVisible: boolean; // للمميزات الدائمة
  };
}

// Define features that should always be visible regardless of permissions
export const ALWAYS_VISIBLE_FEATURES = [
  'UserManagement' // إدارة المستخدم فقط
];

// Feature display names mapping
export const FEATURE_DISPLAY_NAMES = {
  'PersonalPoi': 'المحفوظات',
  'Routing': 'المسارات',
  'Drawings': 'الرسم', 
  'Measurements': 'القياس',
  'UserProfile': 'الملف الشخصي',
  'UserManagement': 'إدارة المستخدم',
  'PublicPoi': 'الأماكن العامة',
  'OrganizationPoi': 'أماكن المؤسسة',
  'OrganizationLayers': 'طبقات المؤسسة',
  'Basemap': 'الخريطة الأساسية',
  'StreetView': 'عرض الشارع'
};

// API function to get logged in user details
export const getLoggedInUserDetails = async (): Promise<UserDetailsResponse> => {
  try {
    const config = getContractConfig();
    const response = await clientApi.get('/api/v1/Users/GetLoggedInUserDetails', config);
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

// Utility function to organize permissions by feature
export const organizePermissions = (permissionStrings: string[]): OrganizedPermissions => {
  const organized: OrganizedPermissions = {};

  // Initialize always visible features first
  ALWAYS_VISIBLE_FEATURES.forEach(feature => {
    organized[feature] = {
      actions: [],
      hasView: true,
      hasCreate: true,
      hasDelete: true,
      hasImport: true,
      hasExport: true,
      hasRead: true,
      hasAdd: true,
      hasEdit: true,
      hasUpdate: true,
      hasGet: true,
      hasSearch: true,
      hasUpload: true,
      hasDownload: true,
      isAlwaysVisible: true,
    };
  });

  permissionStrings.forEach((permission) => {
    const [feature, action] = permission.split(':');
    
    if (!feature || !action) return; // Skip invalid permissions
    
    if (!organized[feature]) {
      organized[feature] = {
        actions: [],
        hasView: false,
        hasCreate: false,
        hasDelete: false,
        hasImport: false,
        hasExport: false,
        hasRead: false,
        hasAdd: false,
        hasEdit: false,
        hasUpdate: false,
        hasGet: false,
        hasSearch: false,
        hasUpload: false,
        hasDownload: false,
        isAlwaysVisible: ALWAYS_VISIBLE_FEATURES.includes(feature),
      };
    }

    // Add action to the actions array
    organized[feature].actions.push(action);

    // Set boolean flags for common actions
    const actionLower = action.toLowerCase();
    
    // Map various action names to boolean flags
    if (actionLower.includes('view') || actionLower.includes('get')) {
      organized[feature].hasView = true;
      organized[feature].hasGet = true;
    }
    if (actionLower.includes('create') || actionLower.includes('add')) {
      organized[feature].hasCreate = true;
      organized[feature].hasAdd = true;
    }
    if (actionLower.includes('delete') || actionLower.includes('remove')) {
      organized[feature].hasDelete = true;
    }
    if (actionLower.includes('edit') || actionLower.includes('update')) {
      organized[feature].hasEdit = true;
      organized[feature].hasUpdate = true;
    }
    if (actionLower.includes('search')) {
      organized[feature].hasSearch = true;
    }
    if (actionLower.includes('upload')) {
      organized[feature].hasUpload = true;
    }
    if (actionLower.includes('download')) {
      organized[feature].hasDownload = true;
    }
    if (actionLower.includes('import')) {
      organized[feature].hasImport = true;
    }
    if (actionLower.includes('export')) {
      organized[feature].hasExport = true;
    }
    if (actionLower.includes('read')) {
      organized[feature].hasRead = true;
    }
  });

  return organized;
};

// Helper function to check if a feature is accessible
export const hasFeatureAccess = (
  organizedPermissions: OrganizedPermissions | null,
  featureName: string
): boolean => {
  if (!organizedPermissions) return false;
  
  // Always visible features are always accessible
  if (ALWAYS_VISIBLE_FEATURES.includes(featureName)) {
    return true;
  }
  
  // Check if feature exists in permissions
  return !!organizedPermissions[featureName];
};

// Helper function to check if a specific action is allowed for a feature
export const hasFeatureAction = (
  organizedPermissions: OrganizedPermissions | null,
  featureName: string,
  action: string
): boolean => {
  if (!organizedPermissions) return false;
  
  // Always visible features have all actions allowed
  if (ALWAYS_VISIBLE_FEATURES.includes(featureName)) {
    return true;
  }
  
  const feature = organizedPermissions[featureName];
  if (!feature) return false;
  
  // Check if the specific action exists
  return feature.actions.some(a => a.toLowerCase().includes(action.toLowerCase()));
};

// Helper function to get feature display name
export const getFeatureDisplayName = (featureName: string): string => {
  return FEATURE_DISPLAY_NAMES[featureName as keyof typeof FEATURE_DISPLAY_NAMES] || featureName;
};

// Helper function to get all accessible features
export const getAccessibleFeatures = (
  organizedPermissions: OrganizedPermissions | null
): string[] => {
  if (!organizedPermissions) return ALWAYS_VISIBLE_FEATURES;
  
  const accessibleFeatures = new Set(ALWAYS_VISIBLE_FEATURES);
  
  // Add features that have permissions
  Object.keys(organizedPermissions).forEach(feature => {
    if (organizedPermissions[feature].actions.length > 0) {
      accessibleFeatures.add(feature);
    }
  });
  
  return Array.from(accessibleFeatures);
};

// Helper function to check if user has any permissions for organization features
export const hasOrganizationAccess = (
  organizedPermissions: OrganizedPermissions | null
): boolean => {
  if (!organizedPermissions) return false;
  
  const orgFeatures = ['OrganizationPoi', 'OrganizationLayers'];
  return orgFeatures.some(feature => 
    organizedPermissions[feature] && organizedPermissions[feature].actions.length > 0
  );
};

// Helper function to check if user has admin permissions
export const hasAdminAccess = (
  organizedPermissions: OrganizedPermissions | null
): boolean => {
  if (!organizedPermissions) return false;
  
  const adminFeatures = ['UserManagement'];
  return adminFeatures.some(feature => 
    organizedPermissions[feature] && organizedPermissions[feature].actions.length > 0
  );
};

// API function to get user permissions for a specific contract
export const getUserPermissions = async (contractId: string): Promise<UserPermissionsResponse> => {
  try {
    const config = getContractConfig({
      headers: {
        'X-Contract-Id': contractId,
      },
    });
    const response = await clientApi.get('/api/v1/Users/GetUserPermissions', config);
    return response.data;
  } catch (error: any) {
    throw error;
  }
}; 