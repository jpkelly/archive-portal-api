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
  echo "ERROR=Usage: archive_account_maintenance.sh <archive|delete|report> <domain> <user> <from_date> <to_date> [mode] [manifest_path_for_delete]"
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

  echo "PROGRESS: finding pre-$to_date files"
  sudo find "$maildir" -type f \
    ! -path '*/tmp/*' \
    -newermt "$from_date" \
    ! -newermt "$next_day" \
    -printf '%s\t%p\n' > "$sized"

  file_count="$(awk -F'\t' 'END{print NR+0}' "$sized")"

  if [[ "$file_count" -eq 0 ]]; then
    echo "PROGRESS: no files found in range"
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
  echo "PROGRESS: tarring $file_count files ($(awk -F'\t' 'BEGIN{s=0}{s+=$1}END{printf "%.1f", s/1048576}' "$sized") MB)"
  if ! sudo tar -czf "$archive_path" -C / -T "$paths"; then
    echo "ERROR=Failed to create archive tarball"
    rm -rf "$work"
    exit 5
  fi
  if ! sudo chown "$(id -u)":"$(id -g)" "$archive_path" 2>/dev/null; then
    # Non-fatal: archive file remains root-owned but world-readable.
    :
  fi
  if ! gzip -t "$archive_path"; then
    echo "ERROR=Archive integrity check failed"
    rm -rf "$work"
    exit 5
  fi

  if ! archive_bytes="$(stat -c '%s' "$archive_path" 2>/dev/null)"; then
    echo "ERROR=Failed to read archive size"
    rm -rf "$work"
    exit 5
  fi
  if [[ ! "$archive_bytes" =~ ^[0-9]+$ ]]; then
    echo "ERROR=Archive size is invalid"
    rm -rf "$work"
    exit 5
  fi

  checksum="$(sha256sum "$archive_path" 2>/dev/null | awk '{print $1}')"
  if [[ ! "$checksum" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "ERROR=Failed to generate archive checksum"
    rm -rf "$work"
    exit 5
  fi
  echo "$checksum" > "$checksum_path"
  if [[ ! -s "$checksum_path" ]]; then
    echo "ERROR=Checksum file is empty"
    rm -rf "$work"
    exit 5
  fi

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
  echo "PROGRESS: uploading archive ($(numfmt --to=iec $archive_bytes 2>/dev/null || echo ${archive_bytes} bytes))"
  aws s3 cp "$archive_path" "$s3prefix/" --only-show-errors
  echo "PROGRESS: uploading manifest"
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

if [[ "$cmd" == "report" ]]; then
  # Large-mailbox tolerance: do a SINGLE find pass that emits each file's size
  # and modification time (epoch seconds) and compute every aggregate in one awk
  # pass. The previous implementation ran two full find passes and then forked a
  # `stat` process per file in a bash loop, which for mailboxes with 100k+ files
  # meant 100k+ subprocess forks and routinely exceeded the report timeout —
  # leaving rows perpetually errored and "stale". This version touches each inode
  # once and uses no per-file subprocesses, so even very large mailboxes finish
  # quickly and never time out.
  now_epoch="$(date +%s)"
  from_epoch="$(date -u -d "$from_date" +%s 2>/dev/null || echo 0)"
  next_day_epoch="$(date -u -d "$next_day" +%s 2>/dev/null || echo 0)"

  report="$(sudo find "$maildir" -type f \
    ! -path '*/tmp/*' \
    -printf '%s\t%T@\n' \
    | awk -F'\t' \
        -v now="$now_epoch" -v lo="$from_epoch" -v hi="$next_day_epoch" '
      {
        size = $1 + 0;
        mt = int($2);
        files += 1;
        total += size;
        age_days = (now - mt) / 86400;
        if (age_days > 1095)      gt3y  += size;
        else if (age_days >= 365) y1to3 += size;
        else                      lt1y  += size;
        if (mt >= lo && mt < hi)  reclaim += size;
      }
      END {
        printf "%d\t%.0f\t%.0f\t%.0f\t%.0f\t%.0f\n",
          files + 0, total + 0, gt3y + 0, y1to3 + 0, lt1y + 0, reclaim + 0;
      }')"

  # If the find|awk pipeline produced nothing (e.g. permission failure), report a
  # clear error instead of silently emitting zeros.
  if [[ -z "$report" ]]; then
    echo "ERROR=Report scan produced no output for $maildir"
    rm -rf "$work"
    exit 4
  fi

  IFS=$'\t' read -r total_files total_bytes gt3y y1to3 lt1y reclaimable_bytes <<< "$report"

  reclaim_key_date="${to_date//-/}"
  echo "STATUS=ok"
  echo "TOTAL_FILES=$total_files"
  echo "TOTAL_BYTES=$total_bytes"
  echo "BUCKET_GT3Y_BYTES=$gt3y"
  echo "BUCKET_1Y_TO_3Y_BYTES=$y1to3"
  echo "BUCKET_LT1Y_BYTES=$lt1y"
  echo "RANGE_FROM=$from_date"
  echo "RANGE_TO=$to_date"
  echo "MODE=$mode"
  echo "RECLAIMABLE_BYTES=$reclaimable_bytes"
  echo "RECLAIMABLE_BEFORE_${reclaim_key_date}_BYTES=$reclaimable_bytes"

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

  echo "PROGRESS: starting deletion of $manifest_count files"

  deleted_count="0"
  progress_interval=500
  next_milestone=$progress_interval
  while IFS= read -r target; do
    if [[ -n "$target" ]]; then
      sudo rm -f -- "$target" && deleted_count=$((deleted_count + 1))
      if [[ "$deleted_count" -ge "$next_milestone" ]]; then
        echo "PROGRESS: deleted $deleted_count / $manifest_count files"
        next_milestone=$((deleted_count + progress_interval))
      fi
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
