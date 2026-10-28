// 삼성·하이닉스 갭 점수와 알림 규칙. 갭 차트 화면(../index.html의 compute())과 같은 계산입니다.

export interface Bar {
  t: number; // 캔들 시작 시각(ms)
  c: number; // 종가
}

export interface GapPoint {
  t: number;
  z: number; // 갭 점수: 최근 W개 캔들의 log(하이닉스/삼성) 대비 표준점수. +면 하이닉스가 비쌈
  s: number; // 삼성 종가
  h: number; // 하이닉스 종가
}

/** 두 종목 캔들을 같은 시각끼리 맞춘 뒤 마지막 캔들(만들어지는 중인 캔들 포함)의 갭 점수. 캔들이 W개보다 적으면 null. */
export function latestGapZ(sam: Bar[], hyn: Bar[], W: number): GapPoint | null {
  const hc = new Map(hyn.map((b) => [b.t, b.c]));
  const rows = sam.filter((b) => hc.has(b.t)).sort((a, b) => a.t - b.t);
  if (rows.length < W || W < 2) return null;
  const lr = rows.slice(-W).map((b) => Math.log(hc.get(b.t)! / b.c));
  let m = 0;
  for (const v of lr) m += v;
  m /= W;
  let sd = 0;
  for (const v of lr) sd += (v - m) ** 2;
  sd = Math.sqrt(sd / (W - 1));
  const last = rows[rows.length - 1];
  return { t: last.t, s: last.c, h: hc.get(last.t)!, z: sd > 0 ? (lr[W - 1] - m) / sd : 0 };
}

export type Side = "h" | "s" | null; // 마지막으로 알린 쪽: h = 하이닉스 비쌈, s = 삼성 비쌈

/**
 * 갭 점수가 ±E를 넘으면 그쪽을 한 번 알리고, 평소 수준(±X 안)으로 돌아와야 같은 쪽을 다시 알립니다.
 * 기준선 근처에서 오르내릴 때 알림이 쏟아지지 않게 하려는 것입니다. 반대쪽으로 넘어가면 바로 알립니다.
 */
export function nextAlert(side: Side, z: number, E: number, X: number): { side: Side; alert: Side } {
  const x = Math.max(0, Math.min(X, E - 0.5)); // 청산 기준이 진입 기준에 너무 가까우면 매번 다시 알리게 되므로 간격을 둠
  let s = side;
  if (s === "h" && z <= x) s = null;
  if (s === "s" && z >= -x) s = null;
  if (!s) {
    if (z >= E) return { side: "h", alert: "h" };
    if (z <= -E) return { side: "s", alert: "s" };
  }
  return { side: s, alert: null };
}
