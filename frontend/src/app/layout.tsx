import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NautiCAI | Hull Check",
  description:
    "NautiCAI turns underwater hull footage into clear, plain-language findings for corrosion, marine growth, and damage.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
