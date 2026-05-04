#!/usr/bin/env bash
#
# Install PostgreSQL on the Ubuntu SERVER (native systemd service, not Docker).
# Use when your laptop uses local Postgres and you want the droplet to match (127.0.0.1:5432).
#
# Requirements: working apt. EOL Ubuntu (e.g. 24.10 Oracular) mirrors return 404 — use:
#   export MACHAKOS_REWRITE_APT_TO_OLD_RELEASES=1
#   sudo -E bash deploy/setup-server-postgresql-native.sh
# That backs up /etc/apt and rewrites DO / security.ubuntu.com / archive.ubuntu.com → old-releases.ubuntu.com.
# Long-term: reinstall or dist-upgrade to 24.04 LTS.
#
#   export MACHAKOS_DB_NAME=government_projects
#   export MACHAKOS_DB_USER=your_app_user
#   export MACHAKOS_DB_PASSWORD='your-secure-password'
#   sudo -E bash deploy/setup-server-postgresql-native.sh
#
# Optional:
#   MACHAKOS_PG_MAJOR=16      # pin major if multiple clusters exist
#   MACHAKOS_SKIP_APT=1      # Postgres already installed
#   MACHAKOS_SKIP_PGVECTOR=1  # do not install / create vector extension
#   MACHAKOS_REWRITE_APT_TO_OLD_RELEASES=1  # EOL Ubuntu: point apt at old-releases.ubuntu.com (see above)
#   MACHAKOS_APT_REMOVE_BROKEN_CERTBOT=0   # set 0 to skip removing python3-certbot-nginx (default: 1)
#
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root or: sudo -E bash $0" >&2
  exit 1
fi

MACHAKOS_DB_NAME="${MACHAKOS_DB_NAME:-government_projects}"
MACHAKOS_DB_USER="${MACHAKOS_DB_USER:-}"
MACHAKOS_DB_PASSWORD="${MACHAKOS_DB_PASSWORD:-}"
MACHAKOS_PG_MAJOR="${MACHAKOS_PG_MAJOR:-}"
MACHAKOS_SKIP_APT="${MACHAKOS_SKIP_APT:-0}"
MACHAKOS_SKIP_PGVECTOR="${MACHAKOS_SKIP_PGVECTOR:-0}"
MACHAKOS_REWRITE_APT_TO_OLD_RELEASES="${MACHAKOS_REWRITE_APT_TO_OLD_RELEASES:-0}"
MACHAKOS_APT_REMOVE_BROKEN_CERTBOT="${MACHAKOS_APT_REMOVE_BROKEN_CERTBOT:-1}"

# Previous runs may have left *.bak-machakos in sources.list.d — apt ignores them but warns; move aside.
cleanup_stale_apt_sed_backups() {
  local stash="/etc/apt/machakos-stale-sed-backups"
  mkdir -p "$stash"
  find /etc/apt/sources.list.d -maxdepth 1 -name '*.bak-machakos' -print0 2>/dev/null |
    while IFS= read -r -d '' g; do mv -f "$g" "$stash/"; done
  true
}

rewrite_apt_to_old_releases() {
  local bak="/etc/apt.bak-machakos-$(date +%Y%m%d%H%M%S)"
  echo "==> Backing up /etc/apt to $bak"
  cp -a /etc/apt "$bak"
  cleanup_stale_apt_sed_backups
  echo "==> Rewriting apt sources → http://old-releases.ubuntu.com/ubuntu (EOL fix)"
  local f
  while IFS= read -r -d '' f; do
    # Full tree already copied to $bak; edit in place only (no *.bak next to live files).
    sed -i \
      -e 's|http://mirrors.digitalocean.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      -e 's|https://mirrors.digitalocean.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      -e 's|http://security.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      -e 's|https://security.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      -e 's|http://archive.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      -e 's|https://archive.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      "$f"
  done < <(find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) -print0 2>/dev/null)
}

apt_prepare_for_postgresql() {
  export DEBIAN_FRONTEND=noninteractive
  echo "==> apt: fix-broken / clear common half-installed certbot blocker"
  dpkg --configure -a 2>/dev/null || true
  apt-get install -f -y || true
  if [[ "$MACHAKOS_APT_REMOVE_BROKEN_CERTBOT" == "1" ]]; then
    echo "==> Removing python3-certbot-nginx if present (often blocks apt; reinstall certbot later if needed)"
    apt-get remove -y --purge python3-certbot-nginx 2>/dev/null || true
  fi
  apt-get install -f -y || true
}

if [[ -z "$MACHAKOS_DB_USER" || -z "$MACHAKOS_DB_PASSWORD" ]]; then
  echo "Set MACHAKOS_DB_USER and MACHAKOS_DB_PASSWORD." >&2
  exit 1
fi

if [[ "$MACHAKOS_SKIP_APT" != "1" ]]; then
  echo "==> apt: install PostgreSQL"
  export DEBIAN_FRONTEND=noninteractive
  cleanup_stale_apt_sed_backups
  if [[ "$MACHAKOS_REWRITE_APT_TO_OLD_RELEASES" == "1" ]]; then
    rewrite_apt_to_old_releases
  fi
  if ! apt-get update -qq; then
    echo "" >&2
    echo "apt-get update failed. If you see 'no longer has a Release file' for oracular:" >&2
    echo "  export MACHAKOS_REWRITE_APT_TO_OLD_RELEASES=1" >&2
    echo "  sudo -E bash $0" >&2
    echo "Or upgrade/reinstall the server to Ubuntu 24.04 LTS." >&2
    exit 1
  fi
  apt_prepare_for_postgresql
  if ! apt-get install -y postgresql postgresql-contrib; then
    echo "WARN: postgresql metapackage failed; trying explicit 16 …" >&2
    apt-get install -f -y || true
    apt-get install -y postgresql-16 postgresql-contrib-16 || {
      echo "apt could not install PostgreSQL. Run: apt-get install -f" >&2
      echo "Then: apt-cache policy postgresql && apt install postgresql-<major>" >&2
      exit 1
    }
  fi
fi

detect_major() {
  if [[ -n "$MACHAKOS_PG_MAJOR" ]]; then
    echo "$MACHAKOS_PG_MAJOR"
    return
  fi
  if command -v pg_lsclusters >/dev/null 2>&1; then
    local v
    v="$(pg_lsclusters --no-header 2>/dev/null | awk 'NF {print $1; exit}')"
    [[ -n "$v" ]] && { echo "$v"; return; }
  fi
  echo "16"
}

PG_MAJOR="$(detect_major)"
echo "==> PostgreSQL major: $PG_MAJOR"

if [[ "$MACHAKOS_SKIP_PGVECTOR" != "1" ]]; then
  if apt-cache show "postgresql-${PG_MAJOR}-pgvector" &>/dev/null; then
    echo "==> apt: install pgvector"
    apt-get install -y "postgresql-${PG_MAJOR}-pgvector" || echo "WARN: pgvector package install failed (continue)." >&2
  else
    echo "WARN: no package postgresql-${PG_MAJOR}-pgvector (add PGDG or set MACHAKOS_SKIP_PGVECTOR=1)." >&2
  fi
fi

echo "==> start cluster"
systemctl enable "postgresql@${PG_MAJOR}-main" 2>/dev/null || true
systemctl start "postgresql@${PG_MAJOR}-main" 2>/dev/null || systemctl start postgresql 2>/dev/null || true

echo "==> role + database (Python emits SQL: psql :'var' does not expand inside DO \$\$ bodies)"
export PG_MAJOR
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for safe password quoting. Install: apt-get install -y python3" >&2
  exit 1
fi
MACHAKOS_DB_USER="$MACHAKOS_DB_USER" MACHAKOS_DB_PASSWORD="$MACHAKOS_DB_PASSWORD" MACHAKOS_DB_NAME="$MACHAKOS_DB_NAME" \
  python3 <<'PY' | sudo -u postgres psql -v ON_ERROR_STOP=1 -f -
import os, re, sys

def require_ident(label, s):
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", s):
        sys.stderr.write("%s must be [A-Za-z_][A-Za-z0-9_]* (got %r)\n" % (label, s))
        sys.exit(1)
    return s

def dollar_for_plpgsql(s):
    """Return PL/pgSQL dollar-quoted literal for arbitrary password (tag chosen so it does not appear in s)."""
    for tag in ("pw", "pwd", "pwb", "pwbody", "pwq", "m", "n"):
        delim = "$%s$" % (tag,)
        if delim not in s:
            return "%s%s%s" % (delim, s, delim)
    for i in range(1000):
        tag = "t%d" % (i,)
        delim = "$%s$" % (tag,)
        if delim not in s:
            return "%s%s%s" % (delim, s, delim)
    sys.exit("could not pick dollar-quote tag for password")

u = require_ident("MACHAKOS_DB_USER", os.environ["MACHAKOS_DB_USER"])
d = require_ident("MACHAKOS_DB_NAME", os.environ["MACHAKOS_DB_NAME"])
pw = os.environ["MACHAKOS_DB_PASSWORD"]
pw_lit = dollar_for_plpgsql(pw)

# CREATE DATABASE cannot run inside DO/EXECUTE (not even dynamic SQL). Use a
# prior SELECT … \\gexec so the generated statement runs at top level. \\c
# switches session DB so GRANT / ALTER SCHEMA hit the target, not postgres.
d_esc = d.replace('"', '""')
u_esc = u.replace('"', '""')
sql = f"""
DO $pl$
DECLARE
  un text := '{u}';
  pw text := {pw_lit};
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = un) THEN
    EXECUTE format('ALTER ROLE %I LOGIN PASSWORD %L CREATEDB', un, pw);
  ELSE
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L CREATEDB', un, pw);
  END IF;
END
$pl$;
SELECT format('CREATE DATABASE %I OWNER %I', '{d}', '{u}')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '{d}');
\\gexec
ALTER DATABASE "{d_esc}" OWNER TO "{u_esc}";
\\c {d}
GRANT ALL ON SCHEMA public TO "{u_esc}";
ALTER SCHEMA public OWNER TO "{u_esc}";
"""
print(sql)
PY

if [[ "$MACHAKOS_SKIP_PGVECTOR" != "1" ]]; then
  echo "==> CREATE EXTENSION vector"
  sudo -u postgres psql -v ON_ERROR_STOP=0 -d "$MACHAKOS_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" || {
    echo "WARN: vector extension failed — install postgresql-${PG_MAJOR}-pgvector or build pgvector, then:" >&2
    echo "  sudo -u postgres psql -d \"$MACHAKOS_DB_NAME\" -c 'CREATE EXTENSION IF NOT EXISTS vector;'" >&2
  }
fi

systemctl reload "postgresql@${PG_MAJOR}-main" 2>/dev/null || systemctl reload postgresql 2>/dev/null || true

echo ""
echo "==> Native PostgreSQL ready."
echo "Server api/.env (API can stay Docker with network_mode: host):"
echo "  DB_TYPE=postgresql"
echo "  DB_HOST=127.0.0.1"
echo "  DB_PORT=5432"
echo "  DB_NAME=$MACHAKOS_DB_NAME"
echo "  DB_USER=$MACHAKOS_DB_USER"
echo "  DB_PASSWORD=<this run's MACHAKOS_DB_PASSWORD>"
echo ""
echo "Then from your laptop: deploy/sync-local-db-to-server.sh (or pg_dump | ssh ... psql)."
