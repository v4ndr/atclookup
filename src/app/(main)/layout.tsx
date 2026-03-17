import type { Metadata } from "next";
import "../globals.css";
import About from "@/components/About";

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
    <div className="grid grid-rows-[1fr_80px] w-full max-w-[1000px]">
      <div className="row-start-1 font-[family-name:var(--font-geist-sans)] w-full h-full flex flex-1 flex-col gap-8 max-w-[1000px] items-center justify-start py-8 sm:pt-16 px-8 sm:px-12">
        {children}
      </div>
      <About className="row-start-2" />
    </div>
  );
}
