// Leaves room in the 120-char column for a "-<n>" collision suffix.
const MAX_BASE_LENGTH = 100;

/** "Équipe Produit 🚀" -> "equipe-produit". Falls back to "workspace". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug || 'workspace';
}

/**
 * Given a base slug and the existing slugs equal to it or shaped like
 * `<base>-<n>`, returns the base if free, else `<base>-<max n + 1>`
 * (starting at 2).
 */
export function nextSlug(base: string, taken: string[]): string {
  if (!taken.includes(base)) {
    return base;
  }
  const prefix = `${base}-`;
  let max = 1;
  for (const slug of taken) {
    const suffix = slug.slice(prefix.length);
    if (slug.startsWith(prefix) && /^\d+$/.test(suffix)) {
      max = Math.max(max, Number(suffix));
    }
  }
  return `${prefix}${max + 1}`;
}
