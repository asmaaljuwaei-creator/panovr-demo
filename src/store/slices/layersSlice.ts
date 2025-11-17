import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ParsedLayer } from '@/utils/layerParsers';

export interface Layer {
  id: string;
  name: string;
  type: 'geojson' | 'kml' | 'gpx' | 'shapefile' | 'csv';
  visible: boolean;
  data: any;
  parsedData?: ParsedLayer;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
  };
  opacity: number;
  color?: string;
  featureCount?: number;
  clusterSettings?: {
    enabled: boolean;
    distance: number;
    minDistance: number;
  };
  heatMapSettings?: {
    enabled: boolean;
    radius: number;
    blur: number;
    maxZoom: number;
    gradient: { [key: number]: string };
    property?: string; // Property to use for intensity (optional)
    weight: number; // Default weight for points without property
    showAsCluster: boolean; // Show points as clusters or individual points
  };
}

interface LayersState {
  layers: Layer[];
  activeLayerId: string | null;
  selectedLayerId: string | null; // Layer selected for viewing features
  isLoading: boolean;
  error: string | null;
}

const initialState: LayersState = {
  layers: [],
  activeLayerId: null,
  selectedLayerId: null,
  isLoading: false,
  error: null,
};

const layersSlice = createSlice({
  name: 'layers',
  initialState,
  reducers: {
    addLayer: (state, action: PayloadAction<Layer>) => {
      state.layers.push(action.payload);
      state.activeLayerId = action.payload.id;
      // Reset selected layer when adding new layer
      state.selectedLayerId = null;
    },
    
    removeLayer: (state, action: PayloadAction<string>) => {
      state.layers = state.layers.filter(layer => layer.id !== action.payload);
      if (state.activeLayerId === action.payload) {
        state.activeLayerId = state.layers.length > 0 ? state.layers[0].id : null;
      }
    },
    
    toggleLayerVisibility: (state, action: PayloadAction<string>) => {
      const layer = state.layers.find(l => l.id === action.payload);
      if (layer) {
        layer.visible = !layer.visible;
      }
    },
    
    updateLayer: (state, action: PayloadAction<{ id: string; updates: Partial<Layer> }>) => {
      const layer = state.layers.find(l => l.id === action.payload.id);
      if (layer) {
        Object.assign(layer, action.payload.updates);
      }
    },
    
    setActiveLayer: (state, action: PayloadAction<string | null>) => {
      state.activeLayerId = action.payload;
    },
    
    reorderLayers: (state, action: PayloadAction<string[]>) => {
      const newOrder = action.payload;
      state.layers = newOrder.map(id => state.layers.find(l => l.id === id)!).filter(Boolean);
    },
    
    clearAllLayers: (state) => {
      const oldLayerIds = state.layers.map(l => l.id);
      state.layers = [];
      state.activeLayerId = null;
      state.selectedLayerId = null;
      // Mark for immediate cleanup
      (state as any)._forceCleanupNow = true;
      (state as any)._layersToCleanup = oldLayerIds;
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    setSelectedLayer: (state, action: PayloadAction<string | null>) => {
      state.selectedLayerId = action.payload;
    },
    
    replaceAllLayers: (state, action: PayloadAction<Layer>) => {
      // Clear all existing layers and add new one
      const oldLayerIds = state.layers.map(l => l.id);
      state.layers = [action.payload];
      state.activeLayerId = action.payload.id;
      state.selectedLayerId = null;
      // Store old layer IDs for cleanup
      (state as any)._layersToCleanup = oldLayerIds;
    },
    
    clearCleanupFlags: (state) => {
      // Clear cleanup flags
      delete (state as any)._layersToCleanup;
      delete (state as any)._forceCleanupNow;
    },
  },
});

export const {
  addLayer,
  removeLayer,
  toggleLayerVisibility,
  updateLayer,
  setActiveLayer,
  reorderLayers,
  clearAllLayers,
  setLoading,
  setError,
  setSelectedLayer,
  replaceAllLayers,
  clearCleanupFlags,
} = layersSlice.actions;

export default layersSlice.reducer;