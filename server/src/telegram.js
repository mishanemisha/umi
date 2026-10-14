// Проверка Telegram.WebApp.initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
// secret = HMAC_SHA256(key="WebAppData", bot_token); hash = hex(HMAC_SHA256(key=secret, data_check_string)).
// initDataUnsafe на клиенте не доказывает личность — доверяем только подписи, проверенной здесь.
const enc = new TextEncoder();
const hmac = async (key, data) => {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
};
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

// → { id, auth_date } или null; maxAge — сколько секунд подпись считается свежей
export async function verifyInitData(initData, botToken, { maxAge = 86400, now = Date.now() / 1000 } = {}) {
  if (!initData || !botToken) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  p.delete('hash');
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', botToken);
  const want = hex(await hmac(secret, check));
  // сравнение без раннего выхода
  let diff = want.length ^ hash.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff) return null;
  const authDate = Number(p.get('auth_date'));
  if (!authDate || now - authDate > maxAge) return null;
  let user = null;
  try { user = JSON.parse(p.get('user') || 'null'); } catch { return null; }
  if (!user || !user.id) return null;
  return { id: String(user.id), auth_date: authDate };
}

// для тестов: подписать initData так же, как это делает Telegram
export async function signInitData(fields, botToken) {
  const p = new URLSearchParams(fields);
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', hex(await hmac(await hmac('WebAppData', botToken), check)));
  return p.toString();
}
