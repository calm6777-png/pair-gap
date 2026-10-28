import { test } from "node:test";
import assert from "node:assert/strict";
import { latestGapZ, nextAlert, type Bar, type Side } from "../src/lib/gap.ts";

const H = 3600e3;
const bars = (closes: number[], start = 0): Bar[] => closes.map((c, i) => ({ t: start + i * H, c }));

test("갭 점수는 화면과 같이 마지막 W개 log(하이닉스/삼성)의 표준점수", () => {
  const sam = bars([100, 101, 99, 100, 102, 100]);
  const hyn = bars([500, 503, 497, 501, 512, 520]);
  const W = 5;
  const lr = sam.slice(-W).map((b, i) => Math.log(hyn.slice(-W)[i].c / b.c));
  const m = lr.reduce((a, b) => a + b) / W;
  const sd = Math.sqrt(lr.reduce((a, v) => a + (v - m) ** 2, 0) / (W - 1));
  const p = latestGapZ(sam, hyn, W)!;
  assert.ok(Math.abs(p.z - (lr[W - 1] - m) / sd) < 1e-12);
  assert.equal(p.t, 5 * H);
  assert.deepEqual([p.s, p.h], [100, 520]);
});

test("한쪽에만 있는 캔들은 빼고 맞추며, 모자라면 null", () => {
  const sam = bars([100, 100, 100, 100]);
  const hyn = [...bars([500, 500, 500]), { t: 99 * H, c: 1 }];
  assert.equal(latestGapZ(sam, hyn, 4), null);
  const p = latestGapZ(sam, hyn, 3)!;
  assert.equal(p.t, 2 * H);
  assert.equal(p.z, 0); // 변동이 없으면 0
});

test("알림: 기준을 넘을 때 한 번, 평소 수준으로 돌아와야 다시", () => {
  let side: Side = null;
  const run = (z: number) => {
    const r = nextAlert(side, z, 2, 0.5);
    side = r.side;
    return r.alert;
  };
  assert.equal(run(1.5), null);
  assert.equal(run(2.1), "h");
  assert.equal(run(2.6), null); // 아직 같은 신호
  assert.equal(run(1.9), null); // 기준 아래로 잠깐 내려와도
  assert.equal(run(2.2), null); // 다시 알리지 않음
  assert.equal(run(0.4), null); // 평소 수준 → 대기
  assert.equal(run(2.0), "h");
  assert.equal(run(-2.3), "s"); // 반대쪽은 바로
  assert.equal(run(-1.0), null);
  assert.equal(run(-0.2), null);
  assert.equal(run(-2.0), "s");
});

test("청산 기준이 진입 기준에 붙어 있어도 매번 알리지 않음", () => {
  assert.deepEqual(nextAlert("h", 2.1, 2, 3), { side: "h", alert: null });
  assert.deepEqual(nextAlert("h", 1.4, 2, 3), { side: null, alert: null });
});
