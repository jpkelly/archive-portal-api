#!/usr/bin/env python3
"""
list_attachments.py  —  List attachment metadata for a single .eml in an S3 tarball.

Usage:
  python3 list_attachments.py <s3_uri> <member_path>

  s3_uri       : full S3 URI of the archive tarball
  member_path  : path of the .eml file inside the tarball

Output (stdout) — one JSON object per attachment, one per line:
  {"filename":"...","mime_type":"...","size_bytes":1234}

Exit codes:
  0 — success (may produce zero lines if no attachments found)
  1 — usage error
  3 — download/extract failure
"""
import sys
import os
import json
import tempfile
import shutil
import tarfile
import subprocess
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
    if len(sys.argv) != 3:
        die(1, 'Usage: list_attachments.py <s3_uri> <member_path>')

    s3_uri = sys.argv[1]
    member_path = sys.argv[2]

    work_dir = tempfile.mkdtemp(prefix='list_att_')
    try:
        # 1. Download tarball from S3.
        tar_local = os.path.join(work_dir, 'archive.tar.gz')
        rc = subprocess.call(
            [AWS_BIN, 's3', 'cp', s3_uri, tar_local],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=AWS_ENV,
        )
        if rc != 0:
            die(3, 'Failed to download tarball from S3: ' + s3_uri)

        # 2. Extract the specific .eml member.
        raw_email = None
        with tarfile.open(tar_local, 'r:gz') as tf:
            try:
                member = tf.getmember(member_path)
            except KeyError:
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

        # 3. Parse the .eml and list attachments (metadata only).
        msg = BytesParser(policy=policy.default).parsebytes(raw_email)

        for part in msg.walk():
            cdisp = (part.get_content_disposition() or '').lower()
            part_filename = part.get_filename() or ''
            if not (cdisp == 'attachment' or (cdisp == 'inline' and part_filename)):
                continue

            try:
                payload = part.get_payload(decode=True)
                if payload is None:
                    continue
                size_bytes = len(payload)
            except Exception:
                continue

            if size_bytes == 0:
                continue

            content_type = (part.get_content_type() or 'application/octet-stream')
            sys.stdout.write(json.dumps({
                'filename': part_filename,
                'mime_type': content_type[:255],
                'size_bytes': size_bytes,
            }) + '\n')

        sys.stdout.flush()

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
