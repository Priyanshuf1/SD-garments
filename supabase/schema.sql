-- ==============================================================================
-- GENRAGE STREETWEAR D2C PLATFORM - SUPABASE POSTGRESQL PRODUCTION SCHEMA
-- Full Implementation based on Backend_Database_Integration_Blueprint.md
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. USERS & PROFILES (Extends Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(150),
    role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'admin', 'super_admin')),
    avatar_url TEXT,
    marketing_consent BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile trigger on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.phone,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Streetwear Customer'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  )
  ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 2. CUSTOMER SAVED ADDRESSES (Multi-address support)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    label VARCHAR(50) DEFAULT 'Home',   -- 'Home', 'Work', 'Other'
    full_name VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(6) NOT NULL,
    country VARCHAR(50) DEFAULT 'India' NOT NULL,
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. PRODUCTS & VARIANTS (Dual-Image Flatlay + Model Hover)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    handle VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    vendor VARCHAR(100) DEFAULT 'GENRAGE',
    category VARCHAR(100) NOT NULL,
    product_type VARCHAR(100) NOT NULL,
    homepage_section VARCHAR(50) DEFAULT 'none', -- 'just_dropped', 'new_arrivals', 'basics', 'none'
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_published BOOLEAN DEFAULT true,
    gst_rate_percent INTEGER DEFAULT 12,
    sort_order INTEGER DEFAULT 0,
    meta_title VARCHAR(255),
    meta_description TEXT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    title VARCHAR(100) DEFAULT 'Default Title',
    sku VARCHAR(100) UNIQUE NOT NULL,
    size VARCHAR(20) DEFAULT 'Free Size',
    color VARCHAR(50) DEFAULT 'Black',
    color_hex VARCHAR(7) DEFAULT '#111111',
    price_paise BIGINT NOT NULL,        -- Selling price in paise (₹1,599 = 159900)
    mrp_paise BIGINT NOT NULL,          -- MRP in paise (₹2,499 = 249900)
    inventory_quantity INT DEFAULT 100,
    available BOOLEAN DEFAULT true,
    weight_grams INT DEFAULT 450,       -- Used for Delhivery freight calculation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dual Images: position 1 = Flatlay (Primary), position 2 = Model Hover
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    src TEXT NOT NULL,
    storage_path TEXT,                  -- Optional Supabase Storage relative path
    alt_text VARCHAR(255),
    position INT DEFAULT 1,
    is_model_view BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. COLLECTIONS & SEASONAL DROPS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    handle VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_drop BOOLEAN DEFAULT false,
    drop_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.collection_products (
    collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, product_id)
);

-- ------------------------------------------------------------------------------
-- 5. COUPONS & DISCOUNTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value INTEGER NOT NULL,    -- Percentage value OR fixed paise amount
    min_order_paise BIGINT DEFAULT 0,
    max_discount_paise BIGINT,
    usage_limit INT DEFAULT 1000,
    usage_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. ORDERS & FULFILLMENT (Cashfree & Delhivery Integrated)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_no VARCHAR(50) UNIQUE NOT NULL,   -- e.g. 'GR-2610-8492'
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(20),

    -- Financial amounts in paise (₹1 = 100 paise)
    subtotal_paise BIGINT NOT NULL,
    discount_paise BIGINT DEFAULT 0 NOT NULL,
    shipping_paise BIGINT DEFAULT 0 NOT NULL,
    tax_paise BIGINT NOT NULL,              -- 12% GST inclusive
    total_paise BIGINT NOT NULL,            -- Final charged amount

    -- Order Status Lifecycle
    status VARCHAR(30) DEFAULT 'pending_payment' NOT NULL CHECK (status IN (
        'pending_payment', 'paid', 'processing', 'shipped',
        'delivered', 'cancelled', 'payment_failed', 'refunded', 'expired'
    )),

    -- Payment Info
    cashfree_order_id VARCHAR(100) UNIQUE,
    cashfree_payment_id VARCHAR(100),
    payment_method VARCHAR(50),             -- 'UPI', 'CARD', 'NETBANKING', 'COD'

    -- Coupon applied
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
    coupon_code VARCHAR(50),

    -- Shipping Address Snapshot (Frozen JSONB)
    shipping_address JSONB NOT NULL,

    -- Delhivery Logistics Info
    delhivery_waybill VARCHAR(100),
    tracking_url TEXT,

    -- Expiry & Lifecycle Timestamps
    expires_at TIMESTAMPTZ NOT NULL,        -- 15-minute reservation window
    paid_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    product_title VARCHAR(255) NOT NULL,
    variant_sku VARCHAR(100),
    size VARCHAR(20),
    color VARCHAR(50),
    unit_price_paise BIGINT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    product_image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. PAYMENTS LEDGER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    cashfree_order_id VARCHAR(100) NOT NULL,
    cashfree_payment_id VARCHAR(100) UNIQUE NOT NULL,
    amount_paise BIGINT NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR' NOT NULL,
    payment_method VARCHAR(50),
    payment_status VARCHAR(30) NOT NULL CHECK (payment_status IN ('SUCCESS', 'FAILED', 'PENDING')),
    raw_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ------------------------------------------------------------------------------
-- 8. WEBHOOK IDEMPOTENCY LEDGER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
    event_id VARCHAR(128) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    order_id VARCHAR(100),
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ------------------------------------------------------------------------------
-- 9. STOCK MOVEMENTS LEDGER (Audit Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE NOT NULL,
    quantity_delta INTEGER NOT NULL,        -- Negative for sale, positive for restock
    reason VARCHAR(50) NOT NULL CHECK (reason IN (
        'order_reserved', 'order_expired', 'order_paid',
        'order_cancelled', 'manual_restock', 'manual_adjustment'
    )),
    reference_id UUID,                      -- order_id or adjustment_id
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ------------------------------------------------------------------------------
-- 10. DELHIVERY SHIPMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
    waybill VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(60) DEFAULT 'Manifested' NOT NULL,
    tracking_url TEXT,
    estimated_delivery_date DATE,
    raw_delhivery_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ------------------------------------------------------------------------------
-- 11. CUSTOMER WISHLISTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wishlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- ------------------------------------------------------------------------------
-- 12. REVIEWS & RATINGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    customer_name VARCHAR(150) NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(120),
    body TEXT,
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 13. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_handle ON public.products(handle);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_homepage ON public.products(homepage_section) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_images_product ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_cashfree ON public.orders(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON public.orders(expires_at) WHERE status = 'pending_payment';
CREATE INDEX IF NOT EXISTS idx_stock_variant ON public.stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON public.wishlists(user_id);

-- ------------------------------------------------------------------------------
-- 14. STORE PROCEDURES / RPC FUNCTIONS
-- ------------------------------------------------------------------------------

-- Atomic stock decrement (checks stock before updating)
CREATE OR REPLACE FUNCTION decrement_stock(p_variant_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    UPDATE public.product_variants
    SET inventory_quantity = inventory_quantity - p_quantity
    WHERE id = p_variant_id
      AND inventory_quantity >= p_quantity
      AND available = TRUE;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic stock increment (on cancellation or order expiry)
CREATE OR REPLACE FUNCTION increment_stock(p_variant_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.product_variants
    SET inventory_quantity = inventory_quantity + p_quantity
    WHERE id = p_variant_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic coupon usage counter
CREATE OR REPLACE FUNCTION increment_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.coupons
    SET usage_count = usage_count + 1
    WHERE id = p_coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 15. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- Public read-only policies
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (is_published = true);
CREATE POLICY "Public read variants" ON public.product_variants FOR SELECT USING (available = true);
CREATE POLICY "Public read product images" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Public read collections" ON public.collections FOR SELECT USING (true);
CREATE POLICY "Public read collection products" ON public.collection_products FOR SELECT USING (true);
CREATE POLICY "Public read approved reviews" ON public.reviews FOR SELECT USING (is_approved = true);

-- User-scoped policies
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own order items" ON public.order_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Users manage own wishlist" ON public.wishlists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users write reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Note: payments, webhook_events, stock_movements, shipments are restricted to SUPABASE_SERVICE_ROLE_KEY
