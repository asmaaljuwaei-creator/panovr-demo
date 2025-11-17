## Tech Stack

### Framework & Runtime
- **Next.js 16.0.1** (App Router)
- **React 19.2.0** with TypeScript 5.9.3
- **Node.js 20+**

### 3D & VR Libraries
- **Three.js 0.181.1** - Core 3D rendering
- **@react-three/fiber 9.4.0** - React renderer for Three.js
- **@react-three/drei 10.7.6** - Three.js helpers
- **@react-three/xr 6.6.27** - WebXR integration
- **@enra-gmbh/panolens 0.0.11** - Panorama viewer

### Mapping
- **OpenLayers (ol) 10.7.0** - 2D map rendering

### Styling
- **Tailwind CSS 4** with PostCSS

### Code Quality
- **ESLint 9** with Next.js config
- **TypeScript strict mode** enabled

## Common Commands

```bash
# Development
npm run dev          # Start dev server at http://localhost:3000

# Production
npm run build        # Build for production
npm start            # Start production server

# Code Quality
npm run lint         # Run ESLint
```

## Build Configuration

- **Target**: ES2017
- **Module Resolution**: bundler (Next.js)
- **Path Alias**: `@/*` maps to `./src/*`
- **JSX**: react-jsx (automatic runtime)
- **Strict Mode**: Enabled
