import { SpecialiteGroup } from "@/types/global";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import FormeBadges from "@/components/FormeBadges";
import RandomRcpLink from "@/components/RandomRcpLink";

type ResultsProps = {
  atc: string;
  isEmbed?: boolean;
  data: SpecialiteGroup[] | Error;
};

const voieColors: Record<string, string> = {
  orale: "bg-blue-500 text-white",
  intraveineuse: "bg-red-500 text-white",
  "sous-cutanée": "bg-emerald-500 text-white",
  intramusculaire: "bg-orange-500 text-white",
  cutanée: "bg-purple-500 text-white",
  inhalée: "bg-cyan-500 text-white",
  rectale: "bg-amber-600 text-white",
  nasale: "bg-teal-500 text-white",
  ophtalmique: "bg-indigo-500 text-white",
};

const getVoieBadgeClass = (voie: string): string => {
  const key = voie.toLowerCase();
  for (const [k, cls] of Object.entries(voieColors)) {
    if (key.includes(k)) return cls;
  }
  return "bg-gray-500 text-white";
};

/** Voies without a predefined color are bucketed under "Autres". */
const OTHER_VOIE_KEY = "Autres";
const getVoieGroupKey = (voie: string): string => {
  const key = voie.toLowerCase();
  for (const k of Object.keys(voieColors)) {
    if (key.includes(k)) return voie;
  }
  return OTHER_VOIE_KEY;
};

const capitalize = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const unitToMg: Record<string, number> = {
  mcg: 0.001,
  µg: 0.001,
  mg: 1,
  g: 1000,
};

/** Parse un dosage label en valeur mg pour le tri */
const dosageToMg = (dosage: string): number => {
  const match = dosage.match(/([\d.,]+)\s*(mcg|µg|mg|g)\b/i);
  if (!match) return parseFloat(dosage) || 0;
  const value = parseFloat(match[1].replace(",", "."));
  const unit = match[2].toLowerCase();
  return value * (unitToMg[unit] ?? 1);
};

type FlatCard = {
  voie: string;
  voies: Set<string>;
  formes: Set<string>;
  dosage: string;
  molecule: string;
  specialites: { label: string; url: string }[];
};

const Results = ({ atc, isEmbed, data }: ResultsProps) => {
  if (data instanceof Error) {
    return (
      <div className="text-center text-md mt-10">
        <p className="mb-4">
          Une erreur est survenue lors de la récupération des données.
        </p>
        <p>Veuillez réessayer plus tard.</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center text-md mt-10">
        <p>Aucun résultat trouvé.</p>
      </div>
    );
  }

  // Regroupement : molécule → flat cards (voie+dosage), formes mergées
  const byMolecule = new Map<string, Map<string, FlatCard>>();

  for (const group of data) {
    const mol = group.substance;
    if (!byMolecule.has(mol)) byMolecule.set(mol, new Map());
    const cards = byMolecule.get(mol)!;

    const isOtherVoie = getVoieGroupKey(group.voie) === OTHER_VOIE_KEY;
    // "Autres" voies of the same specialite group merge into one card.
    // Main voies stay separate. N/A dosage stays per-specialite.
    const voieKey = isOtherVoie ? OTHER_VOIE_KEY : group.voie;
    const key =
      group.dosage === "N/A"
        ? `${voieKey}|N/A|${group.specialites[0]?.url ?? Math.random()}`
        : `${voieKey}|${group.dosage}`;

    if (!cards.has(key)) {
      cards.set(key, {
        voie: voieKey,
        voies: new Set(),
        formes: new Set(),
        dosage: group.dosage,
        molecule: mol,
        specialites: [],
      });
    }
    const card = cards.get(key)!;
    card.voies.add(group.voie);
    card.formes.add(group.forme);
    // Dedup specialites by URL (a spe with N voies appears N times in `data`).
    const seen = new Set(card.specialites.map((s) => s.url));
    for (const spec of group.specialites) {
      if (!seen.has(spec.url)) {
        card.specialites.push(spec);
        seen.add(spec.url);
      }
    }
  }

  // Trier les molécules : celles avec au moins une voie "principale" d'abord,
  // puis celles n'ayant que des voies "Autres", puis alpha.
  const sortedMolecules = Array.from(byMolecule.entries()).sort(
    ([molA, cardsMapA], [molB, cardsMapB]) => {
      const hasMain = (m: Map<string, FlatCard>) =>
        [...m.values()].some((c) => getVoieGroupKey(c.voie) !== OTHER_VOIE_KEY);
      const aOnlyOther = hasMain(cardsMapA) ? 0 : 1;
      const bOnlyOther = hasMain(cardsMapB) ? 0 : 1;
      if (aOnlyOther !== bOnlyOther) return aOnlyOther - bOnlyOther;
      return molA.localeCompare(molB);
    },
  );

  return (
    <div className="w-full">
      {sortedMolecules.map(([molecule, cardsMap]) => {
        const cards = Array.from(cardsMap.values()).sort((a, b) => {
          const aOrale = a.voie.toLowerCase().includes("orale") ? 0 : 1;
          const bOrale = b.voie.toLowerCase().includes("orale") ? 0 : 1;
          if (aOrale !== bOrale) return aOrale - bOrale;
          const voieCmp = a.voie.localeCompare(b.voie);
          if (voieCmp !== 0) return voieCmp;
          const aNA = a.dosage === "N/A" ? 1 : 0;
          const bNA = b.dosage === "N/A" ? 1 : 0;
          if (aNA !== bNA) return aNA - bNA;
          return dosageToMg(a.dosage) - dosageToMg(b.dosage);
        });

        // Grouper les cards par voie (voies non colorées → "Autres")
        const byVoie = new Map<string, FlatCard[]>();
        for (const card of cards) {
          const groupKey = getVoieGroupKey(card.voie);
          if (!byVoie.has(groupKey)) byVoie.set(groupKey, []);
          byVoie.get(groupKey)!.push(card);
        }

        // Trier les voies : orale d'abord, "Autres" à la fin, le reste alpha
        const sortedVoies = Array.from(byVoie.keys()).sort((a, b) => {
          const aOther = a === OTHER_VOIE_KEY ? 1 : 0;
          const bOther = b === OTHER_VOIE_KEY ? 1 : 0;
          if (aOther !== bOther) return aOther - bOther;
          const aOrale = a.toLowerCase().includes("orale") ? 0 : 1;
          const bOrale = b.toLowerCase().includes("orale") ? 0 : 1;
          if (aOrale !== bOrale) return aOrale - bOrale;
          return a.localeCompare(b);
        });

        return (
          <div key={molecule} className="mb-8">
            <h2 className="text-xl font-bold mb-4">{capitalize(molecule)}</h2>

            <div className="space-y-2">
              {sortedVoies.map((voie) => (
                <details key={voie} open>
                  <summary className="cursor-pointer list-none flex items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
                    <svg
                      className="size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                    <Badge className={getVoieBadgeClass(voie)}>
                      {capitalize(voie)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      ({byVoie.get(voie)!.length})
                    </span>
                  </summary>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 pl-6 pt-2 pb-4">
                    {byVoie.get(voie)!.map((card) => {
                      const isNA = card.dosage === "N/A";
                      const isOther = card.voie === OTHER_VOIE_KEY;
                      const displayDosage = isNA ? "Dosage non spécifié" : card.dosage;
                      const formes = Array.from(card.formes)
                        .map((f) => capitalize(f))
                        .sort();
                      const voies = Array.from(card.voies)
                        .map((v) => capitalize(v))
                        .sort();
                      const cardKey = isNA
                        ? `${card.voie}|NA|${card.specialites[0]?.url}`
                        : `${card.voie}|${card.dosage}`;

                      const cardContent = (
                        <Card className="h-full shadow-none transition-colors cursor-pointer hover:bg-accent">
                          <CardHeader>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                className={`w-fit ${getVoieBadgeClass(card.voie)}`}
                              >
                                {capitalize(card.voie)}
                              </Badge>
                              <Badge variant="outline" className="w-fit">
                                {displayDosage}
                              </Badge>
                            </div>
                            <CardTitle className="text-lg truncate">
                              {isNA
                                ? capitalize(card.specialites[0]?.label ?? molecule)
                                : `${capitalize(molecule)} ${card.dosage}`}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <FormeBadges formes={formes} />
                            {isOther && voies.length > 0 && (
                              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground shrink-0">
                                  Voies :
                                </span>
                                <FormeBadges formes={voies} />
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {isNA ? (
                                <>Cliquez pour accéder au RCP.</>
                              ) : (
                                <>
                                  Il existe{" "}
                                  <span className="font-semibold">
                                    {card.specialites.length} RCP
                                  </span>{" "}
                                  identique{card.specialites.length > 1 ? "s" : ""}{" "}
                                  pour cette combinaison. Cliquez pour accéder à un
                                  RCP aléatoire parmi ces derniers.
                                </>
                              )}
                            </p>
                          </CardContent>
                        </Card>
                      );

                      return (
                        <RandomRcpLink
                          key={cardKey}
                          atc={atc}
                          isEmbed={isEmbed}
                          specialites={card.specialites}
                        >
                          {cardContent}
                        </RandomRcpLink>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Results;
