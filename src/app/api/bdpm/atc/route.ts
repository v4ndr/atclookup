import { type NextRequest } from "next/server";
import { Binding } from "./type";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const atc = searchParams.get("code");
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

  const urlencoded = new URLSearchParams();
  urlencoded.append(
    "query",
    `PREFIX ansm: <http://data.esante.gouv.fr/ansm/medicament/>\nPREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n\nSELECT ?specialite ?label\nWHERE {\n  ?specialite ansm:codeATC "${atc}" .\n  ?specialite rdfs:label ?label .\n  FILTER NOT EXISTS { ?specialite ansm:dateFin ?dateFin }\n}\nLIMIT 100`
  );

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: urlencoded,
    redirect: "follow" as RequestRedirect,
  };

  try {
    const response = await fetch(
      "https://smt.esante.gouv.fr/api/sparql",
      requestOptions
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const bindings = data.results.bindings;
    if (bindings.length === 0) {
      return new Response("No data found", { status: 404 });
    }
    const formatedData = bindings.map((binding: Binding) => {
      const match = binding.specialite.value.match(
        /SpecialitePharmaceutique_(\d{8})/
      );
      const CIS = match ? match[1] : null;
      return {
        url: `https://base-donnees-publique.medicaments.gouv.fr/affichageDoc.php?specid=${CIS}&typedoc=R`,
        label: binding.label.value,
      };
    });

    return new Response(JSON.stringify(formatedData));
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify(error));
  }
}
