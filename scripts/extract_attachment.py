#!/usr/bin/env python3
"""
extract_attachment.py  —  Extract a single attachment on-demand from an S3 tarball.

Usage:
  python3 extract_attachment.py <s3_uri> <member_path> <attachment_filename> <attachment_size_bytes>

  s3_uri             : full S3 URI of the archive tarball
  member_path        : path of the .eml file inside the tarball
  attachment_filename: filename of the attachment to extract
  attachment_size_bytes: expected size of the attachment (used to disambiguate)

Output (stdout):
  Line 1:   CONTENT_TYPE:<mime_type>
  Line 2+:  raw binary attachment content

Exit codes:
  0 — success
  1 — usage error
  2 — attachment not found in message
  3 — download/extract failure
"""
import sys
import os
import tempfile
import shutil
import tarfile
from email import policy
from email.parser import BytesParser

AWS_ENV = os.environ.copy()
AWS_ENV.setdefault('HOME', '/home/centos')
AWS_ENV.setdefault('AWS_CONFIG_FILE', '/home/centos/.aws/config')
AWS_ENV.setdefault('AWS_SHARED_CREDENTIALS_FILE', '/home/centos/.aws/credentials')
AWS_BIN = '/usr/bin/aws'


def die(code, msg):
    print('ERROR: ' + msg, file=sys.stderr)
    sys.exit(code)


def main():
    if len(sys.argv) != 5:
        die(1, 'Usage: extract_attachment.py <s3_uri> <member_path> <attachment_filename> <attachment_size_bytes>')

    s3_uri = sys.argv[1]
    member_path = sys.argv[2]
    target_filename = sys.argv[3]
    try:
        target_size = int(sys.argv[4])
    except ValueError:
        die(1, 'attachment_size_bytes must be an integer')

    work_dir = tempfile.mkdtemp(prefix='extract_att_')
    try:
        # 1. Download tarball from S3.
        tar_local = os.path.join(work_dir, 'archive.tar.gz')
        import subprocess
        rc = subprocess.call(
            [AWS_BIN, 's3', 'cp', s3_uri, tar_local],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=AWS_ENV,
        )
        if rc != 0:
            die(3, 'Failed to download tarball from S3: ' + s3_uri)

        # 2. Extract the specific .eml member from the tarball.
        raw_email = None
        with tarfile.open(tar_local, 'r:gz') as tf:
            try:
                member = tf.getmember(member_path)
            except KeyError:
                # Some tarballs may store paths with a leading ./ prefix.
                alt_path = './' + member_path
                try:
                    member = tf.getmember(alt_path)
                except KeyError:
                    die(2, 'Member not found in tarball: ' + member_path)

            if not member.isfile():
                die(2, 'Member is not a file: ' + member_path)

            raw_email = tf.extractfile(member).read()

        if not raw_email:
            die(2, 'Empty .eml file')

        # 3. Parse the .eml and find the matching attachment.
        msg = BytesParser(policy=policy.default).parsebytes(raw_email)
        found = None

        for part in msg.walk():
            cdisp = (part.get_content_disposition() or '').lower()
            part_filename = part.get_filename() or ''
            if not (cdisp == 'attachment' or (cdisp == 'inline' and part_filename)):
                continue

            if part_filename != target_filename:
                continue

            # Filename matches — verify size is close (within 10% or exact).
            try:
                payload = part.get_payload(decode=True)
                if payload is None:
                    continue
            except Exception:
                continue

            part_size = len(payload)
            if target_size > 0:
                size_diff = abs(part_size - target_size)
                if size_diff > max(target_size * 0.1, 1024):
                    continue  # Size mismatch beyond tolerance.

            found = (part, payload)
            break

        if found is None:
            # Debug: list what we did find to help diagnose mismatches.
            found_names = []
            for part in msg.walk():
                cdisp = (part.get_content_disposition() or '').lower()
                fn = part.get_filename() or ''
                if cdisp == 'attachment' or (cdisp == 'inline' and fn):
                    try:
                        pl = part.get_payload(decode=True)
                        sz = len(pl) if pl else 0
                    except Exception:
                        sz = -1
                    found_names.append('%s (%d bytes)' % (fn, sz))
            die(2, 'Attachment not found: "%s" (wanted %d bytes). Found: %s'
                % (target_filename, target_size, ', '.join(found_names) if found_names else 'none'))

        part, payload = found
        content_type = part.get_content_type() or 'application/octet-stream'

        # 4. Output: first line is CONTENT_TYPE header, then raw binary.
        sys.stdout.buffer.write(('CONTENT_TYPE:' + content_type + '\n').encode('utf-8'))
        sys.stdout.buffer.write(payload)
        sys.stdout.buffer.flush()

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
