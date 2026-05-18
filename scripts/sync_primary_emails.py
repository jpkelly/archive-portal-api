#!/usr/bin/env python3
"""Sync portal user emails to upstream primary emails.

Current implementation uses Plesk as the source of truth because the server
already has direct access to `psa`. It updates `mail_archive.users` so each
domain_admin account uses the owning client's email address as the login email.

If WHMCS credentials or a reliable lookup path are added later, this script can
be extended with a WHMCS resolver before the Plesk fallback.
"""

import os
import re
import subprocess
import sys


def run_plesk_db(sql):
    proc = subprocess.Popen(
        ['sudo', 'plesk', 'db', '-B', '-N'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    out, err = proc.communicate(sql.encode('utf-8'))
    if proc.returncode != 0:
        raise RuntimeError(err.decode('utf-8', errors='ignore').strip() or 'plesk db failed')
    return out.decode('utf-8', errors='ignore')


def load_whmcs_db_config():
    config_path = '/var/www/vhosts/smallgod.net/httpdocs/secure/clients/configuration.php'
    with open(config_path, 'r') as handle:
        content = handle.read()

    def grab(name):
        match = re.search(r"\$%s\s*=\s*'([^']*)';" % re.escape(name), content)
        if not match:
          raise RuntimeError('Missing WHMCS config value: {0}'.format(name))
        return match.group(1)

    return {
        'host': grab('db_host'),
        'user': grab('db_username'),
        'password': grab('db_password'),
        'database': grab('db_name'),
    }


def run_whmcs_mysql(sql):
    cfg = load_whmcs_db_config()
    env = os.environ.copy()
    env['MYSQL_PWD'] = cfg['password']
    proc = subprocess.Popen(
        [
            'mysql',
            '-h', cfg['host'],
            '-u', cfg['user'],
            '-B',
            '-N',
            cfg['database'],
            '-e',
            sql,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    out, err = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(err.decode('utf-8', errors='ignore').strip() or 'whmcs mysql failed')
    return out.decode('utf-8', errors='ignore')


def parse_rows(output):
    rows = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line == 'row':
            continue
        rows.append(line.split('\t'))
    return rows


def load_whmcs_owner_emails():
    sql = (
        "SELECT d.domain, c.id, c.email\n"
        'FROM tbldomains d\n'
        'JOIN tblclients c ON c.id = d.userid\n'
        "WHERE c.email IS NOT NULL AND c.email <> '';"
    )
    rows = parse_rows(run_whmcs_mysql(sql))
    mapping = {}
    for domain, client_id, email in rows:
        mapping[domain] = {
            'source': 'whmcs',
            'client_id': client_id,
            'email': email,
        }
    return mapping


def load_plesk_owner_emails():
    sql = (
        'USE psa;\n'
        "SELECT CONCAT_WS(CHAR(9), d.name, c.id, IFNULL(c.email, ''), IFNULL(c.login, '')) AS row\n"
        'FROM domains d\n'
        'JOIN clients c ON c.id = d.cl_id\n'
        "WHERE c.email IS NOT NULL AND c.email <> '';\n"
    )
    rows = parse_rows(run_plesk_db(sql))
    mapping = {}
    for domain, client_id, email, login in rows:
        mapping[domain] = {
            'source': 'plesk',
            'client_id': client_id,
            'email': email,
            'login': login,
        }
    return mapping


def load_portal_users():
    sql = (
        "SELECT u.id, u.email, u.role, IFNULL(u.auth_subject, '__EMPTY__'), d.name\n"
        "FROM mail_archive.users u\n"
        "JOIN mail_archive.domain_members dm ON dm.user_id = u.id\n"
        "JOIN mail_archive.domains d ON d.id = dm.domain_id\n"
        "WHERE u.role = 'domain_admin';\n"
    )
    rows = parse_rows(run_plesk_db(sql))
    users = []
    for user_id, email, role, auth_subject, domain in rows:
        if auth_subject == '__EMPTY__':
            auth_subject = ''
        users.append({
            'id': user_id,
            'email': email,
            'role': role,
            'auth_subject': auth_subject,
            'domain': domain,
        })
    return users


def main():
    owners = load_whmcs_owner_emails()
    users = load_portal_users()

    updates = []

    for user in users:
        domain = user['domain']
        owner = owners.get(domain)
        if not owner:
            print('skip: no WHMCS owner email for {0}'.format(domain))
            continue

        target_email = 'archive-admin@{0}'.format(domain)
        target_primary_email = owner['email']
        auth_subject = '{0}:client:{1}'.format(owner['source'], owner['client_id'])
        if user['email'] == target_email and user['auth_subject'] == auth_subject:
            continue

        updates.append({
            'id': user['id'],
            'email': target_email,
            'primary_email': target_primary_email,
            'auth_subject': auth_subject,
            'old_email': user['email'],
        })

    if not updates:
        print('No user email updates needed.')
        return 0

    print('Updating {0} users...'.format(len(updates)))
    sql_lines = ['USE mail_archive;', 'START TRANSACTION;']
    for row in updates:
        sql_lines.append(
            "UPDATE users SET email='{email}', primary_email='{primary_email}', auth_subject='{auth_subject}' WHERE id='{id}';".format(
                email=row['email'].replace("'", "\\'"),
                primary_email=row['primary_email'].replace("'", "\\'"),
                auth_subject=row['auth_subject'].replace("'", "\\'"),
                id=row['id'].replace("'", "\\'"),
            )
        )
    sql_lines.append('COMMIT;')

    run_plesk_db('\n'.join(sql_lines) + '\n')

    for row in updates[:10]:
        print('{0} -> {1}'.format(row['old_email'], row['email']))
    if len(updates) > 10:
        print('... {0} more'.format(len(updates) - 10))

    return 0


if __name__ == '__main__':
    sys.exit(main())