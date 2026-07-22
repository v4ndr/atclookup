import { type NextRequest } from "next/server";

/**
 * Garde d'accès optionnelle pour les surfaces admin (API + IHM).
 *
 * Si la variable d'environnement ADMIN_TOKEN est définie, chaque appel doit
 * fournir ce token via l'en-tête `x-admin-token` ou le paramètre `?token=`.
 * Si ADMIN_TOKEN n'est pas définie, l'accès est ouvert (pratique en dev) — un
 * avertissement est alors affiché dans l'IHM. En production, définissez
 * ADMIN_TOKEN pour verrouiller l'accès.
 */
export const adminAuthEnabled = (): boolean =>
  Boolean(process.env.ADMIN_TOKEN);

export const isAuthorized = (request: NextRequest): boolean => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true; // pas de token configuré → ouvert
  const provided =
    request.headers.get("x-admin-token") ??
    request.nextUrl.searchParams.get("token");
  return provided === expected;
};
