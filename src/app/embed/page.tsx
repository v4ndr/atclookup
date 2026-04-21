import Results from "@/components/Results";
import lookupAtc from "@/lib/lookupAtc";
import { SpecialiteGroup } from "@/types/global";

type HomeProps = {
  searchParams: Promise<{ atc: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const atc = (await searchParams).atc;
  let results: SpecialiteGroup[] | Error = [];
  try {
    results = await lookupAtc(atc);
  } catch (error) {
    console.error("Error fetching ATC data:", error);
  }

  const hasResults = Array.isArray(results) && results.length > 0;

  return (
    <>
      {!hasResults ? (
        <div className="text-center text-md mt-10">
          <p className="mb-4">
            <strong>Aucun résultat</strong>
          </p>
          <p>
            Nous vous invitons à poursuivre votre recherche sur la{" "}
            <a
              className="underline hover:text-foreground"
              href="https://base-donnees-publique.medicaments.gouv.fr/"
              target="_blank"
              rel="noopener noreferrer"
            >
              base de données publique des médicaments
            </a>
            .
          </p>
        </div>
      ) : (
        <Results atc={atc} isEmbed data={results} />
      )}
    </>
  );
}
