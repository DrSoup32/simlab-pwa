
#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="${1:-.}"
TS="20250910_235455"
BACKUP="$PROJECT_ROOT/backup_before_improvements_$TS"
mkdir -p "$BACKUP"

copy_with_backup() {
  local rel="$1"
  local src="/mnt/data/improvements_pack/$rel"
  local dst="$PROJECT_ROOT/$rel"
  if [ -e "$dst" ]; then
    mkdir -p "$(dirname "$BACKUP/$rel")"
    cp -a "$dst" "$BACKUP/$rel"
  fi
  mkdir -p "$(dirname "$dst")"
  cp -a "$src" "$dst"
  echo "Installed: $rel"
}

files=(
  "src/ui/theme.css"
  "src/views/StageViewer.tsx"
  "src/views/Stage.tsx"
  "src/views/ControlLite.tsx"
  "src/views/MonitorPane.tsx"
  "server/src/laerdalWatcher.js"
  "server/src/monitorRoutes.js"
  "README_IMPROVEMENTS.txt"
)

for f in "${files[@]}"; do
  copy_with_backup "$f"
done

echo "Backup created at $BACKUP"
echo "Next: open README_IMPROVEMENTS.txt for integration steps."
