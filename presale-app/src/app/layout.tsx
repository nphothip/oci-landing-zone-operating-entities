import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCI Presale Studio — Landing Zone Solution Builder",
  description:
    "Self-service presale tool: OCI landing-zone-aligned BOM, monthly THB pricing (AIS Cloud), 13-view architecture diagrams and LaC package",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
