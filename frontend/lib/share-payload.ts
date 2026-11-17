/**
 * What the phone's share sheet is given.
 *
 * The link goes inside the message text, on its own line, and no separate
 * `url` field is sent. When text and url are sent separately, some apps
 * keep only the text, and the invite arrives with nothing to tap. A link
 * in the text is made tappable by every messaging and mail app.
 */
export function sharePayload(input: { title: string; text: string; url: string }): {
  title: string;
  text: string;
} {
  const text = input.text.trim();
  const url = input.url.trim();
  if (!text) return { title: input.title, text: url };
  // Some callers already put the link in their text; don't send it twice.
  if (url && text.includes(url)) return { title: input.title, text };
  return { title: input.title, text: `${text}\n${url}` };
}
