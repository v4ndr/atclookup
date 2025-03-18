import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  return (
    <div className="font-[family-name:var(--font-geist-sans)] min-h-screen flex flex-col gap-8 items-center justify-center pb-60">
      <Logo />
      <SearchBar />
    </div>
  );
}
