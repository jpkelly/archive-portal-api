#!/usr/bin/env python3
"""
extract_body.py  —  Extract body text + HTML from a single .eml in an S3 tarball.

Usage:
  python3 extract_body.py <s3_uri> <member_path>

  s3_uri       : full S3 URI of the archive tarball
  member_path  : path of the .eml file inside the tarball

Output (stdout):
  JSON object with keys: body_text, body_html, preview_text

Exit codes:
  0 — success
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
import re
from html import unescape
from email import policy
from email.parser import BytesParser

AWS_ENV = os.environ.copy()
AWS_ENV.setdefault('HOME', '/home/centos')
AWS_ENV.setdefault('AWS_CONFIG_FILE', '/home/centos/.aws/config')
AWS_ENV.setdefault('AWS_SHARED_CREDENTIALS_FILE', '/home/centos/.aws/credentials')
AWS_BIN = '/usr/bin/aws'

MAX_BODY_TEXT = 200000
MAX_BODY_HTML = 500000
MAX_PREVIEW = 500


def die(code, msg):
    print('ERROR: ' + msg, file=sys.stderr)
    sys.exit(code)


def html_to_text(html):
    if not html:
        return ''
    s = re.sub(r'(?is)<(script|style).*?>.*?</\1>', ' ', html)
    s = re.sub(r'(?i)<br\s*/?>', '\n', s)
    s = re.sub(r'(?i)</p\s*>', '\n\n', s)
    s = re.sub(r'(?i)</div\s*>', '\n', s)
    s = re.sub(r'(?s)<[^>]+>', ' ', s)
    s = unescape(s)
    s = re.sub(r'\r', '\n', s)
    s = re.sub(r'\n\s*\n\s*\n+', '\n\n', s)
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()


def parse_body(raw_email):
    """Extract body text and HTML from a raw .eml, same logic as ingest_worker."""
    msg = BytesParser(policy=policy.default).parsebytes(raw_email)
    body = ''
    body_html = ''

    if msg.is_multipart():
        plain_parts = []
        html_parts = []
        for p in msg.walk():
            ctype = (p.get_content_type() or '').lower()
            # Skip attachments — only extract text bodies.
            cdisp = (p.get_content_disposition() or '').lower()
            if cdisp == 'attachment':
                continue
            if ctype == 'text/plain':
                try:
                    plain_parts.append(p.get_content())
                except Exception:
                    try:
                        payload = p.get_payload(decode=True) or b''
                        plain_parts.append(payload.decode(errors='ignore'))
                    except Exception:
                        pass
            elif ctype == 'text/html':
                try:
                    html_parts.append(p.get_content())
                except Exception:
                    try:
                        payload = p.get_payload(decode=True) or b''
                        html_parts.append(payload.decode(errors='ignore'))
                    except Exception:
                        pass
        body = '\n\n'.join([p for p in plain_parts if p])
        body_html = '\n\n'.join([h for h in html_parts if h])
    else:
        ctype = (msg.get_content_type() or '').lower()
        try:
            content = msg.get_content() or ''
        except Exception:
            payload = msg.get_payload(decode=True) or b''
            content = payload.decode(errors='ignore')
        if ctype == 'text/html':
            body_html = content
            body = html_to_text(content)
        else:
            body = content

    if not body and body_html:
        body = html_to_text(body_html)

    # Build preview from the plain-text body.
    preview = (body or '').strip().replace('\r', '\n')
    preview = '\n'.join([ln.strip() for ln in preview.split('\n') if ln.strip()][:3])
    if len(preview) > MAX_PREVIEW:
        preview = preview[:MAX_PREVIEW]

    # Truncate to match ingest limits.
    if len(body) > MAX_BODY_TEXT:
        body = body[:MAX_BODY_TEXT]
    if len(body_html) > MAX_BODY_HTML:
        body_html = body_html[:MAX_BODY_HTML]

    return {
        'body_text': body,
        'body_html': body_html,
        'preview_text': preview,
    }


def main():
    if len(sys.argv) != 3:
        die(1, 'Usage: extract_body.py <s3_uri> <member_path>')

    s3_uri = sys.argv[1]
    member_path = sys.argv[2]

    work_dir = tempfile.mkdtemp(prefix='extract_body_')
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

        # 3. Parse body and output JSON.
        result = parse_body(raw_email)
        sys.stdout.write(json.dumps(result) + '\n')
        sys.stdout.flush()

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
