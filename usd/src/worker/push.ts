// 휴대폰 푸시(Web Push): RFC 8291 내용 암호화 + RFC 8292 VAPID 서명을 WebCrypto만으로 합니다.
// VAPID 키는 처음 쓸 때 만들어 D1에 저장하므로 따로 설정할 비밀값이 없습니다(모아 앱 lib/push.ts와 같은 방식).

export interface PushRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url?: string; // 서비스 워커 위치 기준 상대 주소
}

const encoder = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (value: string): Bytes =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

// 끝난 결과만 기억합니다. 진행 중인 Promise를 다른 요청과 나누면 첫 요청이 끊길 때 함께 멈출 수 있습니다.
let tablesReady = false;
export async function ensureTables(db: D1Database) {
  if (tablesReady) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS push_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"),
    // cfg: 그 기기 화면의 신호 기준(JSON), side: 마지막으로 알린 쪽(h/s, 없으면 NULL)
    db.prepare(
      "CREATE TABLE IF NOT EXISTS gap_subs (endpoint TEXT PRIMARY KEY NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, cfg TEXT NOT NULL, side TEXT, created TEXT NOT NULL)",
    ),
  ]);
  tablesReady = true;
}

interface VapidKeys {
  publicKey: string;
  privateJwk: JsonWebKey;
}
let vapid: VapidKeys | null = null;
/** 처음 한 번 만들어 D1에 둡니다. 동시에 처음 요청이 와도 먼저 들어간 행 하나로 맞춰집니다. */
export async function vapidKeys(db: D1Database): Promise<VapidKeys> {
  if (vapid) return vapid;
  await ensureTables(db);
  const read = () => db.prepare("SELECT value FROM push_meta WHERE key='vapid'").first<{ value: string }>();
  let row = await read();
  if (!row) {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const value = JSON.stringify({
      publicKey: b64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer),
      privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    });
    await db.prepare("INSERT INTO push_meta (key,value) VALUES ('vapid',?) ON CONFLICT(key) DO NOTHING").bind(value).run();
    row = await read();
  }
  vapid = JSON.parse(row!.value) as VapidKeys;
  return vapid;
}

// 애플은 subject가 https: 또는 mailto: 주소가 아니면 거절합니다.
const SUBJECT = "https://calm6777-png.github.io/pair-gap/";

async function vapidHeader(db: D1Database, endpoint: string) {
  const { publicKey, privateJwk } = await vapidKeys(db);
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT };
  const unsigned = b64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))) + "." + b64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned));
  return `vapid t=${unsigned}.${b64url(signature)}, k=${publicKey}`;
}

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** aes128gcm 내용 부호화(레코드 하나). */
async function encrypt(sub: PushRow, payload: string) {
  const clientPublic = fromB64url(sub.p256dh), authSecret = fromB64url(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const localPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const peer = await crypto.subtle.importKey("raw", clientPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: peer } as SubtleCryptoDeriveKeyAlgorithm, local.privateKey, 256);
  const ikm = await hkdf(authSecret, shared, concat(encoder.encode("WebPush: info\0"), clientPublic, localPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(encoder.encode(payload), new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = localPublic.length;
  return concat(header, localPublic, cipher);
}

/** ok: 보냄, gone: 브라우저가 구독을 버려 지웠음, fail: 일시 실패(다음에 다시 시도). */
export async function sendPush(db: D1Database, sub: PushRow, message: PushMessage): Promise<"ok" | "gone" | "fail"> {
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(db, sub.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "3600", // 한 시간 넘게 못 전한 신호 알림은 의미가 없어 버립니다
        Urgency: "high",
      },
      body: await encrypt(sub, JSON.stringify(message)),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 410) {
      await db.prepare("DELETE FROM gap_subs WHERE endpoint=?").bind(sub.endpoint).run();
      return "gone";
    }
    if (!res.ok) {
      console.error("push failed", res.status, await res.text().catch(() => ""));
      return "fail";
    }
    return "ok";
  } catch (e) {
    console.error("push error", e);
    return "fail";
  }
}

// 알려진 브라우저 푸시 서버로만 보냅니다(아무 주소로나 요청을 보내는 데 쓰이지 않게).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/];
export function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
