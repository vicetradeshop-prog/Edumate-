/**
 * Stub du moteur « Liquid Glass » pour le bundle de test de rendu (jsdom).
 *
 * jsdom n'a pas de WebGL2 : `LiquidGlassBackground` ne déclenche JAMAIS
 * l'import dynamique de `glassScene.js` dans cet environnement. Ce stub
 * remplace donc le vrai module (et avec lui three.js, ~1 Mo de sources) pour
 * que le bundle de test tienne en mémoire et reste fidèle au comportement
 * observé : `createLiquidGlassScene` renvoie `null` → repli CSS, exactement
 * comme sur une machine sans WebGL2.
 */
export interface LiquidGlassScene {
  setTheme(dark: boolean): void;
  dispose(): void;
}

export function createLiquidGlassScene(): LiquidGlassScene | null {
  return null;
}
