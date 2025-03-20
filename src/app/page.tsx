import About from "@/components/About";
import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  return (
    <div className="font-[family-name:var(--font-geist-sans)] min-h-screen w-full flex flex-col items-center justify-between">
      <div className="flex flex-1 flex-col w-full gap-8 pb-60 items-center justify-center">
        <Logo />
        <SearchBar />
      </div>
      <About className="py-8" />
    </div>
  );
}
