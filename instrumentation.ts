/**
 * Runs once when the Next.js server starts. The hospital works in its own
 * local time — "today's" queue, clinic hours, rosters — so the server process
 * uses the hospital's time zone whatever the host is set to.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { HOSPITAL } = await import("./lib/sim/reference");
  process.env.TZ = HOSPITAL.timeZone;
}
