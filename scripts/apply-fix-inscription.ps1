<#
.SYNOPSIS
    EduMate - Applique automatiquement le correctif " page blanche sur /inscription ".

.DESCRIPTION
    Modifie 3 fichiers du projet :
      1. src\client\App.tsx            -> /inscription monte directement le parcours guide
      2. src\client\pages\AuthPage.tsx -> suppression de l'auto-redirection (boucle infinie)
      3. src\client\main.tsx           -> la session est chargee AVANT le montage de l'app

    Proprietes :
      - idempotent   : tu peux le relancer sans risque,
      - prudent      : cree une sauvegarde .bak avant chaque modification,
      - verificateur : controle le resultat et affiche un recapitulatif.

    Utilisation (depuis le dossier du projet, celui qui contient package.json) :
        cd C:\Users\lger3\Documents\Downloads\EduMate-projet\edumate
        powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\apply-fix-inscription.ps1
#>

$ErrorActionPreference = 'Stop'

# Racine du projet = dossier parent de scripts\
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ''
Write-Host '=== EduMate : correctif /inscription ===' -ForegroundColor Cyan
Write-Host "Projet : $root"
Write-Host ''

if (-not (Test-Path (Join-Path $root 'package.json'))) {
    Write-Host 'ERREUR : package.json introuvable ici.' -ForegroundColor Red
    Write-Host 'Lance ce script depuis le dossier du projet, par exemple :'
    Write-Host '  cd C:\Users\lger3\Documents\Downloads\EduMate-projet\edumate'
    exit 1
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$summary = New-Object System.Collections.ArrayList

function Read-Text([string]$path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}
function Write-Text([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}
function Backup-File([string]$path) {
    $bak = "$path.bak"
    if (-not (Test-Path $bak)) { Copy-Item -LiteralPath $path -Destination $bak | Out-Null }
}
function Note([string]$text) { [void]$summary.Add($text) }

# ----------------------------------------------------------------------------
# 1. src\client\App.tsx - route /inscription
# ----------------------------------------------------------------------------
$appPath = Join-Path $root 'src\client\App.tsx'
if (-not (Test-Path $appPath)) { throw "Fichier introuvable : $appPath" }
$app = Read-Text $appPath

# Gere les deux ecritures :
#   <Route path="/inscription" element={<OnboardingPage />} />      (une ligne)
#   <Route path="/inscription" ... > ... </Route>                   (multi-lignes)
# On ancre la fin sur un `/>` ou `</Route>` place en DEBUT de ligne, ce qui
# evite de s'arreter sur le `/>` d'un composant enfant (ex. <AuthPage />).
$routeRegex = '(?m)<Route\s+path="/inscription"[\s\S]*?(?:^[ \t]*/>[ \t]*$|^[ \t]*</Route>[ \t]*$)'

if ($app -match '<Route\s+path="/inscription"\s+element=\{<OnboardingPage\s*/>\s*/>') {
    Note 'App.tsx        : deja corrige (route /inscription)'
}
elseif ([regex]::IsMatch($app, $routeRegex)) {
    Backup-File $appPath
    $newRoute = '<Route path="/inscription" element={<OnboardingPage />} />'.Replace('$', '$$')
    $app = [regex]::Replace($app, $routeRegex, $newRoute, 1)
    Write-Text $appPath $app
    Note 'App.tsx        : CORRIGE (route /inscription)'
}
else {
    throw 'Bloc <Route path="/inscription"> introuvable dans App.tsx'
}

# ----------------------------------------------------------------------------
# 2. src\client\App.tsx - la session n'est plus chargee dans le composant
# ----------------------------------------------------------------------------
$app = Read-Text $appPath
$loadInApp = 'useEffect\(\(\)\s*=>\s*\{\s*void useAuth\.getState\(\)\.loadSession\(\);\s*\},\s*\[\]\);'

if ([regex]::IsMatch($app, $loadInApp)) {
    Backup-File $appPath
    $app = [regex]::Replace($app, $loadInApp, '', 1)
    if ($app -notmatch 'useEffect\(') {
        $app = $app.Replace("import { Suspense, lazy, useEffect } from 'react';", "import { Suspense, lazy } from 'react';")
    }
    Write-Text $appPath $app
    Note 'App.tsx        : CORRIGE (loadSession deplace dans main.tsx)'
}
else {
    Note 'App.tsx        : loadSession deja deplace'
}

# ----------------------------------------------------------------------------
# 3. src\client\pages\AuthPage.tsx - suppression de la boucle de redirection
# ----------------------------------------------------------------------------
$authPath = Join-Path $root 'src\client\pages\AuthPage.tsx'
if (-not (Test-Path $authPath)) { throw "Fichier introuvable : $authPath" }
$auth = Read-Text $authPath

$loopRegex = '(?m)^[ \t]*if \(mode === .signup.\) return <Navigate to="/inscription" replace />;[ \t]*\r?$'

if ([regex]::IsMatch($auth, $loopRegex)) {
    Backup-File $authPath
    $comment = @(
        '  /*',
        '   * Aucune redirection vers /inscription ici : cette route monte directement',
        '   * le parcours guide (OnboardingPage). Une redirection vers sa propre route',
        '   * cree une boucle infinie que React Router interrompt en rendant une page',
        '   * blanche, sans aucune erreur dans la console.',
        '   */'
    ) -join "`n"
    $auth = [regex]::Replace($auth, $loopRegex, $comment.Replace('$', '$$'), 1)
    Write-Text $authPath $auth
    Note 'AuthPage.tsx   : CORRIGE (auto-redirection supprimee)'
}
else {
    Note 'AuthPage.tsx   : deja corrige'
}

# ----------------------------------------------------------------------------
# 4. src\client\main.tsx - session chargee avant le montage
# ----------------------------------------------------------------------------
$mainPath = Join-Path $root 'src\client\main.tsx'
if (-not (Test-Path $mainPath)) { throw "Fichier introuvable : $mainPath" }
$main = Read-Text $mainPath

if ($main -match 'async function bootstrap') {
    Note 'main.tsx       : deja corrige (bootstrap)'
}
else {
    Backup-File $mainPath

    # 4a. Import du magasin d'authentification
    if ($main -notmatch "from '\./lib/store\.js'") {
        $main = $main.Replace("import App from './App.js';", "import App from './App.js';`nimport { useAuth } from './lib/store.js';")
    }

    # 4b. Remplacement du bloc de montage synchrone par un demarrage asynchrone
    $mountRegex = "(?s)if \(!container\) \{.*?String\(error\),\s*\);\s*\}\s*\}"
    if (-not [regex]::IsMatch($main, $mountRegex)) { throw 'Bloc de montage introuvable dans main.tsx' }

    $bootstrap = @(
        'async function bootstrap(): Promise<void> {',
        '  if (!container) {',
        "    showFatalError('EduMate : conteneur racine (#root) introuvable dans index.html.');",
        '    return;',
        '  }',
        '  try {',
        '    // 1) Session etablie (ou constatee absente) AVANT le premier rendu : les',
        '    //    garde-routes disposent immediatement d un etat fiable, ce qui evite',
        '    //    tout flash de redirection au demarrage.',
        '    await useAuth.getState().loadSession();',
        '',
        '    // 2) Montage de l application.',
        '    createRoot(container).render(',
        '      <StrictMode>',
        '        <App />',
        '      </StrictMode>,',
        '    );',
        '    mounted = true;',
        '    window.clearTimeout(watchdog);',
        '  } catch (error) {',
        '    showFatalError(',
        "      'EduMate n a pas pu demarrer.',",
        '      error instanceof Error ? error.message : String(error),',
        '    );',
        '  }',
        '}',
        '',
        'void bootstrap();'
    ) -join "`n"

    $main = [regex]::Replace($main, $mountRegex, $bootstrap.Replace('$', '$$'), 1)
    Write-Text $mainPath $main
    Note 'main.tsx       : CORRIGE (session chargee avant montage)'
}

# ----------------------------------------------------------------------------
# Recapitulatif et verifications
# ----------------------------------------------------------------------------
Write-Host ''
Write-Host '--- Modifications ---' -ForegroundColor Cyan
foreach ($line in $summary) { Write-Host "  $line" }

$appNow = Read-Text $appPath
$authNow = Read-Text $authPath
$mainNow = Read-Text $mainPath

$checks = @(
    @{ ok = [bool]($appNow  -match '<Route path="/inscription" element=\{<OnboardingPage />\} />'); label = '/inscription monte le parcours guide' },
    @{ ok = [bool]($appNow  -match '<Route path="/bienvenue" element=\{<OnboardingPage />\} />');   label = '/bienvenue toujours present' },
    @{ ok = -not [regex]::IsMatch($authNow, 'if \(mode === .signup.\) return <Navigate');          label = 'plus d auto-redirection (boucle supprimee)' },
    @{ ok = [bool]($mainNow -match 'async function bootstrap');                                    label = 'main.tsx demarre via bootstrap()' },
    @{ ok = [bool]($mainNow -match 'await useAuth\.getState\(\)\.loadSession\(\)');                label = 'session chargee avant montage' },
    @{ ok = -not [regex]::IsMatch($appNow, 'void useAuth\.getState\(\)\.loadSession');             label = 'App ne recharge plus la session' },
    @{ ok = [bool]($appNow  -match "import OnboardingPage from './pages/OnboardingPage.js';");     label = 'import OnboardingPage present' }
)

Write-Host ''
Write-Host '--- Verifications ---' -ForegroundColor Cyan
$allOk = $true
foreach ($c in $checks) {
    if ($c.ok) { Write-Host ("  [OK]    " + $c.label) -ForegroundColor Green }
    else { Write-Host ("  [ECHEC] " + $c.label) -ForegroundColor Red; $allOk = $false }
}

Write-Host ''
if ($allOk) {
    Write-Host 'Correctif applique avec succes.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Commandes suivantes :' -ForegroundColor Yellow
    Write-Host '  npm run build'
    Write-Host '  git add .'
    Write-Host '  git commit -m "fix(routes): boucle de redirection sur /inscription"'
    Write-Host '  git push'
    exit 0
}

Write-Host 'Certaines verifications ont echoue.' -ForegroundColor Red
Write-Host 'Retour arriere possible avec les sauvegardes .bak :'
Write-Host '  copy /Y src\client\App.tsx.bak src\client\App.tsx'
Write-Host '  copy /Y src\client\main.tsx.bak src\client\main.tsx'
Write-Host '  copy /Y src\client\pages\AuthPage.tsx.bak src\client\pages\AuthPage.tsx'
exit 1
