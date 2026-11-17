/**
 * ALLEYRICH COD Risk Scoring Engine & Phone Confirmation Hook
 * 
 * Implements:
 * 1. Pincode / City Mismatch Heuristic (Pan-India postal matrix)
 * 2. Junk Address Heuristics (repetitive patterns, keyboard mash, missing plot/door details)
 * 3. Prior RTO History by Customer Phone
 * 4. Order Velocity Tracking (per phone and client IP within sliding window)
 * 5. High Cart Value Thresholds
 * 6. Dual Operating Mode: Shadow (logging only) vs Enforce (fee, limit, confirmation)
 * 7. Phone / WhatsApp Confirmation Hook with auto-cancel support
 */

'use strict';

const crypto = require('crypto');
const whatsapp = require('./whatsapp.js');
const delhivery = require('./delhivery.js');

// 2-digit Indian Postal Circle / State mappings
const PINCODE_REGION_MAP = {
  '11': { state: 'Delhi', cities: ['delhi', 'new delhi'] },
  '12': { state: 'Haryana', cities: ['gurgaon', 'gurugram', 'faridabad', 'rohtak', 'panipat', 'sonipat'] },
  '13': { state: 'Haryana', cities: ['ambala', 'karnal', 'yamunanagar', 'kurukshetra', 'panchkula'] },
  '14': { state: 'Punjab', cities: ['ludhiana', 'jalandhar', 'amritsar', 'patiala', 'bathinda', 'mohali'] },
  '15': { state: 'Punjab', cities: ['bathinda', 'firozpur', 'faridkot', 'fazilka'] },
  '16': { state: 'Chandigarh', cities: ['chandigarh'] },
  '17': { state: 'Himachal Pradesh', cities: ['shimla', 'dharamshala', 'solan', 'mandi', 'kullu'] },
  '18': { state: 'Jammu and Kashmir', cities: ['jammu', 'kathua', 'udhampur', 'samba'] },
  '19': { state: 'Jammu and Kashmir', cities: ['srinagar', 'anantnag', 'baramulla', 'kupwara'] },
  '20': { state: 'Uttar Pradesh', cities: ['noida', 'greater noida', 'ghaziabad', 'aligarh', 'bulandshahr', 'chhibramau'] },
  '21': { state: 'Uttar Pradesh', cities: ['allahabad', 'prayagraj', 'fatehpur', 'pratapgarh', 'kaushambi'] },
  '22': { state: 'Uttar Pradesh', cities: ['lucknow', 'faizabad', 'ayodhya', 'barabanki', 'raebareli'] },
  '23': { state: 'Uttar Pradesh', cities: ['varanasi', 'mirzapur', 'jaunpur', 'ghazipur'] },
  '24': { state: 'Uttar Pradesh', cities: ['bareilly', 'moradabad', 'meerut', 'saharanpur', 'dehradun', 'haridwar'] },
  '25': { state: 'Uttar Pradesh', cities: ['meerut', 'muzaffarnagar', 'shamli'] },
  '26': { state: 'Uttar Pradesh', cities: ['pilibhit', 'lakhimpur', 'kheri', 'nainital', 'haldwani'] },
  '27': { state: 'Uttar Pradesh', cities: ['gorakhpur', 'basti', 'deoria', 'azamgarh'] },
  '28': { state: 'Uttar Pradesh', cities: ['agra', 'mathura', 'firozabad', 'jhansi'] },
  '30': { state: 'Rajasthan', cities: ['jaipur', 'alwar', 'dausa', 'sikar'] },
  '31': { state: 'Rajasthan', cities: ['kota', 'bundi', 'baran', 'jhalawar'] },
  '32': { state: 'Rajasthan', cities: ['bharatpur', 'sawai madhopur', 'dholpur'] },
  '33': { state: 'Rajasthan', cities: ['bikaner', 'sri ganganagar', 'hanumangarh', 'churu'] },
  '34': { state: 'Rajasthan', cities: ['jodhpur', 'barmer', 'jaisalmer', 'pali', 'jalore', 'nagaur'] },
  '36': { state: 'Gujarat', cities: ['rajkot', 'jamnagar', 'junagadh', 'porbandar', 'amreli', 'bhavnagar'] },
  '37': { state: 'Gujarat', cities: ['kutch', 'bhuj', 'gandhidham'] },
  '38': { state: 'Gujarat', cities: ['ahmedabad', 'gandhinagar', 'mehsana', 'sabarkantha'] },
  '39': { state: 'Gujarat', cities: ['surat', 'vadodara', 'bharuch', 'valsad', 'navsari', 'anand'] },
  '40': { state: 'Maharashtra', cities: ['mumbai', 'navi mumbai', 'thane', 'palghar', 'panvel', 'vasai', 'virar', 'goa', 'panaji'] },
  '41': { state: 'Maharashtra', cities: ['pune', 'solapur', 'satara', 'kolhapur', 'sangli', 'ahmednagar'] },
  '42': { state: 'Maharashtra', cities: ['nashik', 'dhule', 'jalgaon', 'nandurbar'] },
  '43': { state: 'Maharashtra', cities: ['aurangabad', 'chhatrapati sambhajinagar', 'nanded', 'parbhani', 'jalna', 'latur'] },
  '44': { state: 'Maharashtra', cities: ['nagpur', 'amravati', 'akola', 'chandrapur', 'wardha', 'yavatmal'] },
  '45': { state: 'Madhya Pradesh', cities: ['indore', 'ujjain', 'dewas', 'dhar', 'khargone'] },
  '46': { state: 'Madhya Pradesh', cities: ['bhopal', 'sehore', 'vidisha', 'raisen', 'hoshangabad'] },
  '47': { state: 'Madhya Pradesh', cities: ['gwalior', 'morena', 'bhind', 'shivpuri', 'guna'] },
  '48': { state: 'Madhya Pradesh', cities: ['jabalpur', 'rewa', 'satna', 'katni', 'sagar', 'chhindwara'] },
  '49': { state: 'Chhattisgarh', cities: ['raipur', 'bilaspur', 'durg', 'bhilai', 'korba', 'rajnandgaon'] },
  '50': { state: 'Telangana', cities: ['hyderabad', 'secunderabad', 'rangareddy', 'medchal', 'warangal', 'karimnagar'] },
  '51': { state: 'Andhra Pradesh', cities: ['tirupati', 'chittoor', 'kadapa', 'kurnool', 'anantapur'] },
  '52': { state: 'Andhra Pradesh', cities: ['vijayawada', 'guntur', 'krishna', 'prakasam', 'nellore'] },
  '53': { state: 'Andhra Pradesh', cities: ['visakhapatnam', 'vizag', 'vizianagaram', 'srikakulam', 'kakinada', 'rajahmundry'] },
  '56': { state: 'Karnataka', cities: ['bangalore', 'bengaluru', 'kolar', 'tumkur'] },
  '57': { state: 'Karnataka', cities: ['mysore', 'mysuru', 'mandya', 'hassan', 'shimoga', 'mangalore', 'mangaluru', 'udupi'] },
  '58': { state: 'Karnataka', cities: ['hubli', 'dharwad', 'belgaum', 'belagavi', 'bellary', 'ballari', 'davangere'] },
  '59': { state: 'Karnataka', cities: ['gulbarga', 'kalaburagi', 'bidar', 'raichur'] },
  '60': { state: 'Tamil Nadu', cities: ['chennai', 'kanchipuram', 'tiruvallur', 'chengalpattu'] },
  '61': { state: 'Tamil Nadu', cities: ['thanjavur', 'nagapattinam', 'tiruvarur'] },
  '62': { state: 'Tamil Nadu', cities: ['madurai', 'dindigul', 'theni', 'virudhunagar', 'tirunelveli'] },
  '63': { state: 'Tamil Nadu', cities: ['salem', 'dharmapuri', 'krishnagiri', 'vellore', 'tiruvannamalai'] },
  '64': { state: 'Tamil Nadu', cities: ['coimbatore', 'tiruppur', 'erode', 'nilgiris', 'ooty'] },
  '67': { state: 'Kerala', cities: ['kozhikode', 'calicut', 'kannur', 'malappuram', 'wayanad', 'kasaragod'] },
  '68': { state: 'Kerala', cities: ['kochi', 'cochin', 'ernakulam', 'thrissur', 'palakkad', 'lakshadweep'] },
  '69': { state: 'Kerala', cities: ['thiruvananthapuram', 'trivandrum', 'kollam', 'alappuzha', 'kottayam', 'pathanamthitta'] },
  '70': { state: 'West Bengal', cities: ['kolkata', 'howrah', 'north 24 parganas', 'south 24 parganas', 'hooghly'] },
  '71': { state: 'West Bengal', cities: ['bardhaman', 'burdwan', 'durgapur', 'asansol', 'birbhum'] },
  '72': { state: 'West Bengal', cities: ['medinipur', 'midnapore', 'kharagpur', 'purulia', 'bankura'] },
  '73': { state: 'West Bengal', cities: ['siliguri', 'jalpaiguri', 'darjeeling', 'cooch behar'] },
  '74': { state: 'West Bengal', cities: ['nadia', 'murshidabad', 'malda'] },
  '75': { state: 'Odisha', cities: ['bhubaneswar', 'puri', 'cuttack', 'khordha', 'balasore'] },
  '76': { state: 'Odisha', cities: ['sambalpur', 'rourkela', 'sundergarh', 'berhampur'] },
  '77': { state: 'Odisha', cities: ['koraput', 'rayagada', 'kalahandi'] },
  '78': { state: 'Assam', cities: ['guwahati', 'kamrup', 'silchar', 'dibrugarh', 'jorhat', 'tezpur', 'nagaon'] },
  '79': { state: 'North East', cities: ['shillong', 'agartala', 'imphal', 'aizawl', 'kohima', 'itanagar', 'gangtok'] },
  '80': { state: 'Bihar', cities: ['patna', 'gaya', 'jehanabad', 'nalanda', 'bihar sharif', 'nawada'] },
  '81': { state: 'Bihar', cities: ['bhagalpur', 'munger', 'banka', 'jamui'] },
  '82': { state: 'Bihar', cities: ['ranchi', 'hazaribagh', 'bokaro', 'dhanbad', 'giridih'] },
  '83': { state: 'Jharkhand', cities: ['jamshedpur', 'chaibasa', 'singhbhum'] },
  '84': { state: 'Bihar', cities: ['muzaffarpur', 'darbhanga', 'samastipur', 'vaishali', 'motihari', 'chapra'] },
  '85': { state: 'Bihar', cities: ['purnia', 'katihar', 'saharsa', 'madhepura', 'kishanganj'] }
};

/**
 * Checks for address junk/gibberish patterns.
 */
function evaluateJunkAddress(address) {
  if (!address || typeof address !== 'string') {
    return { isJunk: true, reason: 'Address is missing or empty' };
  }

  const clean = address.trim();

  // 1. Length heuristic (< 10 chars is typically incomplete for Indian postal delivery)
  if (clean.length < 10) {
    return { isJunk: true, reason: 'Address too short (< 10 characters)' };
  }

  // 2. Repetitive characters: 5 or more identical consecutive characters
  if (/([a-zA-Z0-9])\1{4,}/i.test(clean)) {
    return { isJunk: true, reason: 'Repetitive character sequence detected' };
  }

  // 3. Known keyboard-mash or test tokens
  const lower = clean.toLowerCase();
  const testPhrases = [
    'test test', 'asdf', 'qwerty', 'zxcv', 'dummy', 'fake address', 'sample address',
    'xxxx', 'yyyy', 'zzzz', '12345678', 'testing only', 'somewhere in india', 'near house'
  ];
  for (const phrase of testPhrases) {
    if (lower.includes(phrase)) {
      return { isJunk: true, reason: `Contains dummy/test token '${phrase}'` };
    }
  }

  // 4. Repeated word patterns (e.g. "near near near near")
  const words = lower.split(/[\s,.-]+/).filter(Boolean);
  const wordCounts = {};
  for (const w of words) {
    if (w.length > 2) {
      wordCounts[w] = (wordCounts[w] || 0) + 1;
      if (wordCounts[w] >= 4) {
        return { isJunk: true, reason: `Word '${w}' repeated excessively (${wordCounts[w]} times)` };
      }
    }
  }

  // 5. Total lack of numbers / street / plot details in a very generic sentence
  const hasDigit = /\d/.test(clean);
  const hasPremiseKeyword = /(flat|house|plot|floor|room|bldg|building|tower|apt|apartment|sector|phase|block|street|road|nagar|colony|lane|enclave|heights)/i.test(clean);
  if (!hasDigit && !hasPremiseKeyword && words.length < 4) {
    return { isJunk: true, reason: 'Missing door/plot number or premise landmark' };
  }

  return { isJunk: false };
}

/**
 * Detects obvious mismatch between entered pincode and city/state.
 */
function evaluatePincodeCityMismatch(pincode, city, state = '') {
  if (!pincode || String(pincode).length < 2) {
    return { mismatch: false };
  }

  const prefix = String(pincode).trim().substring(0, 2);
  const region = PINCODE_REGION_MAP[prefix];
  if (!region) return { mismatch: false };

  const normCity = String(city || '').toLowerCase().trim();
  const normState = String(state || '').toLowerCase().trim();

  // If no city provided, cannot determine mismatch
  if (!normCity) return { mismatch: false };

  // Check if normalized city or state matches known mapping
  const cityMatch = region.cities.some(c => normCity.includes(c) || c.includes(normCity));
  const stateMatch = normState && (normState.includes(region.state.toLowerCase()) || region.state.toLowerCase().includes(normState));

  // If neither city nor state matches the pincode region, check if city belongs to a DIFFERENT prominent region
  if (!cityMatch && !stateMatch) {
    for (const [otherPrefix, otherRegion] of Object.entries(PINCODE_REGION_MAP)) {
      if (otherPrefix !== prefix && otherRegion.cities.some(c => normCity === c)) {
        return {
          mismatch: true,
          expectedRegion: region.state,
          actualCity: city,
          conflictWithRegion: otherRegion.state,
          reason: `Pincode ${pincode} (${region.state}) conflicts with entered city '${city}' (${otherRegion.state})`
        };
      }
    }
  }

  return { mismatch: false };
}

/**
 * Evaluates prior RTO records for customer phone number.
 */
function evaluatePriorRto(phone, pastOrders = []) {
  if (!phone || !Array.isArray(pastOrders) || pastOrders.length === 0) {
    return { rtoCount: 0, rtoOrders: [] };
  }

  const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
  if (!cleanPhone) return { rtoCount: 0, rtoOrders: [] };

  const rtoOrders = [];
  for (const o of pastOrders) {
    const oPhone = String(o.customer?.phone || o.phone || '').replace(/\D/g, '').slice(-10);
    if (oPhone === cleanPhone) {
      const status = String(o.orderStatus || o.fulfillment_status || o.fulfillmentStatus || '').toLowerCase();
      const payStatus = String(o.paymentStatus || o.payment_status || '').toLowerCase();
      if (status.includes('rto') || status.includes('return') || status.includes('undelivered') || payStatus.includes('rto')) {
        rtoOrders.push(o.id);
      }
    }
  }

  return {
    rtoCount: rtoOrders.length,
    rtoOrders
  };
}

/**
 * Evaluates order velocity within sliding window (default 30 mins).
 */
function evaluateOrderVelocity(phone, ip, pastOrders = [], windowMinutes = 30) {
  if (!Array.isArray(pastOrders) || pastOrders.length === 0) {
    return { velocityCount: 0 };
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  let count = 0;

  for (const o of pastOrders) {
    const createdTime = new Date(o.createdAt || o.created_at || 0).getTime();
    if (now - createdTime <= windowMs) {
      const oPhone = String(o.customer?.phone || o.phone || '').replace(/\D/g, '').slice(-10);
      const oIp = String(o.ipAddress || o.ip || '');
      if ((cleanPhone && oPhone === cleanPhone) || (ip && oIp === ip)) {
        count++;
      }
    }
  }

  return { velocityCount: count };
}

/**
 * Master COD Risk Evaluator
 *
 * @param {object} params
 * @param {object} params.customer - { name, phone, email, address, city, state, pincode }
 * @param {number} [params.total=0] - Cart total in INR
 * @param {number} [params.totalPaise=0] - Cart total in integer paise
 * @param {string} [params.ip=''] - Client IP address
 * @param {Array} [params.pastOrders=[]] - Historical orders list for RTO & velocity evaluation
 * @returns {object} Comprehensive Risk Assessment
 */
function evaluateCodRisk({
  customer = {},
  total = 0,
  totalPaise = 0,
  ip = '',
  pastOrders = []
} = {}) {
  let score = 0;
  const reasons = [];
  const details = {};

  const cartTotalINR = total || (totalPaise ? totalPaise / 100 : 0);

  // 1. Pincode / City Mismatch Heuristic
  const mismatchCheck = evaluatePincodeCityMismatch(customer.pincode, customer.city, customer.state);
  if (mismatchCheck.mismatch) {
    score += 35;
    reasons.push('PINCODE_CITY_MISMATCH');
    details.pincodeMismatch = mismatchCheck.reason;
  }

  // 2. Junk Address Heuristic
  const junkCheck = evaluateJunkAddress(customer.address);
  if (junkCheck.isJunk) {
    score += 35;
    reasons.push('JUNK_ADDRESS_DETECTED');
    details.junkAddress = junkCheck.reason;
  }

  // 3. Prior RTO by Phone
  const rtoCheck = evaluatePriorRto(customer.phone, pastOrders);
  if (rtoCheck.rtoCount > 0) {
    const rtoScore = Math.min(60, rtoCheck.rtoCount * 40);
    score += rtoScore;
    reasons.push('PRIOR_RTO_HISTORY');
    details.rtoOrdersCount = rtoCheck.rtoCount;
    details.rtoOrders = rtoCheck.rtoOrders;
  }

  // 4. Order Velocity
  const velocityCheck = evaluateOrderVelocity(customer.phone, ip, pastOrders, 30);
  if (velocityCheck.velocityCount >= 4) {
    score += 40;
    reasons.push('HIGH_ORDER_VELOCITY');
    details.recentOrderCount = velocityCheck.velocityCount;
  } else if (velocityCheck.velocityCount >= 2) {
    score += 25;
    reasons.push('MODERATE_ORDER_VELOCITY');
    details.recentOrderCount = velocityCheck.velocityCount;
  }

  // 5. Cart Value Threshold
  const highValueThreshold = Number(process.env.HIGH_COD_THRESHOLD_INR || 6000);
  const criticalValueThreshold = Number(process.env.CRITICAL_COD_THRESHOLD_INR || 10000);

  if (cartTotalINR >= criticalValueThreshold) {
    score += 30;
    reasons.push('CRITICAL_CART_VALUE');
    details.cartValueINR = cartTotalINR;
  } else if (cartTotalINR >= highValueThreshold) {
    score += 15;
    reasons.push('HIGH_CART_VALUE');
    details.cartValueINR = cartTotalINR;
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Risk Tiers
  let tier = 'LOW';
  if (score >= 60) tier = 'HIGH';
  else if (score >= 30) tier = 'MEDIUM';

  // Action Recommendation
  let action = 'ALLOW';
  if (score >= 70) {
    action = 'REQUIRE_CONFIRMATION';
  } else if (score >= 35) {
    action = 'ADD_COD_FEE';
  }

  // Check enforce mode
  const mode = String(process.env.COD_RISK_MODE || 'shadow').toLowerCase() === 'enforce' ? 'enforce' : 'shadow';
  const isEnforce = mode === 'enforce';

  let appliedFeePaise = 0;
  if (isEnforce && action === 'ADD_COD_FEE') {
    appliedFeePaise = Number(process.env.COD_RISK_SURCHARGE_PAISE || 9900); // Default ₹99
  }

  return {
    score,
    tier,
    reasons,
    action,
    mode,
    isEnforce,
    appliedFeePaise,
    details
  };
}

/**
 * Generates a 6-digit confirmation OTP & cryptographically secure hash.
 */
function generateConfirmationToken() {
  const code = String(Math.floor(100000 + crypto.randomInt(900000)));
  const token = crypto.randomBytes(24).toString('base64url');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return {
    code,
    token,
    codeHash,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 60 min default expiry
  };
}

/**
 * Dispatches a phone / WhatsApp order confirmation request (Stub / WhatsApp)
 */
async function dispatchPhoneConfirmation({ orderId, phone, code, token, customerName = '' }) {
  const normPhone = whatsapp.normalizeIndianPhoneNumber(phone);
  console.log(`[COD CONFIRMATION HOOK] Dispatching verification code ${code} for order ${orderId} to phone +${normPhone || phone}`);

  // In production with Meta WhatsApp configured, this would dispatch interactive WhatsApp template
  return {
    dispatched: true,
    channel: 'whatsapp_or_sms_stub',
    phone: normPhone || phone,
    orderId,
    code
  };
}

module.exports = {
  PINCODE_REGION_MAP,
  evaluateJunkAddress,
  evaluatePincodeCityMismatch,
  evaluatePriorRto,
  evaluateOrderVelocity,
  evaluateCodRisk,
  generateConfirmationToken,
  dispatchPhoneConfirmation
};
