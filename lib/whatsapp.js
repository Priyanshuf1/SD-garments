/**
 * ALLEYRICH WhatsApp Marketing & Omnichannel Messaging Adapter
 * 
 * Supports:
 * 1. Indian Phone Number Normalization (+91 10-digit mobile)
 * 2. Automated Meta WhatsApp Cloud API / Twilio Dispatcher
 * 3. 1-Click Direct WhatsApp wa.me Universal Links
 * 4. Aggregation of customer & subscriber phone contacts
 */

/**
 * Normalizes any raw phone input to standard Indian E.164 without '+' (e.g. 919876543210)
 * Suitable for WhatsApp wa.me API and Meta Cloud API.
 * @param {string|number} raw
 * @returns {string|null}
 */
function normalizeIndianPhoneNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // 10 digits: assume India (e.g. 9876543210 -> 919876543210)
  if (digits.length === 10) {
    // Standard Indian mobile prefix starts with 6, 7, 8, or 9
    if (/^[6-9]/.test(digits)) {
      return `91${digits}`;
    }
    return `91${digits}`;
  }

  // 11 digits starting with 0 (e.g. 09876543210 -> 919876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.substring(1)}`;
  }

  // 12 digits starting with 91 (e.g. 919876543210)
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }

  // International standard 10-15 digits
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return null;
}

/**
 * Formats a clean, high-converting WhatsApp streetwear announcement
 */
function buildWhatsAppPromoMessage({ headline, subject, message, code, link, brandName = 'ALLEYRICH' }) {
  const parts = [];

  parts.push(`*${brandName.toUpperCase()} ARCHITECTURAL STREETWEAR*`);
  
  const title = headline || subject;
  if (title) {
    parts.push(`🔥 *${title.toUpperCase()}*`);
  }

  if (message) {
    parts.push(`\n${message.trim()}`);
  }

  if (code) {
    parts.push(`\n🏷️ *Use Code:* \`${code.toUpperCase()}\``);
  }

  const targetLink = link || (process.env.APP_URL ? `${process.env.APP_URL}/collections.html` : 'https://alleyrich.com/collections.html');
  parts.push(`🔗 *Shop Now:* ${targetLink}`);

  parts.push(`\n_Limited archival drop • Ships under 48h • No restocks_`);

  return parts.join('\n');
}

/**
 * Generates an official 1-click WhatsApp wa.me link
 * @param {string} phone Normalized phone digits
 * @param {string} text Message string
 * @returns {string}
 */
function buildDirectWhatsAppLink(phone, text) {
  const cleanPhone = normalizeIndianPhoneNumber(phone) || phone;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Dispatches a WhatsApp message using Meta Cloud API or Twilio, falling back to wa.me links
 * @param {string} phone
 * @param {string} messageText
 * @param {object} options
 * @returns {Promise<{success: boolean, mode: string, waLink: string, error?: string}>}
 */
async function dispatchWhatsAppMessage(phone, messageText, options = {}) {
  const normPhone = normalizeIndianPhoneNumber(phone);
  if (!normPhone) {
    return { success: false, mode: 'invalid_phone', error: 'Invalid phone number' };
  }

  const waLink = buildDirectWhatsAppLink(normPhone, messageText);

  // 1. Meta WhatsApp Cloud API (if configured in .env)
  const metaToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (metaToken && metaPhoneId) {
    try {
      const url = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normPhone,
          type: 'text',
          text: { preview_url: true, body: messageText }
        })
      });

      const data = await res.json();
      if (res.ok) {
        return { success: true, mode: 'meta_cloud_api', messageId: data.messages?.[0]?.id, waLink };
      } else {
        console.warn(`[META WA API ERROR] for ${normPhone}:`, data.error?.message);
        // Fall back to link mode if API returns template restriction error
        return { success: true, mode: 'meta_api_fallback', waLink, warning: data.error?.message };
      }
    } catch (err) {
      console.warn(`[META WA EXCEPTION] for ${normPhone}:`, err.message);
    }
  }

  // 2. Twilio WhatsApp API (if configured in .env)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

  if (twilioSid && twilioToken) {
    try {
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const bodyParams = new URLSearchParams({
        From: twilioFrom.startsWith('whatsapp:') ? twilioFrom : `whatsapp:${twilioFrom}`,
        To: `whatsapp:+${normPhone}`,
        Body: messageText
      });

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });

      if (res.ok) {
        const data = await res.json();
        return { success: true, mode: 'twilio_api', messageId: data.sid, waLink };
      }
    } catch (err) {
      console.warn(`[TWILIO WA EXCEPTION] for ${normPhone}:`, err.message);
    }
  }

  // 3. Out-of-the-box Direct WhatsApp Launch Mode (Zero cost, instant)
  return {
    success: true,
    mode: 'wa_link',
    simulated: true,
    phone: normPhone,
    waLink
  };
}

/**
 * Aggregates all unique customer and subscriber marketing contacts across orders, profiles, and newsletter
 */
function aggregateMarketingRecipients(subscribers = [], customers = [], orders = []) {
  const emailSet = new Set();
  const phoneMap = new Map();

  // 1. Subscribers
  for (const s of (subscribers || [])) {
    const email = (s.email || '').toLowerCase().trim();
    if (email && email.includes('@')) emailSet.add(email);
    if (s.phone) {
      const norm = normalizeIndianPhoneNumber(s.phone);
      if (norm && !phoneMap.has(norm)) {
        phoneMap.set(norm, {
          phone: norm,
          rawPhone: s.phone,
          name: s.name || 'Inner Circle Member',
          email: email || '',
          source: 'newsletter'
        });
      }
    }
  }

  // 2. Customers
  for (const c of (customers || [])) {
    const email = (c.email || '').toLowerCase().trim();
    if (email && email.includes('@')) emailSet.add(email);
    if (c.phone) {
      const norm = normalizeIndianPhoneNumber(c.phone);
      if (norm && !phoneMap.has(norm)) {
        phoneMap.set(norm, {
          phone: norm,
          rawPhone: c.phone,
          name: c.name || 'Customer',
          email: email || '',
          source: 'customer_account'
        });
      }
    }
  }

  // 3. Past Orders
  for (const o of (orders || [])) {
    const email = (o.customer?.email || '').toLowerCase().trim();
    if (email && email.includes('@')) emailSet.add(email);
    const ph = o.customer?.phone;
    if (ph) {
      const norm = normalizeIndianPhoneNumber(ph);
      if (norm && !phoneMap.has(norm)) {
        phoneMap.set(norm, {
          phone: norm,
          rawPhone: ph,
          name: o.customer?.name || 'Verified Buyer',
          email: email || '',
          source: 'order_checkout'
        });
      }
    }
  }

  return {
    emails: Array.from(emailSet),
    phoneContacts: Array.from(phoneMap.values()),
    totalEmails: emailSet.size,
    totalPhones: phoneMap.size
  };
}

module.exports = {
  normalizeIndianPhoneNumber,
  buildWhatsAppPromoMessage,
  buildDirectWhatsAppLink,
  dispatchWhatsAppMessage,
  aggregateMarketingRecipients
};
