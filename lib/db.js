/**
 * ALLEYRICH AWS RDS PostgreSQL Native Database Adapter
 * High-performance connection pool using 'pg'.
 * Directly handles products, customers/profiles, orders, subscribers, wishlists, and webhook events.
 */

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
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000
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
  isConfigured: isAwsConfigured,
  pool,

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

    async create(order) {
      const id = String(order.id || `ORD-${Date.now()}`);
      const custEmail = (order.customer?.email || order.customer_email || order.email || '').toLowerCase();
      const status = order.orderStatus || order.fulfillment_status || 'Processing';
      const awb = order.trackingNumber || order.delhiveryWaybill || order.awb || '';
      const query = `
        INSERT INTO orders (
          id, customer_id, customer_email, total, subtotal, shipping_address, items, payment_status, fulfillment_status, awb, raw_data, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
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
          updated_at = NOW()
        RETURNING *;
      `;
      const res = await db.query(query, [
        id,
        order.customer_id || null,
        custEmail,
        Number(order.total) || 0,
        Number(order.subtotal) || 0,
        JSON.stringify(order.customer || order.shipping_address || {}),
        JSON.stringify(order.items || []),
        order.paymentStatus || order.payment_status || 'Pending',
        status,
        awb,
        JSON.stringify(order)
      ]);
      return res.rows[0];
    },

    async updateStatus(id, { payment_status, fulfillment_status, awb }) {
      const updates = [];
      const values = [String(id)];
      let i = 2;

      if (payment_status !== undefined) {
        updates.push(`payment_status = $${i++}`);
        values.push(payment_status);
      }
      if (fulfillment_status !== undefined) {
        updates.push(`fulfillment_status = $${i++}`);
        values.push(fulfillment_status);
      }
      if (awb !== undefined) {
        updates.push(`awb = $${i++}`);
        values.push(awb);
      }

      updates.push(`updated_at = NOW()`);

      const query = `UPDATE orders SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
      const res = await db.query(query, values);
      return res.rows[0];
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

    // Seed products from products.json if empty
    const countRes = await p.query('SELECT count(*) FROM products;');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      console.log('PostgreSQL products table empty. Seeding catalog from local JSON...');
      const path = require('path');
      const prodPath = path.join(__dirname, '..', 'data', 'products.json');
      if (fs.existsSync(prodPath)) {
        const prods = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
        for (const pr of prods) {
          await db.products.upsert(pr);
        }
        console.log(`✓ Successfully seeded ${prods.length} products into local PostgreSQL database.`);
      }
    }
  } catch (err) {
    console.warn('PostgreSQL schema auto-init notice:', err.message);
  }
}
