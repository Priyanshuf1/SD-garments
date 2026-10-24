const crypto = require('crypto');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let base32 = '';
  for (let i = 0; i < bytes.length; i++) {
    base32 += BASE32_CHARS[bytes[i] % 32];
  }
  return base32;
}

function base32Decode(base32) {
  let bits = '';
  const clean = String(base32).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret, time = Date.now()) {
  const key = base32Decode(secret);
  const epoch = Math.floor(time / 1000);
  const counter = Math.floor(epoch / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, '0');
}

function verifyTotp(secret, token, window = 1) {
  if (!secret || !token) return false;
  const cleanToken = String(token).trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;

  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const expected = generateTotp(secret, now + (i * 30000));
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

function getOtpAuthUrl(label, secret, issuer = 'ALLYRICH') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Quick self-test
const secret = 'JBSWY3DPEHPK3PXP';
const code = generateTotp(secret);
console.log('TOTP Self-Test Generated Code:', code);
console.log('TOTP Verify Passed:', verifyTotp(secret, code));
console.log('TOTP Reject Wrong Code:', verifyTotp(secret, '123456') === false);

module.exports = {
  generateBase32Secret,
  generateTotp,
  verifyTotp,
  getOtpAuthUrl
};
