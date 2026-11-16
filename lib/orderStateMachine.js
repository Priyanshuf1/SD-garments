'use strict';

const db = require('./db.js');

const ORDER_STATUSES = {
  CREATED: 'created',
  PAYMENT_PENDING: 'payment_pending',
  PAID: 'paid',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

const ALLOWED_TRANSITIONS = {
  [ORDER_STATUSES.CREATED]: [ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.PAID, ORDER_STATUSES.FULFILLED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.PAYMENT_PENDING]: [ORDER_STATUSES.PAID, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.PAID]: [ORDER_STATUSES.FULFILLED, ORDER_STATUSES.REFUNDED],
  [ORDER_STATUSES.FULFILLED]: [ORDER_STATUSES.REFUNDED],
  [ORDER_STATUSES.CANCELLED]: [],
  [ORDER_STATUSES.REFUNDED]: []
};

function canTransition(currentStatus, nextStatus) {
  const current = String(currentStatus || ORDER_STATUSES.CREATED).toLowerCase();
  const next = String(nextStatus || '').toLowerCase();
  const allowed = ALLOWED_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

/**
 * Transitions an order state enforcing SQL constraint (UPDATE ... WHERE status = <expected>)
 * or in-memory state transition validation.
 */
async function transitionOrder(orderId, expectedStatus, nextStatus, options = {}) {
  const current = String(expectedStatus).toLowerCase();
  const next = String(nextStatus).toLowerCase();

  if (!canTransition(current, next)) {
    const err = new Error(`Illegal state transition: cannot move order ${orderId} from '${current}' to '${next}'`);
    err.statusCode = 400;
    throw err;
  }

  // 1. PostgreSQL transition enforced in SQL: UPDATE ... WHERE id = $1 AND status = $2
  if (db && db.isConfigured && db.orders && typeof db.orders.updateStatus === 'function') {
    try {
      const updated = await db.orders.updateStatus(orderId, current, next, options.client);
      if (!updated) {
        const err = new Error(`State transition conflict: order ${orderId} is not in expected status '${current}'`);
        err.statusCode = 409;
        throw err;
      }
      return updated;
    } catch (dbErr) {
      if (dbErr.statusCode) throw dbErr;
      console.warn('[ORDER STATE TRANSITION NOTICE]:', dbErr.message);
    }
  }

  // 2. Memory / JSON fallback execution
  const { readJsonFile, writeJsonFile } = options;
  if (typeof readJsonFile === 'function' && typeof writeJsonFile === 'function') {
    const orders = readJsonFile('orders.json', []);
    const order = orders.find(o => String(o.id) === String(orderId));
    if (!order) {
      const err = new Error(`Order ${orderId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const orderCurrent = String(order.status || (order.paymentStatus === 'Paid' ? ORDER_STATUSES.PAID : (order.orderStatus === 'Cancelled' ? ORDER_STATUSES.CANCELLED : (order.paymentStatus === 'Pending' ? ORDER_STATUSES.PAYMENT_PENDING : ORDER_STATUSES.CREATED)))).toLowerCase();
    if (orderCurrent !== current) {
      const err = new Error(`State transition conflict: order ${orderId} is currently '${orderCurrent}', expected '${current}'`);
      err.statusCode = 409;
      throw err;
    }
    order.status = next;
    order.updatedAt = new Date().toISOString();
    // Synchronize legacy UI status fields
    if (next === ORDER_STATUSES.PAID) order.paymentStatus = 'Paid';
    if (next === ORDER_STATUSES.FULFILLED) order.orderStatus = 'Delivered';
    if (next === ORDER_STATUSES.CANCELLED) order.orderStatus = 'Cancelled';
    if (next === ORDER_STATUSES.REFUNDED) {
      order.orderStatus = 'Refunded';
      order.paymentStatus = 'Refunded';
    }
    writeJsonFile('orders.json', orders);
    return order;
  }

  return { id: orderId, status: next, updatedAt: new Date().toISOString() };
}

module.exports = {
  ORDER_STATUSES,
  ALLOWED_TRANSITIONS,
  canTransition,
  transitionOrder
};
