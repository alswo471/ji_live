#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: pnpm backup:community -- /absolute/backup/directory" >&2
  exit 64
fi

destination="$1"
if [[ ! -d "$destination" ]]; then
  echo "Backup directory must already exist." >&2
  exit 64
fi

destination="$(cd "$destination" && pwd -P)"
script_directory="$(cd "$(dirname "$0")" && pwd -P)"
workspace_directory="$(cd "$script_directory/.." && pwd -P)"
home_directory="$(cd "$HOME" && pwd -P)"

case "$destination" in
  /|"$home_directory"|"$workspace_directory"|"$workspace_directory"/*)
    echo "Refusing root, home, or workspace backup destination." >&2
    exit 64
    ;;
esac

umask 077
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$destination/ji-live-community-$timestamp.sql"
trap 'rm -f -- "$output"' ERR INT TERM

pnpm dlx supabase db dump --linked --file "$output"
chmod 600 "$output"
trap - ERR INT TERM
echo "Community database backup created: $output"
