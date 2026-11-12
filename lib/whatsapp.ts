export interface AdminNotification {
  documentUrl: string;
  filename: string;
  applicantName: string;
  applicantPhone: string;
  amountLabel: string;
}

/**
 * Send the signed PDF to the admin via WhatsApp Cloud API. Returns true on success, never throws.
 *
 * WhatsApp only allows free-form messages within 24h of the recipient last messaging your business number.
 * For reliable delivery create an approved template with a DOCUMENT header and 3 body variables
 * ({{1}} name, {{2}} phone, {{3}} amount) and set WHATSAPP_TEMPLATE_NAME.
 */
export async function notifyAdminWhatsApp(n: AdminNotification): Promise<boolean> {
  const to = (process.env.ADMIN_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  if (!to || !phoneId || !token) return false;

  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

  const payload = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components: [
            { type: 'header', parameters: [{ type: 'document', document: { link: n.documentUrl, filename: n.filename } }] },
            {
              type: 'body',
              parameters: [n.applicantName, n.applicantPhone, n.amountLabel].map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          link: n.documentUrl,
          filename: n.filename,
          caption: `NEW LOAN APPLICATION\nApplicant: ${n.applicantName}\nPhone: ${n.applicantPhone}\nRequested: ${n.amountLabel}`,
        },
      };

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error('[whatsapp] send failed', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[whatsapp] request error', err);
    return false;
  }
}

export type OutboundResult = { ok: true } | { ok: false; reason: 'not_integrated' | 'failed' };

/** Flip to true once the WhatsApp integration below is implemented. */
export const WHATSAPP_MESSAGING_INTEGRATED = false;

/**
 * Send ONE free-text message to an applicant. NOT INTEGRATED YET: nothing is sent and nothing is stored
 * (there is deliberately no message history). When integrating, use an approved WhatsApp template
 * (warnings are business-initiated, so free-form text is only deliverable inside the 24h window),
 * keep `to` in international format without "+", and return { ok: false, reason: 'failed' } on errors.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<OutboundResult> {
  void to;
  void body;
  if (!WHATSAPP_MESSAGING_INTEGRATED) return { ok: false, reason: 'not_integrated' };
  return { ok: false, reason: 'failed' };
}
