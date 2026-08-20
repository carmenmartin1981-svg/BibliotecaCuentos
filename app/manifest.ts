import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Biblioteca de Cuentos",
    short_name: "Mi Biblioteca",
    description: "Los cuentos de Carmen y Noé, ordenados y siempre a mano.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#e99331",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
