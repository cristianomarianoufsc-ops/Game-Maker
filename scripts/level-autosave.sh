#!/usr/bin/env bash

WATCH_FILES=(
  "artifacts/pursuit-game/public/level-patch.json"
  "artifacts/pursuit-game/public/gallery-types.json"
)
SPRITES_DIR="artifacts/pursuit-game/public/sprites"
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
    snapshot+="$(ls -la "$SPRITES_DIR" 2>/dev/null | md5sum)"
  fi
  echo "$snapshot"
}

log "Vigia de salvamento iniciado."
log "Monitorando: ${WATCH_FILES[*]} e $SPRITES_DIR"

last_snapshot=$(get_snapshot)

while true; do
  sleep "$CHECK_INTERVAL"

  current_snapshot=$(get_snapshot)

  if [ "$current_snapshot" != "$last_snapshot" ]; then
    log "Mudança detectada! Salvando no Git..."

    git add \
      "artifacts/pursuit-game/public/level-patch.json" \
      "artifacts/pursuit-game/public/gallery-types.json" \
      "artifacts/pursuit-game/public/sprites/" \
      2>/dev/null

    if git diff --cached --quiet; then
      log "Nenhuma mudança nova para commitar."
    else
      commit_msg="[autosave] $(date '+%d/%m/%Y %H:%M:%S')"
      git commit -m "$commit_msg" >> "$LOG_FILE" 2>&1
      log "Commit local salvo."

      # Tenta enviar ao remoto com timeout curto.
      # Falhas (sem rede / sem credencial) são silenciosas e não interrompem o loop.
      if git remote get-url origin >/dev/null 2>&1; then
        if timeout 20 git push origin HEAD --quiet >> "$LOG_FILE" 2>&1; then
          log "Push para origin OK."
        else
          log "Push falhou ou expirou (continua local)."
        fi
      fi
    fi

    last_snapshot=$(get_snapshot)
  fi
done
