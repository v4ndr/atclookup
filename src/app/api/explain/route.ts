import { type NextRequest } from "next/server";
import { explainAtc, explainDosage } from "@/lib/lookupAtc";
import { isAuthorized } from "@/lib/adminAuth";
import formatQuery from "@/lib/formatQuery";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * API d'explicabilité.
 *
 *  - GET /api/explain?atc=CODE
 *      Trace complète du pipeline pour un code ATC : requête SPARQL envoyée au
 *      SMT, bindings bruts, agrégation par spécialité avec les étapes de
 *      normalisation de chaque dosage, et regroupement final avec les clés.
 *
 *  - GET /api/explain?dosage=STRING[&reference=STRING]
 *      Bac à sable : normalise une valeur de dosage isolée, étape par étape,
 *      sans appel réseau. Utile pour déboguer les regex de normalisation.
 *
 * Protégé par ADMIN_TOKEN si défini (en-tête x-admin-token ou ?token=).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ error: "Non autorisé (ADMIN_TOKEN requis)." }, 401);
  }

  const params = request.nextUrl.searchParams;
  const dosage = params.get("dosage");
  const atc = params.get("atc");

  // Mode bac à sable : normalisation d'un dosage isolé.
  if (dosage !== null) {
    const reference = params.get("reference") ?? undefined;
    return json({ mode: "normalize", normalization: explainDosage(dosage, reference) });
  }

  if (!atc) {
    return json(
      { error: "Paramètre requis : ?atc=CODE ou ?dosage=STRING" },
      400,
    );
  }

  const normalizedAtc = formatQuery(atc);
  const trace = await explainAtc(normalizedAtc);
  return json({ mode: "atc", trace });
}
