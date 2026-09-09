# Blättchen (the community paper)

The *GG&Gemeinschafts-Blättche* is an irregularly published PDF paper. Members
read it at `/blaettchen`; the page also carries the call for contributions to
the next issue.

Publishing an issue means **copying a PDF into a directory on the server** — no
deploy, no restart, no database. The listing endpoint reads the directory on
every request.

## Why nothing of it is in the repository

- The issues are written by and for the members and contain their names,
  photos, phone numbers and addresses. They are not published on the open web,
  so `frontend/data/blaettchen/` is git-ignored and both endpoints sit behind
  `requireUserSession`.
- The contact address for contributions is a private one. It lives in an
  environment variable and is served through the authenticated endpoint —
  never through `runtimeConfig.public`, which would put it into the client
  bundle where any anonymous visitor can read it in the page source.

## File-name convention

```
NN_YYYY-MM-DD[_Titel].pdf
```

| Part | Meaning |
| --- | --- |
| `NN` | Issue number as printed in the paper (2–3 digits, zero-padded) |
| `YYYY-MM-DD` | Publication date from the paper's header line |
| `_Titel` | Optional subtitle, shown verbatim — spaces and umlauts are fine |

Examples:

```
frontend/data/blaettchen/
  01_2023-06-06.pdf
  04_2023-12-23_Sonderausgabe Weihnachten.pdf
  12_2026-05-01.pdf
```

The list is sorted by issue number, newest first. **Gaps are normal** — not
every issue is archived, and the numbering is never rewritten to close them.

Files that do not follow the convention (a draft, a `.DS_Store`, a name that
was never renamed) are skipped and logged with a warning. That is deliberate:
the directory is filled by copying files around, and one stray file must not
take the whole archive down.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BLAETTCHEN_DIR` | `data/blaettchen` | Where the PDFs live, relative to the process working directory or absolute |
| `BLAETTCHEN_CONTACT_EMAIL` | *(empty)* | Address for contributions. Empty = the page shows the archive without the call for contributions |

In production, point `BLAETTCHEN_DIR` at a directory **outside** the deployment
directory (e.g. `/var/lib/jahrweiser/blaettchen`) so a redeploy cannot wipe the
archive, and mount it into the container:

```yaml
services:
  frontend:
    environment:
      - BLAETTCHEN_DIR=/var/lib/jahrweiser/blaettchen
      - BLAETTCHEN_CONTACT_EMAIL=redaktion@example.org
    volumes:
      - /srv/jahrweiser/blaettchen:/var/lib/jahrweiser/blaettchen:ro
```

Read-only is enough — the app never writes issues.

## Endpoints

| Endpoint | Answer |
| --- | --- |
| `GET /api/blaettchen` | `{ issues: [...], contact: string \| null }`, newest issue first |
| `GET /api/blaettchen/<file>` | The PDF, `Content-Type: application/pdf`, `Cache-Control: private, no-store` |
| `POST /api/admin/blaettchen/upload` | multipart: `file`, `number`, `date`, `title?`, `replace?`. Answers `{ issue, replaced }`, or 400/409/413/415 |
| `POST /api/admin/blaettchen/delete` | `{ file }` → `{}`, or 404 |

All four require a session; the two under `/admin/` additionally require the
admin role. The download endpoint parses the requested name with
the same grammar as the listing before it touches the file system: the pattern
is anchored and contains no path separator, so a name that matches can never
address anything outside the issue directory. Anything else is a 404.

## Adding an issue

### Through the admin page (the usual way)

`/admin/blaettchen` (Admin → Blättchen) uploads an issue and lists what is
already published.

1. Pick the PDF. If its name already follows the convention, number, date and
   subtitle fill themselves; otherwise read them off the paper's header line
   (`Südhessen, 01.05.26, 12. Ausgabe`) and type them in. The form shows the
   resulting file name before anything is sent.
2. Upload. **The browser's file name is never used as a path** — the server
   builds the name from the fields and parses it back with the reading grammar,
   so nothing can be written that the listing could not read again.
3. An issue number that already exists is refused (409) until "Vorhandene
   Ausgabe ersetzen" is ticked. Replacing removes the old file of that number,
   which is logged with the admin's address; the archive keeps no other history.

Refusals the form spells out: not a PDF (checked by magic bytes, not by the
content type the browser claims), larger than 10 MB, impossible date, subtitle
containing a path separator.

Deleting an issue takes two clicks and is irreversible — there is no second copy
on the server.

### By hand on the server

1. Read the issue number and date off the paper's header line.
2. Copy the PDF to `$BLAETTCHEN_DIR/12_2026-05-01.pdf`.
3. Reload `/blaettchen` — it is there. If it is not, check the server log for
   the "do not follow" warning naming the file.

The icon-rail entry appears with the first issue and disappears again when the
directory is empty or unreadable, so members are never offered a link into an
error page.
