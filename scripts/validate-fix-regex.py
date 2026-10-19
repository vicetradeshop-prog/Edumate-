# -*- coding: utf-8 -*-
"""Valide les expressions régulières du script PowerShell apply-fix-inscription.ps1
en les rejouant à l'identique sur une copie des fichiers « avant correctif »."""
import os
import re
import shutil

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "client")
BASE = "/tmp/fixtest2/src/client"

os.makedirs(BASE + "/pages", exist_ok=True)
for f in ["App.tsx", "main.tsx"]:
    shutil.copy(os.path.join(SRC, f), os.path.join(BASE, f))
shutil.copy(os.path.join(SRC, "pages", "AuthPage.tsx"), os.path.join(BASE, "pages", "AuthPage.tsx"))

# ---------------------------------------------------------------------------
# 1) Recrée l'état « avant correctif » (celui du dépôt de l'utilisateur)
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "App.tsx")
s = open(p, encoding="utf-8").read()
s = s.replace(
    """          {/*
            /inscription ET /bienvenue montent le même parcours guidé :
            anonyme → création de compte en 8-9 étapes ;
            déjà connecté → mise à jour du profil (l'appel API s'adapte).
          */}
          <Route path="/inscription" element={<OnboardingPage />} />""",
    """          <Route
            path="/inscription"
            element={
              <GuestOnly>
                <AuthPage mode="signup" />
              </GuestOnly>
            }
          />""",
)
s = s.replace("import { Suspense, lazy } from 'react';", "import { Suspense, lazy, useEffect } from 'react';")
s = s.replace(
    """export default function App() {
  return (""",
    """export default function App() {
  useEffect(() => {
    void useAuth.getState().loadSession();
  }, []);

  return (""",
)
open(p, "w", encoding="utf-8").write(s)

p = os.path.join(BASE, "pages", "AuthPage.tsx")
s = open(p, encoding="utf-8").read()
s = s.replace(
    """  /*
   * ⚠️ Ne JAMAIS rediriger ici vers la route qui monte ce composant :
   * /inscription affiche directement le parcours guidé (OnboardingPage).
   * Une redirection vers sa propre route crée une boucle infinie que
   * React Router interrompt en rendant une page blanche, sans erreur.
   */
  if (status === 'authenticated') {
    return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/tableau-de-bord'} replace />;
  }""",
    """  if (mode === 'signup') return <Navigate to="/inscription" replace />;
  if (status === 'authenticated') return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/tableau-de-bord'} replace />;""",
)
open(p, "w", encoding="utf-8").write(s)

app_raw = open(os.path.join(BASE, "App.tsx"), encoding="utf-8").read()
auth_raw = open(os.path.join(BASE, "pages", "AuthPage.tsx"), encoding="utf-8").read()
print("état « avant » recréé")
print("  bloc fautif présent    :", 'path="/inscription"' in app_raw and "AuthPage mode=\"signup\"" in app_raw)
print("  boucle AuthPage présente:", "if (mode === 'signup') return <Navigate" in auth_raw)

# ---------------------------------------------------------------------------
# 2) Applique les regex EXACTES du script PowerShell
# ---------------------------------------------------------------------------
print("\n=== [1] Route /inscription ===")
route_regex = r'(?m)<Route\s+path="/inscription"[\s\S]*?(?:^[ \t]*/>[ \t]*$|^[ \t]*</Route>[ \t]*$)'
m = re.search(route_regex, app_raw)
print("  résultat :", "MATCH" if m else "AUCUN")
if m:
    print("  bloc capturé :")
    for line in m.group(0).split("\n"):
        print("     |", line)
    app2 = app_raw[: m.start()] + '<Route path="/inscription" element={<OnboardingPage />} />' + app_raw[m.end() :]
else:
    app2 = app_raw

print("\n=== [2] loadSession retiré de App ===")
load_regex = r"useEffect\(\(\)\s*=>\s*\{\s*void useAuth\.getState\(\)\.loadSession\(\);\s*\},\s*\[\]\);"
m2 = re.search(load_regex, app2)
print("  résultat :", "MATCH" if m2 else "AUCUN")
if m2:
    app2 = re.sub(load_regex, "", app2, count=1)
    if "useEffect(" not in app2:
        app2 = app2.replace("import { Suspense, lazy, useEffect } from 'react';", "import { Suspense, lazy } from 'react';")

print("\n=== [3] Boucle AuthPage supprimée ===")
loop_regex = r'(?m)^[ \t]*if \(mode === .signup.\) return <Navigate to="/inscription" replace />;[ \t]*\r?$'
m3 = re.search(loop_regex, auth_raw)
print("  résultat :", "MATCH" if m3 else "AUCUN")
auth2 = re.sub(loop_regex, "  /* boucle supprimee */", auth_raw, count=1) if m3 else auth_raw

print("\n=== [4] Bloc de montage main.tsx ===")
main_raw = open(os.path.join(BASE, "main.tsx"), encoding="utf-8").read()
# main.tsx du dépôt est déjà corrigé : on recrée l'ancien bloc pour le test
if "async function bootstrap" in main_raw:
    print("  (main.tsx déjà au format bootstrap dans le dépôt — test du motif sur l'ancienne forme)")
    old_form = """if (!container) {
  showFatalError('EduMate : conteneur racine (#root) introuvable dans index.html.');
} else {
  try {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    mounted = true;
    window.clearTimeout(watchdog);
  } catch (error) {
    showFatalError(
      'EduMate n’a pas pu démarrer.',
      error instanceof Error ? error.message : String(error),
    );
  }
}"""
    m4 = re.search(r"(?s)if \(!container\) \{.*?String\(error\),\s*\);\s*\}\s*\}", old_form)
    print("  résultat sur l'ancienne forme :", "MATCH" if m4 else "AUCUN")
    if m4:
        print("  fin du bloc capturé :", repr(m4.group(0)[-50:]))
else:
    m4 = re.search(r"(?s)if \(!container\) \{.*?String\(error\),\s*\);\s*\}\s*\}", main_raw)
    print("  résultat :", "MATCH" if m4 else "AUCUN")

# ---------------------------------------------------------------------------
# 3) Contrôle d'intégrité du résultat
# ---------------------------------------------------------------------------
print("\n=== Intégrité du App.tsx transformé ===")
probes = [
    ('<Route path="/inscription" element={<OnboardingPage />} />', True),
    ('<Route path="/bienvenue" element={<OnboardingPage />} />', True),
    ('path="/connexion"', True),
    ('<AuthPage mode="login" />', True),
    ('AuthPage mode="signup"', False),
    ('path="/inscription"\n            element={\n              <GuestOnly>', False),
    ("void useAuth.getState().loadSession", False),
    ("import { Suspense, lazy } from 'react';", True),
    ("requireAuth", False),
]
ok = True
for probe, expected in probes:
    found = probe in app2
    good = found == expected
    ok = ok and good
    print(f"  [{'OK ' if good else 'KO '}] {'présent' if found else 'absent '} (attendu {'présent' if expected else 'absent '}) : {probe[:60]}")

print("\n=== Résidu autour de /inscription ===")
lines = app2.split("\n")
idx = [n for n, l in enumerate(lines) if "/inscription" in l]
if idx:
    i = idx[0]
    for l in lines[max(0, i - 2) : i + 4]:
        print("   |", l)

print("\n=== AuthPage : plus de boucle ===")
print("  boucle présente :", "if (mode === 'signup') return <Navigate" in auth2)

print("\nRésultat global :", "VALIDÉ ✅" if ok else "ÉCHEC ❌")
