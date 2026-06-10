import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuiltMe — AI Renovation",
  description: "AI-powered home renovation for Dubai",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
