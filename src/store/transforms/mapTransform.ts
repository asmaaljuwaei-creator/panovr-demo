import { createTransform } from 'redux-persist';

// Transform للـ map slice لتجاهل mapInstance (تجنب circular structure)
export const mapTransform = createTransform(
  // Transform state on its way to being serialized and persisted
  (inboundState: any) => {
    // إزالة mapInstance من الحالة المحفوظة
    const { mapInstance, ...stateToPersist } = inboundState;
    return stateToPersist;
  },
  // Transform state being rehydrated
  (outboundState: any) => {
    // إضافة mapInstance كـ null عند الاستعادة
    return {
      ...outboundState,
      mapInstance: null
    };
  },
  // Define which reducers this transform is for
  { whitelist: ['map'] }
);
