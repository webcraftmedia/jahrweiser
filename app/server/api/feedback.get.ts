/**
 * Whether feedback can be sent at all.
 *
 * The form asks before it offers a textarea: without FEEDBACK_EMAIL every
 * submission would end in a 503, and a member would have written their report
 * first. The address itself never leaves the server — the answer is a boolean,
 * so an operator's private inbox does not become public through the form.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const config = useRuntimeConfig()
  return { enabled: !!config.FEEDBACK_EMAIL }
})
