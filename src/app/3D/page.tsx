"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import graph from "@/data/graph.json";

type Graph = {
  startId: string;
  nodes: Record<
    string,
    {
      imageUrl: string;
      lat?: number;
      lon?: number;
      latitude?: number;
      longitude?: number;
      links: Array<{
        targetId: string;
        yaw: number;
      }>;
    }
  >;
};

// Simple lat/lon to 3D position converter
function latLonToPosition(lat: number, lon: number, scale = 1000): THREE.Vector3 {
  // Simple mercator-like projection
  const x = lon * scale;
  const z = -lat * scale; // Negative Z for proper orientation
  return new THREE.Vector3(x, 0, z);
}

export default function ThreeDPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const bootstrap = graph as unknown as Graph;

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 1000, 10000);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      20000
    );
    camera.position.set(0, 500, 1000);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2; // Don't go below ground

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    scene.add(directionalLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(10000, 10000);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(10000, 100, 0x444444, 0x888888);
    scene.add(gridHelper);

    // Create markers for each panorama node
    const markers: THREE.Mesh[] = [];
    const nodePositions = new Map<string, THREE.Vector3>();

    Object.entries(bootstrap.nodes).forEach(([id, node]) => {
      const lat = (node.lat ?? node.latitude) as number | undefined;
      const lon = (node.lon ?? node.longitude) as number | undefined;

      if (typeof lat === "number" && typeof lon === "number") {
        const position = latLonToPosition(lat, lon);
        nodePositions.set(id, position);

        // Create marker sphere
        const markerGeometry = new THREE.SphereGeometry(20, 16, 16);
        const markerMaterial = new THREE.MeshStandardMaterial({
          color: id === bootstrap.startId ? 0x00ff00 : 0xff6b6b,
          emissive: id === bootstrap.startId ? 0x00ff00 : 0xff6b6b,
          emissiveIntensity: 0.3,
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(position);
        marker.position.y = 10; // Slightly above ground
        marker.userData.nodeId = id;
        scene.add(marker);
        markers.push(marker);

        // Add label
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = 256;
        canvas.height = 64;
        context.fillStyle = "white";
        context.font = "bold 32px Arial";
        context.textAlign = "center";
        context.fillText(id, 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        sprite.position.y = 50;
        sprite.scale.set(100, 25, 1);
        scene.add(sprite);
      }
    });

    // Draw connections between nodes
    Object.entries(bootstrap.nodes).forEach(([id, node]) => {
      const startPos = nodePositions.get(id);
      if (!startPos) return;

      node.links?.forEach((link) => {
        const endPos = nodePositions.get(link.targetId);
        if (!endPos) return;

        const points = [startPos.clone(), endPos.clone()];
        points[0].y = 5;
        points[1].y = 5;

        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0x4ecdc4,
          linewidth: 2,
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);
      });
    });

    // Center camera on data
    if (nodePositions.size > 0) {
      const positions = Array.from(nodePositions.values());
      const center = new THREE.Vector3();
      positions.forEach((pos) => center.add(pos));
      center.divideScalar(positions.length);
      controls.target.copy(center);
      camera.position.set(center.x, 500, center.z + 1000);
    }

    // Raycaster for clicking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onMouseClick(event: MouseEvent) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(markers);

      if (intersects.length > 0) {
        const nodeId = intersects[0].object.userData.nodeId;
        setSelectedNode(nodeId);
        console.log("Selected node:", nodeId);
      }
    }

    window.addEventListener("click", onMouseClick);

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("click", onMouseClick);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [bootstrap]);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* Back button */}
      <button
        onClick={() => (window.location.href = "/")}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 100,
          padding: "10px 18px",
          borderRadius: 8,
          border: "none",
          background: "#555",
          color: "white",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        ← Back to Map
      </button>

      {/* Info panel */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          zIndex: 100,
          padding: "15px 20px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.8)",
          color: "white",
          fontSize: 14,
          maxWidth: 300,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 10 }}>
          3D Panorama Map
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          🔴 Red spheres = Panorama locations
          <br />
          🟢 Green sphere = Start location
          <br />
          🔵 Blue lines = Navigation links
          <br />
          <br />
          🖱️ Click markers to select
          <br />
          🖱️ Drag to rotate view
          <br />
          🖱️ Scroll to zoom
        </div>
        {selectedNode && (
          <div
            style={{
              marginTop: 15,
              paddingTop: 15,
              borderTop: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            <div style={{ fontWeight: "bold", color: "#4ecdc4" }}>
              Selected: {selectedNode}
            </div>
            <div style={{ fontSize: 12, marginTop: 5 }}>
              Links: {bootstrap.nodes[selectedNode]?.links?.length || 0}
            </div>
          </div>
        )}
      </div>

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
