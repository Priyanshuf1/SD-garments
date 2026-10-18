/**
 * GENRAGE Supabase Database & Storage Adapter
 * Provides high-speed REST operations with zero external dependencies (native fetch).
 * Automatically connects to live Supabase PostgreSQL and Supabase Storage when configured,
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
 * Storage Helpers
 */
const storage = {
  /**
   * Upload an image buffer or base64 data to Supabase Storage
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
 * Query Builder Helper (PostgREST)
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
  from
};
