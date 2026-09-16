export function check(email: string | undefined): asserts email is string {
  if (!email) {
    console.error('Fehler: Keine E-Mail-Adresse angegeben')
    process.exit(1)
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(email)) {
    console.error('Fehler: Ungültige E-Mail-Adresse')
    process.exit(1)
  }
}
