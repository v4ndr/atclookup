import SearchBar from "@/components/SearchBar";
import HomeButton from "@/components/HomeButton";
import RcpViewer from "@/components/RcpViewer";
import { scrapeRcp } from "@/lib/scrapeRcp";

type RcpPageProps = {
  searchParams: Promise<{ url?: string }>;
};

export default async function RcpPage({ searchParams }: RcpPageProps) {
  const { url } = await searchParams;

  if (!url) {
    return (
      <>
        <div className="flex items-center justify-center space-x-3 w-full">
          <HomeButton />
          <SearchBar fullWidth className="" />
        </div>
        <div className="text-center text-md mt-10">
          <p>URL manquante. Veuillez passer par la page de résultats.</p>
        </div>
      </>
    );
  }

  let sections;
  try {
    sections = await scrapeRcp(url);
  } catch {
    return (
      <>
        <div className="flex items-center justify-center space-x-3 w-full">
          <HomeButton />
          <SearchBar fullWidth className="" />
        </div>
        <div className="text-center text-md mt-10">
          <p className="mb-4">
            Impossible de charger le RCP depuis la base de données publique.
          </p>
          <p>Veuillez réessayer plus tard.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-center space-x-3 w-full">
        <HomeButton />
        <SearchBar fullWidth className="" />
      </div>
      <RcpViewer sections={sections} />
    </>
  );
}
