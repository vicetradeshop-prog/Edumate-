# -*- coding: utf-8 -*-
"""
Validateur des scripts Windows du projet (.bat et .ps1).

Ce contrôle existe à cause d'un bug réel : `publier.bat` était enregistré en
UTF-8 avec des caractères accentués. Or cmd.exe lit un fichier .bat ligne par
ligne AVANT d'appliquer un éventuel `chcp 65001` : les octets UTF-8 des accents
étaient alors interprétés comme des séparateurs de commandes, ce qui faisait
exécuter des fragments de commentaires en boucle (« 'clic' n'est pas reconnu… »).

Règles vérifiées :
  .bat : ASCII pur, fins de ligne CRLF, pas de BOM, parenthèses équilibrées,
         AUCUNE parenthèse dans un `REM` situé à l'intérieur d'un bloc (ferme le
         bloc prématurément), toutes les étiquettes de `goto` existent,
         `setlocal` présent, aucune commande `chcp` (inutile et risquée),
         terminaison par `exit /b`.
  .ps1 : ASCII pur (BOM UTF-8 autorisée), fins de ligne CRLF, accolades et
         parenthèses équilibrées hors chaînes, aucun `[regex]::Replace` avec
         bloc de script (non supporté par PowerShell 5.1).

Usage : python3 scripts/audit-scripts.py   (outil mainteneur, hors application)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BAT_FILES = ["publier.bat", "apply-fix.bat"]
PS_FILES = ["scripts/apply-fix-inscription.ps1"]


def read_bytes(relative):
    with open(os.path.join(ROOT, relative), "rb") as handle:
        return handle.read()


def strip_ps(code: str) -> str:
    """Neutralise chaînes et commentaires PowerShell en conservant les positions."""
    out = list(code)
    i, n = 0, len(code)

    def blank(start, end):
        for k in range(start, min(end, n)):
            if out[k] != "\n":
                out[k] = " "

    while i < n:
        ch = code[i]
        if code.startswith("<#", i):
            end = code.find("#>", i + 2)
            end = n if end == -1 else end + 2
            blank(i, end); i = end; continue
        if ch == "#":
            end = code.find("\n", i)
            end = n if end == -1 else end
            blank(i, end); i = end; continue
        if code.startswith("@'", i):
            end = code.find("\n'@", i)
            end = n if end == -1 else end + 3
            blank(i, end); i = end; continue
        if code.startswith('@"', i):
            end = code.find('\n"@', i)
            end = n if end == -1 else end + 3
            blank(i, end); i = end; continue
        if ch == "'":
            j = i + 1
            while j < n:
                if code[j] == "'":
                    if j + 1 < n and code[j + 1] == "'":
                        j += 2; continue
                    j += 1; break
                j += 1
            blank(i, j); i = j; continue
        if ch == '"':
            j, depth = i + 1, 0
            while j < n:
                c = code[j]
                if c == "`":
                    j += 2; continue
                if c == "$" and j + 1 < n and code[j + 1] == "(":
                    depth += 1; j += 2; continue
                if c == "(" and depth > 0:
                    depth += 1
                elif c == ")" and depth > 0:
                    depth -= 1
                elif c == '"' and depth == 0:
                    j += 1; break
                j += 1
            blank(i, j); i = j; continue
        i += 1
    return "".join(out)


def audit_bat(relative):
    raw = read_bytes(relative)
    problems = []

    non_ascii = sorted({b for b in raw if b > 127})
    if non_ascii:
        problems.append(
            f"caractères non ASCII (octets {[hex(b) for b in non_ascii[:6]]}) : "
            "cmd.exe les découpe en séparateurs de commandes → boucle d'erreurs"
        )
    if raw.startswith(b"\xef\xbb\xbf"):
        problems.append("BOM UTF-8 présent : cmd.exe affiche un caractère parasite en tête de script")

    body = raw.decode("ascii", errors="replace")
    crlf = body.count("\r\n")
    lf_only = body.count("\n") - crlf
    if lf_only:
        problems.append(f"{lf_only} fin(s) de ligne LF seule(s) : un .bat doit être en CRLF")

    if re.search(r"^\s*chcp\b", body, re.I | re.M):
        problems.append("commande `chcp` présente : inutile en ASCII pur et source d'effets de bord")

    labels = {m.group(1).lower() for m in re.finditer(r"^:([A-Za-z_]\w*)", body, re.M)}
    gotos = {g.lower() for g in re.findall(r"goto\s+:?([A-Za-z_]\w*)", body, re.I)}
    missing = gotos - labels - {"eof"}
    if missing:
        problems.append(f"`goto` vers des étiquettes inexistantes : {sorted(missing)}")

    if not re.search(r"^\s*setlocal\b", body, re.I | re.M):
        problems.append("`setlocal` absent : les variables fuiraient dans la session appelante")

    depth = 0
    for lineno, line in enumerate(body.split("\n"), 1):
        stripped = line.strip()
        if re.match(r"^(REM\b|::)", stripped, re.I):
            # ⚠️ Piège réel, déjà rencontré dans ce projet : une parenthèse non
            # échappée dans un commentaire situé À L'INTÉRIEUR d'un bloc
            # « if (…) » ferme ce bloc prématurément. Les commandes qui suivent
            # sont alors évaluées hors du bloc, les « set » ne s'exécutent plus
            # et le script prend une mauvaise branche — sans aucune erreur de
            # syntaxe visible. Au niveau 0, une parenthèse dans un REM est
            # inoffensive, donc on ne signale que depth > 0.
            if depth > 0 and ("(" in line or ")" in line):
                problems.append(
                    f"ligne {lineno} : parenthèse dans un REM à l'intérieur d'un bloc "
                    "(ferme le bloc prématurément) — échapper avec ^( et ^) "
                    "ou sortir le commentaire du bloc"
                )
            continue
        if re.match(r"^echo\b", stripped, re.I):
            continue
        depth += line.count("(") - line.count(")")
        if depth < 0:
            problems.append(f"parenthèse fermante orpheline ligne {lineno}")
            break
    if depth > 0:
        problems.append(f"parenthèses non fermées (solde {depth})")

    # Un `&` nu sépare deux commandes : dangereux seulement dans un `echo`,
    # où il provoquerait l'exécution du texte affiché. `2>&1` est légitime.
    risky_amp = 0
    for lineno, line in enumerate(body.split("\n"), 1):
        stripped = line.strip()
        if re.match(r"^(REM\b|::)", stripped, re.I):
            continue
        if not re.match(r"^echo\b", stripped, re.I):
            continue
        cleaned = re.sub(r"2>&1", "", stripped)
        cleaned = cleaned.replace("^&", "")
        if re.search(r"(?<!&)&(?!&)", cleaned):
            risky_amp += 1
            problems.append(f"ligne {lineno} : `&` non échappé dans un echo (risque d'exécution)")
    if risky_amp == 0:
        # Contrôle global : aucun `&` nu hors redirection et hors commentaire
        for lineno, line in enumerate(body.split("\n"), 1):
            stripped = line.strip()
            if re.match(r"^(REM\b|::)", stripped, re.I):
                continue
            cleaned = re.sub(r"2>&1", "", stripped).replace("^&", "")
            if re.search(r"(?<!&)&(?!&)", cleaned):
                problems.append(f"ligne {lineno} : `&` nu inattendu (séparateur de commandes)")

    if not re.search(r"exit\s+/b", body, re.I):
        problems.append("aucun `exit /b` : la fenêtre peut rester ouverte ou reboucler")

    return problems


def audit_ps(relative):
    raw = read_bytes(relative)
    problems = []

    has_bom = raw.startswith(b"\xef\xbb\xbf")
    body_bytes = raw[3:] if has_bom else raw
    non_ascii = sorted({b for b in body_bytes if b > 127})
    if non_ascii:
        problems.append(
            f"caractères non ASCII (octets {[hex(b) for b in non_ascii[:6]]}) : "
            "PowerShell 5.1 lit un .ps1 sans BOM en ANSI → texte et motifs corrompus"
        )
    if not has_bom:
        problems.append("BOM UTF-8 absent : recommandé pour PowerShell 5.1 (Windows)")

    body = body_bytes.decode("ascii", errors="replace")
    crlf = body.count("\r\n")
    lf_only = body.count("\n") - crlf
    if lf_only:
        problems.append(f"{lf_only} fin(s) de ligne LF seule(s) : préférer CRLF sur Windows")

    clean = strip_ps(body)
    if clean.count("{") != clean.count("}"):
        problems.append(f"accolades déséquilibrées : {clean.count('{')} × '{{' vs {clean.count('}')} × '}}'")
    if clean.count("(") != clean.count(")"):
        problems.append(f"parenthèses déséquilibrées : {clean.count('(')} vs {clean.count(')')}")

    depth = 0
    for lineno, line in enumerate(clean.split("\n"), 1):
        depth += line.count("{") - line.count("}")
        if depth < 0:
            problems.append(f"accolade fermante orpheline ligne {lineno}")
            break

    if re.search(r"\[regex\]::Replace\([^,]+,[^,]+,\s*\{", clean):
        problems.append("`[regex]::Replace` avec bloc de script : non supporté par PowerShell 5.1")

    return problems


def main():
    print("\n🔎 Audit des scripts Windows")
    failed = 0
    for relative in BAT_FILES:
        path = os.path.join(ROOT, relative)
        if not os.path.exists(path):
            print(f"  ⚠️  {relative} : absent")
            continue
        problems = audit_bat(relative)
        if problems:
            failed += 1
            print(f"  ❌ {relative}")
            for problem in problems:
                print(f"       • {problem}")
        else:
            print(f"  ✅ {relative} : ASCII, CRLF, structure valide")

    for relative in PS_FILES:
        path = os.path.join(ROOT, relative)
        if not os.path.exists(path):
            print(f"  ⚠️  {relative} : absent")
            continue
        problems = audit_ps(relative)
        if problems:
            failed += 1
            print(f"  ❌ {relative}")
            for problem in problems:
                print(f"       • {problem}")
        else:
            print(f"  ✅ {relative} : ASCII + BOM, CRLF, syntaxe valide")

    print()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
