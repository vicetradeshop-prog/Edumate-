/**
 * EduMate — Validation d'une adresse e-mail, PARTAGÉE serveur / client.
 *
 * Même raison d'être que `shared/password.ts` : le client refuse en direct une
 * adresse que le serveur refuserait de toute façon, et inversement. Deux regex
 * différentes produiraient le pire des comportements — un formulaire accepté
 * côté navigateur puis rejeté en HTTP 400.
 *
 * Règle volontairement SIMPLE et permissive (pas de RFC 5322 complet) :
 *   - un `@` entouré de caractères non-blancs,
 *   - un domaine avec un point et au moins deux lettres.
 * C'est exactement ce qu'accepte l'inscription, donc un élève qui a pu créer son
 * compte pourra toujours demander un lien de réinitialisation.
 */

/** Expression régulière unique, partagée par les deux builds. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Longueur maximale acceptée (borne aussi la taille des clés en base). */
export const EMAIL_MAX_LENGTH = 160;

/** Normalise une adresse : espaces retirés, minuscules. */
export function normalizeEmailValue(value: string): string {
  return String(value ?? '').trim().toLowerCase();
}

/** L'adresse est-elle acceptable ? */
export function isValidEmailValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const email = normalizeEmailValue(value);
  return email.length > 0 && email.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(email);
}

/**
 * Masque une adresse e-mail pour l'afficher sans la révéler entièrement.
 * `camille.dupont@lycee.fr` → `c•••••••••t@lycee.fr`.
 *
 * Placée dans le module PARTAGÉ parce que le serveur l'utilise pour l'indice
 * renvoyé avec un jeton valide, et que le client peut vouloir masquer une
 * adresse affichée ailleurs. Le nombre de points est borné (3 à 10) pour que la
 * longueur réelle du compte local ne soit pas déductible.
 */
export function maskEmailValue(email: string): string {
  const [local = '', domain = ''] = String(email ?? '').split('@');
  if (!local || !domain) return '••••';
  const first = local.slice(0, 1);
  const last = local.length > 1 ? local.slice(-1) : '';
  const dots = '•'.repeat(Math.min(10, Math.max(3, local.length - (last ? 2 : 1))));
  return `${first}${dots}${last}@${domain}`;
}
