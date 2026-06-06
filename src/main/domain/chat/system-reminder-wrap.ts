const OPENING_TAG = "<system-reminder>";
const CLOSING_TAG = "</system-reminder>";

export function wrapAsSystemReminder(body: string): string {
  if (body.includes(OPENING_TAG) || body.includes(CLOSING_TAG)) {
    throw new Error("System reminder body must not contain wrapper tags");
  }

  return `${OPENING_TAG}\n${body}\n${CLOSING_TAG}`;
}
