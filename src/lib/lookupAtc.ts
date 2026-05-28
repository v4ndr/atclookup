import { Binding, SpecialiteGroup } from "@/types/global";

// Facteurs de conversion vers une unité de base par dimension
const MASS_TO_MG: Record<string, number> = {
  g: 1000,
  mg: 1,
  µg: 0.001,
  μg: 0.001,
  microgramme: 0.001,
  microgrammes: 0.001,
};

const VOLUME_TO_ML: Record<string, number> = {
  l: 1000,
  ml: 1,
};

const parseNum = (s: string): number => parseFloat(s.replace(",", "."));

const formatPercent = (n: number): string => {
  const rounded = Math.round(n * 1e8) / 1e8;
  const s = rounded.toFixed(8).replace(/\.?0+$/, "").replace(".", ",");
  return `${s} %`;
};

// Convertit un ratio "X u1 / Y u2" en pourcentage si u1 et u2 sont de même
// dimension (masse ou volume). Retourne null sinon.
const ratioToPercent = (s: string): string | null => {
  const m = s.match(/^([\d.,]+)\s*([a-zµμ]+)\/([\d.,]*)\s*([a-zµμ]+)$/i);
  if (!m) return null;
  const u1 = m[2].toLowerCase();
  const u2 = m[4].toLowerCase();

  let mult: number;
  if (u1 in MASS_TO_MG && u2 in MASS_TO_MG) {
    mult = MASS_TO_MG[u1] / MASS_TO_MG[u2];
  } else if (u1 in VOLUME_TO_ML && u2 in VOLUME_TO_ML) {
    mult = VOLUME_TO_ML[u1] / VOLUME_TO_ML[u2];
  } else {
    return null;
  }

  const num = parseNum(m[1]);
  const denom = m[3] === "" ? 1 : parseNum(m[3]);
  if (!isFinite(num) || !isFinite(denom) || denom === 0) return null;
  return formatPercent(((num * mult) / denom) * 100);
};

const cleanDosageValue = (dosage: string): string => {
  const result = dosage
    .replace(/\s*pour\s+cent\b/gi, "%")
    .replace(/\s*\/\s*/g, "/") // normalise espaces autour des /
    .replace(/(\d+[.,]\d*[1-9])0+/g, "$1") // 1,50 → 1,5 ; 1,500 → 1,5
    .replace(/(\d+)[.,]0+(\s|\/|$)/g, "$1$2") // 1,0 g / 1,0/... / 1,0 → 1
    .replace(/\b1000\s*mg\b/gi, "1 g");

  // "X u1/Y u2" avec unités de même dimension → "Z %"
  // Couvre "1 g/100 g", "20 mg/1 g", "5 mg/100 mg", "1 ml/100 ml"...
  const ratio = ratioToPercent(result);
  if (ratio) return ratio;

  // "X/100 u" (unité du numérateur implicite, sortie typique du SPARQL) → "X %"
  const impliedUnit = result.match(/^([\d.,]+)\/100\s*[a-zµμ]+$/i);
  if (impliedUnit) return `${impliedUnit[1]} %`;

  // "X/100" (ratio pur) → "X %"
  const noUnit = result.match(/^([\d.,]+)\/100$/);
  if (noUnit) return `${noUnit[1]} %`;

  // "X%" ou "X  %" → "X %" (espacement uniforme)
  const pct = result.match(/^([\d.,]+)\s*%$/);
  if (pct) return `${pct[1]} %`;

  return result;
};

const normalizeDosage = (quantite: string, reference?: string): string => {
  if (!reference) return cleanDosageValue(quantite);

  // On essaye d'abord de retirer la référence telle quelle. Si elle n'apparaît
  // pas dans quantite (typos genre "créme" vs "crème"), on retombe sur
  // l'extraction du motif numérique + unité en tête de quantite.
  let pure = quantite.replace(reference, "").trim();
  if (pure === quantite.trim()) {
    const leadingMatch = quantite.match(/^([\d.,]+(?:\s*[a-zµμ]+)?)/i);
    if (leadingMatch) pure = leadingMatch[1].trim();
  }

  const unitMatch = reference.match(/^pour\s+([\d,]+\s*\w+)/);
  if (unitMatch) {
    const unit = unitMatch[1].trim();
    return cleanDosageValue(`${pure}/${unit}`);
  }

  if (reference.match(/^pour\s+un[e]?\s/)) return cleanDosageValue(pure);

  return cleanDosageValue(pure);
};

const UNIT = "(?:mg|g|ml|µg|microgrammes?|UI|MUI|%|pour\\s+cent)";

const extractDosageFromLabel = (label: string): string | null => {
  // Pattern composé : "500 microgrammes/50 microgrammes/dose" ou "100 mg/12,5 mg par mL"
  const compoundMatch = label.match(
    new RegExp(
      `(\\d+[\\d,./]*\\s*${UNIT}\\s*\\/\\s*\\d+[\\d,./]*\\s*${UNIT}(?:\\s*\\/\\s*(?:dose|ml|mL))?)`,
      "i",
    ),
  );
  if (compoundMatch) return cleanDosageValue(compoundMatch[1].trim());

  // Pattern simple : "400 mg", "20 mg/1 ml", "2,5 POUR CENT"
  const simpleMatch = label.match(
    new RegExp(
      `(\\d+[\\d,./]*\\s*(?:${UNIT}|mg\\/ml|mg\\/mL)(?:\\s*\\/\\s*\\d+\\s*m[lL])?)`,
      "i",
    ),
  );
  if (simpleMatch) return cleanDosageValue(simpleMatch[1].trim());

  return null;
};

type RawSpecialite = {
  label: string;
  url: string;
  forme: string;
  voies: Set<string>;
  substances: Set<string>;
  dosages: Set<string>;
};

const loopupAtc = async (atc: string): Promise<SpecialiteGroup[] | Error> => {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

  const urlencoded = new URLSearchParams();
  urlencoded.append(
    "query",
    `PREFIX ansm: <http://data.esante.gouv.fr/ansm/medicament/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?specialite ?label ?forme ?substance ?quantite ?reference ?voie
WHERE {
  ?specialite ansm:codeATC "${atc}" .
  ?specialite rdfs:label ?label .
  
  OPTIONAL { ?specialite ansm:formeManufacturee ?formeURI .
             ?formeURI rdfs:label ?forme . }
  
  OPTIONAL { ?specialite ansm:voie ?voieURI .
             ?voieURI rdfs:label ?voie . }

  OPTIONAL { ?specialite ansm:seComposeDe ?compo .
  
    OPTIONAL { ?compo ansm:substanceActive ?substURI .
               ?substURI rdfs:label ?substance . }
    
    OPTIONAL { ?compo ansm:expressionDeDosage ?dosageURI .
               ?dosageURI ansm:expressionQuantite ?quantite .
               OPTIONAL { ?dosageURI ansm:referenceDosage ?reference . } }
  }

  FILTER NOT EXISTS { ?specialite ansm:dateFin ?dateFin }
}
LIMIT 200`,
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
      requestOptions,
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const bindings: Binding[] = data.results.bindings;

    if (bindings.length === 0) {
      return [];
    }

    // Étape 1 : agréger par spécialité
    const bySpecialite = new Map<string, RawSpecialite>();

    for (const binding of bindings) {
      const uri = binding.specialite.value;
      const match = uri.match(/SpecialitePharmaceutique_(\d{8})/);
      const CIS = match ? match[1] : null;

      if (!bySpecialite.has(uri)) {
        bySpecialite.set(uri, {
          label: binding.label.value,
          url: `https://base-donnees-publique.medicaments.gouv.fr/affichageDoc.php?specid=${CIS}&typedoc=R`,
          forme: binding.forme?.value ?? "N/A",
          voies: new Set(),
          substances: new Set(),
          dosages: new Set(),
        });
      }

      const spe = bySpecialite.get(uri)!;

      if (binding.voie?.value) {
        spe.voies.add(binding.voie.value);
      }

      if (binding.substance?.value) {
        spe.substances.add(binding.substance.value);
      }

      if (binding.quantite?.value) {
        const dosage = normalizeDosage(
          binding.quantite.value,
          binding.reference?.value,
        );
        spe.dosages.add(dosage);
      }
    }

    // Étape 2 : grouper par substance + dosage + forme + voie
    // A specialite with N voies produces N group entries (one per voie).
    const groups = new Map<string, SpecialiteGroup>();

    for (const spe of bySpecialite.values()) {
      const substance = [...spe.substances].sort().join(" + ") || "Inconnu";

      const dosage =
        [...spe.dosages].sort().join(" + ") ||
        extractDosageFromLabel(spe.label) ||
        "N/A";

      const voies = spe.voies.size > 0 ? [...spe.voies] : ["N/A"];

      for (const voie of voies) {
        // When dosage is unknown we can't safely group (different dosages would be conflated),
        // so each specialite becomes its own group via the unique URL.
        const key =
          dosage === "N/A"
            ? `${substance}|N/A|${spe.forme}|${voie}|${spe.url}`
            : `${substance}|${dosage}|${spe.forme}|${voie}`;

        if (!groups.has(key)) {
          groups.set(key, {
            substance,
            dosage,
            forme: spe.forme,
            voie,
            specialites: [],
          });
        }

        groups.get(key)!.specialites.push({
          label: spe.label,
          url: spe.url,
        });
      }
    }

    return Array.from(groups.values());
  } catch (error) {
    console.error(error);
    return error as Error;
  }
};

export default loopupAtc;
