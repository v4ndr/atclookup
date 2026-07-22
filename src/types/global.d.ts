export type Specialite = {
  label: string;
  url: string;
};

export type SpecialiteGroup = {
  substance: string;
  dosage: string;
  forme: string;
  voie: string;
  specialites: Specialite[];
};

export type Binding = {
  specialite: { value: string };
  label: { value: string };
  forme?: { value: string };
  substance?: { value: string };
  quantite?: { value: string };
  reference?: { value: string };
  voie?: { value: string };
};

// --- Explicabilité (API /api/explain + IHM admin) ---

/** Une transformation unitaire appliquée à une valeur de dosage. */
export type NormalizationStep = {
  rule: string;
  before: string;
  after: string;
};

/** Normalisation d'un dosage brut (quantité + référence) étape par étape. */
export type DosageTrace = {
  rawQuantite: string;
  rawReference: string | null;
  steps: NormalizationStep[];
  result: string;
};

/** Une spécialité agrégée, avec la trace de normalisation de ses dosages. */
export type SpecialiteTrace = {
  uri: string;
  cis: string | null;
  label: string;
  url: string;
  forme: string;
  voies: string[];
  substances: string[];
  dosages: DosageTrace[];
};

/** Un groupe final, avec la clé de regroupement effectivement utilisée. */
export type GroupTrace = SpecialiteGroup & {
  key: string;
};

/** Trace complète du pipeline pour un code ATC. */
export type ExplainTrace = {
  atc: string;
  timestamp: string;
  sparql: {
    endpoint: string;
    query: string;
    httpStatus: number | null;
    durationMs: number;
    bindingCount: number;
    error: string | null;
  };
  rawBindings: Binding[];
  specialites: SpecialiteTrace[];
  groups: GroupTrace[];
};
