'use strict';

/**
 * Payment Provider Interface
 * Base class for all payment gateways (Razorpay, Cashfree, Stub).
 */
class PaymentProvider {
  constructor(name) {
    this.name = name;
  }

  async createOrder({ orderId, amountPaise, currency = 'INR', customer = {} }) {
    throw new Error('createOrder() must be implemented by payment provider');
  }

  verifyClientSignature({ orderId, paymentId, signature, secret }) {
    throw new Error('verifyClientSignature() must be implemented by payment provider');
  }

  verifyWebhook({ rawBody, headers = {}, secret }) {
    throw new Error('verifyWebhook() must be implemented by payment provider');
  }

  async refund({ paymentId, amountPaise, reason }) {
    throw new Error('refund() must be implemented by payment provider');
  }
}

module.exports = PaymentProvider;
