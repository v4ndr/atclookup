import type { Metadata } from "next";
import "../globals.css";

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
    <div className="h-full w-full">
      <div className="font-[family-name:var(--font-geist-sans)] w-full h-full flex flex-1 flex-col gap-2 items-center justify-start">
        {children}
      </div>
    </div>
  );
}
