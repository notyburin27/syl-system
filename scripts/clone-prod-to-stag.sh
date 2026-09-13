#!/usr/bin/env bash
#
# Clone ข้อมูล production → staging ของ SYL System
#
#   ⚠️  สคริปต์นี้ "ลบข้อมูล staging ทั้งหมด" แล้วทับด้วยข้อมูลจาก production
#       ย้อนกลับไม่ได้ ถ้าไม่ได้เก็บไฟล์ backup ที่สคริปต์สร้างให้ไว้
#
#   ⚠️  prod กับ staging อยู่บน DigitalOcean cluster เดียวกัน ต่างกันแค่ชื่อ database
#       (prod = defaultdb, staging = pop_db_stag) สคริปต์จึงตรวจซ้ำหลายชั้น
#       ว่าปลายทางไม่ใช่ prod ก่อนจะแตะอะไรทั้งสิ้น
#
# ใช้งาน:
#   ./scripts/clone-prod-to-stag.sh          # ถามยืนยันก่อน (แนะนำ)
#   ./scripts/clone-prod-to-stag.sh -y       # ข้ามคำถาม (สำหรับ automation)
#
# ต้องมี: docker (ใช้ image postgres:15-alpine — ตรงกับ server 15.x)
#        .env.prod และ .env.stag ที่มี DATABASE_URL

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_IMAGE="postgres:15-alpine"
BACKUP_DIR="$REPO_ROOT/.db-backups"
TS="$(date +%Y%m%d-%H%M%S)"

ASSUME_YES=0
[[ "${1:-}" == "-y" ]] && ASSUME_YES=1

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

die() { red "✖ $*"; exit 1; }

# ── อ่าน DATABASE_URL จากไฟล์ env ───────────────────────────────────────────
read_db_url() {
  local file="$1"
  [[ -f "$file" ]] || die "ไม่พบไฟล์ $file"
  local url
  url="$(grep -E '^DATABASE_URL=' "$file" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
  [[ -n "$url" ]] || die "ไม่พบ DATABASE_URL ใน $file"
  printf '%s' "$url"
}

# ── แยกส่วนประกอบของ URL (ไม่ print password) ──────────────────────────────
url_part() { # url, part
  printf '%s' "$1" | sed -E "s#^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):([0-9]+)/([^?]+).*#\\$2#"
}
url_user() { url_part "$1" 2; }
url_host() { url_part "$1" 4; }
url_port() { url_part "$1" 5; }
url_db()   { url_part "$1" 6; }

PROD_URL="$(read_db_url .env.prod)"
STAG_URL="$(read_db_url .env.stag)"

PROD_HOST="$(url_host "$PROD_URL")"; PROD_DB="$(url_db "$PROD_URL")"
STAG_HOST="$(url_host "$STAG_URL")"; STAG_DB="$(url_db "$STAG_URL")"
STAG_PORT="$(url_port "$STAG_URL")"; STAG_USER="$(url_user "$STAG_URL")"

# ── ด่านความปลอดภัย ────────────────────────────────────────────────────────
# prod กับ stag ใช้ host เดียวกัน ชื่อ db จึงเป็นสิ่งเดียวที่กันไม่ให้ลบ prod
[[ "$PROD_DB" != "$STAG_DB" ]] \
  || die "ปลายทางชื่อ database เดียวกับ prod ($PROD_DB) — หยุดทันที ไม่ยอมลบ prod"

# กันพลาดซ้ำ: ปลายทางต้องไม่ใช่ defaultdb เด็ดขาด
[[ "$STAG_DB" != "defaultdb" ]] \
  || die "ปลายทางเป็น 'defaultdb' ซึ่งคือ production — หยุดทันที"

# ปลายทางต้องมีคำว่า stag อยู่ในชื่อ (กันชี้ผิด db ในคลัสเตอร์เดียวกัน)
[[ "$STAG_DB" == *stag* ]] \
  || die "ชื่อ database ปลายทาง ('$STAG_DB') ไม่มีคำว่า 'stag' — น่าสงสัย หยุดไว้ก่อน"

command -v docker >/dev/null || die "ไม่พบ docker"
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 || die "docker ไม่ได้รัน"

# ── แสดง source → target แล้วขอยืนยัน ──────────────────────────────────────
echo
bold "════════ Clone production → staging (SYL System) ════════"
echo
echo "  SOURCE (อ่านอย่างเดียว)"
echo "    host : $PROD_HOST"
echo "    db   : $PROD_DB"
echo
echo "  TARGET (จะถูกลบทิ้งแล้วเขียนทับ)"
echo "    host : $STAG_HOST"
echo "    db   : $STAG_DB"
echo
ylw "  ⚠️  ข้อมูลใน staging ('$STAG_DB') ทั้งหมดจะถูกลบ แล้วแทนที่ด้วยข้อมูล production"
ylw "  ⚠️  ข้อมูลจริงของลูกค้า (ชื่อคนขับ เลขบัญชี ฐานเงินเดือน) จะไปอยู่บน staging"
ylw "  ⚠️  prod กับ staging อยู่คลัสเตอร์เดียวกัน ต่างกันแค่ชื่อ db"
echo
echo "  จะสำรอง staging ไว้ก่อนที่: $BACKUP_DIR/stag-$TS.dump"
echo

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "พิมพ์ชื่อ database ปลายทางเพื่อยืนยัน ($STAG_DB): " answer
  [[ "$answer" == "$STAG_DB" ]] || die "ยกเลิก (พิมพ์ไม่ตรง)"
fi

mkdir -p "$BACKUP_DIR"

# รัน pg_* ใน container โดยส่ง URL ผ่าน env — ไม่โผล่ใน `ps` หรือ log
run_pg() { # <url> <backup-mount?> <cmd...>
  local url="$1"; shift
  docker run --rm -i \
    -e PGCONN="$url" \
    -v "$BACKUP_DIR:/backup" \
    "$PG_IMAGE" "$@"
}

echo
bold "[1/4] สำรองข้อมูล staging ปัจจุบัน"
run_pg "$STAG_URL" sh -c \
  'pg_dump --dbname="$PGCONN" --format=custom --no-owner --no-privileges --file=/backup/'"stag-$TS.dump" \
  || die "สำรอง staging ไม่สำเร็จ — หยุดก่อนแตะข้อมูล"
grn "      ✔ เก็บไว้ที่ $BACKUP_DIR/stag-$TS.dump"

echo
bold "[2/4] ดึงข้อมูลจาก production"
run_pg "$PROD_URL" sh -c \
  'pg_dump --dbname="$PGCONN" --format=custom --no-owner --no-privileges --file=/backup/'"prod-$TS.dump" \
  || die "ดึงข้อมูล production ไม่สำเร็จ (ยังไม่ได้แตะ staging)"
grn "      ✔ ได้ไฟล์ $BACKUP_DIR/prod-$TS.dump"

echo
bold "[3/4] ล้าง schema เดิมของ staging แล้ว restore"
# ใช้ DROP SCHEMA แทน DROP DATABASE เพราะ managed PG ไม่ให้ drop db ที่กำลังต่ออยู่
run_pg "$STAG_URL" sh -c \
  'psql --dbname="$PGCONN" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"' \
  || die "ล้าง schema staging ไม่สำเร็จ (backup อยู่ที่ $BACKUP_DIR/stag-$TS.dump)"

run_pg "$STAG_URL" sh -c \
  'pg_restore --dbname="$PGCONN" --no-owner --no-privileges --no-comments /backup/'"prod-$TS.dump" \
  || ylw "      ⚠ pg_restore แจ้งเตือนบางรายการ (มักเป็นเรื่อง extension/owner) — ตรวจผลด้านล่าง"
grn "      ✔ restore เสร็จ"

echo
bold "[4/4] ตรวจผล"
run_pg "$STAG_URL" sh -c \
  'psql --dbname="$PGCONN" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='"'"'public'"'"';"' \
  | sed 's/^/      จำนวนตาราง: /'

echo
grn "✔ เสร็จสิ้น — staging ('$STAG_DB') มีข้อมูลเหมือน production แล้ว"
echo
echo "  backup ก่อนทับ : $BACKUP_DIR/stag-$TS.dump"
echo "  dump จาก prod  : $BACKUP_DIR/prod-$TS.dump"
echo
ylw "  ถ้าต้องการย้อนกลับ:"
echo "    docker run --rm -v \"$BACKUP_DIR:/backup\" -e PGCONN='<staging url>' $PG_IMAGE \\"
echo "      sh -c 'psql --dbname=\"\$PGCONN\" -c \"DROP SCHEMA public CASCADE; CREATE SCHEMA public;\" \\"
echo "             && pg_restore --dbname=\"\$PGCONN\" --no-owner --no-privileges /backup/stag-$TS.dump'"
echo
ylw "  อย่าลืม: หลัง clone แล้ว schema จะเป็นของ prod — ถ้า branch ไหนมี field ใหม่"
ylw "  ที่ยังไม่ขึ้น prod ต้องรัน 'make migrate-stag' ซ้ำ"
