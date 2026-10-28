// 삼성·하이닉스 1시간봉 갭 신호 알림. 5분마다(wrangler.jsonc의 crons) 하이퍼리퀴드 캔들로 갭 점수를 계산해,
// 구독한 기기마다 그 기기 화면의 진입 기준을 넘으면 푸시를 보냅니다.
import { latestGapZ, nextAlert, type Bar, type GapPoint, type Side } from "../lib/gap.ts";
import { ensureTables, sendPush, validEndpoint, type PushMessage } from "./push.ts";

export interface AlertCfg {
  W: number; // 평소 기준 길이(캔들 수)
  E: number; // 진입 기준 ±
  X: number; // 청산 기준 ± (여기 안으로 돌아오면 다시 알릴 수 있음)
  S: number; // 손절 기준 ±
  coinS: string;
  coinH: string;
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const coin = (v: unknown) => (typeof v === "string" && /^[\w:.-]{1,40}$/.test(v) ? v : null);

/** 화면에서 보낸 기준을 화면 입력 칸과 같은 범위로 확인합니다. */
export function parseCfg(v: unknown): AlertCfg | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const W = num(o.W, 20, 1000), E = num(o.E, 0.5, 4), X = num(o.X, 0, 3), S = num(o.S, 1, 99), coinS = coin(o.coinS), coinH = coin(o.coinH);
  if (W == null || E == null || X == null || S == null || !coinS || !coinH) return null;
  return { W: Math.round(W), E, X, S, coinS, coinH };
}

async function candles(name: string, hours: number): Promise<Bar[]> {
  const end = Date.now();
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: name, interval: "1h", startTime: end - hours * 3600e3, endTime: end } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
  const data = (await res.json()) as { t: number; c: string }[];
  if (!Array.isArray(data) || !data.length) throw new Error(`${name} 캔들 없음`);
  return data.map((k) => ({ t: k.t, c: +k.c }));
}

/** 지금(만들어지는 중인 1시간봉 포함) 갭 점수. 화면에서 1시간을 골랐을 때 보이는 값과 같습니다. */
export async function gapNow(cfg: AlertCfg): Promise<GapPoint | null> {
  const hours = cfg.W + 24; // 빠진 캔들이 있어도 W개를 채우도록 여유
  const [s, h] = await Promise.all([candles(cfg.coinS, hours), candles(cfg.coinH, hours)]);
  return latestGapZ(s, h, cfg.W);
}

const sign = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
const usd = (v: number) => "$" + (v >= 100 ? v.toFixed(2) : v.toFixed(3));

export function signalMessage(side: "h" | "s", p: GapPoint, cfg: AlertCfg): PushMessage {
  const who = side === "h" ? "하이닉스가" : "삼성이";
  const extreme = Math.abs(p.z) >= cfg.S;
  const trade = side === "h" ? "SKHX 숏 · SMSN 롱" : "SMSN 숏 · SKHX 롱";
  return {
    title: `${who} ${extreme ? "비정상적으로" : "평소보다"} 비쌈 · 1시간봉`,
    body: `갭 점수 ${sign(p.z)} (기준 ±${cfg.E}) · ${extreme ? `손절 기준 ±${cfg.S}도 넘음` : trade}\n삼성 ${usd(p.s)} · 하이닉스 ${usd(p.h)}`,
    tag: "gap-signal",
    url: "./?iv=1h",
  };
}

export function testMessage(p: GapPoint | null, cfg: AlertCfg): PushMessage {
  return {
    title: "갭 알림이 켜져 있어요",
    body: p
      ? `지금 1시간봉 갭 점수 ${sign(p.z)}. ±${cfg.E}를 넘으면 이렇게 알려 드려요.`
      : `지금 시세를 받지 못했지만 알림 경로는 정상입니다. ±${cfg.E}를 넘으면 알려 드려요.`,
    tag: "gap-test",
    url: "./?iv=1h",
  };
}

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
  cfg: string;
  side: Side;
}

const MAX_SUBS = 20;

export async function subscribe(db: D1Database, sub: unknown, cfgIn: unknown): Promise<string | null> {
  const s = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const cfg = parseCfg(cfgIn);
  const p256dh = s?.keys?.p256dh, auth = s?.keys?.auth;
  if (!s || !validEndpoint(s.endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100)
    return "알림 구독 정보가 올바르지 않습니다.";
  if (!cfg) return "신호 기준 값이 올바르지 않습니다.";
  await ensureTables(db);
  const known = await db.prepare("SELECT 1 FROM gap_subs WHERE endpoint=?").bind(s.endpoint).first();
  if (!known) {
    const count = await db.prepare("SELECT COUNT(*) AS n FROM gap_subs").first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_SUBS) return "알림을 켠 기기가 너무 많습니다.";
  }
  await db
    .prepare(
      "INSERT INTO gap_subs (endpoint,p256dh,auth,cfg,side,created) VALUES (?,?,?,?,NULL,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, cfg=excluded.cfg",
    )
    .bind(s.endpoint, p256dh, auth, JSON.stringify(cfg), new Date().toISOString())
    .run();
  return null;
}

export async function unsubscribe(db: D1Database, endpoint: unknown) {
  if (!validEndpoint(endpoint)) return;
  await ensureTables(db);
  await db.prepare("DELETE FROM gap_subs WHERE endpoint=?").bind(endpoint).run();
}

export async function sendTest(db: D1Database, endpoint: unknown): Promise<string | null> {
  if (!validEndpoint(endpoint)) return "알림 구독 정보가 올바르지 않습니다.";
  await ensureTables(db);
  const row = await db.prepare("SELECT endpoint,p256dh,auth,cfg,side FROM gap_subs WHERE endpoint=?").bind(endpoint).first<Row>();
  const cfg = row && parseCfg(JSON.parse(row.cfg));
  if (!row || !cfg) return "이 기기의 알림 구독을 찾지 못했습니다. 알림을 껐다가 다시 켜 주세요.";
  const p = await gapNow(cfg).catch(() => null);
  const result = await sendPush(db, row, testMessage(p, cfg));
  return result === "ok" ? null : result === "gone" ? "브라우저가 알림 구독을 해지했습니다. 다시 켜 주세요." : "푸시 서버가 받지 않았습니다. 잠시 뒤 다시 해 보세요.";
}

/** 크론마다 실행. 같은 종목·기준 길이를 쓰는 기기끼리는 캔들을 한 번만 받습니다. */
export async function checkGapAlerts(db: D1Database) {
  await ensureTables(db);
  const { results } = await db.prepare("SELECT endpoint,p256dh,auth,cfg,side FROM gap_subs").all<Row>();
  const points = new Map<string, Promise<GapPoint | null>>();
  let sent = 0;
  for (const row of results) {
    const cfg = parseCfg(JSON.parse(row.cfg));
    if (!cfg) continue;
    const key = `${cfg.coinS}|${cfg.coinH}|${cfg.W}`;
    if (!points.has(key)) points.set(key, gapNow(cfg).catch((e) => (console.error("gap", key, e), null)));
    const p = await points.get(key)!;
    // 거래가 멈춰 캔들이 오래됐으면 판단하지 않습니다.
    if (!p || Date.now() - p.t > 3 * 3600e3) continue;
    const next = nextAlert(row.side, p.z, cfg.E, cfg.X);
    if (next.alert) {
      const result = await sendPush(db, row, signalMessage(next.alert, p, cfg));
      if (result === "gone") continue;
      if (result === "fail") continue; // 다음 확인 때 다시 보냄
      sent++;
    }
    if (next.side !== row.side) await db.prepare("UPDATE gap_subs SET side=? WHERE endpoint=?").bind(next.side, row.endpoint).run();
  }
  return { devices: results.length, sent };
}
