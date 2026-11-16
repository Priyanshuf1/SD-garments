'use strict';

const crypto = require('crypto');
const PaymentProvider = require('./provider.js');

class StubPaymentProvider extends PaymentProvider {
  constructor(name = 'stub') {
    super(name);
  }

  async createOrder({ orderId, amountPaise, currency = 'INR', customer = {} }) {
    const providerOrderId = `${this.name}_ord_${orderId}_${crypto.randomBytes(4).toString('hex')}`;
    return {
      provider: this.name,
      providerOrderId,
      amountPaise: Number(amountPaise),
      currency: String(currency || 'INR').toUpperCase(),
      status: 'created'
    };
  }

  verifyClientSignature({ orderId, paymentId, signature, secret = 'stub_secret' }) {
    if (!orderId || !paymentId || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    const supBuf = Buffer.from(String(signature));
    const expBuf = Buffer.from(expected);
    if (supBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(supBuf, expBuf);
  }

  verifyWebhook({ rawBody, headers = {}, secret = process.env.PAYMENT_WEBHOOK_SECRET || 'stub_webhook_secret' }) {
    const signature = headers['x-webhook-signature'] || headers['x-razorpay-signature'] || headers['x-signature'] || '';
    if (!signature || !rawBody) {
      return { valid: false, reason: 'Missing webhook signature or raw payload' };
    }

    const rawStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto.createHmac('sha256', secret).update(rawStr).digest('hex');
    const supBuf = Buffer.from(String(signature).trim());
    const expBuf = Buffer.from(expected.trim());

    if (supBuf.length !== expBuf.length || !crypto.timingSafeEqual(supBuf, expBuf)) {
      return { valid: false, reason: 'HMAC signature mismatch' };
    }

    try {
      const payload = JSON.parse(rawStr);
      return {
        valid: true,
        event: {
          eventId: payload.event_id || payload.id || `evt_${Date.now()}`,
          eventType: payload.event || payload.type || 'payment.captured',
          orderId: payload.order_id || payload.payload?.payment?.entity?.order_id || payload.data?.order?.order_id,
          paymentId: payload.payment_id || payload.payload?.payment?.entity?.id || payload.data?.payment?.payment_id || `pay_${Date.now()}`,
          amountPaise: Number(payload.amount_paise || payload.amount || (payload.payload?.payment?.entity?.amount) || 0),
          currency: String(payload.currency || payload.payload?.payment?.entity?.currency || 'INR').toUpperCase(),
          raw: payload
        }
      };
    } catch (_) {
      return { valid: false, reason: 'Malformed JSON payload in webhook' };
    }
  }

  async refund({ paymentId, amountPaise, reason = 'customer_request' }) {
    return {
      provider: this.name,
      refundId: `${this.name}_rfnd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      paymentId,
      amountPaise: Number(amountPaise),
      status: 'processed',
      reason
    };
  }
}

module.exports = StubPaymentProvider;
