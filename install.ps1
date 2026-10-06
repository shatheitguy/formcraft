# FormCraft installer for Windows (PowerShell 5.1+) — interactive Docker setup.
#
#   One-liner:  irm https://raw.githubusercontent.com/shatheitguy/formcraft/main/install.ps1 | iex
#   From repo:  .\install.ps1            (add -Yes to accept all defaults, -DryRun to only write .env)
#
# Asks which database to use (bundled PostgreSQL, your own PostgreSQL, or embedded SQLite),
# the ports to use, and whether to load demo data. Writes everything to .env and starts
# the stack with Docker Compose.

$ErrorActionPreference = 'Stop'
# Works both as a file (.\install.ps1 -Yes) and via `irm | iex` (set $env:FC_YES=1 / $env:FC_DRY_RUN=1).
$AssumeYes = ($args -contains '-Yes') -or ($env:FC_YES -eq '1')
$DryRun = ($args -contains '-DryRun') -or ($env:FC_DRY_RUN -eq '1')
$RawUrl = if ($env:FORMCRAFT_RAW) { $env:FORMCRAFT_RAW } else { 'https://raw.githubusercontent.com/shatheitguy/formcraft/main' }
$Image = 'ghcr.io/shatheitguy/formcraft'
$InstallDir = if ($env:FORMCRAFT_DIR) { $env:FORMCRAFT_DIR } else { 'formcraft' }

function Info($m) { Write-Host "> $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "OK $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!  $m" -ForegroundColor Yellow }
function Die($m) { Write-Host "X  $m" -ForegroundColor Red; throw $m }

function Ask([string]$Question, [string]$Default = '') {
  if ($AssumeYes) { return $Default }
  $suffix = if ($Default) { " [$Default]" } else { '' }
  $a = Read-Host "$Question$suffix"
  if ([string]::IsNullOrWhiteSpace($a)) { return $Default } else { return $a.Trim() }
}
function AskSecret([string]$Question) {
  if ($AssumeYes) { return '' }
  $s = Read-Host $Question -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function YesNo([string]$Question, [string]$Default = 'y') { return (Ask "$Question (y/n)" $Default) -match '^[Yy]' }
function Choose([string]$Question, [string]$Default, [string[]]$Options) {
  Write-Host ""; Write-Host $Question -ForegroundColor White
  for ($i = 0; $i -lt $Options.Count; $i++) { Write-Host ("  {0}) {1}" -f ($i + 1), $Options[$i]) }
  while ($true) {
    $a = Ask "Choose 1-$($Options.Count)" $Default
    if ($a -match '^\d+$' -and [int]$a -ge 1 -and [int]$a -le $Options.Count) { return [int]$a }
    Warn "Please enter a number between 1 and $($Options.Count)."
  }
}
function RandPw([int]$Len = 28) {
  $chars = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  $bytes = New-Object byte[] ($Len * 2)
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes[0..($Len - 1)] | ForEach-Object { $chars[$_ % $chars.Length] })
}
function Enc([string]$s) { return [uri]::EscapeDataString($s) }
function ValidPort($p) { return ($p -match '^\d+$') -and [int]$p -ge 1 -and [int]$p -le 65535 }

Write-Host ""
Write-Host "  FormCraft installer" -ForegroundColor White
Write-Host "  The self-hosted form builder - Docker setup" -ForegroundColor DarkGray
Write-Host ""

# ---------- prerequisites ----------
if (-not $DryRun) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop and re-run." }
  & docker compose version *> $null; if ($LASTEXITCODE -ne 0) { Die "Docker Compose v2 is required ('docker compose'). Update Docker Desktop and re-run." }
  & docker info *> $null; if ($LASTEXITCODE -ne 0) { Die "Docker is installed but not running. Start Docker Desktop and re-run." }
  Ok "Docker is running"
}

# ---------- get the source ----------
if ((Test-Path docker-compose.yml) -and (Test-Path Dockerfile) -and (Select-String -Path docker-compose.yml -Pattern formcraft -Quiet)) {
  Ok "Using FormCraft in $(Get-Location)"
} elseif (Test-Path (Join-Path $InstallDir 'docker-compose.yml')) {
  Set-Location $InstallDir; Ok "Using existing $(Get-Location)"
} else {
  # Only the compose files are needed: the app itself comes from the published image.
  Info "Downloading FormCraft into .\$InstallDir"
  New-Item -ItemType Directory -Force $InstallDir | Out-Null
  Set-Location $InstallDir
  foreach ($f in 'docker-compose.yml', 'docker-compose.db.yml', 'docker-compose.ports.yml') {
    try { Invoke-WebRequest "$RawUrl/$f" -OutFile $f -UseBasicParsing } catch { Die "Could not download $f from $RawUrl." }
  }
  Ok "Downloaded the compose files to $(Get-Location)"
}

if ((Test-Path .env) -and (Select-String -Path .env -Pattern '^FC_DB_PROVIDER=' -Quiet) -and -not $AssumeYes) {
  Warn "An existing configuration was found in .env."
  if (-not (YesNo "Reconfigure it? (No just rebuilds and restarts with the current settings)" 'n')) {
    if ($DryRun) { return }
    Info "Updating and starting FormCraft with the existing configuration..."
    & docker compose pull; & docker compose up -d; Ok "Done."; return
  }
}

# ---------- database ----------
$dbChoice = Choose "Which database should FormCraft use?" '1' @(
  'Install a PostgreSQL database for me (separate container - recommended)',
  'Use my own PostgreSQL server (enter host and credentials)',
  'Embedded SQLite (single container, simplest - fine for small teams)')

$pgUser = ''; $pgPass = ''; $pgDb = ''; $adminer = $false; $dbLabel = ''
switch ($dbChoice) {
  1 {
    $provider = 'postgresql'
    Write-Host "`nNew PostgreSQL database (runs in the formcraft-db container)" -ForegroundColor White
    $pgDb = Ask 'Database name' 'formcraft'
    $pgUser = Ask 'Database user' 'formcraft'
    if ("$pgDb$pgUser" -notmatch '^[A-Za-z0-9_]+$') { Die 'Database name and user may only contain letters, numbers and underscores.' }
    while ($true) {
      $pgPass = AskSecret 'Database password (leave empty to generate a strong one)'
      if (-not $pgPass) { $pgPass = RandPw 28; Ok 'Generated a 28-character password (saved in .env)'; break }
      if ($pgPass.Length -lt 8 -or $pgPass -match "[\s'`"`$``\\]") { Warn 'Use at least 8 characters, without spaces, quotes, $, ` or backslashes.'; continue }
      break
    }
    $dbUrl = "postgresql://$(Enc $pgUser):$(Enc $pgPass)@db:5432/$(Enc $pgDb)?schema=public"
    $adminer = YesNo 'Also install Adminer (a web UI to browse the database)?' 'n'
    $dbLabel = "Bundled PostgreSQL ($pgUser@db/$pgDb)"
  }
  2 {
    $provider = 'postgresql'
    Write-Host "`nYour PostgreSQL server" -ForegroundColor White
    Write-Host '  The database must already exist, and the user needs permission to create tables in it.' -ForegroundColor DarkGray
    Write-Host '  If PostgreSQL runs on this same machine, use host host.docker.internal (not localhost).' -ForegroundColor DarkGray
    while ($true) {
      $xHost = Ask 'Host' 'host.docker.internal'
      $xPort = Ask 'Port' '5432'; if (-not (ValidPort $xPort)) { Warn 'Invalid port.'; continue }
      $xDb = Ask 'Database name' 'formcraft'
      $xUser = Ask 'User' 'formcraft'
      $xPass = AskSecret 'Password'
      $xSsl = Ask 'SSL mode (disable / require)' 'disable'
      $dbUrl = "postgresql://$(Enc $xUser):$(Enc $xPass)@${xHost}:${xPort}/$(Enc $xDb)?schema=public"
      if ($xSsl -eq 'require') { $dbUrl += '&sslmode=require' }
      if ($DryRun) { Warn 'Dry run - skipping connection test.'; break }
      Info 'Testing the connection...'
      $out = & docker run --rm --add-host=host.docker.internal:host-gateway -e "PGPASSWORD=$xPass" -e "PGSSLMODE=$xSsl" postgres:16-alpine psql -h $xHost -p $xPort -U $xUser -d $xDb -tAc 'select 1' 2>&1
      if ($LASTEXITCODE -eq 0) { Ok "Connected to ${xHost}:${xPort}/$xDb as $xUser"; break }
      Warn "Connection failed: $(($out | Select-Object -Last 2) -join ' ')"
      $retry = Choose 'What now?' '1' @('Re-enter the connection details', 'Continue anyway', 'Abort')
      if ($retry -eq 2) { break }
      if ($retry -eq 3) { Die 'Installation aborted.' }
    }
    $dbLabel = "Your PostgreSQL ($xUser@${xHost}:${xPort}/$xDb)"
  }
  3 {
    $provider = 'sqlite'
    $dbUrl = 'file:/app/data/formcraft.db'
    $dbLabel = 'Embedded SQLite'
    Ok 'SQLite file will be stored in the formcraft-data volume'
  }
}

# ---------- ports & options ----------
Write-Host "`nNetwork" -ForegroundColor White
while ($true) { $fcPort = Ask 'Port for the FormCraft dashboard' '3000'; if (ValidPort $fcPort) { break }; Warn 'Invalid port.' }

$formPorts = ''
if (YesNo 'Give every form its own dedicated port (for Cloudflare Tunnel / reverse proxies)?' 'y') {
  while ($true) {
    $formPorts = Ask 'Port range for forms' '4001-4050'
    if ($formPorts -match '^(\d+)-(\d+)$' -and [int]$Matches[1] -ge 1024 -and [int]$Matches[2] -le 65535 -and [int]$Matches[2] -ge [int]$Matches[1]) {
      if ([int]$fcPort -ge [int]$Matches[1] -and [int]$fcPort -le [int]$Matches[2]) { Warn "The range must not include the dashboard port $fcPort."; continue }
      break
    }
    Warn 'Use the form START-END, e.g. 4001-4050 (ports 1024-65535).'
  }
}
$seed = if (YesNo 'Load the 4 demo forms with sample responses?' 'y') { 'true' } else { 'false' }

# ---------- summary ----------
$files = @('docker-compose.yml')
if ($dbChoice -eq 1) { $files += 'docker-compose.db.yml' }
if ($formPorts) { $files += 'docker-compose.ports.yml' }

Write-Host "`nSummary" -ForegroundColor White
Write-Host "  Database    $dbLabel"
Write-Host "  Dashboard   http://localhost:$fcPort"
Write-Host "  Form ports  $(if ($formPorts) { $formPorts } else { 'disabled' })"
Write-Host "  Demo data   $seed"
if ($adminer) { Write-Host '  Adminer     http://localhost:8080' }
Write-Host ''
if (-not (YesNo 'Write this configuration and start FormCraft?' 'y')) { Die 'Installation aborted - nothing was changed.' }

# ---------- write .env ----------
$keep = @()
if (Test-Path .env) {
  Copy-Item .env ".env.bak.$(Get-Date -Format yyyyMMddHHmmss)"
  $keep = Get-Content .env | Where-Object { $_ -notmatch '^(# FormCraft installer|FC_|POSTGRES_|COMPOSE_FILE=|COMPOSE_PATH_SEPARATOR=|COMPOSE_PROFILES=)' }
}
$lines = @($keep) + @(
  "# FormCraft installer - $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')). Re-run install.ps1 to change.",
  "COMPOSE_FILE=$($files -join ';')",
  'COMPOSE_PATH_SEPARATOR=;'
)
if ($adminer) { $lines += 'COMPOSE_PROFILES=tools' }
$lines += @(
  "FC_DB_PROVIDER=$provider",
  "FC_IMAGE_TAG=$(if ($provider -eq 'postgresql') { 'postgres' } else { 'latest' })",
  "FC_DATABASE_URL='$dbUrl'",
  "FC_PORT=$fcPort",
  "FC_FORM_PORTS=$formPorts",
  "FC_SEED_DEMO=$seed"
)
if ($dbChoice -eq 1) { $lines += @("POSTGRES_DB=$pgDb", "POSTGRES_USER=$pgUser", "POSTGRES_PASSWORD='$pgPass'") }
# UTF-8 without BOM and LF endings, which Docker Compose parses reliably.
[IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
Ok "Saved configuration to $(Join-Path (Get-Location) '.env')"

if ($DryRun) { Warn 'Dry run - not starting Docker.'; return }

# ---------- start ----------
Info "Pulling $Image and starting FormCraft..."
& docker compose pull
if ($LASTEXITCODE -ne 0) {
  Warn "Couldn't download the FormCraft image ($Image)."
  Write-Host '  This usually means the image is still being published or the registry is unreachable.'
  Write-Host "  Your settings are saved - once the image is available, run:`n"
  Write-Host "    cd `"$(Get-Location)`"; docker compose pull; docker compose up -d`n" -ForegroundColor White
  return
}
& docker compose up -d
if ($LASTEXITCODE -ne 0) { Die 'docker compose failed - see the output above.' }

Info 'Waiting for FormCraft to become healthy...'
for ($i = 0; $i -lt 90; $i++) {
  try {
    Invoke-WebRequest "http://localhost:$fcPort/api/health" -UseBasicParsing -TimeoutSec 3 | Out-Null
    Write-Host "`nFormCraft is running!`n" -ForegroundColor Green
    Write-Host "  Open http://localhost:$fcPort and create your admin account."
    Write-Host "  Settings and database credentials are in $(Join-Path (Get-Location) '.env')"
    Write-Host "  Logs: docker compose logs -f   Stop: docker compose down   Reconfigure: .\install.ps1`n"
    return
  } catch { Start-Sleep -Seconds 2 }
}
Warn "FormCraft didn't report healthy within 3 minutes. Check the logs with: docker compose logs -f formcraft"
