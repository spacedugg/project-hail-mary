import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DemoBanner } from "@/components/shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "temoa OS",
  description: "Cockpit für Wachstum & Profitabilität auf Amazon",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* App-Frame: der Body scrollt NIE — Banner + Shell füllen den Viewport,
          gescrollt wird nur die Inhaltsfläche neben der Sidebar (bzw. dieser
          Wrapper auf Seiten ohne Sidebar wie /login). */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <DemoBanner />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
