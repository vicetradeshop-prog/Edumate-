# -*- coding: utf-8 -*-
"""
Auditeur des règles de Hooks de React (hooks-after-early-return).

Pourquoi ce contrôle existe
---------------------------
Bug réel introduit puis corrigé dans ce projet : des `useState` / `useEffect` /
`useMemo` avaient été ajoutés DANS `DashboardPage` après les retours anticipés
(`if (progress.loading) return <Loader/>`). Au premier rendu le composant
retournait tôt — les hooks ne s'exécutaient donc pas — puis ils apparaissaient
au second rendu. React signale alors :

    Warning: React has detected a change in the order of Hooks called by …

…et l'état du composant est corrompu (valeurs décalées d'un hook à l'autre).

Ce piège est invisible à la compilation : `tsc` ne connaît pas les règles de
Hooks, et le projet n'embarque pas ESLint. D'où cet auditeur statique, exécuté
par `npm run test:hooks` et intégré à `npm run test:all`.

Règle vérifiée
--------------
Dans le corps d'un composant (fonction au nom en capitale), aucun appel de hook
ne doit apparaître après un `if (…) { return … }` de premier niveau.

Limites assumées : c'est une heuristique, pas une analyse de flux complète. Elle
ne remplace pas `eslint-plugin-react-hooks`, mais elle attrape le cas qui s'est
réellement produit, sans ajouter de dépendance.

Usage : python3 scripts/audit-hooks.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "client")

# Hooks reconnus : ceux de React et ceux du projet.
HOOK_RE = re.compile(
    r"\buse(?:State|Effect|LayoutEffect|Memo|Callback|Ref|ImperativeHandle|"
    r"Context|Reducer|SyncExternalStore|DebugValue|Id|Transition|DeferredValue|"
    r"Api|Auth|Catalog|Feed|Ui|Quiz|DocumentTitle|Debounced|ReducedMotion|"
    r"Action|SearchParams|Navigate|Location|Params)\s*\("
)
# Début d'un composant : fonction au nom commençant par une capitale.
COMPONENT_RE = re.compile(r"^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)")
# Retour anticipé de premier niveau (indenté de 2 espaces).
EARLY_IF_RE = re.compile(r"^  if\s*\(.*\)\s*\{\s*$")
EARLY_RETURN_RE = re.compile(r"^  return\b")


def audit_file(relative):
    path = os.path.join(ROOT, relative)
    try:
        with open(path, encoding="utf-8") as handle:
            lines = handle.read().split("\n")
    except OSError:
        return []

    problems = []
    component = None
    early_line = None
    early_kind = None

    for index, line in enumerate(lines, 1):
        match = COMPONENT_RE.match(line)
        if match:
            # Nouveau composant : on repart de zéro.
            component = match.group(1)
            early_line = None
            early_kind = None
            continue

        if component is None:
            continue

        # Une déclaration de fonction imbriquée (sous-composant, helper) remet
        # le contexte à zéro : ses propres hooks ne sont pas concernés.
        if re.match(r"^\s+(?:const|function)\s+\w+", line) and HOOK_RE.search(line) is None:
            if re.match(r"^\s+(?:function\s+[A-Z]\w*|const\s+[A-Z]\w*\s*=\s*(?:function|\())", line):
                component = None
            continue

        if early_line is None:
            if EARLY_IF_RE.match(line):
                # Un `if` de premier niveau n'est un retour anticipé que s'il
                # contient bien un `return` dans les lignes qui suivent.
                window = "\n".join(lines[index:index + 8])
                if re.search(r"^\s+return\b", window, re.M):
                    early_line = index
                    early_kind = "if (…) { return … }"
            elif EARLY_RETURN_RE.match(line):
                early_line = index
                early_kind = "return …"
            continue

        if HOOK_RE.search(line):
            problems.append(
                f"{relative}:{index} — hook appelé APRÈS un retour anticipé "
                f"(ligne {early_line}, {early_kind}) dans `{component}` : "
                f"{line.strip()[:80]}"
            )
            break

    return problems


def main():
    if not os.path.isdir(SRC):
        print(f"⚠️  Dossier introuvable : {SRC}")
        return 1

    targets = []
    for directory, subdirs, files in os.walk(SRC):
        subdirs[:] = [d for d in subdirs if d != "node_modules"]
        for name in sorted(files):
            if name.endswith((".tsx", ".ts")):
                targets.append(os.path.relpath(os.path.join(directory, name), ROOT).replace(os.sep, "/"))

    all_problems = []
    for relative in sorted(targets):
        all_problems.extend(audit_file(relative))

    print("\n🔎 Audit des règles de Hooks (retours anticipés)")
    print(f"   {len(targets)} fichiers analysés dans src/client")

    if all_problems:
        print(f"\n  ❌ {len(all_problems)} violation(s) :")
        for problem in all_problems:
            print(f"     • {problem}")
        print(
            "\n  Un hook placé après un `return` anticipé ne s'exécute pas au\n"
            "  premier rendu, puis apparaît au suivant : React signale un\n"
            "  changement d'ordre des hooks et l'état du composant est corrompu.\n"
            "  → Déplace TOUS les hooks au début du composant, avant tout return.\n"
        )
        return 1

    print("  ✅ Aucun hook appelé après un retour anticipé.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
