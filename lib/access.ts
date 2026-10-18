// Who may use the app, and where it lives. Both matter once it is on the public internet:
// without an allowlist anyone could request a magic link and spend the owner's API credits.

// ALLOWED_EMAILS="me@example.com, friend@example.com". Unset = anyone (fine on localhost).
export function isAllowedEmail(email: string | undefined | null) {
  const list = (process.env.ALLOWED_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  return !!email && list.includes(email.toLowerCase());
}

// Behind a reverse proxy the request URL is the internal http://host:3000 address, so links in
// emails and redirects use APP_URL (e.g. https://study.example.com) when it is set.
export function appOrigin(req: Request) {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, '');
}
