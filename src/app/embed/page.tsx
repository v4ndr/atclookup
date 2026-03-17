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
            Aucun résultat pour le code ATC <strong>{atc}</strong>.
          </p>
          <p>Vérifiez le code ATC et réessayez.</p>
        </div>
      ) : (
        <Results data={results} />
      )}
    </>
  );
}
