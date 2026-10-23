/**
 * ALLEYRICH Delhivery Express B2C Logistics Adapter
 * Direct integration with Delhivery Express Production API.
 * 
 * Account: SD Garments
 * Warehouse: SD Garments (PIN: 209721, Chhibramau, UP)
 * API Token: 5b89b0734b0d4daa1655ea178e432c33f1964d80
 */

const DELHIVERY_PROD_URL = 'https://track.delhivery.com';
const DELHIVERY_STAGE_URL = 'https://staging-express.delhivery.com';

function getConfig() {
  const env = (process.env.DELHIVERY_ENV || 'production').toLowerCase();
  const baseUrl = env === 'staging' ? DELHIVERY_STAGE_URL : DELHIVERY_PROD_URL;
  const token = process.env.DELHIVERY_API_TOKEN || '5b89b0734b0d4daa1655ea178e432c33f1964d80';
  const warehouse = process.env.DELHIVERY_WAREHOUSE_NAME || 'SD Garments';
  const warehousePin = process.env.DELHIVERY_WAREHOUSE_PINCODE || '209721';
  const clientName = process.env.DELHIVERY_CLIENT_NAME || 'SD Garments';

  return {
    baseUrl,
    token,
    warehouse,
    warehousePin,
    clientName,
    isConfigured: Boolean(token && token.length > 10)
  };
}

/**
 * Checks pincode delivery and COD serviceability across Pan-India
 * @param {string|number} pincode 6-digit Indian PIN code
 */
async function checkPincodeServiceability(pincode) {
  const config = getConfig();
  if (!config.isConfigured || !pincode) {
    return { serviceable: true, cod: true, pre_paid: true, city: '', state: '' };
  }

  const cleanPin = String(pincode).trim().replace(/\D/g, '');
  if (cleanPin.length !== 6) {
    return { serviceable: false, message: 'Invalid 6-digit Indian PIN code' };
  }

  try {
    const url = `${config.baseUrl}/c/api/pin-codes/json/?filter_codes=${cleanPin}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${config.token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`Delhivery pincode check returned HTTP ${res.status}`);
      return { serviceable: true, cod: true, pre_paid: true }; // graceful fallback
    }

    const data = await res.json();
    const codes = data.delivery_codes || [];
    if (!codes.length) {
      return { serviceable: false, cod: false, pre_paid: false, message: `Pincode ${cleanPin} is not currently serviceable by Delhivery` };
    }

    const postal = codes[0].postal_code || {};
    return {
      serviceable: true,
      pin: cleanPin,
      cod: postal.cod === 'Y',
      pre_paid: postal.pre_paid === 'Y',
      pickup: postal.pickup === 'Y',
      city: postal.city || '',
      district: postal.district || '',
      state: postal.state_code || ''
    };
  } catch (err) {
    console.error('Delhivery checkPincodeServiceability error:', err.message);
    return { serviceable: true, cod: true, pre_paid: true };
  }
}

/**
 * Creates and manifests a live shipment order on Delhivery Express (cmu/create.json)
 * Automatically allocates a genuine Delhivery AWB tracking waybill.
 * @param {object} order Order details from database/storefront
 */
async function createShipment(order) {
  const config = getConfig();
  if (!config.isConfigured) {
    throw new Error('Delhivery API token is not configured');
  }

  const customer = order.customer || {};
  const cleanPhone = String(customer.phone || '').replace(/\D/g, '').slice(-10);
  const cleanPin = String(customer.pincode || '').replace(/\D/g, '').slice(0, 6);

  if (!cleanPin || cleanPin.length !== 6) {
    throw new Error('Valid 6-digit shipping destination PIN code is required for Delhivery dispatch');
  }

  const paymentMode = String(order.paymentMethod || '').toLowerCase().includes('cod') ? 'COD' : 'Prepaid';
  const totalAmount = Number(order.total || 0);
  const codAmount = paymentMode === 'COD' ? totalAmount : 0;

  const itemsDesc = (order.items || [])
    .map(i => `${i.title || 'Apparel'} (${i.size || 'M'}) x${i.quantity || 1}`)
    .join(', ')
    .slice(0, 240) || 'ALLEYRICH Luxury Streetwear';

  const totalQty = (order.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0) || 1;
  const estWeightGrams = Math.max(450, totalQty * 450);

  const shipmentPayload = {
    shipments: [
      {
        name: customer.name || 'Valued Client',
        add: `${customer.address || ''} ${customer.locality || ''}`.trim() || 'Address On File',
        pin: cleanPin,
        city: customer.city || 'Destination City',
        state: customer.state || 'State',
        country: customer.country || 'India',
        phone: cleanPhone || '9876543210',
        order: String(order.id),
        payment_mode: paymentMode,
        total_amount: totalAmount,
        cod_amount: codAmount,
        products_desc: itemsDesc,
        quantity: totalQty,
        weight: estWeightGrams,
        order_date: new Date(order.createdAt || Date.now()).toISOString(),
        seller_name: 'SD Garments (ALLEYRICH)',
        seller_add: '1 SD Garments, nagar palika road, chhibramau',
        hsn_code: '61091000'
      }
    ],
    pickup_location: {
      name: config.warehouse
    }
  };

  const bodyString = `format=json&data=${encodeURIComponent(JSON.stringify(shipmentPayload))}`;

  const res = await fetch(`${config.baseUrl}/api/cmu/create.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${config.token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: bodyString
  });

  const responseText = await res.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Delhivery raw API error (HTTP ${res.status}): ${responseText}`);
  }

  if (!res.ok || (data && data.success === false)) {
    const errorMsg = (data.packages && data.packages[0] && data.packages[0].remarks) 
      ? data.packages[0].remarks.join(', ') 
      : (data.rmk || data.message || responseText);
    throw new Error(`Delhivery Shipment Creation Failed: ${errorMsg}`);
  }

  // Extract waybill from packages array
  const pkg = (data.packages && data.packages[0]) || {};
  const waybill = pkg.waybill || data.upload_wbn;

  if (!waybill) {
    throw new Error('Delhivery response did not include a waybill tracking number');
  }

  return {
    success: true,
    waybill: String(waybill),
    trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
    packingSlipUrl: `/api/admin/orders/${order.id || waybill}/shipping-label`,
    status: pkg.status || 'Manifested',
    paymentMode,
    codAmount,
    totalAmount,
    client: pkg.client || config.clientName,
    raw: data
  };
}

/**
 * Retrieves real-time live package tracking scans from Delhivery API
 * @param {string} waybill Delhivery AWB Tracking Number
 */
async function trackShipment(waybill) {
  const config = getConfig();
  if (!config.isConfigured || !waybill) {
    return null;
  }

  try {
    const cleanWaybill = String(waybill).trim();
    const url = `${config.baseUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(cleanWaybill)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${config.token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const pkgData = data.ShipmentData && data.ShipmentData[0] ? data.ShipmentData[0].Shipment : null;
    if (!pkgData) return null;

    return {
      success: true,
      waybill: cleanWaybill,
      status: pkgData.Status?.Status || 'In Transit',
      statusType: pkgData.Status?.StatusType || '',
      statusDateTime: pkgData.Status?.StatusDateTime || '',
      origin: pkgData.Origin || 'Chhibramau, UP',
      destination: pkgData.Destination || '',
      expectedDeliveryDate: pkgData.ExpectedDeliveryDate || null,
      scans: (pkgData.Scans || []).map(s => ({
        scanDetail: s.ScanDetail?.Scan || '',
        scanDateTime: s.ScanDetail?.ScanDateTime || '',
        scannedLocation: s.ScanDetail?.ScannedLocation || '',
        instructions: s.ScanDetail?.Instructions || ''
      }))
    };
  } catch (err) {
    console.error('Delhivery trackShipment error:', err.message);
    return null;
  }
}

/**
 * Calls Delhivery authenticated packing slip API and extracts the pre-signed S3 PDF download link.
 * @param {string} waybill Delhivery AWB Tracking Number
 * @returns {Promise<string|null>} Pre-signed S3 PDF download URL or null if packages_found == 0
 */
async function getPackingSlipPdfUrl(waybill) {
  const config = getConfig();
  if (!config.isConfigured || !waybill) {
    throw new Error('Delhivery is not configured or waybill is missing');
  }

  const cleanWaybill = String(waybill).trim();
  const url = `${config.baseUrl}/api/p/packing_slip?wbns=${encodeURIComponent(cleanWaybill)}&pdf=true`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Token ${config.token}`,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Delhivery Packing Slip API error (HTTP ${res.status}): ${errText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (data) {
      if (Array.isArray(data.packages) && data.packages.length > 0) {
        const link = data.packages[0].pdf_download_link || data.packages[0].pdf_url;
        if (link) return link;
      } else if (data.packages && typeof data.packages === 'object' && !Array.isArray(data.packages)) {
        const link = data.packages.pdf_download_link || data.packages.pdf_url;
        if (link) return link;
      }
      if (data.pdf_download_link) return data.pdf_download_link;
      // If no packages found in Delhivery live cloud (simulated or non-existent waybill)
      if (data.packages_found === 0) {
        return null;
      }
    }
  }

  return url;
}

/**
 * Cancels a manifested Delhivery courier shipment prior to physical courier pickup
 * @param {string} waybill Delhivery AWB Tracking Number
 */
async function cancelShipment(waybill) {
  const config = getConfig();
  if (!config.isConfigured || !waybill) {
    throw new Error('Delhivery is not configured or waybill is missing');
  }

  const cleanWaybill = String(waybill).trim();
  const url = `${config.baseUrl}/api/p/edit`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${config.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      waybill: cleanWaybill,
      cancellation: 'true'
    })
  });

  const responseText = await res.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    const isSuccess = responseText.toLowerCase().includes('success');
    return {
      success: isSuccess,
      status: isSuccess ? 'Success' : 'Failure',
      message: isSuccess ? 'Delhivery shipment cancelled successfully' : responseText,
      raw: responseText
    };
  }

  const isSuccess = data.status === 'Success' || data.success === true || (data.status !== 'Failure' && res.ok);

  return {
    success: isSuccess,
    status: data.status || (isSuccess ? 'Success' : 'Failure'),
    message: data.message || data.error || (isSuccess ? 'Delhivery shipment cancelled successfully' : 'Cancellation failed'),
    raw: data
  };
}

/**
 * Returns a proxy URL or direct URL for packing slip PDF
 * @param {string} waybill Delhivery AWB Tracking Number
 * @param {string} [orderId] Internal Order ID
 */
function getPackingSlipUrl(waybill, orderId) {
  if (orderId) {
    return `/api/admin/orders/${orderId}/shipping-label`;
  }
  return `/api/admin/orders/awb-${encodeURIComponent(waybill)}/shipping-label`;
}

module.exports = {
  getConfig,
  checkPincodeServiceability,
  createShipment,
  trackShipment,
  getPackingSlipUrl,
  getPackingSlipPdfUrl,
  cancelShipment
};

