import { SpecialiteGroup } from "@/types/global";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import FormeBadges from "@/components/FormeBadges";

type ResultsProps = {
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

const pickRandom = <T,>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

type FlatCard = {
  voie: string;
  formes: Set<string>;
  dosage: string;
  molecule: string;
  specialites: { label: string; url: string }[];
};

const Results = ({ data }: ResultsProps) => {
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

    const key = `${group.voie}|${group.dosage}`;
    if (!cards.has(key)) {
      cards.set(key, {
        voie: group.voie,
        formes: new Set(),
        dosage: group.dosage,
        molecule: mol,
        specialites: [],
      });
    }
    const card = cards.get(key)!;
    card.formes.add(group.forme);
    card.specialites.push(...group.specialites);
  }

  return (
    <div className="w-full">
      {Array.from(byMolecule.entries()).map(([molecule, cardsMap]) => {
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

        // Grouper les cards par voie
        const byVoie = new Map<string, FlatCard[]>();
        for (const card of cards) {
          if (!byVoie.has(card.voie)) byVoie.set(card.voie, []);
          byVoie.get(card.voie)!.push(card);
        }

        // Trier les voies : orale d'abord, puis alpha
        const sortedVoies = Array.from(byVoie.keys()).sort((a, b) => {
          const aOrale = a.toLowerCase().includes("orale") ? 0 : 1;
          const bOrale = b.toLowerCase().includes("orale") ? 0 : 1;
          if (aOrale !== bOrale) return aOrale - bOrale;
          return a.localeCompare(b);
        });

        return (
          <div key={molecule} className="mb-8">
            <h2 className="text-xl font-bold mb-4 capitalize">{molecule}</h2>

            <div className="space-y-2">
              {sortedVoies.map((voie, idx) => (
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
                      const picked = pickRandom(card.specialites);
                      const formes = Array.from(card.formes)
                        .map((f) => capitalize(f))
                        .sort();

                      const cardContent = (
                        <Card
                          className={`h-full shadow-none transition-colors ${
                            isNA
                              ? "opacity-50 cursor-default"
                              : "cursor-pointer hover:bg-accent"
                          }`}
                        >
                          <CardHeader>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                className={`w-fit ${getVoieBadgeClass(card.voie)}`}
                              >
                                {capitalize(card.voie)}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="w-fit"
                              >
                                {card.dosage}
                              </Badge>
                            </div>
                            <CardTitle className="text-lg">
                              <span className="capitalize">
                                {molecule}
                              </span>{" "}
                              {card.dosage}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <FormeBadges formes={formes} />
                          </CardContent>
                        </Card>
                      );

                      if (isNA) {
                        return (
                          <div key={`${card.voie}|${card.dosage}`}>
                            {cardContent}
                          </div>
                        );
                      }

                      return (
                        <a
                          key={`${card.voie}|${card.dosage}`}
                          href={picked.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          {cardContent}
                        </a>
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
