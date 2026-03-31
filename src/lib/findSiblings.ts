import lookupAtc from "@/lib/lookupAtc";

/** Given an ATC code and a selected RCP url, return the sibling specialites from the same group */
export async function findSiblings(
  atc: string,
  selectedUrl: string,
): Promise<{ label: string; url: string }[]> {
  try {
    const results = await lookupAtc(atc);
    if (results instanceof Error) return [];

    for (const group of results) {
      const match = group.specialites.find((s) => s.url === selectedUrl);
      if (match) return group.specialites;
    }

    return [];
  } catch {
    return [];
  }
}
