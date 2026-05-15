import { unsubscribeByToken } from './unsubscribe'

export default defineEventHandler(async (event) => {
  const token = getQuery(event).token as string | undefined
  const ok = await unsubscribeByToken(token ?? '')

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  if (ok) {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Newsletter abbestellt</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1e293b}</style>
</head><body>
<h1>Newsletter abbestellt</h1>
<p>Du erhältst keine wöchentlichen Mails mehr. Falls das ein Versehen war, kannst du dich jederzeit in den Einstellungen wieder anmelden.</p>
</body></html>`
  }
  setResponseStatus(event, 404)
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Token ungültig</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1e293b}</style>
</head><body>
<h1>Token ungültig oder bereits verwendet</h1>
<p>Dieser Abmelde-Link konnte nicht zugeordnet werden. Falls du weiter Mails bekommst, melde dich bitte in den Einstellungen ab.</p>
</body></html>`
})
