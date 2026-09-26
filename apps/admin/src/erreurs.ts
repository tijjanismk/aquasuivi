/// `@refinedev/simple-rest` remonte déjà le `message` du corps de réponse via
/// son intercepteur axios ; on retombe sur `response.data.message` pour les
/// autres chemins.
export function messageErreur(erreur: unknown): string | undefined {
  const e = erreur as
    | { message?: string; response?: { data?: { message?: string } } }
    | undefined;
  return e?.response?.data?.message ?? e?.message ?? undefined;
}
