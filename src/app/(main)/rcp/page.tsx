import SearchBar from "@/components/SearchBar";
import HomeButton from "@/components/HomeButton";
import RcpViewer from "@/components/RcpViewer";
import RetryButton from "@/components/RetryButton";
import { scrapeRcp } from "@/lib/scrapeRcp";
import { findSiblings } from "@/lib/findSiblings";

type RcpPageProps = {
  searchParams: Promise<{ url?: string; atc?: string }>;
};

export default async function RcpPage({ searchParams }: RcpPageProps) {
  const { url, atc } = await searchParams;

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

  let result;
  try {
    result = await scrapeRcp(url);
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
          <p className="mb-6">Veuillez réessayer plus tard.</p>
          <RetryButton />
        </div>
      </>
    );
  }

  const siblings = atc ? await findSiblings(atc, url) : [];

  return (
    <>
      <div className="flex items-center justify-center space-x-3 w-full">
        <HomeButton />
        <SearchBar fullWidth className="" />
      </div>
      <RcpViewer
        name={result.name}
        sections={result.sections}
        sourceUrl={url}
        siblings={siblings}
      />
    </>
  );
}
