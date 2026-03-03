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
