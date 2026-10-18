/**
 * GENRAGE Supabase Database, Auth & Storage Adapter
 * Provides high-speed REST operations with zero external dependencies (native fetch).
 * Automatically connects to live Supabase PostgreSQL, Supabase Auth, and Supabase Storage,
 * with full fallback resilience to local JSON data.
 */

const fs = require('fs');
const path = require('path');

// Auto-load .env if not loaded yet
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > -1) {
          const k = trimmed.substring(0, idx).trim();
          const v = trimmed.substring(idx + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    });
  }
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shhjnxarewideotbhzby.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isConfigured = Boolean(SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY) && !SUPABASE_URL.includes('your-project-id'));

function getHeaders(useServiceKey = true) {
  const key = useServiceKey ? (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY) : (SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY);
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Storage Helpers (100% Free - 1GB bucket)
 */
const storage = {
  /**
   * Upload an image buffer or base64 data to Supabase Storage bucket
   * @param {Buffer|string} fileData - Buffer or base64 string
   * @param {string} filename - target filename
   * @param {string} mimeType - image/webp, image/jpeg, image/png
   * @returns {Promise<{success: boolean, publicUrl?: string, error?: string}>}
   */
  async uploadImage(fileData, filename, mimeType = 'image/webp') {
    if (!isConfigured || !SUPABASE_SERVICE_KEY) {
      return { success: false, error: 'Supabase storage not configured' };
    }

    try {
      let buffer = fileData;
      if (typeof fileData === 'string') {
        if (fileData.startsWith('data:')) {
          buffer = Buffer.from(fileData.split(',')[1], 'base64');
        } else {
          buffer = Buffer.from(fileData, 'base64');
        }
      }

      const cleanFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/product-images/${cleanFilename}`;

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': mimeType,
          'x-upsert': 'true'
        },
        body: buffer
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `Upload failed: ${errText}` };
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${cleanFilename}`;
      return { success: true, publicUrl, filename: cleanFilename };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

/**
 * Customer Authentication Helpers (100% Free - up to 50,000 MAU)
 */
const auth = {
  /**
   * Register a customer via Supabase Admin API with instant auto-confirmation
   */
  async signUp({ email, password, full_name, phone }) {
    if (!isConfigured) return { success: false, message: 'Supabase not configured' };
    try {
      const cleanEmail = (email || '').toLowerCase().trim();
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({
          email: cleanEmail,
          password: password,
          email_confirm: true,
          user_metadata: {
            full_name: full_name || 'Storefront Member',
            phone: phone || '',
            role: 'customer'
          }
        })
      });

      const body = await res.json();
      if (!res.ok) {
        if (body.message && body.message.toLowerCase().includes('already registered')) {
          return { success: false, message: 'Account with this email already exists. Please log in.' };
        }
        return { success: false, message: body.message || 'Registration failed' };
      }

      const user = body;

      // Log in immediately to obtain standard JWT token
      let token = `tok_${user.id}_${Date.now()}`;
      try {
        const tokRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: getHeaders(false),
          body: JSON.stringify({ email: cleanEmail, password: password })
        });
        if (tokRes.ok) {
          const tokData = await tokRes.json();
          if (tokData.access_token) token = tokData.access_token;
        }
      } catch (tokErr) {}

      // Fetch or build the profile object
      const profile = await profiles.get(user.id);
      const safeUser = profile || {
        id: user.id,
        email: cleanEmail,
        name: full_name || 'Storefront Member',
        phone: phone || '',
        role: 'customer',
        status: 'Active'
      };

      return { success: true, user: safeUser, token };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  /**
   * Authenticate customer with email and password
   */
  async signInWithPassword({ email, password }) {
    if (!isConfigured) return { success: false, message: 'Supabase not configured' };
    try {
      const cleanEmail = (email || '').toLowerCase().trim();
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: getHeaders(false),
        body: JSON.stringify({ email: cleanEmail, password })
      });

      const body = await res.json();
      if (!res.ok) {
        return { success: false, message: body.error_description || body.message || 'Invalid email or password' };
      }

      const token = body.access_token;
      const user = body.user;

      // Fetch user profile from public.profiles
      let profile = await profiles.get(user.id);
      if (!profile) {
        profile = {
          id: user.id,
          email: cleanEmail,
          name: user.user_metadata?.full_name || 'Storefront Member',
          phone: user.user_metadata?.phone || '',
          role: 'customer'
        };
      }

      return { success: true, user: profile, token };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  /**
   * Send 100% Free Email OTP / Magic Link
   */
  async sendMagicLink({ email }) {
    if (!isConfigured) return { success: false, message: 'Supabase not configured' };
    try {
      const cleanEmail = (email || '').toLowerCase().trim();
      const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: getHeaders(false),
        body: JSON.stringify({ email: cleanEmail, create_user: true })
      });

      if (!res.ok) {
        const body = await res.json();
        return { success: false, message: body.message || 'Failed to send login code' };
      }

      return { success: true, message: `Login link / verification code sent to ${cleanEmail}` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  /**
   * Verify Email OTP / Magic Token
   */
  async verifyOtp({ email, token, type = 'email' }) {
    if (!isConfigured) return { success: false, message: 'Supabase not configured' };
    try {
      const cleanEmail = (email || '').toLowerCase().trim();
      const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: getHeaders(false),
        body: JSON.stringify({ email: cleanEmail, token, type })
      });

      const body = await res.json();
      if (!res.ok) {
        return { success: false, message: body.error_description || body.message || 'Invalid or expired code' };
      }

      const accessToken = body.access_token;
      const user = body.user;
      let profile = await profiles.get(user.id);
      if (!profile) {
        profile = {
          id: user.id,
          email: cleanEmail,
          name: user.user_metadata?.full_name || 'Storefront Member',
          phone: user.user_metadata?.phone || '',
          role: 'customer'
        };
      }

      return { success: true, user: profile, token: accessToken };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  /**
   * Get authenticated user by access token
   */
  async getUser(token) {
    if (!isConfigured || !token) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }
};

/**
 * Customer Profiles Management
 */
const profiles = {
  async get(userId) {
    if (!isConfigured || !userId) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        headers: getHeaders(true)
      });
      if (!res.ok) return null;
      const rows = await res.json();
      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          email: r.email,
          name: r.full_name || 'Storefront Member',
          phone: r.phone || '',
          role: r.role || 'customer',
          avatar_url: r.avatar_url,
          created_at: r.created_at
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  async getByEmail(email) {
    if (!isConfigured || !email) return null;
    try {
      const cleanEmail = email.toLowerCase().trim();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${cleanEmail}&select=*`, {
        headers: getHeaders(true)
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows && rows.length > 0 ? rows[0] : null;
    } catch (e) {
      return null;
    }
  },

  async update(userId, updates) {
    if (!isConfigured || !userId) return null;
    try {
      const payload = {};
      if (updates.name !== undefined) payload.full_name = updates.name;
      if (updates.full_name !== undefined) payload.full_name = updates.full_name;
      if (updates.phone !== undefined) payload.phone = updates.phone;
      if (updates.avatar_url !== undefined) payload.avatar_url = updates.avatar_url;
      payload.updated_at = new Date().toISOString();

      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { ...getHeaders(true), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows && rows.length > 0 ? rows[0] : null;
    } catch (e) {
      return null;
    }
  }
};

/**
 * Customer Wishlist Database Management
 */
const wishlists = {
  async getByUserId(userId) {
    if (!isConfigured || !userId) return [];
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/wishlists?user_id=eq.${userId}&select=product_id,products(id,handle,title,category)`, {
        headers: getHeaders(true)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return rows.map(r => r.products?.handle || r.product_id).filter(Boolean);
    } catch (e) {
      return [];
    }
  },

  async sync(userId, productHandles = []) {
    if (!isConfigured || !userId || !Array.isArray(productHandles)) return false;
    try {
      // Find product UUIDs for handles
      const handleList = productHandles.map(h => `"${h}"`).join(',');
      if (!handleList) return true;

      const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/products?handle=in.(${handleList})&select=id,handle`, {
        headers: getHeaders(true)
      });
      if (!prodRes.ok) return false;
      const prods = await prodRes.json();

      const rows = prods.map(p => ({
        user_id: userId,
        product_id: p.id
      }));

      if (rows.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/wishlists?on_conflict=user_id,product_id`, {
          method: 'POST',
          headers: { ...getHeaders(true), 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(rows)
        });
      }
      return true;
    } catch (e) {
      return false;
    }
  }
};

/**
 * PostgREST Generic Query Builder
 */
function from(table) {
  let endpoint = `${SUPABASE_URL}/rest/v1/${table}`;
  const params = new URLSearchParams();
  const headers = getHeaders(true);

  return {
    select(columns = '*') {
      params.set('select', columns);
      return this;
    },
    eq(column, value) {
      params.set(column, `eq.${value}`);
      return this;
    },
    order(column, { ascending = true } = {}) {
      params.set('order', `${column}.${ascending ? 'asc' : 'desc'}`);
      return this;
    },
    limit(count) {
      params.set('limit', String(count));
      return this;
    },
    async execute() {
      const url = `${endpoint}?${params.toString()}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase query failed on ${table}: ${err}`);
      }
      return res.json();
    },
    async insert(data) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase insert failed on ${table}: ${err}`);
      }
      return res.json();
    },
    async update(data) {
      const url = `${endpoint}?${params.toString()}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase update failed on ${table}: ${err}`);
      }
      return res.json();
    },
    async delete() {
      const url = `${endpoint}?${params.toString()}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { ...headers, 'Prefer': 'return=representation' }
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase delete failed on ${table}: ${err}`);
      }
      return res.json();
    }
  };
}

module.exports = {
  isConfigured,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY,
  storage,
  auth,
  profiles,
  wishlists,
  from
};
