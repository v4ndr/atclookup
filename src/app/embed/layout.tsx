import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ATC Lookup",
  description: "Accèder aux bases de données du médicament via un code ATC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid grid-rows-[1fr_80px] w-full">
      <div className="row-start-1 font-[family-name:var(--font-geist-sans)] w-full h-full flex flex-1 flex-col gap-8 items-center justify-start">
        {children}
      </div>
    </div>
  );
}
