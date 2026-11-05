#!/usr/bin/env bash
# Runs the database backup once a day on this computer, using a systemd timer for this user.
#
#   npm run backup:schedule     turn the daily backup on (run again if the project folder moves)
#   npm run backup:unschedule   turn it off (existing backups are kept)
#   npm run backup:status       show the next run and the latest backup
#
# The timer fires at midnight. If the computer is off then, it fires the next time you sign in.
# The unit files are generated here so that this computer's paths stay out of the public repo.
set -euo pipefail

UNIT=treez-backup
PROJECT_DIR=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)
cd "$PROJECT_DIR"
SYSTEMD_DIR=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
BACKUP_DIR=backups/daily
KEEP=30
ATTEMPTS=3
RETRY_WAIT=${BACKUP_RETRY_WAIT:-300} # seconds; right after sign-in the network may not be up yet

install_schedule() {
  local cf_dir node_dir bash_path
  # npm run puts node_modules first; the job must not break when dependencies are reinstalled.
  PATH=$(tr ':' '\n' <<<"$PATH" | grep -v '/node_modules/' | paste -sd ':')
  if ! command -v cf >/dev/null || ! command -v node >/dev/null; then
    echo "Install Node.js and the cf CLI first (npm install -g cf, then cf auth login)." >&2
    exit 1
  fi
  cf_dir=$(dirname "$(command -v cf)")
  node_dir=$(dirname "$(command -v node)")
  bash_path=$(command -v bash)

  mkdir -p "$SYSTEMD_DIR"
  cat >"$SYSTEMD_DIR/$UNIT.service" <<EOF
[Unit]
Description=Back up the treez.tech database

[Service]
Type=oneshot
Environment="PATH=$cf_dir:$node_dir:/usr/local/bin:/usr/bin:/bin"
ExecStart=$bash_path "$PROJECT_DIR/scripts/backup-schedule.sh" run
EOF
  cat >"$SYSTEMD_DIR/$UNIT.timer" <<EOF
[Unit]
Description=Daily backup of the treez.tech database

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT.timer"
  echo "Daily backup is on. Backups go to $BACKUP_DIR/, keeping the newest $KEEP."
  show_status
}

remove_schedule() {
  systemctl --user disable --now "$UNIT.timer" 2>/dev/null || true
  rm -f "$SYSTEMD_DIR/$UNIT.service" "$SYSTEMD_DIR/$UNIT.timer"
  systemctl --user daemon-reload
  echo "Daily backup is off. Existing backups in $BACKUP_DIR/ were kept."
}

show_status() {
  if [[ $(systemctl --user is-enabled "$UNIT.timer" 2>/dev/null) != enabled ]]; then
    echo "Daily backup is off. Turn it on with: npm run backup:schedule"
    return
  fi
  echo "Next run: $(systemctl --user show "$UNIT.timer" -p NextElapseUSecRealtime --value)"
  local latest
  latest=$(find "$PROJECT_DIR/$BACKUP_DIR" -maxdepth 1 -name '*.json' -printf '%f\n' 2>/dev/null | sort | tail -n 1)
  echo "Latest backup: ${latest:-none yet}"
  echo "Backups kept: $(find "$PROJECT_DIR/$BACKUP_DIR" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l) of $KEEP"
}

run_backup() {
  local attempt
  for ((attempt = 1; attempt <= ATTEMPTS; attempt++)); do
    if node "$PROJECT_DIR/scripts/backup.mjs" --dir "$BACKUP_DIR" --keep "$KEEP"; then
      return 0
    fi
    echo "Backup attempt $attempt of $ATTEMPTS failed." >&2
    if ((attempt < ATTEMPTS)); then
      sleep "$RETRY_WAIT"
    fi
  done
  notify-send --urgency=critical --app-name="TREEZ backup" "Database backup failed" \
    "Today's treez.tech backup was not saved. See why with: journalctl --user -u $UNIT" || true
  return 1
}

case "${1:-}" in
  install) install_schedule ;;
  remove) remove_schedule ;;
  status) show_status ;;
  run) run_backup ;;
  *)
    echo "Usage: $0 {install|remove|status|run}" >&2
    exit 2
    ;;
esac
