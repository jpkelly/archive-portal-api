#!/usr/bin/env python3
"""Repair archive_file_count, archive_source_bytes, and archive_bytes for all
accounts where they are 0, by reading the correct values from the S3 manifest.

Usage:
  python3 repair_archive_counts.py [--dry-run]
"""

import subprocess
import sys

PREFIX = 's3://smallgod-mail-archive'


def plesk_db(sql):
    proc = subprocess.Popen(
        ['sudo', 'plesk', 'db', '-B', '-N'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    out, err = proc.communicate(sql.encode('utf-8'))
    if proc.returncode != 0:
        raise RuntimeError(err.decode(errors='ignore').strip())
    return out.decode(errors='ignore')


def get_stale_accounts():
    """Return list of (account_id, username, domain, archive_s3_uri)."""
    sql = (
        "SELECT a.id, a.username, d.name AS domain, maa.archive_s3_uri "
        "FROM mail_archive.mail_account_archives maa "
        "JOIN mail_archive.mail_accounts a ON a.id = maa.account_id "
        "JOIN mail_archive.domains d ON d.id = a.domain_id "
        "WHERE maa.archive_file_count = 0 "
        "  AND maa.archive_s3_uri IS NOT NULL "
        "  AND maa.archive_s3_uri != '' "
        "ORDER BY d.name, a.username"
    )
    out = plesk_db(sql)
    rows = []
    for line in out.strip().split('\n'):
        if not line.strip():
            continue
        parts = line.split('\t')
        if len(parts) >= 4:
            rows.append({
                'account_id': parts[0].strip(),
                'username': parts[1].strip(),
                'domain': parts[2].strip(),
                's3_uri': parts[3].strip(),
            })
    return rows


def manifest_uri(s3_uri):
    """Derive manifest S3 path from the tarball path."""
    if s3_uri.endswith('.tar.gz'):
        return s3_uri[:-7] + '.manifest.txt'
    return s3_uri + '.manifest.txt'


def fetch_manifest(s3_uri):
    """Download manifest and return parsed dict."""
    mani_uri = manifest_uri(s3_uri)
    proc = subprocess.Popen(
        ['aws', 's3', 'cp', mani_uri, '-'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    out, err = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError('Failed to download %s: %s' % (mani_uri, err.decode(errors='ignore').strip()))
    data = {}
    for line in out.decode(errors='ignore').split('\n'):
        if '=' in line:
            k, v = line.split('=', 1)
            data[k.strip()] = v.strip()
    return data


def update_account(account_id, file_count, source_bytes, archive_bytes):
    sql = (
        "UPDATE mail_archive.mail_account_archives "
        "SET archive_file_count = %d, "
        "    archive_source_bytes = %d, "
        "    archive_bytes = %d "
        "WHERE account_id = '%s'" % (file_count, source_bytes, archive_bytes, account_id)
    )
    plesk_db(sql)


def main():
    dry_run = '--dry-run' in sys.argv

    accounts = get_stale_accounts()
    print('Found %d accounts with archive_file_count = 0' % len(accounts))

    fixed = 0
    failed = 0

    for acct in accounts:
        try:
            mani = fetch_manifest(acct['s3_uri'])
            fc = int(mani.get('file_count', 0))
            sb = int(mani.get('source_bytes', 0))
            ab = int(mani.get('archive_bytes', 0))

            if fc == 0:
                print('  SKIP %s/%s — manifest file_count is 0' % (acct['domain'], acct['username']))
                failed += 1
                continue

            if dry_run:
                print('  WOULD FIX %s/%s: file_count=%d source_bytes=%d archive_bytes=%d' % (
                    acct['domain'], acct['username'], fc, sb, ab))
            else:
                update_account(acct['account_id'], fc, sb, ab)
                print('  FIXED %s/%s: file_count=%d' % (acct['domain'], acct['username'], fc))

            fixed += 1
        except Exception as e:
            print('  ERROR %s/%s: %s' % (acct['domain'], acct['username'], str(e)[:100]))
            failed += 1

    print('\nDone: %d fixed, %d failed, %d total' % (fixed, failed, len(accounts)))


if __name__ == '__main__':
    main()
