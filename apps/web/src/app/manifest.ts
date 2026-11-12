import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bannerai",
    short_name: "Bannerai",
    description: "AI banner studio. Describe your event or campaign and get a professional, on-brand banner in minutes.",
    start_url: "/create",
    display: "standalone",
    background_color: "#040021",
    theme_color: "#040021",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
