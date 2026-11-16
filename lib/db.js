/**
 * ALLEYRICH AWS RDS PostgreSQL Native Database Adapter
 * High-performance connection pool using 'pg'.
 * Directly handles products, customers/profiles, orders, subscribers, wishlists, and webhook events.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

let pool = null;

function getConnectionString() {
  return process.env.DATABASE_URL || 
    (process.env.RDS_HOST ? `postgresql://${process.env.RDS_USER || 'postgres'}:${encodeURIComponent(process.env.RDS_PASSWORD || '')}@${process.env.RDS_HOST}:${process.env.RDS_PORT || 5432}/${process.env.RDS_DATABASE || 'allyrich'}` : null);
}

function initPool() {
  const connStr = getConnectionString();
  if (!connStr || pool) return pool;

  const isLocal = connStr.includes('@localhost') || 
                  connStr.includes('@127.0.0.1') || 
                  connStr.includes('@db:') || 
                  connStr.includes('@db/') ||
                  connStr.includes('@postgres:') || 
                  connStr.includes('@postgres/') ||
                  connStr.includes('sslmode=disable');
  pool = new Pool({
    connectionString: connStr,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: Math.min(parseInt(process.env.PG_POOL_MAX || '25', 10), 50),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  pool.on('error', (err) => {
    console.error('AWS RDS Pool Background Error:', err.message);
  });

  return pool;
}

const isAwsConfigured = Boolean(getConnectionString());

// Initialize pool if connection string exists
if (isAwsConfigured) {
  initPool();
  setTimeout(() => {
    initSchema();
  }, 1000);
}

const db = {
  async runInTransaction(callback) {
    const p = initPool();
    if (!p) throw new Error('AWS RDS Database not configured');
    const client = await p.connect();
    try {
      await client.query('BEGIN;');
      const result = await callback(client);
      await client.query('COMMIT;');
      return result;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  },

  isConfigured: isAwsConfigured,
  get pool() {
    return initPool();
  },

  async query(text, params) {
    const p = initPool();
    if (!p) throw new Error('AWS RDS Database not configured');
    return p.query(text, params);
  },

  // 1. Products
  products: {
    async getAll() {
      const res = await db.query('SELECT * FROM products ORDER BY title ASC');
      return res.rows.map(r => ({
        id: r.id,
        handle: r.handle,
        title: r.title,
        body_html: r.body_html,
        vendor: r.vendor,
        category: r.category,
        product_type: r.product_type,
        homepage_section: r.homepage_section,
        tags: r.tags || [],
        variants: r.variants || [],
        images: r.images || [],
        published_at: r.published_at,
        created_at: r.created_at,
        updated_at: r.updated_at
      }));
    },

    async getByHandle(handle) {
      const res = await db.query('SELECT * FROM products WHERE handle = $1 LIMIT 1', [handle]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        handle: r.handle,
        title: r.title,
        body_html: r.body_html,
        vendor: r.vendor,
        category: r.category,
        product_type: r.product_type,
        homepage_section: r.homepage_section,
        tags: r.tags || [],
        variants: r.variants || [],
        images: r.images || [],
        published_at: r.published_at,
        created_at: r.created_at,
        updated_at: r.updated_at
      };
    },

    async upsert(p) {
      const id = String(p.id || `prod_${Date.now()}`);
      const handle = String(p.handle || `prod-${Date.now()}`);
      const query = `
        INSERT INTO products (
          id, handle, title, body_html, vendor, category, product_type,
          homepage_section, tags, variants, images, published_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (handle) DO UPDATE SET
          title = EXCLUDED.title,
          body_html = EXCLUDED.body_html,
          vendor = EXCLUDED.vendor,
          category = EXCLUDED.category,
          product_type = EXCLUDED.product_type,
          homepage_section = EXCLUDED.homepage_section,
          tags = EXCLUDED.tags,
          variants = EXCLUDED.variants,
          images = EXCLUDED.images,
          updated_at = NOW()
        RETURNING *;
      `;
      const res = await db.query(query, [
        id,
        handle,
        p.title || 'Untitled Product',
        p.body_html || '',
        p.vendor || 'ALLEYRICH',
        p.category || 'streetwear',
        p.product_type || '',
        p.homepage_section || null,
        JSON.stringify(p.tags || []),
        JSON.stringify(p.variants || []),
        JSON.stringify(p.images || []),
        p.published_at || new Date().toISOString()
      ]);
      return res.rows[0];
    },

    async delete(idOrHandle) {
      const res = await db.query('DELETE FROM products WHERE id = $1 OR handle = $1 RETURNING *', [String(idOrHandle)]);
      return res.rowCount > 0;
    }
  },

  // 2. Customers / Profiles
  customers: {
    async getByEmail(email) {
      if (!email) return null;
      const cleanEmail = email.trim().toLowerCase();
      const res = await db.query('SELECT * FROM customers WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
      if (res.rows.length === 0) return null;
      return res.rows[0];
    },

    async getById(id) {
      const res = await db.query('SELECT * FROM customers WHERE id = $1 LIMIT 1', [String(id)]);
      if (res.rows.length === 0) return null;
      return res.rows[0];
    },

    async getAll() {
      const res = await db.query('SELECT * FROM customers ORDER BY created_at DESC');
      return res.rows;
    },

    async upsert(cust) {
      const id = String(cust.id || `cust_${Date.now()}`);
      const email = String(cust.email || '').trim().toLowerCase();
      const query = `
        INSERT INTO customers (
          id, email, name, phone, role, status, address, locality, city, state, pincode, country, wishlist, cart, password_hash, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        ON CONFLICT (email) DO UPDATE SET
          name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
          phone = COALESCE(NULLIF(EXCLUDED.phone, ''), customers.phone),
          address = COALESCE(NULLIF(EXCLUDED.address, ''), customers.address),
          locality = COALESCE(NULLIF(EXCLUDED.locality, ''), customers.locality),
          city = COALESCE(NULLIF(EXCLUDED.city, ''), customers.city),
          state = COALESCE(NULLIF(EXCLUDED.state, ''), customers.state),
          pincode = COALESCE(NULLIF(EXCLUDED.pincode, ''), customers.pincode),
          country = COALESCE(NULLIF(EXCLUDED.country, ''), customers.country),
          wishlist = CASE WHEN EXCLUDED.wishlist IS NOT NULL AND jsonb_array_length(EXCLUDED.wishlist) > 0 THEN EXCLUDED.wishlist ELSE customers.wishlist END,
          cart = CASE WHEN EXCLUDED.cart IS NOT NULL THEN EXCLUDED.cart ELSE customers.cart END,
          password_hash = COALESCE(NULLIF(EXCLUDED.password_hash, ''), customers.password_hash),
          updated_at = NOW()
        RETURNING *;
      `;
      const res = await db.query(query, [
        id,
        email,
        cust.name || '',
        cust.phone || '',
        cust.role || 'customer',
        cust.status || 'Active',
        cust.address || '',
        cust.locality || '',
        cust.city || '',
        cust.state || '',
        cust.pincode || '',
        cust.country || 'India',
        JSON.stringify(cust.wishlist || []),
        JSON.stringify(cust.cart || []),
        cust.password_hash || ''
      ]);
      return res.rows[0];
    },

    async updateWishlist(email, wishlist) {
      const res = await db.query(
        'UPDATE customers SET wishlist = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2) RETURNING *',
        [JSON.stringify(wishlist || []), email]
      );
      return res.rows[0];
    },

    async updateCart(email, cart) {
      const res = await db.query(
        'UPDATE customers SET cart = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2) RETURNING *',
        [JSON.stringify(cart || []), email]
      );
      return res.rows[0];
    }
  },

  // 3. Orders
  orders: {
    async getAll() {
      const res = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
      return res.rows.map(r => {
        let raw = {};
        try {
          raw = typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : (r.raw_data || {});
        } catch (e) {}
        let shipAddr = r.shipping_address;
        if (typeof shipAddr === 'string') {
          try { shipAddr = JSON.parse(shipAddr); } catch(e) {}
        }
        let items = r.items;
        if (typeof items === 'string') {
          try { items = JSON.parse(items); } catch(e) {}
        }

        return {
          ...raw,
          id: r.id,
          status: r.status || raw.status || (r.payment_status === 'Paid' ? 'paid' : (r.fulfillment_status === 'Cancelled' ? 'cancelled' : 'created')),
          customer_id: r.customer_id || raw.customer_id,
          customer_email: r.customer_email || raw.customer_email || raw.customer?.email,
          customer: raw.customer || shipAddr || {},
          shipping_address: shipAddr || raw.customer || {},
          total: Number(r.total) || Number(raw.total) || 0,
          subtotal: Number(r.subtotal) || Number(raw.subtotal) || 0,
          items: items || raw.items || [],
          payment_status: r.payment_status || raw.paymentStatus || 'Pending',
          paymentStatus: r.payment_status || raw.paymentStatus || 'Pending',
          fulfillment_status: r.fulfillment_status || raw.orderStatus || 'Processing',
          orderStatus: r.fulfillment_status || raw.orderStatus || 'Processing',
          awb: r.awb || raw.trackingNumber || '',
          trackingNumber: r.awb || raw.trackingNumber || '',
          delhiveryWaybill: r.awb || raw.delhiveryWaybill || '',
          cod_risk_score: r.cod_risk_score !== undefined && r.cod_risk_score !== null ? r.cod_risk_score : (raw.cod_risk_score || 0),
          cod_risk_reasons: r.cod_risk_reasons || raw.cod_risk_reasons || [],
          cod_risk_mode: r.cod_risk_mode || raw.cod_risk_mode || 'shadow',
          cod_risk_action: r.cod_risk_action || raw.cod_risk_action || 'ALLOW',
          cod_confirmed: r.cod_confirmed !== undefined && r.cod_confirmed !== null ? Boolean(r.cod_confirmed) : Boolean(raw.cod_confirmed),
          cod_risk_score: r.cod_risk_score !== undefined && r.cod_risk_score !== null ? r.cod_risk_score : (raw.cod_risk_score || 0),
          cod_risk_reasons: r.cod_risk_reasons || raw.cod_risk_reasons || [],
          cod_risk_mode: r.cod_risk_mode || raw.cod_risk_mode || 'shadow',
          cod_risk_action: r.cod_risk_action || raw.cod_risk_action || 'ALLOW',
          cod_confirmed: r.cod_confirmed !== undefined && r.cod_confirmed !== null ? Boolean(r.cod_confirmed) : Boolean(raw.cod_confirmed),
          carrier: raw.carrier || (r.awb ? 'Delhivery Express Air Priority' : ''),
          trackingUrl: raw.trackingUrl || (r.awb ? `https://www.delhivery.com/track/package/${r.awb}` : ''),
          shippingLabelUrl: r.awb ? `/api/admin/orders/${r.id}/shipping-label` : '',
          created_at: r.created_at || raw.createdAt,
          createdAt: r.created_at || raw.createdAt,
          updated_at: r.updated_at || raw.updatedAt,
          updatedAt: r.updated_at || raw.updatedAt
        };
      });
    },

    async getById(id) {
      const res = await db.query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [String(id)]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      let raw = {};
      try {
        raw = typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : (r.raw_data || {});
      } catch (e) {}
      let shipAddr = r.shipping_address;
      if (typeof shipAddr === 'string') {
        try { shipAddr = JSON.parse(shipAddr); } catch(e) {}
      }
      return {
        ...raw,
        id: r.id,
        status: r.status || raw.status || (r.payment_status === 'Paid' ? 'paid' : (r.fulfillment_status === 'Cancelled' ? 'cancelled' : 'created')),
        customer: raw.customer || shipAddr || {},
        total: Number(r.total) || Number(raw.total) || 0,
        subtotal: Number(r.subtotal) || Number(raw.subtotal) || 0,
        orderStatus: r.fulfillment_status || raw.orderStatus || 'Processing',
        paymentStatus: r.payment_status || raw.paymentStatus || 'Pending',
        trackingNumber: r.awb || raw.trackingNumber || '',
        delhiveryWaybill: r.awb || raw.delhiveryWaybill || ''
      };
    },

    async getByCustomerEmail(email) {
      const res = await db.query('SELECT * FROM orders WHERE LOWER(customer_email) = LOWER($1) ORDER BY created_at DESC', [email]);
      return res.rows;
    },

    async create(order, client = null) {
      const q = client ? client.query.bind(client) : db.query.bind(db);
      const id = String(order.id || `ORD-${Date.now()}`);
      const custEmail = (order.customer?.email || order.customer_email || order.email || '').toLowerCase();
      const status = order.orderStatus || order.fulfillment_status || 'Processing';
      const awb = order.trackingNumber || order.delhiveryWaybill || order.awb || '';
      const subtotalPaise = order.subtotal_paise !== undefined ? Number(order.subtotal_paise) : Math.round((Number(order.subtotal) || 0) * 100);
      const discountPaise = order.discount_paise !== undefined ? Number(order.discount_paise) : Math.round((Number(order.discount) || 0) * 100);
      const shippingPaise = order.shipping_paise !== undefined ? Number(order.shipping_paise) : Math.round((Number(order.shipping) || 0) * 100);
      const codFeePaise = order.cod_fee_paise !== undefined ? Number(order.cod_fee_paise) : Math.round((Number(order.codFee) || 0) * 100);
      const taxPaise = order.tax_paise !== undefined ? Number(order.tax_paise) : Math.round((Number(order.tax) || 0) * 100);
      const totalPaise = order.total_paise !== undefined ? Number(order.total_paise) : Math.round((Number(order.total) || 0) * 100);
      const idempotencyKey = order.idempotency_key || order.idempotencyKey || null;

      const query = `
        INSERT INTO orders (
          id, customer_id, customer_email, total, subtotal, shipping_address, items, payment_status, fulfillment_status, awb, raw_data,
          subtotal_paise, discount_paise, shipping_paise, cod_fee_paise, tax_paise, total_paise, idempotency_key, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          customer_email = EXCLUDED.customer_email,
          total = EXCLUDED.total,
          subtotal = EXCLUDED.subtotal,
          shipping_address = EXCLUDED.shipping_address,
          items = EXCLUDED.items,
          payment_status = EXCLUDED.payment_status,
          fulfillment_status = EXCLUDED.fulfillment_status,
          awb = EXCLUDED.awb,
          raw_data = EXCLUDED.raw_data,
          subtotal_paise = EXCLUDED.subtotal_paise,
          discount_paise = EXCLUDED.discount_paise,
          shipping_paise = EXCLUDED.shipping_paise,
          cod_fee_paise = EXCLUDED.cod_fee_paise,
          tax_paise = EXCLUDED.tax_paise,
          total_paise = EXCLUDED.total_paise,
          idempotency_key = COALESCE(EXCLUDED.idempotency_key, orders.idempotency_key),
          updated_at = NOW()
        RETURNING *;
      `;
      const res = await q(query, [
        id,
        order.customer_id || null,
        custEmail,
        Number(order.total) || (totalPaise / 100),
        Number(order.subtotal) || (subtotalPaise / 100),
        JSON.stringify(order.customer || order.shipping_address || {}),
        JSON.stringify(order.items || []),
        order.paymentStatus || order.payment_status || 'Pending',
        status,
        awb,
        JSON.stringify(order),
        subtotalPaise,
        discountPaise,
        shippingPaise,
        codFeePaise,
        taxPaise,
        totalPaise,
        idempotencyKey
      ]);
      return res.rows[0];
    },

    async getByIdempotencyKey(key, client = null) {
      if (!key) return null;
      const q = client ? client.query.bind(client) : db.query.bind(db);
      const res = await q('SELECT * FROM orders WHERE idempotency_key = $1 LIMIT 1', [String(key)]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      let raw = {};
      try {
        raw = typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : (r.raw_data || {});
      } catch (_) {}
      return { ...raw, ...r, total: Number(r.total), subtotal: Number(r.subtotal) };
    },

    async updateStatus(id, param2, param3, client = null) {
      // Phase 4: State Machine Transition (id, expectedStatus, nextStatus)
      if (typeof param2 === 'string' && typeof param3 === 'string') {
        const expectedStatus = param2.toLowerCase();
        const nextStatus = param3.toLowerCase();
        const q = client ? client.query.bind(client) : db.query.bind(db);
        const sql = `
          UPDATE orders
          SET status = $1, updated_at = NOW()
          WHERE id = $2 AND LOWER(status) = $3
          RETURNING *;
        `;
        const res = await q(sql, [nextStatus, String(id), expectedStatus]);
        return res.rows[0] || null;
      }

      // Legacy patch: (id, { payment_status, fulfillment_status, awb, status })
      const updates = [];
      const values = [String(id)];
      let i = 2;
      const patch = param2 || {};

      if (patch.status !== undefined) {
        updates.push(`status = ${i++}`);
        values.push(patch.status);
      }
      if (patch.payment_status !== undefined) {
        updates.push(`payment_status = ${i++}`);
        values.push(patch.payment_status);
      }
      if (patch.fulfillment_status !== undefined) {
        updates.push(`fulfillment_status = ${i++}`);
        values.push(patch.fulfillment_status);
      }
      if (patch.awb !== undefined) {
        updates.push(`awb = ${i++}`);
        values.push(patch.awb);
      }

      updates.push(`updated_at = NOW()`);
      const q = client ? client.query.bind(client) : db.query.bind(db);
      const query = `UPDATE orders SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
      const res = await q(query, values);
      return res.rows[0];
    },

    async getStuckOrders(timeoutMs = 30 * 60 * 1000) {
      const sql = `
        SELECT * FROM orders
        WHERE status = 'payment_pending'
          AND created_at < (NOW() - make_interval(secs => $1::double precision / 1000))
        ORDER BY created_at ASC;
      `;
      const res = await db.query(sql, [timeoutMs]);
      return res.rows;
    },

    async delete(id) {
      const res = await db.query('DELETE FROM orders WHERE id = $1', [String(id)]);
      return res.rowCount > 0;
    }
  },

  // 4. Subscribers
  subscribers: {
    async getAll() {
      const res = await db.query('SELECT * FROM subscribers ORDER BY subscribed_at DESC');
      return res.rows;
    },

    async add(email, source = 'footer_newsletter') {
      const cleanEmail = email.trim().toLowerCase();
      const id = `sub_${Date.now()}`;
      const query = `
        INSERT INTO subscribers (id, email, source, status, subscribed_at)
        VALUES ($1, $2, $3, 'Active', NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING *;
      `;
      const res = await db.query(query, [id, cleanEmail, source]);
      return res.rows[0] || { email: cleanEmail, status: 'Active' };
    }
  },

  // 5. OTP & Webhook Events
  events: {
    async setOtp(email, code, expiryMs = 10 * 60 * 1000) {
      const event_id = `OTP_${email.trim().toLowerCase()}`;
      const payload = {
        email: email.trim().toLowerCase(),
        code: String(code),
        expiresAt: Date.now() + expiryMs
      };
      const query = `
        INSERT INTO webhook_events (event_id, event_type, order_id, payload, processed_at)
        VALUES ($1, 'otp_verification', $2, $3, NOW())
        ON CONFLICT (event_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          processed_at = NOW();
      `;
      await db.query(query, [event_id, email, JSON.stringify(payload)]);
    },

    async getOtp(email) {
      const event_id = `OTP_${email.trim().toLowerCase()}`;
      const res = await db.query('SELECT payload FROM webhook_events WHERE event_id = $1 LIMIT 1', [event_id]);
      if (res.rows.length === 0) return null;
      return res.rows[0].payload;
    },

    async deleteOtp(email) {
      const event_id = `OTP_${email.trim().toLowerCase()}`;
      await db.query('DELETE FROM webhook_events WHERE event_id = $1', [event_id]);
    }
  },

  // 6. Customer & Admin Sessions
  sessions: {
    async create({ userId, email, tokenHash, ip, userAgent, idleExpiresAt, absoluteExpiresAt }) {
      const q = `
        INSERT INTO customer_sessions (user_id, token_hash, ip, user_agent, idle_expires_at, absolute_expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (token_hash) DO UPDATE SET
          last_active_at = CURRENT_TIMESTAMP,
          idle_expires_at = EXCLUDED.idle_expires_at
        RETURNING *;
      `;
      const res = await db.query(q, [userId, tokenHash, ip, userAgent, idleExpiresAt, absoluteExpiresAt]);
      return res.rows[0];
    },

    async getByHash(tokenHash) {
      const res = await db.query('SELECT * FROM customer_sessions WHERE token_hash = $1 LIMIT 1;', [tokenHash]);
      return res.rows[0] || null;
    },

    async touch(tokenHash, newIdleExpiresAt) {
      await db.query(
        'UPDATE customer_sessions SET last_active_at = CURRENT_TIMESTAMP, idle_expires_at = $2 WHERE token_hash = $1;',
        [tokenHash, newIdleExpiresAt]
      );
    },

    async deleteByHash(tokenHash) {
      await db.query('DELETE FROM customer_sessions WHERE token_hash = $1;', [tokenHash]);
    },

    async deleteAllForUser(userId) {
      await db.query('DELETE FROM customer_sessions WHERE user_id = $1;', [userId]);
    }
  },

  adminSessions: {
    async create({ username, tokenHash, ip, expiresAt }) {
      const q = `
        INSERT INTO admin_sessions (username, token_hash, ip, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (token_hash) DO UPDATE SET
          last_active_at = CURRENT_TIMESTAMP,
          expires_at = EXCLUDED.expires_at
        RETURNING *;
      `;
      const res = await db.query(q, [username, tokenHash, ip, expiresAt]);
      return res.rows[0];
    },

    async getByHash(tokenHash) {
      const res = await db.query('SELECT * FROM admin_sessions WHERE token_hash = $1 LIMIT 1;', [tokenHash]);
      return res.rows[0] || null;
    },

    async deleteByHash(tokenHash) {
      await db.query('DELETE FROM admin_sessions WHERE token_hash = $1;', [tokenHash]);
    }
  },

  // 7. Append-Only Administrative Audit Log
  auditLog: {
    async create({ adminUsername, ipAddress, action, targetType = null, targetId = null, details = {} }) {
      const q = `
        INSERT INTO audit_log (admin_username, ip_address, action, target_type, target_id, details)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at;
      `;
      const res = await db.query(q, [
        adminUsername,
        ipAddress,
        action,
        targetType,
        targetId,
        JSON.stringify(details || {})
      ]);
      return res.rows[0];
    },

    async query({ action = null, targetType = null, targetId = null, limit = 50, offset = 0 } = {}) {
      const conditions = [];
      const params = [];
      let idx = 1;

      if (action) {
        conditions.push(`action = ${idx++}`);
        params.push(action);
      }
      if (targetType) {
        conditions.push(`target_type = ${idx++}`);
        params.push(targetType);
      }
      if (targetId) {
        conditions.push(`target_id = ${idx++}`);
        params.push(targetId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);
      const q = `
        SELECT id, admin_username, ip_address, action, target_type, target_id, details, created_at
        FROM audit_log
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${idx++} OFFSET ${idx++};
      `;
      const res = await db.query(q, params);
      return res.rows;
    }
  },

  // 8. Payment Records
  payments: {
    async create({ id, orderId, provider, providerOrderId, providerPaymentId, amountPaise, currency = 'INR', status = 'pending', rawResponse = {} }) {
      const paymentId = id || `pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const q = `
        INSERT INTO payments (id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, currency, status, raw_response)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const res = await db.query(q, [
        paymentId,
        orderId,
        provider,
        providerOrderId || null,
        providerPaymentId || null,
        amountPaise,
        currency,
        status,
        JSON.stringify(rawResponse || {})
      ]);
      return res.rows[0];
    },

    async getByOrderId(orderId) {
      const res = await db.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC;', [orderId]);
      return res.rows;
    },

    async getByProviderPaymentId(paymentId) {
      const res = await db.query('SELECT * FROM payments WHERE provider_payment_id = $1 LIMIT 1;', [paymentId]);
      return res.rows[0] || null;
    },

    async updateStatus(id, status, errorCode = null, errorDescription = null, rawResponse = null) {
      const q = `
        UPDATE payments
        SET status = $2, error_code = $3, error_description = $4,
            raw_response = COALESCE($5, raw_response),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *;
      `;
      const res = await db.query(q, [
        id,
        status,
        errorCode,
        errorDescription,
        rawResponse ? JSON.stringify(rawResponse) : null
      ]);
      return res.rows[0] || null;
    }
  }
};

module.exports = db;


async function initSchema() {
  try {
    const p = initPool();
    if (!p) return;
    await p.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        body_html TEXT,
        vendor TEXT,
        category TEXT,
        product_type TEXT,
        homepage_section TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        variants JSONB DEFAULT '[]'::jsonb,
        images JSONB DEFAULT '[]'::jsonb,
        raw_data JSONB,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_products_handle ON products(handle);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_homepage ON products(homepage_section);

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        role TEXT DEFAULT 'customer',
        status TEXT DEFAULT 'Active',
        address TEXT,
        locality TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        country TEXT DEFAULT 'India',
        wishlist JSONB DEFAULT '[]'::jsonb,
        cart JSONB DEFAULT '[]'::jsonb,
        password_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        email TEXT,
        full_name TEXT,
        phone TEXT,
        role TEXT DEFAULT 'customer',
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        customer_email TEXT,
        total NUMERIC DEFAULT 0,
        subtotal NUMERIC DEFAULT 0,
        shipping_address JSONB,
        items JSONB DEFAULT '[]'::jsonb,
        payment_status TEXT DEFAULT 'Pending',
        fulfillment_status TEXT DEFAULT 'Unfulfilled',
        awb TEXT,
        raw_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_email);

      CREATE TABLE IF NOT EXISTS subscribers (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        source TEXT DEFAULT 'footer_newsletter',
        status TEXT DEFAULT 'Active',
        subscribed_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

      CREATE TABLE IF NOT EXISTS webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        order_id TEXT,
        payload JSONB NOT NULL,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON webhook_events(order_id);

      CREATE TABLE IF NOT EXISTS wishlists (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
    `);
    console.log('✓ PostgreSQL schema verified/initialized successfully.');
    // Run additive schema migrations from /migrations
    try {
      const migrate = require('./migrate.js');
      await migrate.runMigrations(p, 'up');
    } catch (migErr) {
      console.warn('[MIGRATIONS NOTICE]:', migErr.message);
    }


    // Seed and synchronize products from data/products.json if missing or incomplete
    const prodPath = path.join(__dirname, '..', 'data', 'products.json');
    if (fs.existsSync(prodPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
        const prods = Array.isArray(raw) ? raw : (raw.products || []);
        const countRes = await p.query('SELECT count(*) FROM products;');
        const dbCount = parseInt(countRes.rows[0].count, 10);
        const legacyCheck = await p.query("SELECT count(*) FROM products WHERE images::text LIKE '%cdn.shopify.com/s/files/1/0633/9339/9022%';").catch(() => ({ rows: [{ count: 0 }] }));
        const legacyCount = parseInt(legacyCheck.rows[0].count, 10);

        if (dbCount < prods.length || legacyCount > 0) {
          console.log(`PostgreSQL catalog needs synchronization (${dbCount}/${prods.length} products, ${legacyCount} legacy images). Syncing catalog from local JSON...`);
          for (const pr of prods) {
            await db.products.upsert(pr);
            await db.variants.syncFromProduct(pr, p);
          }
          console.log(`✓ Successfully seeded and synchronized ${prods.length} products into PostgreSQL database.`);
        }
      } catch (seedErr) {
        console.warn('PostgreSQL product seed parsing notice:', seedErr.message);
      }
    }
  } catch (err) {
    console.warn('PostgreSQL schema auto-init notice:', err.message);
  }
}
