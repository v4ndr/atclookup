import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen box-border flex justify-center `}
      >
        <div className="font-[family-name:var(--font-geist-sans)] w-full h-full flex flex-1 flex-col gap-8 max-w-[1200px] items-center justify-center py-8 sm:pt-16 px-8 sm:px-32">
          {children}
        </div>
      </body>
    </html>
  );
}
