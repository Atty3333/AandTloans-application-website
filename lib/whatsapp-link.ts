/**
 * Click-to-chat link (https://wa.me/<digits>) for a Botswana number. Needs no WhatsApp API: it just opens the admin's own
 * WhatsApp with the chat ready. Returns null when the number is not a valid +267 number.
 */
import { normalizePhone } from './validation';

export function whatsappChatUrl(raw: string | null | undefined, message?: string): string | null {
  if (!raw) return null;
  const n = normalizePhone(raw);
  if (!n) return null;
  const base = `https://wa.me/${n.slice(1)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
