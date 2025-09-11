
Param(
    [string]$ProjectRoot = "."
)
$ErrorActionPreference = "Stop"
$ts = "20250910_235455"
$backup = Join-Path $ProjectRoot ("backup_before_restore_" + $ts)
New-Item -ItemType Directory -Force -Path $backup | Out-Null

function Backup-And-Copy($relPath) {
    $src = Join-Path "/mnt/data/restore_pre_today" $relPath
    $dst = Join-Path $ProjectRoot $relPath
    if (Test-Path $dst) {
        New-Item -ItemType Directory -Force -Path (Join-Path $backup ($relPath | Split-Path -Parent)) | Out-Null
        Copy-Item -LiteralPath $dst -Destination (Join-Path $backup $relPath) -Force -Recurse
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    Copy-Item -LiteralPath $src -Destination $dst -Force -Recurse
    Write-Host "Restored: $relPath"
}

$files = @(
  "src\views\Control.tsx",
  "src\views\Learner.tsx",
  "src\views\Stage.tsx",
  "src\socket.ts",
  "src\main.tsx",
  "tsconfig.json",
  "vite.config.mts",
  "vitest.config.ts",
  "package.json",
  "package-lock.json"
)

foreach ($f in $files) { Backup-And-Copy $f }
Write-Host "Done. Backup saved to $backup"
