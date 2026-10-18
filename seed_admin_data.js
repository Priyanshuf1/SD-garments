const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 1. Orders Seed
const ordersFile = path.join(dataDir, 'orders.json');
if (!fs.existsSync(ordersFile)) {
  const orders = [
    {
      id: "GR-9842",
      customer: {
        name: "Aarav Sharma",
        email: "aarav.sharma@gmail.com",
        phone: "+91 98201 84920",
        address: "Flat 402, Skyline Residency, Bandra West",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400050"
      },
      items: [
        {
          id: 9581723877614,
          title: "Zaraki Corduroy Full Sleeves",
          size: "L",
          price: 1599,
          quantity: 1,
          image: "https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977"
        },
        {
          id: 9581723900001,
          title: "Typhoon Black Straight Fit Baggy Pants",
          size: "32",
          price: 1899,
          quantity: 1,
          image: "https://genrage.com/cdn/shop/files/front_79f62e01-7f3f-468e-903c-959328f4d873.png?v=1758346828&width=400"
        }
      ],
      subtotal: 3498,
      discount: 349.8,
      shipping: 0,
      total: 3148.2,
      discountCode: "RAGE10",
      paymentMethod: "Gokwik UPI",
      paymentStatus: "Paid",
      orderStatus: "Delivered",
      trackingNumber: "BLUEDART-8829104",
      createdAt: "2026-10-17T14:22:10+05:30",
      updatedAt: "2026-10-18T01:10:00+05:30"
    },
    {
      id: "GR-9841",
      customer: {
        name: "Rohan Kapoor",
        email: "rohan.kapoor@outlook.com",
        phone: "+91 98112 30491",
        address: "C-14, Hauz Khas Enclave",
        city: "New Delhi",
        state: "Delhi",
        pincode: "110016"
      },
      items: [
        {
          id: 9581723900002,
          title: "Sinutation Grey Boxy Oversized Tshirt",
          size: "XL",
          price: 1299,
          quantity: 2,
          image: "https://cdn.shopify.com/s/files/1/0633/9339/9022/files/sinutation-unisex-grey-boxy-oversized-tshirt-genrage-1_140x140.png?v=1788528958"
        }
      ],
      subtotal: 2598,
      discount: 0,
      shipping: 0,
      total: 2598,
      discountCode: null,
      paymentMethod: "Cash on Delivery",
      paymentStatus: "Pending",
      orderStatus: "Shipped",
      trackingNumber: "DELHIVERY-99104820",
      createdAt: "2026-10-17T16:45:00+05:30",
      updatedAt: "2026-10-17T19:30:00+05:30"
    },
    {
      id: "GR-9840",
      customer: {
        name: "Ishaan Verma",
        email: "ishaan.v@gmail.com",
        phone: "+91 97410 88201",
        address: "24, 5th Cross, Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038"
      },
      items: [
        {
          id: 9581723877614,
          title: "Zaraki Corduroy Full Sleeves",
          size: "M",
          price: 1599,
          quantity: 1,
          image: "https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977"
        }
      ],
      subtotal: 1599,
      discount: 239.85,
      shipping: 0,
      total: 1359.15,
      discountCode: "FIRSTBUY",
      paymentMethod: "Razorpay / Cards",
      paymentStatus: "Paid",
      orderStatus: "Processing",
      trackingNumber: null,
      createdAt: "2026-10-17T18:12:00+05:30",
      updatedAt: "2026-10-17T18:15:00+05:30"
    },
    {
      id: "GR-9839",
      customer: {
        name: "Meera Nair",
        email: "meera.nair@yahoo.com",
        phone: "+91 94471 20934",
        address: "Hill View Villa, Jubilee Hills",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500033"
      },
      items: [
        {
          id: 9581723900003,
          title: "Dawn Unisex Straight Fit Baggy Pants",
          size: "30",
          price: 1999,
          quantity: 1,
          image: "https://cdn.shopify.com/s/files/1/0633/9339/9022/files/dawn-unisex-straight-fit-baggy-pants-genrage-1_140x140.png?v=1788529016"
        }
      ],
      subtotal: 1999,
      discount: 199.9,
      shipping: 0,
      total: 1799.1,
      discountCode: "RAGE10",
      paymentMethod: "Gokwik UPI",
      paymentStatus: "Paid",
      orderStatus: "Pending",
      trackingNumber: null,
      createdAt: "2026-10-17T20:05:00+05:30",
      updatedAt: "2026-10-17T20:05:00+05:30"
    },
    {
      id: "GR-9838",
      customer: {
        name: "Karan Malhotra",
        email: "karan.malhotra@gmail.com",
        phone: "+91 98720 11982",
        address: "Sector 18-B, House #402",
        city: "Chandigarh",
        state: "Punjab",
        pincode: "160018"
      },
      items: [
        {
          id: 9581723900004,
          title: "Heavyweight Boxy Drop-Shoulder Tee",
          size: "L",
          price: 1199,
          quantity: 2,
          image: "https://cdn.shopify.com/s/files/1/0633/9339/9022/files/1_cd34702d-ac3b-4ee4-a9d4-1733e518d430.png?v=1792222977"
        }
      ],
      subtotal: 2398,
      discount: 0,
      shipping: 0,
      total: 2398,
      discountCode: null,
      paymentMethod: "Gokwik UPI",
      paymentStatus: "Paid",
      orderStatus: "Delivered",
      trackingNumber: "BLUEDART-7729102",
      createdAt: "2026-10-16T11:20:00+05:30",
      updatedAt: "2026-10-17T15:00:00+05:30"
    }
  ];
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  console.log('Seeded orders.json with', orders.length, 'orders');
}

// 2. Discounts Seed
const discountsFile = path.join(dataDir, 'discounts.json');
if (!fs.existsSync(discountsFile)) {
  const discounts = [
    {
      id: "dsc_1",
      code: "RAGE10",
      type: "percentage",
      value: 10,
      minOrderValue: 999,
      maxDiscount: 500,
      usageCount: 1420,
      usageLimit: 5000,
      isActive: true,
      description: "10% off on all streetwear orders above ₹999",
      createdAt: "2026-01-01T00:00:00Z"
    },
    {
      id: "dsc_2",
      code: "FIRSTBUY",
      type: "percentage",
      value: 15,
      minOrderValue: 1499,
      maxDiscount: 750,
      usageCount: 890,
      usageLimit: 2500,
      isActive: true,
      description: "Welcome offer: 15% off first streetwear purchase",
      createdAt: "2026-01-01T00:00:00Z"
    },
    {
      id: "dsc_3",
      code: "FREESHIP",
      type: "shipping",
      value: 100,
      minOrderValue: 0,
      maxDiscount: 150,
      usageCount: 2310,
      usageLimit: null,
      isActive: true,
      description: "Complimentary express doorstep delivery",
      createdAt: "2026-01-01T00:00:00Z"
    },
    {
      id: "dsc_4",
      code: "BAGGY500",
      type: "fixed",
      value: 500,
      minOrderValue: 2999,
      maxDiscount: 500,
      usageCount: 312,
      usageLimit: 1000,
      isActive: true,
      description: "Flat ₹500 off on baggy pants and heavy outerwear bundles",
      createdAt: "2026-03-15T00:00:00Z"
    },
    {
      id: "dsc_5",
      code: "FESTIVE25",
      type: "percentage",
      value: 25,
      minOrderValue: 3999,
      maxDiscount: 1200,
      usageCount: 504,
      usageLimit: 500,
      isActive: false,
      description: "Festival Drop Special 25% Off (Expired)",
      createdAt: "2026-04-01T00:00:00Z"
    }
  ];
  fs.writeFileSync(discountsFile, JSON.stringify(discounts, null, 2));
  console.log('Seeded discounts.json with', discounts.length, 'discounts');
}

// 3. Settings Seed
const settingsFile = path.join(dataDir, 'settings.json');
if (!fs.existsSync(settingsFile)) {
  const settings = {
    storeName: "GENRAGE",
    brandTagline: "STREETWEAR INDIA // DEFINE YOUR IDENTITY",
    currency: "INR",
    currencySymbol: "₹",
    freeShippingThreshold: 999,
    supportEmail: "support@genrage.com",
    supportPhone: "+91 98765 43210",
    supportWhatsApp: "+91 98765 43210",
    instagramHandle: "@genrageclothing",
    announcements: [
      "FREE DOORSTEP DELIVERY IN INDIA 🇮🇳",
      "EXTRA 10% OFF ON PREPAID ORDERS | CODE: RAGE10",
      "LOVED BY 300,000+ CUSTOMERS ACROSS INDIA"
    ],
    flashSale: {
      enabled: true,
      title: "EXCLUSIVE DROP SALE ENDS IN",
      targetDate: "2026-10-31T23:59:59"
    },
    seo: {
      metaTitle: "GENRAGE | Streetwear Clothing Brand India",
      metaDescription: "Shop high quality oversized tshirts, straight fit baggy pants, hoodies, and jackets proudly crafted in India."
    }
  };
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  console.log('Seeded settings.json');
}
