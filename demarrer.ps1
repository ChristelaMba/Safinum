# Demarrage de SAFINUM en une commande (Windows 11, PowerShell).
#   .\demarrer.ps1              serveur sur le port 8000
#   .\demarrer.ps1 -Port 8010   autre port
#   .\demarrer.ps1 -Test        moteur de TEST (ne traduit pas, prefixe seulement) : pour verifier que tout est branche
# Si PowerShell refuse le script : powershell -ExecutionPolicy Bypass -File .\demarrer.ps1
param(
    [int]$Port = 8000,
    [switch]$Test
)

$ErrorActionPreference = "Stop"
$racine = Split-Path -Parent $MyInvocation.MyCommand.Path
$serveur = Join-Path $racine "serveur"

# 1. Trouver un Python entre 3.10 et 3.13
function Trouver-Python {
    foreach ($v in @("3.13", "3.12", "3.11", "3.10")) {
        try {
            $exe = & py "-$v" -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $exe) { return $exe.Trim() }
        } catch { }
    }
    try {
        $info = & python -c "import sys; print(sys.version_info.major, sys.version_info.minor, sys.executable)" 2>$null
        if ($info) {
            $p = $info.Trim().Split(" ", 3)
            if ([int]$p[0] -eq 3 -and [int]$p[1] -ge 10 -and [int]$p[1] -le 13) { return $p[2] }
        }
    } catch { }
    return $null
}

$python = Trouver-Python
if (-not $python) {
    Write-Host "Python 3.10 a 3.13 introuvable. Python 3.14 ou plus recent n'est pas supporte (roues manquantes)." -ForegroundColor Red
    Write-Host "Installez Python 3.12 depuis python.org, puis relancez ce script."
    exit 1
}
Write-Host "Python utilise : $python"

# 2. Environnement et dependances (roues precompilees seulement : aucune compilation)
$venv = Join-Path $serveur ".venv"
$pyVenv = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $pyVenv)) {
    Write-Host "Creation de l'environnement..."
    & $python -m venv $venv
}
Write-Host "Installation des dependances..."
& $pyVenv -m pip install --quiet --only-binary=:all: -r (Join-Path $serveur "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "L'installation a echoue. Verifiez la connexion internet, puis relancez." -ForegroundColor Red
    exit 1
}

# 3. Fichier .env (la cle API se met dedans, jamais dans le depot)
$env_ = Join-Path $serveur ".env"
if (-not (Test-Path $env_)) {
    Copy-Item (Join-Path $serveur ".env.example") $env_
    Write-Host "Fichier .env cree. Ajoutez votre cle dans serveur\.env (voir README)." -ForegroundColor Yellow
}

if ($Test) {
    $env:SAFINUM_MOTEUR = "test"
    Write-Host "MODE TEST : le moteur ne traduit pas, il ajoute seulement un prefixe." -ForegroundColor Yellow
}

# 4. Lancer
Write-Host ""
Write-Host "Etat et diagnostic : http://localhost:$Port/diagnostic"
Write-Host "Pages de test      : http://localhost:$Port/banque/"
Write-Host "Arret              : Ctrl+C"
Write-Host ""
Set-Location $serveur
& $pyVenv -m uvicorn main:app --port $Port
