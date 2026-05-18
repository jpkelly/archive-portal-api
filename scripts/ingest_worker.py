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
from html import unescape
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime, parseaddr, getaddresses


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
    body = ''
    body_html = ''
    if msg.is_multipart():
        plain_parts = []
        html_parts = []
        for p in msg.walk():
            cdisp = (p.get_content_disposition() or '').lower()
            if cdisp == 'attachment':
                has_attach = 1
                continue
            ctype = (p.get_content_type() or '').lower()
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
        lines.append(
            "INSERT INTO messages (id,folder_id,message_id,message_id_hash,subject,from_name,from_email,to_list,cc_list,bcc_list,sent_at,received_at,has_attachments,size_bytes,preview_text,body_text,body_html,raw_location,mime_hash,created_at,updated_at) "
            "VALUES (%s,@%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%d,%d,%s,%s,%s,%s,%s,NOW(),NOW()) "
            "ON DUPLICATE KEY UPDATE subject=VALUES(subject), from_name=VALUES(from_name), from_email=VALUES(from_email), to_list=VALUES(to_list), cc_list=VALUES(cc_list), bcc_list=VALUES(bcc_list), sent_at=VALUES(sent_at), received_at=VALUES(received_at), has_attachments=VALUES(has_attachments), size_bytes=VALUES(size_bytes), preview_text=VALUES(preview_text), body_text=VALUES(body_text), body_html=VALUES(body_html), raw_location=VALUES(raw_location), updated_at=NOW();"
            % (
                q(str(uuid.uuid4())), folder_var[r['folder']],
                q(mid), q(r['message_id_hash']),
                q(r['subject']), q(r['from_name']), q(r['from_email']),
                q(r['to_list']), q(r['cc_list']), q(r['bcc_list']),
                q(r['sent_at']), q(r['received_at']),
                int(r['has_attachments']), int(r['size_bytes']),
                q(r['preview_text']), q(r['body_text']), q(r['body_html']),
                q(r['raw_location']), q(r['mime_hash'])
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
    lines.append(
        "SELECT COUNT(*) AS messages_in_db FROM messages m "
        "JOIN folders f ON f.id=m.folder_id "
        "JOIN mail_accounts a ON a.id=f.account_id "
        "JOIN domains d ON d.id=a.domain_id "
        "WHERE d.name=%s AND a.username=%s;" % (q(domain), q(username))
    )
    return '\n'.join(lines) + '\n'


def ingest_from_s3(s3_path, domain, username):
    work = tempfile.mkdtemp(prefix='ingest_')
    try:
        tar_local = os.path.join(work, 'archive.tar.gz')
        print('Downloading %s ...' % s3_path)
        subprocess.check_call(['aws', 's3', 'cp', s3_path, tar_local],
                              stdout=subprocess.DEVNULL)

        print('Parsing messages ...')
        records = []
        with tarfile.open(tar_local, 'r:gz') as tf:
            for m in tf.getmembers():
                if not m.isfile():
                    continue
                name = m.name
                if not is_message_member(name):
                    continue
                folder = folder_from_member(name)
                if not folder:
                    continue
                raw = tf.extractfile(m).read()
                parsed = parse_msg(raw)
                parsed['folder'] = folder
                parsed['raw_location'] = '%s#%s' % (s3_path, name)
                parsed['mime_hash'] = hashlib.sha256(raw).hexdigest()
                base_mid = parsed['message_id'] or name
                parsed['message_id_hash'] = hashlib.sha256(
                    base_mid.encode(errors='ignore')).hexdigest()
                records.append(parsed)

        print('Parsed %d messages across %d folders' % (
            len(records), len(set([r['folder'] for r in records]))))

        sql_path = os.path.join(work, 'ingest.sql')
        with open(sql_path, 'w') as f:
            f.write(build_sql(domain, username, s3_path, records))

        print('Inserting into database ...')
        with open(sql_path, 'r') as f:
            result = subprocess.check_output(
                ['sudo', 'plesk', 'db'],
                stdin=f, stderr=subprocess.STDOUT
            ).decode(errors='ignore')
        for line in result.strip().split('\n'):
            print(line)
        return len(records)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print('Usage: ingest_worker.py <domain> <local_username> <s3_path>')
        sys.exit(1)
    domain = sys.argv[1]
    local_user = sys.argv[2]
    s3_path = sys.argv[3]
    username = local_user if '@' in local_user else ('%s@%s' % (local_user, domain))
    count = ingest_from_s3(s3_path, domain, username)
    print('Done: %d messages ingested for %s' % (count, username))
