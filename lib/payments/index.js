'use strict';

const StubPaymentProvider = require('./stubProvider.js');

const stubProvider = new StubPaymentProvider('stub');
const razorpayStub = new StubPaymentProvider('razorpay');

const registry = {
  stub: stubProvider,
  razorpay: razorpayStub
};

function isOnlinePaymentsEnabled() {
  return process.env.ONLINE_PAYMENTS_ENABLED === 'true';
}

function getProvider(name = 'razorpay') {
  const key = String(name || 'razorpay').toLowerCase().trim();
  return registry[key] || registry.stub;
}

module.exports = {
  isOnlinePaymentsEnabled,
  getProvider,
  StubPaymentProvider
};
