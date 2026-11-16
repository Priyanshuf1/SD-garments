'use strict';

const db = require('./db.js');
const { transitionOrder, ORDER_STATUSES } = require('./orderStateMachine.js');
const security = require('./security.js');

/**
 * Reconciles stuck 'payment_pending' orders and expires inventory holds.
 *
 * @param {object} options
 * @param {number} [options.maxAgeMinutes=30] - Age threshold after which unpaid orders are cancelled
 * @param {Function} [options.releaseInventoryFn] - Callback to return items to catalog inventory
 * @param {Function} [options.getAllOrdersFn] - Function to read current orders
 * @param {Function} [options.writeJsonFileFn] - Function to persist orders to disk
 * @returns {Promise<{ reconciledCount: number, ordersChecked: number, cancelledOrders: string[] }>}
 */
async function reconcileStuckOrders({
  maxAgeMinutes = 30,
  releaseInventoryFn = null,
  getAllOrdersFn = null,
  readJsonFileFn = null,
  writeJsonFileFn = null
} = {}) {
  const timeoutMs = maxAgeMinutes * 60 * 1000;
  const now = Date.now();
  const cancelledOrders = [];

  let pendingOrders = [];

  // 1. Fetch from Database if available
  if (db && db.isConfigured && db.orders && typeof db.orders.getStuckOrders === 'function') {
    try {
      pendingOrders = await db.orders.getStuckOrders(timeoutMs);
    } catch (_) {}
  }

  // 2. Fallback to memory / local JSON
  if (pendingOrders.length === 0) {
    let all = [];
    if (typeof getAllOrdersFn === 'function') {
      try { all = await getAllOrdersFn(); } catch (_) {}
    }
    if (typeof readJsonFileFn === 'function') {
      const diskOrders = readJsonFileFn('orders.json', []);
      if (diskOrders.length >= all.length) all = diskOrders;
    }
    pendingOrders = all.filter(o => {
      const status = String(o.status || (o.paymentStatus === 'Pending' ? 'payment_pending' : '')).toLowerCase();
      if (status === ORDER_STATUSES.CANCELLED || o.orderStatus === 'Cancelled') return false;
      const isUnconfirmedCod = String(o.paymentStatus || '').toLowerCase() === 'pending cod confirmation' && !o.cod_confirmed;
      const created = new Date(o.createdAt || o.created_at || 0).getTime();
      return (status === ORDER_STATUSES.PAYMENT_PENDING || status === 'pending' || isUnconfirmedCod) && (now - created) > timeoutMs;
    });
  }

  for (const order of pendingOrders) {
    try {
      const current = String(order.status || (order.paymentStatus === 'Pending' ? ORDER_STATUSES.PAYMENT_PENDING : ORDER_STATUSES.CREATED)).toLowerCase();
      // Transition from current -> cancelled
      await transitionOrder(order.id, current, ORDER_STATUSES.CANCELLED, {
        readJsonFile: typeof readJsonFileFn === 'function' ? readJsonFileFn : () => pendingOrders,
        writeJsonFile: writeJsonFileFn
      });

      // Release reserved stock hold
      if (typeof releaseInventoryFn === 'function' && Array.isArray(order.items)) {
        await releaseInventoryFn(order.items);
      }

      // Log in append-only administrative audit trail
      if (security && typeof security.logAuditAsync === 'function') {
        await security.logAuditAsync({
          adminUsername: 'system_reconciliation',
          ipAddress: '127.0.0.1',
          action: 'order_reconciliation_timeout',
          targetType: 'order',
          targetId: order.id,
          details: {
            reason: 'payment_pending_timeout',
            timeoutMinutes: maxAgeMinutes
          }
        });
      }

      cancelledOrders.push(order.id);
    } catch (err) {
      console.warn(`[RECONCILIATION] Failed to cancel stuck order ${order.id}:`, err.message);
    }
  }

  return {
    reconciledCount: cancelledOrders.length,
    ordersChecked: pendingOrders.length,
    cancelledOrders
  };
}

module.exports = {
  reconcileStuckOrders
};
