
Param([string]$ProjectRoot = ".")
$ErrorActionPreference = "Stop"
$ts = "20250910_235455"
$backup = Join-Path $ProjectRoot ("backup_before_improvements_" + $ts)
New-Item -ItemType Directory -Force -Path $backup | Out-Null

function Copy-With-Backup($relPath) {
  $src = Join-Path "/mnt/data/improvements_pack" $relPath
  $dst = Join-Path $ProjectRoot $relPath
  if (Test-Path $dst) {
    New-Item -ItemType Directory -Force -Path (Join-Path $backup ($relPath | Split-Path -Parent)) | Out-Null
    Copy-Item -LiteralPath $dst -Destination (Join-Path $backup $relPath) -Force -Recurse
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst -Force -Recurse
  Write-Host "Installed: $relPath"
}

$files = @(
  "src\ui\theme.css",
  "src\views\StageViewer.tsx",
  "src\views\Stage.tsx",
  "src\views\ControlLite.tsx",
  "src\views\MonitorPane.tsx",
  "server\src\laerdalWatcher.js",
  "server\src\monitorRoutes.js",
  "README_IMPROVEMENTS.txt"
)

foreach ($f in $files) { Copy-With-Backup $f }
Write-Host "Backup created at $backup"
Write-Host "Next: open README_IMPROVEMENTS.txt for integration steps."
