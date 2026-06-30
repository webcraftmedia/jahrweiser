# Registration links (self-signup)

Admins can mint shareable links that let people create their own Jahrweiser
account. A visitor opening a link enters **email, first name and last name**;
the account is then confirmed by an email magic link (the same passwordless
flow used for login). This keeps DAV the source of truth for contact data while
giving admins a low-friction way to onboard members (flyers, QR codes, mailings).

## Flow

```
Admin                         Visitor                        System
-----                         -------                        ------
create link  ───────────────▶ open /register/{token}
(/admin/links)                fill email + name
                              submit ──────────────────────▶ validate link
                                                             create VCard in DAV
                                                             mirror into sidecar
                                                             record redemption
                                                             send magic login link
                              click link in mail ──────────▶ redeem → logged in
```

1. **Admin creates a link** at `/admin/links` (sidebar → "Registrierungs-Links").
   Options: a free-text label, a validity preset (1 / 7 / 30 days or unlimited),
   and an optional maximum number of uses.
2. **Visitor opens `/register/{token}`.** The page validates the link first and
   shows a friendly message if it is revoked, expired, used up or unknown.
3. **Visitor submits** email + first/last name.
   - **New email:** a VCard is written to DAV, mirrored into the sidecar, the
     join is recorded, and a magic login link is emailed.
   - **Existing email:** no duplicate and no join is recorded, but any *missing*
     name is filled in (DAV VCard + sidecar — existing data is never
     overwritten) and a magic login link is emailed anyway, so the person can
     get in. This covers e.g. members an admin added by email only.
4. **Visitor clicks the email link** → existing `/login/{token}` redeem flow →
   logged in. Clicking the link is what confirms the email address.

Either way the page ends on "check your inbox". A join is counted only for a
genuinely new account (step 3); the email-dedup check prevents double counting.

## Admin UI

`/admin/links` lists every link with its label, creator, expiry, join count
(`used / max`), status, a copy-to-clipboard button for the share URL, and
per-row actions:

- **Edit** — inline-edit the label and/or re-base the validity. Picking a
  duration preset re-bases the expiry from *now* (e.g. "30 days" = 30 days from
  the edit), or pick "keep validity" to leave it unchanged.
- **Revoke / Reactivate** — revoke soft-disables (the row and its join history
  are kept, but the link can't be used); reactivate clears the revoke. A
  reactivated link is subject to its expiry/use-cap again, so it may still be
  expired/exhausted.
- **Delete** — only offered for a link that is **both deactivated and never
  redeemed**; it removes the row entirely. Deactivate first, then delete. Links
  with redemptions can only be revoked (preserves the join history). Both rules
  are enforced server-side (404 if missing, 409 if active or redeemed).

## Data model

Two MariaDB tables (sidecar):

- **`registration_links`** — `token` (PK), `created_by_uid` (which admin),
  `label`, `max_uses` (nullable = unlimited), `expires_at` (nullable = never),
  `revoked_at` (nullable), `created_at`.
- **`registration_link_redemptions`** — one row per account created through a
  link (`link_token`, `user_uid`, `created_at`). The join count is `COUNT(*)`
  over this table, which is race-free and doubles as a "who joined" audit trail.

Both cascade-delete with their referenced rows, so the count always reflects
currently-existing joined users.

A link is **usable** only when it is not revoked, not past `expires_at`, and
under `max_uses`. The check lives in `linkStatus()`
(`server/helpers/registrationLinks.ts`) and is applied both when rendering the
page and again on submit.

## API

| Endpoint                                    | Auth        | Purpose                          |
|---------------------------------------------|-------------|----------------------------------|
| `POST /api/admin/registration-links/create` | admin       | Mint a link                      |
| `GET  /api/admin/registration-links/list`   | admin       | List links + counts + status     |
| `POST /api/admin/registration-links/update` | admin       | Edit label and/or validity       |
| `POST /api/admin/registration-links/revoke` | admin       | Soft-disable a link              |
| `POST /api/admin/registration-links/reactivate` | admin   | Clear the revoke (re-enable)     |
| `POST /api/admin/registration-links/delete` | admin       | Delete a deactivated, never-redeemed link (404/409 otherwise) |
| `GET  /api/register/{token}`                | public      | Validate a link (coarse status)  |
| `POST /api/register`                        | public      | Register + send verification mail |

The public validate endpoint deliberately returns only the coarse status
(`valid` / `revoked` / `expired` / `exhausted` / `notfound`) — never the
creator or join count — so an anonymous holder of the token learns nothing
about internal state.

## Tests

- Pure logic (`linkStatus`, `computeExpiresAt`, vCard building) is unit-tested
  in `server/helpers/registrationLinks.spec.ts`.
- The pages are covered by `src/pages/register/[token].spec.ts` and
  `src/pages/admin/links.spec.ts`.
- The DB-integrated endpoints follow the existing convention: excluded from the
  unit coverage threshold (`vitest.config.ts`) and exercised end-to-end in
  `e2e-full-stack/registration.spec.ts` (admin mints a link → newcomer registers
  → verifies via email; plus revoked-link and unauthorized-access checks).
