import SearchBar from "@/components/SearchBar";
import Results from "@/components/Results";
import HomeButton from "@/components/HomeButton";
import lookupAtc from "@/lib/lookupAtc";

type HomeProps = {
  searchParams: Promise<{ atc: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const atc = (await searchParams).atc;
  const results = await lookupAtc(atc);
  return (
    <div className="font-[family-name:var(--font-geist-sans)] min-h-screen flex flex-col gap-8 items-center justify-flex py-16 px-32">
      <div className="flex items-center justify-center space-x-3 w-full">
        <HomeButton />
        <SearchBar fullWidth className="" />
      </div>
      <Results data={results} />
    </div>
  );
}
