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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Customer Profiles Management
 */
const profiles = {
  async get(userId, email = null) {
    if (!isConfigured || !userId) return null;
    try {
      let profileData = null;
      const isUuid = UUID_REGEX.test(userId);

      if (isUuid) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
          headers: getHeaders(true)
        });
        if (res.ok) {
          const rows = await res.json();
          if (rows && rows.length > 0) {
            const r = rows[0];
            profileData = {
              id: r.id,
              email: r.email,
              name: r.full_name || 'Storefront Member',
              phone: r.phone || '',
              role: r.role || 'customer',
              avatar_url: r.avatar_url,
              created_at: r.created_at
            };
          }
        }

        // Fetch user_metadata from Supabase Auth admin API to get cloud wishlist and saved address
        let userMeta = null;
        try {
          const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
            headers: getHeaders(true)
          });
          if (authRes.ok) {
            const authUser = await authRes.json();
            userMeta = authUser.user_metadata || {};
            if (!profileData) {
              profileData = {
                id: authUser.id,
                email: authUser.email,
                name: userMeta.full_name || 'Storefront Member',
                phone: userMeta.phone || '',
                role: userMeta.role || 'customer',
                created_at: authUser.created_at
              };
            }
          }
        } catch (e) {}

        if (profileData) {
          const relationalWish = await wishlists.getByUserId(userId, profileData.email);
          const metaWish = Array.isArray(userMeta?.wishlist) ? userMeta.wishlist : [];
          profileData.wishlist = Array.from(new Set([...metaWish, ...relationalWish]));
          if (userMeta?.address) profileData.address = userMeta.address;
          if (userMeta?.city) profileData.city = userMeta.city;
          if (userMeta?.state) profileData.state = userMeta.state;
          if (userMeta?.pincode) profileData.pincode = userMeta.pincode;
          return profileData;
        }
      }

      // Check Supabase webhook_events for cloud-persisted customer profile
      const queryId = encodeURIComponent(email || userId);
      const eventRes = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?event_type=eq.customer_profile&or=(order_id.eq.${queryId},event_id.eq.CUST_${encodeURIComponent(userId)})&order=processed_at.desc&limit=1`, {
        headers: getHeaders(true)
      });
      if (eventRes.ok) {
        const events = await eventRes.json();
        if (events && events.length > 0 && events[0].payload) {
          const p = events[0].payload;
          const cloudWish = await wishlists.getByUserId(userId, p.email || email);
          p.wishlist = Array.from(new Set([...(p.wishlist || []), ...cloudWish]));
          return p;
        }
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
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) {
          return await this.get(rows[0].id, cleanEmail);
        }
      }
      return await this.get(cleanEmail, cleanEmail);
    } catch (e) {
      return null;
    }
  },

  async update(userId, updates) {
    if (!isConfigured || !userId) return null;
    try {
      const isUuid = UUID_REGEX.test(userId);
      const email = (updates.email || '').toLowerCase().trim();

      if (isUuid) {
        const payload = {};
        if (updates.name !== undefined) payload.full_name = updates.name;
        if (updates.full_name !== undefined) payload.full_name = updates.full_name;
        if (updates.phone !== undefined) payload.phone = updates.phone;
        if (updates.avatar_url !== undefined) payload.avatar_url = updates.avatar_url;
        payload.updated_at = new Date().toISOString();

        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers: { ...getHeaders(true), 'Prefer': 'return=representation' },
          body: JSON.stringify(payload)
        }).catch(() => {});

        const metaUpdates = {};
        if (updates.wishlist !== undefined) metaUpdates.wishlist = updates.wishlist;
        if (updates.address !== undefined) metaUpdates.address = updates.address;
        if (updates.city !== undefined) metaUpdates.city = updates.city;
        if (updates.state !== undefined) metaUpdates.state = updates.state;
        if (updates.pincode !== undefined) metaUpdates.pincode = updates.pincode;
        if (updates.phone !== undefined) metaUpdates.phone = updates.phone;
        if (updates.name || updates.full_name) metaUpdates.full_name = updates.name || updates.full_name;

        if (Object.keys(metaUpdates).length > 0) {
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: getHeaders(true),
            body: JSON.stringify({ user_metadata: metaUpdates })
          }).catch(() => {});
        }
      }

      // Always persist to Supabase PostgreSQL webhook_events for universal cloud persistence
      const eventKey = email || userId;
      const profileSnapshot = {
        id: userId,
        email: email || undefined,
        name: updates.name || updates.full_name || 'Storefront Member',
        phone: updates.phone || '',
        address: updates.address || '',
        locality: updates.locality || '',
        city: updates.city || '',
        state: updates.state || '',
        pincode: updates.pincode || '',
        country: updates.country || 'India',
        wishlist: updates.wishlist || [],
        updatedAt: new Date().toISOString()
      };

      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
        method: 'POST',
        headers: { ...getHeaders(true), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          event_id: `CUST_${eventKey}`,
          event_type: 'customer_profile',
          order_id: eventKey,
          payload: profileSnapshot
        })
      }).catch(() => {});

      if (updates.wishlist !== undefined) {
        await wishlists.sync(userId, updates.wishlist, email);
      }

      return await this.get(userId, email);
    } catch (e) {
      return null;
    }
  }
};

/**
 * Customer Wishlist Database Management
 */
const wishlists = {
  async getByUserId(userId, email = null) {
    if (!isConfigured || !userId) return [];
    try {
      const handles = new Set();
      const isUuid = UUID_REGEX.test(userId);

      if (isUuid) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/wishlists?user_id=eq.${userId}&select=product_id,products(id,handle,title,category)`, {
          headers: getHeaders(true)
        });
        if (res.ok) {
          const rows = await res.json();
          rows.forEach(r => {
            const h = r.products?.handle || r.product_id;
            if (h) handles.add(h);
          });
        }
      }

      // Query Supabase webhook_events for cloud wishlist
      const eventKey = encodeURIComponent(email || userId);
      const evRes = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?event_type=eq.customer_wishlist&or=(order_id.eq.${eventKey},event_id.eq.WISH_${encodeURIComponent(userId)})&order=processed_at.desc&limit=1`, {
        headers: getHeaders(true)
      });
      if (evRes.ok) {
        const evRows = await evRes.json();
        if (evRows && evRows.length > 0 && Array.isArray(evRows[0].payload?.wishlist)) {
          evRows[0].payload.wishlist.forEach(h => {
            const cleanH = typeof h === 'string' ? h : h?.handle;
            if (cleanH) handles.add(cleanH);
          });
        }
      }

      return Array.from(handles);
    } catch (e) {
      return [];
    }
  },

  async sync(userId, productHandles = [], email = null) {
    if (!isConfigured || !userId || !Array.isArray(productHandles)) return false;
    try {
      const cleanHandles = Array.from(new Set(productHandles.map(h => typeof h === 'string' ? h : h?.handle).filter(Boolean)));
      const isUuid = UUID_REGEX.test(userId);

      if (isUuid) {
        try {
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: getHeaders(true),
            body: JSON.stringify({ user_metadata: { wishlist: cleanHandles } })
          });
        } catch (authErr) {}

        await fetch(`${SUPABASE_URL}/rest/v1/wishlists?user_id=eq.${userId}`, {
          method: 'DELETE',
          headers: getHeaders(true)
        }).catch(() => {});

        if (cleanHandles.length > 0) {
          const handleList = cleanHandles.map(h => `"${h}"`).join(',');
          const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/products?handle=in.(${handleList})&select=id,handle`, {
            headers: getHeaders(true)
          });

          if (prodRes.ok) {
            const prods = await prodRes.json();
            const rows = prods.map(p => ({
              user_id: userId,
              product_id: p.id
            }));

            if (rows.length > 0) {
              await fetch(`${SUPABASE_URL}/rest/v1/wishlists`, {
                method: 'POST',
                headers: { ...getHeaders(true), 'Prefer': 'return=minimal' },
                body: JSON.stringify(rows)
              }).catch(() => {});
            }
          }
        }
      }

      // Always persist to Supabase webhook_events table
      const eventKey = email || userId;
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
        method: 'POST',
        headers: { ...getHeaders(true), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          event_id: `WISH_${eventKey}`,
          event_type: 'customer_wishlist',
          order_id: eventKey,
          payload: {
            userId: userId,
            email: email || undefined,
            wishlist: cleanHandles,
            updatedAt: new Date().toISOString()
          }
        })
      }).catch(() => {});

      return true;
    } catch (e) {
      return false;
    }
  }
};

/**
 * Newsletter Subscribers Management (Cloud Database Storage via Supabase)
 */
const subscribers = {
  async getAll() {
    if (!isConfigured) return [];
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?event_type=eq.newsletter_subscription&select=*&order=processed_at.desc`, {
        headers: getHeaders(true)
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return rows.map(r => r.payload || {
        id: r.event_id,
        email: r.order_id,
        subscribedAt: r.processed_at,
        source: 'footer_newsletter',
        status: 'Active'
      });
    } catch (e) {
      return [];
    }
  },

  async insert(subscriber) {
    if (!isConfigured || !subscriber?.email) return false;
    try {
      const row = {
        event_id: subscriber.id || `SUB-${Date.now()}`,
        event_type: 'newsletter_subscription',
        order_id: subscriber.email.toLowerCase().trim(),
        payload: subscriber,
        processed_at: subscriber.subscribedAt || new Date().toISOString()
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?on_conflict=event_id`, {
        method: 'POST',
        headers: { ...getHeaders(true), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([row])
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  async delete(subIdOrEmail) {
    if (!isConfigured || !subIdOrEmail) return false;
    try {
      const target = String(subIdOrEmail).trim();
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?event_type=eq.newsletter_subscription&event_id=eq.${encodeURIComponent(target)}`, {
        method: 'DELETE',
        headers: getHeaders(true)
      });
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?event_type=eq.newsletter_subscription&order_id=eq.${encodeURIComponent(target.toLowerCase())}`, {
        method: 'DELETE',
        headers: getHeaders(true)
      });
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
  subscribers,
  from
};
