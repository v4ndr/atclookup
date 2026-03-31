import BackButton from "@/components/BackButton";
import RcpViewer from "@/components/RcpViewer";
import RetryButton from "@/components/RetryButton";
import { scrapeRcp, bdpmPageExists } from "@/lib/scrapeRcp";
import { findSiblings } from "@/lib/findSiblings";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

type RcpPageProps = {
  searchParams: Promise<{ url?: string; atc?: string }>;
};

export default async function RcpPage({ searchParams }: RcpPageProps) {
  const { url, atc } = await searchParams;

  if (!url) {
    return (
      <div className="text-center text-md mt-10">
        <p>URL manquante. Veuillez passer par la page de résultats.</p>
      </div>
    );
  }

  let result;
  try {
    result = await scrapeRcp(url);
  } catch {
    const infoUrl = url.replace("typedoc=R", "typedoc=F");
    const hasInfoPage = await bdpmPageExists(infoUrl);

    return (
      <>
        <div className="w-full">
          <BackButton />
        </div>
        <div className="text-center text-md mt-10 space-y-4">
          {hasInfoPage ? (
            <>
              <p>
                Le RCP de ce médicament est disponible sur le site de
                l&apos;agence européenne des médicaments (EMA).
              </p>
              <div className="flex justify-center gap-3">
                <a href={infoUrl} target="_blank" rel="noopener noreferrer">
                  <Button className="cursor-pointer" variant="outline">
                    <ExternalLink />
                    Voir la fiche info sur la BDPM
                  </Button>
                </a>
              </div>
            </>
          ) : (
            <>
              <p>
                Impossible de charger le RCP depuis la base de données publique.
              </p>
              <p>Veuillez réessayer plus tard.</p>
              <RetryButton />
            </>
          )}
        </div>
      </>
    );
  }

  const siblings = atc ? await findSiblings(atc, url) : [];

  return (
    <>
      <div className="w-full">
        <BackButton />
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
