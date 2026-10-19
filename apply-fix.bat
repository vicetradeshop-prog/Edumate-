@echo off
REM ===========================================================================
REM  EduMate - Correctif "page blanche sur /inscription"
REM
REM  Double-clique sur ce fichier, OU lance-le depuis cmd :
REM      cd C:\Users\lger3\Documents\Downloads\EduMate-projet\edumate
REM      apply-fix.bat
REM
REM  Il applique les 3 modifications puis verifie le resultat.
REM  Des sauvegardes .bak sont creees avant chaque modification.
REM ===========================================================================

setlocal

REM Se place dans le dossier du projet.
REM CORRECTIF : le "cd .." historique supposait que ce fichier vivait dans
REM scripts\ ; il est en realite a la racine, a cote de package.json. Ce "cd .."
REM faisait remonter d'un cran et le script ne trouvait plus package.json.
cd /d "%~dp0"

if not exist "package.json" (
    echo.
    echo [ERREUR] package.json introuvable dans le dossier courant.
    echo Place ce fichier .bat a la racine du projet ^(a cote de package.json^),
    echo ou lance-le depuis le dossier du projet.
    echo.
    pause
    exit /b 1
)

echo.
echo === EduMate : application du correctif /inscription ===
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\apply-fix-inscription.ps1"
set RC=%ERRORLEVEL%

echo.
if %RC%==0 (
    echo ============================================================
    echo  Correctif applique. Commandes a lancer maintenant :
    echo.
    echo     npm run build
    echo     git add .
    echo     git commit -m "fix(routes): boucle de redirection sur /inscription"
    echo     git push
    echo.
    echo  Puis ouvre ton site en navigation privee ^(Ctrl + Maj + N^) :
    echo     https://edumate-w87j.onrender.com/inscription
    echo ============================================================
) else (
    echo [ERREUR] Le correctif n'a pas pu etre applique automatiquement.
    echo Copie le message ci-dessus pour obtenir de l'aide.
)
echo.
pause
endlocal
exit /b %RC%
