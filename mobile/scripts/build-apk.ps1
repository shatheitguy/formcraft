# Builds the FormCraft Android app (APK).
#
#   powershell -ExecutionPolicy Bypass -File mobile\scripts\build-apk.ps1
#   powershell -ExecutionPolicy Bypass -File mobile\scripts\build-apk.ps1 -Icons     (also re-render icons/splash first)
#
# Output: mobile\dist\FormCraft-<VERSION>.apk  (debug build, installs fine by side-loading).
# Release: set FC_KEYSTORE, FC_KEYSTORE_PASSWORD, FC_KEY_ALIAS (and FC_KEY_PASSWORD if different) and the script
# also builds a signed release: mobile\dist\FormCraft-<VERSION>-release.apk (and FormCraft-<VERSION>.apk is then
# the signed release; the debug build is kept as FormCraft-<VERSION>-debug.apk).
# FC_VERSION_CODE sets Android's versionCode (default 1; raise it for every APK that should install as an update).
param([switch]$Icons)
$ErrorActionPreference = "Stop"
$mobile = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $mobile
Set-Location $mobile

if (-not $env:ANDROID_HOME) {
  $guess = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $guess) { $env:ANDROID_HOME = $guess } else { throw "Android SDK not found. Set ANDROID_HOME." }
}
"sdk.dir=$($env:ANDROID_HOME -replace '\\','\\')" | Set-Content -Encoding ascii android\local.properties

$version = (Get-Content (Join-Path $repo "VERSION") -Raw).Trim()
Write-Host "==> FormCraft $version (versionCode $(if ($env:FC_VERSION_CODE) { $env:FC_VERSION_CODE } else { 1 }))"

if (-not (Test-Path node_modules\@capacitor\android)) {
  Write-Host "==> npm install"
  npm install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

Write-Host "==> cap sync android"
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }

if ($Icons) {
  Write-Host "==> icons"
  node scripts/make-icons.mjs
  if ($LASTEXITCODE -ne 0) { throw "make-icons failed" }
}

$signed = $env:FC_KEYSTORE -and (Test-Path $env:FC_KEYSTORE)
$tasks = @("assembleDebug")
if ($signed) { $tasks += "assembleRelease" }

Push-Location android
try {
  # --no-daemon: no Gradle process is left running after the build
  .\gradlew.bat --no-daemon @tasks
  if ($LASTEXITCODE -ne 0) { throw "gradle build failed" }
} finally { Pop-Location }

New-Item -ItemType Directory -Force dist | Out-Null
$debug = "android\app\build\outputs\apk\debug\app-debug.apk"
$out = "dist\FormCraft-$version.apk"
if ($signed) {
  Copy-Item $debug "dist\FormCraft-$version-debug.apk" -Force
  Copy-Item "android\app\build\outputs\apk\release\app-release.apk" "dist\FormCraft-$version-release.apk" -Force
  Copy-Item "android\app\build\outputs\apk\release\app-release.apk" $out -Force
} else {
  Copy-Item $debug $out -Force
}
$size = [Math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host "APK ready: $(Join-Path $mobile $out)  ($size MB$(if ($signed) { ', signed release' } else { ', debug' }))"
