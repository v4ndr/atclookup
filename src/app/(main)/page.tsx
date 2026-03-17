import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  return (
    <div className="font-[family-name:var(--font-geist-sans)] w-full h-full flex flex-col items-center justify-center gap-8 pb-60">
      <Logo />
      <SearchBar />
    </div>
  );
}
