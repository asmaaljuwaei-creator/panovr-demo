## Project Structure

```
panovr-demo/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── 3D/          # 3D-related routes
│   │   ├── api/         # API routes (proxy endpoints)
│   │   ├── layout.tsx   # Root layout
│   │   └── page.tsx     # Main page (map + panorama viewer)
│   ├── components/       # React components
│   │   ├── BaseMap.tsx           # OpenLayers 2D map
│   │   ├── PanoramaVR.tsx        # Main VR panorama viewer
│   │   ├── PanPad.tsx            # Pan control UI
│   │   ├── RightRailControls.tsx # Side panel controls
│   │   ├── VrSettingsPanel.tsx   # VR settings UI
│   │   ├── webxr-controller.ts   # WebXR controller logic
│   │   ├── useStreetViewMap.ts   # Map hook
│   │   └── getMapFormattedBounds.ts
│   └── data/             # Static data
│       └── graph.json    # Panorama graph (nodes, links, GPS)
├── public/               # Static assets
│   ├── panos/           # Panorama images
│   └── *.png, *.svg     # UI icons
├── .kiro/               # Kiro AI steering rules
└── .next/               # Next.js build output (gitignored)
```

## Architecture Patterns

### Component Organization
- **Client Components**: All interactive components use `"use client"` directive
- **Separation of Concerns**: Map logic separate from VR viewer logic
- **Ref-based Integration**: Three.js/Panolens managed via refs, not React state

### State Management
- Local React state with hooks (useState, useRef, useEffect)
- No global state library - props drilling for shared state
- Refs for imperative APIs (Three.js, WebXR, DOM manipulation)

### Data Flow
- `graph.json` defines panorama nodes with GPS coordinates and navigation links
- Graph structure: `{ startId, nodes: { [id]: { imageUrl, lat, lon, links } } }`
- Links define yaw-based hotspot navigation between nodes

### Coordinate System
- GPS coordinates stored as `[longitude, latitude]` (lon/lat order)
- Configurable via `coordinateOrder` prop
- Yaw angles in degrees (0-360, 0 = North)

### Image Loading
- Supports string URLs, Blob objects, and cube map arrays
- Blob URL management with revocation queue
- Prefetch cache for adjacent panoramas (LRU eviction)
- API proxy routes for authenticated image fetching

### WebXR Integration
- Separate XR renderer from main Panolens viewer
- Controller input via Gamepad API
- Snap turn and smooth turn support
- A/B button navigation between panoramas
