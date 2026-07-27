#!/usr/bin/env bash

WATCH_FILES=(
  "artifacts/pursuit-game/public/level-patch.json"
  "artifacts/pursuit-game/public/gallery-types.json"
  "artifacts/pursuit-game/public/game-settings.json"
)
SPRITES_DIR="artifacts/pursuit-game/public/sprites"
SRC_DIRS=(
  "artifacts/pursuit-game/src"
  "artifacts/pursuit-game/public/sounds"
  "artifacts/pursuit-game/public/music"
  "artifacts/api-server/src"
  "scripts"
)
LOG_FILE="scripts/level-autosave.log"
CHECK_INTERVAL=5

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

get_snapshot() {
  local snapshot=""
  for f in "${WATCH_FILES[@]}"; do
    if [ -f "$f" ]; then
      snapshot+="$(stat -c '%Y %s' "$f" 2>/dev/null):$f|"
    fi
  done
  if [ -d "$SPRITES_DIR" ]; then
    snapshot+="$(find "$SPRITES_DIR" -type f -exec stat -c '%Y %s %n' {} \; 2>/dev/null | md5sum)"
  fi
  for d in "${SRC_DIRS[@]}"; do
    if [ -d "$d" ]; then
      snapshot+="$(find "$d" -type f -exec stat -c '%Y %s %n' {} \; 2>/dev/null | md5sum)"
    fi
  done
  echo "$snapshot"
}

log "Vigia de salvamento iniciado."
log "Monitorando: ${WATCH_FILES[*]}, $SPRITES_DIR e ${SRC_DIRS[*]}"

last_snapshot=$(get_snapshot)

while true; do
  sleep "$CHECK_INTERVAL"

  current_snapshot=$(get_snapshot)

  if [ "$current_snapshot" != "$last_snapshot" ]; then
    log "Mudança detectada! Salvando no Git..."

    git add \
      "artifacts/pursuit-game/public/level-patch.json" \
      "artifacts/pursuit-game/public/gallery-types.json" \
      "artifacts/pursuit-game/public/game-settings.json" \
      "artifacts/pursuit-game/public/sprites/" \
      "artifacts/pursuit-game/public/sounds/" \
      "artifacts/pursuit-game/public/music/" \
      "artifacts/pursuit-game/src/" \
      "artifacts/api-server/src/" \
      "scripts/" \
      2>/dev/null

    if git diff --cached --quiet; then
      log "Nenhuma mudança nova para commitar."
    else
      commit_msg="[autosave] $(date '+%d/%m/%Y %H:%M:%S')"
      git commit -m "$commit_msg" >> "$LOG_FILE" 2>&1
      log "Commit local salvo."

      if git remote get-url origin >/dev/null 2>&1; then
        ORIGIN_URL=$(git remote get-url origin)
        if [ -n "$GITHUB_TOKEN" ] && echo "$ORIGIN_URL" | grep -q '^https://github.com/'; then
          AUTH_URL=$(echo "$ORIGIN_URL" | sed "s|^https://|https://x-access-token:${GITHUB_TOKEN}@|")
          PUSH_URL="$AUTH_URL"
        else
          PUSH_URL="origin"
        fi
        PUSH_OUTPUT=$(timeout 20 git push "$PUSH_URL" HEAD 2>&1)
        PUSH_EXIT=$?
        if [ $PUSH_EXIT -eq 0 ]; then
          log "Push para origin OK."
        else
          log "Push FALHOU (exit $PUSH_EXIT): $PUSH_OUTPUT"
        fi
      fi
    fi

    last_snapshot=$(get_snapshot)
  fi
done
