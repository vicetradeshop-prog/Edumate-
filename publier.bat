@echo off
setlocal EnableExtensions EnableDelayedExpansion
title EduMate - Publication GitHub

REM ===========================================================================
REM  EduMate - Publication sur GitHub en un double-clic
REM
REM  IMPORTANT : ce fichier est volontairement en ASCII pur (sans accent) et
REM  avec des fins de ligne Windows (CRLF). cmd.exe lit un .bat ligne par ligne
REM  AVANT d'appliquer un eventuel "chcp 65001" : tout caractere accentue serait
REM  decoupe en octets parasites pouvant etre interpretes comme des separateurs
REM  de commandes, ce qui provoque des erreurs en boucle.
REM
REM  Ce script :
REM    1. verifie Node.js et Git,
REM    2. verifie qu'il est bien a la racine du projet,
REM    3. bloque la publication si un fichier .env peut partir sur GitHub,
REM       controle delegate a Node (scripts/scan-secrets.mjs --env-check),
REM    4. detecte les cles d'API dans le code (blocage GitHub GH013),
REM    5. installe les dependances si besoin,
REM    6. genere le catalogue puis lance les tests et le build,
REM    7. cree ou repare le depot Git local,
REM    8. cree ou verifie le remote "origin",
REM    9. commite et pousse, avec recuperation des cas classiques.
REM
REM  Usage :
REM    double-clic, ou :  publier.bat
REM    sans les tests  :  publier.bat --rapide
REM
REM  Le controle des secrets reste actif meme en mode --rapide : c'est lui qui
REM  evite le refus de GitHub. Il dure moins d'une seconde.
REM ===========================================================================

set "SKIP_TESTS=0"
if /i "%~1"=="--rapide" set "SKIP_TESTS=1"
if /i "%~1"=="--fast" set "SKIP_TESTS=1"

echo.
echo   EduMate - Publication sur GitHub
echo   --------------------------------
echo.

REM ---------------------------------------------------------------------------
REM 0. Se placer a la racine du projet
REM ---------------------------------------------------------------------------
cd /d "%~dp0"

if not exist "package.json" (
    echo   [ERREUR] package.json introuvable dans :
    echo            %CD%
    echo.
    echo   Ce fichier doit se trouver a la racine du projet EduMate.
    echo   Place "publier.bat" dans le dossier qui contient "package.json".
    goto :echec
)
echo   [1/9] Projet trouve.

REM ---------------------------------------------------------------------------
REM 1. Node.js
REM ---------------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [ERREUR] Node.js est introuvable.
    echo   Installe-le depuis https://nodejs.org ^(version 20 ou plus recente^),
    echo   puis ferme et rouvre cette fenetre.
    goto :echec
)
for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo   [2/9] Node.js : !NODE_VERSION!

REM ---------------------------------------------------------------------------
REM 2. Git
REM ---------------------------------------------------------------------------
where git >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [ERREUR] Git est introuvable.
    echo   Installe-le depuis https://git-scm.com/download/win
    echo   ^(installation par defaut^), puis FERME et rouvre cette fenetre.
    goto :echec
)
for /f "delims=" %%v in ('git --version') do set "GIT_VERSION=%%v"
echo   [3/9] Git : !GIT_VERSION!

REM ---------------------------------------------------------------------------
REM 3. Securite : aucun fichier .env ne doit partir sur GitHub
REM
REM  Historique des deux faux positifs corriges ici :
REM
REM  1) "git check-ignore" renvoie 128 ("not a git repository") tant que le
REM     depot n'existe pas, et le depot n'etait cree qu'a l'etape 7. Un dossier
REM     fraichement extrait du ZIP etait donc declare a tort "non ignore".
REM
REM  2) Apres correctif, le bloc batch echouait ENCORE a tort : un commentaire
REM     "REM ... (fonctionne sans depot)." place a l'interieur du bloc
REM     "if exist .env (" fermait ce bloc prematurement. Les "set" suivants ne
REM     s'executaient jamais, donc le script concluait a tort que .env n'etait
REM     pas ignore. Aucune erreur de syntaxe n'etait signalee, et l'audit du
REM     projet ne voyait rien puisqu'il ignore les lignes de commentaire.
REM     L'audit a ete durci pour detecter cette classe de bug.
REM
REM  Conclusion : ce controle est desormais ENTIEREMENT delegate a Node
REM  (scripts/scan-secrets.mjs --env-check). Le batch ne fait plus aucune
REM  logique sur les fichiers. Node distingue trois cas que le batch melangeait :
REM     - fichier deja suivi par Git  -> danger reel, "git rm --cached"
REM     - aucune regle d'oubli        -> danger reel, ajouter la ligne
REM     - regle appliquee             -> OK, et la regle exacte est affichee
REM ---------------------------------------------------------------------------
echo   [4/9] Verification des fichiers sensibles...

if not exist ".gitignore" (
    echo          .gitignore absent : creation d'un fichier de securite minimal.
    > ".gitignore" echo node_modules/
    >> ".gitignore" echo dist/
    >> ".gitignore" echo dist-test/
    >> ".gitignore" echo .env
    >> ".gitignore" echo .env.local
    >> ".gitignore" echo *.log
    >> ".gitignore" echo *.zip
    >> ".gitignore" echo data/local/
    >> ".gitignore" echo data/generated/
)

REM Le controle est delegate a Node : cmd.exe est trop fragile pour ce travail.
REM Deux pieges reels ont deja produit un faux positif ici :
REM   - "git check-ignore" renvoie 128 hors depot, et 1 des que le fichier est
REM     deja suivi dans l'index, meme si une regle d'oubli existe ;
REM   - un REM contenant des parentheses a l'interieur d'un bloc "if (" ferme
REM     ce bloc trop tot : les "set" suivants ne s'executent jamais, et
REM     l'audit ne le voit pas puisqu'il ignore les lignes de commentaire.
REM Node distingue correctement les trois cas et affiche la regle appliquee.

if not exist "scripts\scan-secrets.mjs" goto :env_sans_node

call node scripts\scan-secrets.mjs --env-check
if errorlevel 1 goto :echec_env
goto :env_fini

:env_sans_node
REM Repli minimal si le script de controle est absent : simple presence.
if exist ".env" (
    echo          [AVERTISSEMENT] scan-secrets.mjs absent : controle .env non effectue.
    echo          Verifie toi-meme que la ligne  .env  figure dans .gitignore.
)

:env_fini

REM ---------------------------------------------------------------------------
REM 4. Cles d'API dans le code : le blocage reel cote GitHub
REM
REM  GitHub "Push Protection" analyse CHAQUE commit du push et refuse l'envoi
REM  des qu'une cle est detectee :
REM      remote: error: GH013: Repository rule violations found
REM  Supprimer la cle du fichier ne suffit PAS : elle reste dans l'historique.
REM  Ce controle local detecte le probleme AVANT le push et explique la marche
REM  a suivre. Il ne bloque jamais sur un .env correctement ignore.
REM ---------------------------------------------------------------------------
echo   [5/9] Recherche de cles d'API dans le projet...

if not exist "scripts\scan-secrets.mjs" (
    echo          scan-secrets.mjs absent : controle ignore.
    goto :apres_scan
)

call node scripts\scan-secrets.mjs
if errorlevel 1 goto :echec_secret
echo          Aucune cle d'API dans les fichiers publies : OK

:apres_scan

REM ---------------------------------------------------------------------------
REM 5. Dependances, catalogue, tests et build
REM ---------------------------------------------------------------------------
if not exist "node_modules" (
    echo.
    echo   [6/9] Installation des dependances...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :echec_build
) else (
    echo   [6/9] Dependances deja installees.
)

if "!SKIP_TESTS!"=="1" (
    echo   [7/9] Tests ignores ^(mode rapide^).
    echo   [8/9] Build ignore ^(mode rapide^).
) else (
    echo   [7/9] Tests automatiques...
    REM CORRECTIF : le catalogue est genere AVANT le test de contenu.
    REM data/generated/ est ignore par git : sur un clone frais le fichier
    REM etait absent, test:content echouait en ENOENT et la publication
    REM s'arretait sur un projet pourtant parfaitement valide.
    call npm run build:data
    if errorlevel 1 goto :echec_build
    call npm run test:unit
    if errorlevel 1 goto :echec_tests
    call npm run test:content
    if errorlevel 1 goto :echec_tests

    echo   [8/9] Build de production...
    call npm run build
    if errorlevel 1 goto :echec_build

    call npm run test:bundle
    if errorlevel 1 goto :echec_tests
)

REM ---------------------------------------------------------------------------
REM 6. Depot Git local : creation ou reparation
REM ---------------------------------------------------------------------------
echo   [9/9] Preparation du depot Git...

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo          Depot Git absent : initialisation...
    git init
    if errorlevel 1 goto :echec
)

git config user.name >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Ton nom n'est pas configure pour Git.
    set /p "GIT_NAME=  Entre ton nom ou pseudo GitHub : "
    if "!GIT_NAME!"=="" set "GIT_NAME=EduMate"
    git config --global user.name "!GIT_NAME!"
)

git config user.email >nul 2>&1
if errorlevel 1 (
    set /p "GIT_MAIL=  Entre ton adresse e-mail : "
    if "!GIT_MAIL!"=="" set "GIT_MAIL=edumate@local"
    git config --global user.email "!GIT_MAIL!"
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_BRANCH=%%b"
if /i not "!CURRENT_BRANCH!"=="main" git branch -M main >nul 2>&1

REM Comportement stable sur Windows : chemins longs et fins de ligne preservees
git config core.longpaths true >nul 2>&1
git config core.autocrlf false >nul 2>&1

REM ---------------------------------------------------------------------------
REM 7. Remote "origin"
REM ---------------------------------------------------------------------------
set "REPO_URL="
for /f "delims=" %%u in ('git config --get remote.origin.url 2^>nul') do set "REPO_URL=%%u"

if "!REPO_URL!"=="" (
    echo.
    echo   Aucun depot distant n'est configure.
    echo   Cree d'abord un depot VIDE sur https://github.com/new
    echo   ^(sans README, sans .gitignore, sans licence^).
    echo.
    set /p "REPO_URL=  Colle l'URL de ton depot GitHub : "
    if "!REPO_URL!"=="" (
        echo   [ERREUR] URL vide : publication annulee.
        goto :echec
    )
    git remote add origin "!REPO_URL!"
    if errorlevel 1 git remote set-url origin "!REPO_URL!"
)
echo          Remote : !REPO_URL!

REM ---------------------------------------------------------------------------
REM 8. Commit
REM ---------------------------------------------------------------------------
git add -A

git diff --cached --quiet
if not errorlevel 1 (
    echo          Aucune modification a publier.
    echo.
    set /p "PUSH_ANYWAY=  Pousser quand meme les commits existants ? ^(O/N^) : "
    if /i not "!PUSH_ANYWAY!"=="O" goto :fin_ok
    goto :push
)

echo.
set /p "COMMIT_MSG=  Message du commit ^(Entree = message par defaut^) : "
if "!COMMIT_MSG!"=="" set "COMMIT_MSG=mise a jour du projet EduMate"

git commit -m "!COMMIT_MSG!"
if errorlevel 1 (
    echo   [ERREUR] Le commit a echoue. Lis le message ci-dessus.
    goto :echec
)

REM ---------------------------------------------------------------------------
REM 9. Push avec recuperation automatique
REM ---------------------------------------------------------------------------
:push
echo.
echo   Envoi vers GitHub...

git push -u origin main
if not errorlevel 1 goto :fin_ok

echo          Echec du push standard : tentatives de recuperation...

git fetch origin >nul 2>&1

REM Cas A : le depot distant utilise la branche "master"
git ls-remote --exit-code --heads origin master >nul 2>&1
if not errorlevel 1 (
    echo          Branche distante "master" detectee : renommage local...
    git branch -m master main >nul 2>&1
    git push -u origin main
    if not errorlevel 1 goto :fin_ok
)

REM Cas B : historiques divergents ^(depot recree, ZIP re-extrait...^)
echo.
echo   Les historiques local et distant divergent.
echo   Le depot distant sera REMPLACE par ta version locale.
echo   Ta copie locale contient tout le projet : rien n'est perdu ici.
echo.
set /p "CONFIRM_FORCE=  Tape OUI pour forcer l'envoi : "
if /i not "!CONFIRM_FORCE!"=="OUI" (
    echo   Publication annulee. Tu peux relancer ce script plus tard.
    goto :echec
)

git push --force -u origin main
if not errorlevel 1 goto :fin_ok

echo.
echo   [ERREUR] L'envoi a echoue. Causes frequentes :
echo     - cle d'API detectee par GitHub ^(GH013^) : relis l'etape [5/9]
echo     - authentification : il faut un Personal Access Token ^(scope "repo"^)
echo       https://github.com/settings/tokens
echo     - depot distant introuvable : verifie l'URL avec  git remote -v
echo     - reseau ou proxy : teste  git ls-remote origin
goto :echec

REM ---------------------------------------------------------------------------
REM  Sorties
REM ---------------------------------------------------------------------------
:fin_ok
echo.
echo   ---------------------------------------------
echo    PUBLICATION REUSSIE
echo   ---------------------------------------------
echo.
for /f "delims=" %%u in ('git config --get remote.origin.url 2^>nul') do set "FINAL_URL=%%u"
echo    Depot   : !FINAL_URL!
echo    Branche : main
echo.
echo    Si Render est connecte a ce depot, le deploiement demarre
echo    automatiquement. Suivi : https://dashboard.render.com
echo.
echo    N'oublie pas la cle de l'assistant IA dans Render :
echo      service edumate, onglet Environment, cles AI_PROVIDER et AI_API_KEY
echo    Sans elles, le tuteur integre hors-ligne prend le relais.
echo.
echo    Sante de l'application : https://edumate-w87j.onrender.com/api/health
echo.
pause
endlocal
exit /b 0

:echec_env
echo.
echo   -------------------------------------------------------------
echo    [ERREUR] Un fichier .env n'est pas protege : publication arretee.
echo   -------------------------------------------------------------
echo.
echo   Le detail exact figure juste au-dessus ^(fichier concerne, regle
echo   appliquee ou absente, suivi par Git ou non^).
echo.
echo   Corrections possibles, a la racine du projet :
echo.
echo    - ajouter la ligne au .gitignore :
echo         echo .env^>^>.gitignore
echo.
echo    - si le fichier est deja suivi par Git :
echo         git rm --cached .env
echo.
echo   Puis relance ce script. Controle isole :
echo         node scripts\scan-secrets.mjs --env-check
goto :echec_fin

:echec_secret
echo.
echo   -------------------------------------------------------------
echo    [ERREUR] Cle d'API detectee : publication arretee.
echo   -------------------------------------------------------------
echo.
echo   C'est exactement ce qui faisait refuser le push par GitHub ^(GH013^).
echo   Marche a suivre, dans l'ordre :
echo.
echo    1. REVOQUE la cle signalee ci-dessus.
echo       Elle a deja ete ecrite dans Git : considere-la comme publique.
echo       Groq : https://console.groq.com  puis  API Keys
echo       xAI  : https://console.x.ai     puis  API Keys
echo.
echo    2. RETIRE la cle du code source.
echo       Le projet lit deja la bonne variable, il n'y a rien d'autre a faire :
echo          src/server/lib/config.ts   AI_API_KEY vient de l'environnement
echo       Mets la cle dans ton fichier .env local ^(ignore par git^)
echo       et dans Render, onglet Environment.
echo.
echo    3. PURGE l'historique si la cle apparait dans un commit.
echo       GitHub analyse TOUS les commits du push, pas seulement le dernier :
echo       supprimer la cle du fichier ne suffit donc pas.
echo       Cas simple ^(peu de commits, rien de partage^) :
echo          git checkout --orphan propre
echo          git add -A
echo          git commit -m "feat: EduMate"
echo          git branch -M main
echo          git push --force -u origin main
echo.
echo    4. RELANCE ce script une fois le menage fait.
echo.
echo   Detail complet : node scripts\scan-secrets.mjs
goto :echec_fin

:echec_build
echo.
echo   [ERREUR] Le build a echoue : publication arretee.
echo   Corrige les erreurs affichees ci-dessus puis relance ce script.
goto :echec_fin

:echec_tests
echo.
echo   [ERREUR] Des tests ont echoue : publication arretee.
echo   C'est une securite : on ne pousse jamais du code casse sur GitHub.
echo   Pour publier quand meme en connaissance de cause : publier.bat --rapide
goto :echec_fin

:echec
:echec_fin
echo.
pause
endlocal
exit /b 1
