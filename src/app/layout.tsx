// src/app/layout.tsx
import type { ReactNode } from "react";

export const metadata = {
  title: "PanoVR Demo",
  description: "Street View + VR viewer",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "#000",
        }}
      >
        {children}
      </body>
    </html>
  );
}
