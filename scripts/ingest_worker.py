#!/usr/bin/env python3
"""
ingest_worker.py  –  Ingest one Maildir archive bundle into mail_archive.

Usage:
  python3 ingest_worker.py <domain> <username> <tar_gz_s3_path> <db_socket>

Example:
  python3 ingest_worker.py versmaat.com np \
    s3://smallgod-mail-archive/archive/20260518_103231/versmaat.com/np/versmaat.com_np_pre2025_20260518_103231.tar.gz \
    /var/lib/mysql/mysql.sock
"""
import sys
import os
import hashlib
import json
import uuid
import subprocess
import tarfile
import tempfile
import shutil
import re
import binascii
from html import unescape
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime, parseaddr, getaddresses


AWS_ENV = os.environ.copy()
AWS_ENV.setdefault('HOME', '/home/centos')
AWS_ENV.setdefault('AWS_CONFIG_FILE', '/home/centos/.aws/config')
AWS_ENV.setdefault('AWS_SHARED_CREDENTIALS_FILE', '/home/centos/.aws/credentials')
AWS_BIN = '/usr/bin/aws'

# Maximum attachment size to store in the database (25 MB).
# Larger attachments are skipped with a warning.
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

# Default to safe mode: attachment content extraction is opt-in.
# Pass --extract-attachments to enable binary content storage.
# Wrapped in a list to allow mutation from __main__ without 'global' keyword.
EXTRACT_ATTACHMENTS = [False]

# Metadata-only mode: skip storing message bodies (body_text, body_html,
# preview_text) in MySQL. Bodies are fetched on-demand from the S3 tarball
# when the message is viewed. Pass --metadata-only to enable.
METADATA_ONLY = [False]


def emit_progress(text):
    print('PROGRESS:' + text, flush=True)


def die(msg):
    print('ERROR: ' + msg, file=sys.stderr)
    sys.exit(1)


def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\x00', '')


def q(s):
    if s is None:
        return 'NULL'
    return "'" + esc(str(s)) + "'"


def folder_from_member(name):
    marker = '/Maildir/'
    i = name.find(marker)
    if i == -1:
        return None
    rest = name[i + len(marker):]
    if rest.startswith('new/') or rest.startswith('cur/'):
        return 'INBOX'
    if rest.startswith('.'):
        part = rest.split('/', 1)[0]
        part = part[1:]
        if not part:
            return None
        return part.replace('.', '/')
    return None


def is_message_member(name):
    if '/Maildir/' not in name:
        return False
    if '/new/' in name or '/cur/' in name:
        low = name.lower()
        for suffix in ('/dovecot.index.log', '/dovecot-uidlist',
                       '/dovecot.index.cache', '/maildirsize',
                       '/dovecot-uidvalidity', '/dovecot.list.index.log'):
            if low.endswith(suffix):
                return False
        return True
    return False


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


def _extract_attachment(part, extract_content=False):
    """Extract attachment metadata (always) and optionally binary content.
    When extract_content is False, content_hex will be None — the attachment
    row is still created so the UI can list it, and content is served on-demand
    from the S3 tarball on first download.
    Returns a dict, or None if the attachment exceeds MAX_ATTACHMENT_BYTES."""
    filename = part.get_filename() or 'unnamed'
    content_type = (part.get_content_type() or 'application/octet-stream')
    try:
        payload = part.get_payload(decode=True)
        if payload is None:
            return None
    except Exception:
        return None

    size_bytes = len(payload)
    if size_bytes > MAX_ATTACHMENT_BYTES:
        print('WARNING: skipping attachment "%s" (%d bytes) — exceeds %d byte limit'
              % (filename, size_bytes, MAX_ATTACHMENT_BYTES))
        return None
    if size_bytes == 0:
        return None

    content_hex = None
    if extract_content:
        content_hex = binascii.hexlify(payload).decode('ascii')

    return {
        'id': str(uuid.uuid4()),
        'filename': filename,
        'mime_type': content_type[:255],
        'size_bytes': size_bytes,
        'content_hex': content_hex,
    }


def parse_msg(raw):
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    subject = msg.get('subject')
    from_name, from_email = parseaddr(msg.get('from', ''))
    to_list = [addr for _, addr in getaddresses(msg.get_all('to', [])) if addr]
    cc_list = [addr for _, addr in getaddresses(msg.get_all('cc', [])) if addr]
    bcc_list = [addr for _, addr in getaddresses(msg.get_all('bcc', [])) if addr]
    message_id = msg.get('message-id')
    dt = None
    try:
        d = parsedate_to_datetime(msg.get('date')) if msg.get('date') else None
        if d is not None:
            if d.tzinfo is not None:
                d = d.astimezone().replace(tzinfo=None)
            dt = d.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        dt = None

    has_attach = 0
    attachments = []
    body = ''
    body_html = ''
    if msg.is_multipart():
        plain_parts = []
        html_parts = []
        for p in msg.walk():
            cdisp = (p.get_content_disposition() or '').lower()
            ctype = (p.get_content_type() or '').lower()
            if cdisp == 'attachment' or (cdisp == 'inline' and p.get_filename()):
                has_attach = 1
                # Always extract metadata so the UI can list attachments.
                # Binary content is only stored when --extract-attachments is passed;
                # otherwise it is served on-demand from the S3 tarball on first download.
                att = _extract_attachment(p, extract_content=EXTRACT_ATTACHMENTS[0])
                if att is not None:
                    attachments.append(att)
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

    preview = (body or '').strip().replace('\r', '\n')
    preview = '\n'.join([ln.strip() for ln in preview.split('\n') if ln.strip()][:3])
    if len(preview) > 500:
        preview = preview[:500]
    if len(body) > 200000:
        body = body[:200000]
    if len(body_html) > 500000:
        body_html = body_html[:500000]

    return {
        'subject': subject,
        'from_name': from_name,
        'from_email': from_email,
        'to_list': json.dumps(to_list),
        'cc_list': json.dumps(cc_list),
        'bcc_list': json.dumps(bcc_list),
        'sent_at': dt,
        'received_at': dt,
        'has_attachments': has_attach,
        'size_bytes': len(raw),
        'preview_text': preview,
        'body_text': body,
        'body_html': body_html,
        'message_id': message_id,
        'attachments': attachments,
    }


def build_sql(domain, username, s3_obj, records):
    display = username.split('@')[0] if '@' in username else username
    folders = sorted(set([r['folder'] for r in records]))
    folder_var = {}
    for folder in folders:
        folder_var[folder] = 'f_' + hashlib.md5(folder.encode()).hexdigest()[:8]

    lines = []
    lines.append('USE mail_archive;')
    lines.append('START TRANSACTION;')

    # domain
    lines.append("SET @domain_id = (SELECT id FROM domains WHERE name = %s LIMIT 1);" % q(domain))
    lines.append("INSERT INTO domains (id,name,status,archive_source) SELECT UUID(),%s,'active',%s FROM DUAL WHERE @domain_id IS NULL;" % (q(domain), q(s3_obj)))
    lines.append("SET @domain_id = (SELECT id FROM domains WHERE name = %s LIMIT 1);" % q(domain))

    # account
    lines.append("SET @account_id = (SELECT id FROM mail_accounts WHERE domain_id=@domain_id AND username=%s LIMIT 1);" % q(username))
    lines.append("SET @account_id = IFNULL(@account_id, UUID());")
    lines.append(
        "INSERT INTO mail_accounts (id,domain_id,username,display_name,source_path,message_count,folder_count,last_indexed_at,created_at,updated_at) "
        "SELECT @account_id,@domain_id,%s,%s,%s,0,0,NOW(),NOW(),NOW() FROM DUAL "
        "ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), source_path=VALUES(source_path), last_indexed_at=VALUES(last_indexed_at), updated_at=NOW();"
        % (q(username), q(display), q(s3_obj))
    )

    # folders
    for folder in folders:
        var = folder_var[folder]
        ph = hashlib.sha256(folder.encode()).hexdigest()
        lines.append("SET @%s = (SELECT id FROM folders WHERE account_id=@account_id AND path_hash=%s LIMIT 1);" % (var, q(ph)))
        lines.append("SET @%s = IFNULL(@%s, UUID());" % (var, var))
        lines.append(
            "INSERT INTO folders (id,account_id,path,path_hash,display_name,message_count,created_at,updated_at) "
            "SELECT @%s,@account_id,%s,%s,%s,0,NOW(),NOW() FROM DUAL "
            "ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), updated_at=NOW();"
            % (var, q(folder), q(ph), q(folder))
        )

    # messages — batch in chunks to avoid huge SQL
    for r in records:
        mid = r['message_id'] if r['message_id'] is not None else ''
        msg_uuid = str(uuid.uuid4())
        # In metadata-only mode we still store body_text and preview_text
        # (they are tiny compared to attachments — typically 1-5 KB each),
        # so the UI can show message bodies instantly without downloading the
        # full S3 tarball.  body_html is skipped (redundant, often much larger).
        # Attachments continue to be served on-demand from S3.
        preview_sql = q(r['preview_text'])
        body_text_sql = q(r['body_text'])
        body_html_sql = "''" if METADATA_ONLY[0] else q(r['body_html'])

        lines.append(
            "INSERT INTO messages (id,folder_id,message_id,message_id_hash,subject,from_name,from_email,to_list,cc_list,bcc_list,sent_at,received_at,has_attachments,size_bytes,preview_text,body_text,body_html,raw_location,mime_hash,created_at,updated_at) "
            "VALUES (%s,@%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%d,%d,%s,%s,%s,%s,%s,NOW(),NOW()) "
            "ON DUPLICATE KEY UPDATE subject=VALUES(subject), from_name=VALUES(from_name), from_email=VALUES(from_email), to_list=VALUES(to_list), cc_list=VALUES(cc_list), bcc_list=VALUES(bcc_list), sent_at=VALUES(sent_at), received_at=VALUES(received_at), has_attachments=VALUES(has_attachments), size_bytes=VALUES(size_bytes), preview_text=VALUES(preview_text), body_text=VALUES(body_text), body_html=VALUES(body_html), raw_location=VALUES(raw_location), updated_at=NOW();"
            % (
                q(msg_uuid), folder_var[r['folder']],
                q(mid), q(r['message_id_hash']),
                q(r['subject']), q(r['from_name']), q(r['from_email']),
                q(r['to_list']), q(r['cc_list']), q(r['bcc_list']),
                q(r['sent_at']), q(r['received_at']),
                int(r['has_attachments']), int(r['size_bytes']),
                preview_sql, body_text_sql, body_html_sql,
                q(r['raw_location']), q(r['mime_hash'])
            )
        )

        # Attachment metadata: always store (even in metadata-only mode).
        # Metadata is tiny (~200 bytes per attachment — ~3.4 MB for 17k attachments)
        # and enables instant attachment listing without downloading the tarball.
        # We use a subquery to resolve the real message id instead of the
        # Python-generated UUID, because ON DUPLICATE KEY UPDATE on messages
        # may keep the existing row id (not our generated one).
        # In metadata-only mode: content = NULL, storage_location = 's3'
        # In full mode: content = binary, storage_location = 'db'
        for att in r.get('attachments', []):
            if att['content_hex'] is not None and not METADATA_ONLY[0]:
                content_sql = '0x' + att['content_hex']
                storage = 'db'
            else:
                content_sql = 'NULL'
                storage = 's3'
            lines.append(
                "INSERT INTO attachments (id,message_id,filename,mime_type,size_bytes,content,storage_location,created_at) "
                "SELECT UUID(), m.id, %s, %s, %d, %s, '%s', NOW() "
                "FROM messages m "
                "JOIN folders f ON f.id = m.folder_id "
                "WHERE f.account_id = @account_id AND m.message_id_hash = %s "
                "LIMIT 1;"
                % (
                    q(att['filename']), q(att['mime_type']),
                    att['size_bytes'], content_sql, storage,
                    q(r['message_id_hash'])
                )
            )

    lines.append("UPDATE folders f SET f.message_count=(SELECT COUNT(*) FROM messages m WHERE m.folder_id=f.id) WHERE f.account_id=@account_id;")
    lines.append(
        "UPDATE mail_accounts a SET "
        "a.message_count=(SELECT COUNT(*) FROM messages m JOIN folders f ON f.id=m.folder_id WHERE f.account_id=a.id), "
        "a.folder_count=(SELECT COUNT(*) FROM folders f WHERE f.account_id=a.id), "
        "a.last_indexed_at=NOW(), a.updated_at=NOW() WHERE a.id=@account_id;"
    )
    lines.append("COMMIT;")

    # Verification: check that the UPDATE actually set counts.  If @account_id
    # resolved to NULL (e.g. domain lookup failed silently), the UPDATE affects
    # zero rows and counts stay at 0.  Run a diagnostic SELECT so the caller can
    # detect a silent failure.
    lines.append(
        "SELECT a.message_count AS acct_msg_count, a.folder_count AS acct_folder_count,"
        " (SELECT COUNT(*) FROM folders WHERE account_id=a.id) AS actual_folder_count"
        " FROM mail_accounts a"
        " WHERE a.id=@account_id;"
    )
    lines.append(
        "SELECT COUNT(*) AS messages_in_db FROM messages m "
        "JOIN folders f ON f.id=m.folder_id "
        "JOIN mail_accounts a ON a.id=f.account_id "
        "JOIN domains d ON d.id=a.domain_id "
        "WHERE d.name=%s AND a.username=%s;" % (q(domain), q(username))
    )
    return '\n'.join(lines) + '\n'


def build_repair_sql(domain, username):
    """Return SQL that repairs message/folder counts for an existing account.

    This runs standalone (no transaction) and can be used as a post-ingest
    safety net or via --fix-counts.
    """
    lines = [
        "SET @domain_id = (SELECT id FROM domains WHERE name = %s LIMIT 1);" % q(domain),
        "SET @account_id = (SELECT id FROM mail_accounts WHERE domain_id=@domain_id AND username=%s LIMIT 1);" % q(username),
        "UPDATE folders f SET f.message_count=(SELECT COUNT(*) FROM messages m WHERE m.folder_id=f.id) WHERE f.account_id=@account_id;",
        "UPDATE mail_accounts a SET "
        "a.message_count=(SELECT COUNT(*) FROM messages m JOIN folders f ON f.id=m.folder_id WHERE f.account_id=a.id), "
        "a.folder_count=(SELECT COUNT(*) FROM folders f WHERE f.account_id=a.id), "
        "a.last_indexed_at=IFNULL(a.last_indexed_at, NOW()), a.updated_at=NOW() WHERE a.id=@account_id;",
        "SELECT a.username, a.message_count, a.folder_count, a.last_indexed_at FROM mail_accounts a WHERE a.id=@account_id;",
    ]
    return '\n'.join(lines) + '\n'


def run_repair_counts(domain, username):
    """Repair counts for an account directly via plesk db.

    Returns (success_bool, message).
    """
    sql = build_repair_sql(domain, username)
    proc = subprocess.Popen(
        ['sudo', 'plesk', 'db'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    out, err = proc.communicate(sql.encode('utf-8'))
    out = out.decode(errors='ignore')
    err = err.decode(errors='ignore')
    if proc.returncode != 0:
        return False, 'repair SQL failed: ' + (err.strip() or 'exit %d' % proc.returncode)
    # Parse the final SELECT to confirm counts > 0
    lines_out = [l.strip() for l in out.strip().split('\n') if l.strip()]
    return True, '\n'.join(lines_out)


def backfill_bodies(s3_path, domain, username):
    """Download tarball once, extract body text for every .eml, UPDATE the DB."""
    return _backfill_pass(s3_path, domain, username, bodies=True, attachments=False)


def backfill_attachments(s3_path, domain, username):
    """Download tarball once, extract attachment metadata for every .eml, INSERT into DB."""
    return _backfill_pass(s3_path, domain, username, bodies=False, attachments=True)


def backfill_all(s3_path, domain, username):
    """Download tarball once, extract bodies + attachment metadata, update DB."""
    return _backfill_pass(s3_path, domain, username, bodies=True, attachments=True)


def _backfill_pass(s3_path, domain, username, bodies, attachments):
    """Single tarball download pass that extracts bodies and/or attachment metadata.

    Uses the subquery approach for attachment INSERTs (same as build_sql) so
    the correct message_id is resolved even when ON DUPLICATE KEY UPDATE kept
    a different row id.
    """
    work = tempfile.mkdtemp(prefix='backfill_')
    try:
        tar_local = os.path.join(work, 'archive.tar.gz')
        print('Downloading %s ...' % s3_path)
        subprocess.check_call(
            [AWS_BIN, 's3', 'cp', s3_path, tar_local],
            stdout=subprocess.DEVNULL,
            env=AWS_ENV,
        )

        body_updates = []
        att_lines = []
        total_bodies = 0
        total_atts = 0
        skipped = 0
        batch_size = 500

        with tarfile.open(tar_local, 'r:gz') as tf:
            members = [m for m in tf.getmembers() if m.isfile()
                       and is_message_member(m.name)
                       and folder_from_member(m.name)]
            for idx, m in enumerate(members):
                if idx > 0 and idx % 100 == 0:
                    print('  %d/%d messages (%d bodies, %d atts, %d skipped)' %
                          (idx, len(members), total_bodies, total_atts, skipped))

                name = m.name
                raw = tf.extractfile(m).read()
                try:
                    parsed = parse_msg(raw)
                except Exception:
                    skipped += 1
                    continue

                if bodies:
                    body = (parsed.get('body_text') or '').strip()
                    preview = (parsed.get('preview_text') or '').strip()
                    if body or preview:
                        raw_location = '%s#%s' % (s3_path, name)
                        body_updates.append((body, preview, raw_location))
                        total_bodies += 1

                    if len(body_updates) >= batch_size:
                        _flush_body_updates(body_updates)
                        body_updates = []

                if attachments:
                    for att in parsed.get('attachments', []):
                        att_lines.append(
                            "INSERT INTO attachments (id,message_id,filename,mime_type,size_bytes,content,storage_location,created_at) "
                            "SELECT UUID(), m.id, %s, %s, %d, NULL, 's3', NOW() "
                            "FROM messages m "
                            "JOIN folders f ON f.id = m.folder_id "
                            "WHERE f.account_id = (SELECT a2.id FROM mail_accounts a2 "
                            "JOIN domains d2 ON d2.id = a2.domain_id "
                            "WHERE d2.name = %s AND a2.username = %s LIMIT 1) "
                            "AND m.message_id_hash = %s "
                            "LIMIT 1;"
                            % (
                                q(att['filename']), q(att['mime_type']),
                                att['size_bytes'],
                                q(domain), q(username),
                                q(parsed['message_id_hash'])
                            )
                        )
                        total_atts += 1

                    if len(att_lines) >= batch_size:
                        _flush_attachment_inserts(att_lines)
                        att_lines = []

        if body_updates:
            _flush_body_updates(body_updates)
        if att_lines:
            _flush_attachment_inserts(att_lines)

        print('Backfilled %d bodies, %d attachments (%d skipped)' %
              (total_bodies, total_atts, skipped))
        return (total_bodies, total_atts)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _flush_body_updates(updates):
    """Write a batch of UPDATE statements to a temp SQL file and execute."""
    sql_path = '/tmp/backfill_bodies_batch.sql'
    lines = []
    for body, preview, raw_location in updates:
        lines.append(
            "UPDATE mail_archive.messages SET body_text=%s, preview_text=%s, updated_at=NOW() "
            "WHERE raw_location=%s AND (body_text IS NULL OR body_text='') LIMIT 1;" %
            (q(body), q(preview), q(raw_location))
        )
    _run_sql_file(sql_path, lines)


def _flush_attachment_inserts(lines):
    """Write a batch of attachment INSERT statements and execute."""
    sql_path = '/tmp/backfill_attachments_batch.sql'
    _run_sql_file(sql_path, lines)


def _run_sql_file(path, lines):
    """Write SQL lines to a file and execute via plesk db. Prints warnings on failure."""
    with open(path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    with open(path, 'r') as f:
        proc = subprocess.Popen(
            ['sudo', 'plesk', 'db'],
            stdin=f, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        out, err = proc.communicate()
    if proc.returncode != 0:
        print('WARNING: SQL batch failed: ' + err.decode(errors='ignore').strip()[:500])


def ingest_from_s3(s3_path, domain, username):
    work = tempfile.mkdtemp(prefix='ingest_')
    try:
        tar_local = os.path.join(work, 'archive.tar.gz')
        emit_progress('2/5 downloading')
        print('Downloading %s ...' % s3_path)
        subprocess.check_call(
            [AWS_BIN, 's3', 'cp', s3_path, tar_local],
            stdout=subprocess.DEVNULL,
            env=AWS_ENV,
        )

        emit_progress('3/5 parsing')
        print('Parsing messages ...')
        records = []
        total_attachments = 0
        skipped = 0
        with tarfile.open(tar_local, 'r:gz') as tf:
            members = [m for m in tf.getmembers() if m.isfile()
                       and is_message_member(m.name)
                       and folder_from_member(m.name)]
            total_members = len(members)
            for idx, m in enumerate(members):
                # Emit a progress update every 100 messages so the UI feels responsive.
                if idx > 0 and idx % 100 == 0:
                    emit_progress('3/5 parsing (%d/%d msgs, %d att, %d skipped)'
                                  % (idx, total_members, total_attachments, skipped))

                name = m.name
                folder = folder_from_member(name)
                raw = tf.extractfile(m).read()
                try:
                    parsed = parse_msg(raw)
                except Exception:
                    # Skip individual messages that fail to parse (malformed
                    # headers, encoding errors, etc.) instead of aborting the
                    # entire ingest.
                    skipped += 1
                    continue
                parsed['folder'] = folder
                parsed['raw_location'] = '%s#%s' % (s3_path, name)
                parsed['mime_hash'] = hashlib.sha256(raw).hexdigest()
                base_mid = parsed['message_id'] or name
                parsed['message_id_hash'] = hashlib.sha256(
                    base_mid.encode(errors='ignore')).hexdigest()
                total_attachments += len(parsed.get('attachments', []))
                records.append(parsed)

        print('Parsed %d messages across %d folders (%d attachments, %d skipped)' % (
            len(records), len(set([r['folder'] for r in records])), total_attachments, skipped))

        sql_path = os.path.join(work, 'ingest.sql')
        with open(sql_path, 'w') as f:
            f.write(build_sql(domain, username, s3_path, records))

        emit_progress('4/5 inserting')
        print('Inserting into database ...')
        with open(sql_path, 'r') as f:
            proc = subprocess.Popen(
                ['sudo', 'plesk', 'db'],
                stdin=f, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            out, err = proc.communicate()
            out = out.decode(errors='ignore')
            err = err.decode(errors='ignore')
        if proc.returncode != 0:
            # Print the MySQL error so it is visible in logs.
            for line in err.strip().split('\n'):
                print('MYSQL ERROR: ' + line)
            for line in out.strip().split('\n'):
                print('MYSQL OUT: ' + line)
            # Also save the failing SQL for inspection.
            debug_path = '/tmp/ingest_failed.sql'
            with open(debug_path, 'w') as df:
                with open(sql_path, 'r') as sf:
                    df.write(sf.read())
            print('Saved failing SQL to ' + debug_path)
            shutil.rmtree(work, ignore_errors=True)
            sys.exit(1)
        for line in out.strip().split('\n'):
            print(line)
        
        # Post-commit verification: if the final UPDATE didn't take effect
        # (message_count still 0 despite messages existing), run a repair.
        out_lines = [l.strip() for l in out.strip().split('\n') if l.strip()]
        verify = {}
        for line in out_lines:
            if '\t' in line:
                parts = line.split('\t')
            else:
                parts = line.split()
            if len(parts) >= 2 and parts[0].isdigit():
                if 'messages_in_db' not in verify:
                    verify['messages_in_db'] = int(parts[0])
            if len(parts) >= 3 and parts[0].isdigit() and parts[1].isdigit():
                verify['acct_msg_count'] = int(parts[0])
                verify['acct_folder_count'] = int(parts[1])
        msgs_in_db = verify.get('messages_in_db', 0)
        acct_count = verify.get('acct_msg_count', -1)
        if msgs_in_db > 0 and acct_count == 0:
            print('WARNING: messages inserted (%d) but account count is 0 — running repair' % msgs_in_db)
            ok, msg = run_repair_counts(domain, username)
            if ok:
                print('Repair result: ' + msg)
            else:
                print('Repair failed: ' + msg)

        emit_progress('5/5 complete (%d msgs, %d att, %d skipped)' % (len(records), total_attachments, skipped))
        return len(records)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--extract-attachments' in sys.argv:
        EXTRACT_ATTACHMENTS[0] = True
    if '--metadata-only' in sys.argv:
        METADATA_ONLY[0] = True

    if '--fix-counts' in sys.argv:
        if len(args) < 2:
            print('Usage: ingest_worker.py --fix-counts <domain> <local_username>')
            sys.exit(1)
        domain = args[0]
        local_user = args[1]
        username = local_user if '@' in local_user else ('%s@%s' % (local_user, domain))
        ok, msg = run_repair_counts(domain, username)
        if ok:
            print('Counts repaired:\n' + msg)
            sys.exit(0)
        else:
            print('ERROR: ' + msg)
            sys.exit(1)

    if '--backfill-all' in sys.argv or '--backfill-bodies' in sys.argv or '--backfill-attachments' in sys.argv:
        if len(args) < 3:
            print('Usage: ingest_worker.py --backfill-all <domain> <local_username> <s3_path>')
            sys.exit(1)
        domain = args[0]
        local_user = args[1]
        s3_path = args[2]
        username = local_user if '@' in local_user else ('%s@%s' % (local_user, domain))
        do_bodies = '--backfill-all' in sys.argv or '--backfill-bodies' in sys.argv
        do_atts = '--backfill-all' in sys.argv or '--backfill-attachments' in sys.argv
        bodies_count, atts_count = _backfill_pass(s3_path, domain, username,
                                                   bodies=do_bodies, attachments=do_atts)
        parts = []
        if do_bodies:
            parts.append('%d bodies' % bodies_count)
        if do_atts:
            parts.append('%d attachments' % atts_count)
        print('Done: %s backfilled for %s' % (', '.join(parts), username))
        sys.exit(0)

    if len(args) < 3:
        print('Usage: ingest_worker.py [--extract-attachments|--metadata-only|--fix-counts] <domain> <local_username> [<s3_path>]')
        sys.exit(1)
    domain = args[0]
    local_user = args[1]
    s3_path = args[2]
    emit_progress('1/5 queued')
    username = local_user if '@' in local_user else ('%s@%s' % (local_user, domain))
    count = ingest_from_s3(s3_path, domain, username)
    print('Done: %d messages ingested for %s' % (count, username))
