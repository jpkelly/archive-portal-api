#!/usr/bin/env bash
set -u
set -o pipefail

cmd="${1:-}"
domain="${2:-}"
user="${3:-}"
from_date="${4:-}"
to_date="${5:-}"
mode="${6:-range}"
manifest_source="${7:-}"

if [[ -z "$cmd" || -z "$domain" || -z "$user" || -z "$from_date" || -z "$to_date" ]]; then
  echo "ERROR=Usage: archive_account_maintenance.sh <archive|delete> <domain> <user> <from_date> <to_date> [mode] [manifest_path_for_delete]"
  exit 2
fi

if [[ ! "$domain" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "ERROR=Invalid domain"
  exit 2
fi
if [[ ! "$user" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "ERROR=Invalid user"
  exit 2
fi
if [[ ! "$from_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR=Invalid from_date"
  exit 2
fi
if [[ ! "$to_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR=Invalid to_date"
  exit 2
fi

maildir="/var/qmail/mailnames/${domain}/${user}/Maildir"
if [[ ! -d "$maildir" ]]; then
  echo "ERROR=Maildir not found: $maildir"
  exit 3
fi

stamp="$(date +%Y%m%d_%H%M%S)"
work="/tmp/mail-archive-${domain}-${user}-${stamp}"
mkdir -p "$work"

next_day="$(date -u -d "$to_date + 1 day" '+%Y-%m-%d' 2>/dev/null || true)"
if [[ -z "$next_day" ]]; then
  echo "ERROR=Could not parse to_date"
  rm -rf "$work"
  exit 2
fi

if [[ "$cmd" == "archive" ]]; then
  sized="$work/files.tsv"
  paths="$work/paths.txt"

  sudo find "$maildir" -type f \
    ! -path '*/tmp/*' \
    -newermt "$from_date" \
    ! -newermt "$next_day" \
    -printf '%s\t%p\n' > "$sized"

  file_count="$(awk -F'\t' 'END{print NR+0}' "$sized")"

  if [[ "$file_count" -eq 0 ]]; then
    echo "STATUS=no_files"
    echo "FILE_COUNT=0"
    echo "SOURCE_BYTES=0"
    echo "ARCHIVE_BYTES=0"
    rm -rf "$work"
    exit 0
  fi

  src_bytes="$(awk -F'\t' '{s+=$1} END{printf "%.0f", s+0}' "$sized")"
  range_tag="range_${from_date}_to_${to_date}"
  if [[ "$mode" == "before" ]]; then
    range_tag="before_${to_date}"
  fi
  archive_file="${domain}_${user}_${range_tag}_${stamp}.tar.gz"
  checksum_file="${domain}_${user}_${range_tag}_${stamp}.sha256"
  manifest_file="${domain}_${user}_${range_tag}_${stamp}.manifest.txt"

  archive_path="$work/$archive_file"
  checksum_path="$work/$checksum_file"
  manifest_path="$work/$manifest_file"

  awk -F'\t' '{p=$2; sub("^/", "", p); print p}' "$sized" > "$paths"
  sudo tar -czf "$archive_path" -C / -T "$paths"
  sudo chown "$(id -u)":"$(id -g)" "$archive_path"
  gzip -t "$archive_path"

  archive_bytes="$(stat -f '%z' "$archive_path")"
  sha256 -q "$archive_path" > "$checksum_path"

  {
    echo "domain=$domain"
    echo "user=$user"
    echo "mode=$mode"
    echo "from_date=$from_date"
    echo "to_date=$to_date"
    echo "file_count=$file_count"
    echo "source_bytes=$src_bytes"
    echo "archive_file=$archive_file"
    echo "archive_bytes=$archive_bytes"
    echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$manifest_path"
  awk -F'\t' '{print "PATH=" $2}' "$sized" >> "$manifest_path"

  s3prefix="s3://smallgod-mail-archive/archive/${stamp}/${domain}/${user}"
  aws s3 cp "$archive_path" "$s3prefix/" --only-show-errors
  aws s3 cp "$checksum_path" "$s3prefix/" --only-show-errors
  aws s3 cp "$manifest_path" "$s3prefix/" --only-show-errors

  echo "STATUS=ok"
  echo "FILE_COUNT=$file_count"
  echo "SOURCE_BYTES=$src_bytes"
  echo "ARCHIVE_BYTES=$archive_bytes"
  echo "ARCHIVE_S3_URI=$s3prefix/$archive_file"

  rm -rf "$work"
  exit 0
fi

if [[ "$cmd" == "delete" ]]; then
  paths="$work/delete_paths.txt"

  if [[ -z "$manifest_source" ]]; then
    echo "ERROR=Manifest file is required for delete"
    rm -rf "$work"
    exit 2
  fi

  if [[ ! -f "$manifest_source" ]]; then
    echo "ERROR=Manifest file not found: $manifest_source"
    rm -rf "$work"
    exit 4
  fi

  expected_count="$(awk -F= '$1 == "file_count" {print $2}' "$manifest_source" | tail -n 1)"
  if [[ -n "$expected_count" && ! "$expected_count" =~ ^[0-9]+$ ]]; then
    echo "ERROR=Manifest file_count is invalid"
    rm -rf "$work"
    exit 4
  fi

  awk -F= '/^PATH=/{print substr($0, 6)}' "$manifest_source" > "$paths"
  manifest_count="$(awk 'END{print NR+0}' "$paths")"

  if [[ "$manifest_count" -eq 0 ]]; then
    if [[ "${expected_count:-0}" -eq 0 ]]; then
      echo "STATUS=ok"
      echo "DELETED_COUNT=0"
      rm -rf "$work"
      exit 0
    fi

    echo "ERROR=Manifest contains no PATH entries"
    rm -rf "$work"
    exit 4
  fi

  if [[ -n "$expected_count" && "$manifest_count" -ne "$expected_count" ]]; then
    echo "ERROR=Manifest path count does not match file_count"
    rm -rf "$work"
    exit 4
  fi

  while IFS= read -r target; do
    if [[ -n "$target" && "$target" != "$maildir"/* ]]; then
      echo "ERROR=Manifest path is outside maildir: $target"
      rm -rf "$work"
      exit 4
    fi
  done < "$paths"

  if [[ "${expected_count:-0}" -eq 0 ]]; then
    echo "STATUS=ok"
    echo "DELETED_COUNT=0"
    rm -rf "$work"
    exit 0
  fi

  deleted_count="0"
  while IFS= read -r target; do
    if [[ -n "$target" ]]; then
      sudo rm -f -- "$target" && deleted_count=$((deleted_count + 1))
    fi
  done < "$paths"

  echo "STATUS=ok"
  echo "DELETED_COUNT=$deleted_count"
  rm -rf "$work"
  exit 0
fi

echo "ERROR=Unknown command: $cmd"
rm -rf "$work"
exit 2
