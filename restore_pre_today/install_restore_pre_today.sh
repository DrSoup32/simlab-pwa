
#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="${1:-.}"
TS="20250910_235455"
BACKUP="$PROJECT_ROOT/backup_before_restore_$TS"
mkdir -p "$BACKUP"

backup_and_copy() {
  local rel="$1"
  local src="/mnt/data/restore_pre_today/$rel"
  local dst="$PROJECT_ROOT/$rel"
  if [ -e "$dst" ]; then
    mkdir -p "$(dirname "$BACKUP/$rel")"
    cp -a "$dst" "$BACKUP/$rel"
  fi
  mkdir -p "$(dirname "$dst")"
  cp -a "$src" "$dst"
  echo "Restored: $rel"
}

files=(
  "src/views/Control.tsx"
  "src/views/Learner.tsx"
  "src/views/Stage.tsx"
  "src/socket.ts"
  "src/main.tsx"
  "tsconfig.json"
  "vite.config.mts"
  "vitest.config.ts"
  "package.json"
  "package-lock.json"
)

for f in "${files[@]}"; do
  backup_and_copy "$f"
done

echo "Done. Backup saved to $BACKUP"
