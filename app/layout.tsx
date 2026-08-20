import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Biblioteca de cuentos de Carmen",
  description: "Los cuentos de Carmen y Noé, ordenados y siempre a mano.",
  applicationName: "Mi Biblioteca",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Mi Biblioteca",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
