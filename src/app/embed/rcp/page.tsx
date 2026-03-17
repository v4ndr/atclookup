import RcpViewer from "@/components/RcpViewer";
import { scrapeRcp } from "@/lib/scrapeRcp";

type RcpPageProps = {
  searchParams: Promise<{ url?: string; siblings?: string }>;
};

export default async function RcpPage({ searchParams }: RcpPageProps) {
  const { url, siblings: siblingsParam } = await searchParams;

  if (!url) {
    return (
      <>
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
        <div className="text-center text-md mt-10">
          <p className="mb-4">
            Impossible de charger le RCP depuis la base de données publique.
          </p>
          <p>Veuillez réessayer plus tard.</p>
        </div>
      </>
    );
  }

  const siblings: { label: string; url: string }[] = siblingsParam
    ? JSON.parse(siblingsParam)
    : [];

  return (
    <>
      <RcpViewer
        name={result.name}
        sections={result.sections}
        sourceUrl={url}
        siblings={siblings}
      />
    </>
  );
}
