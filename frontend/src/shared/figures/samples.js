/**
 * 도해마다 **말이 되는 값 한 벌.** 시험 전용이다.
 *
 * 같은 글자가 도해마다 다른 크기를 뜻해서(`b` 는 키 폭이기도 하고 플랜지 폭이기도
 * 하다) 한 벌로 돌려쓸 수 없다. 그래서 하나씩 적고, 목록 시험이 「새 도해를
 * 넣으면 여기도 채워라」 를 강제한다.
 *
 * 값이 하는 일이 둘이다: 실제 값으로도 그려지는지 보고, **값이 있어야 나오는
 * 말글**까지 시험이 거치게 한다 — 빈 값만 보는 시험은 그런 말글을 아예 안 지난다.
 */
export const SAMPLE = {
  shaft: { d: 40, L: 120, di: 20, T: 250000 },
  sunk_key: { d: 40, b: 12, L: 50, h: 8 },
  bearing: { d: 30, D: 62, B: 16 },
  section_rect: { b: 120, h: 300 },
  section_i: { b: 200, h: 400, tw: 12, tf: 18 },
  beam_cantilever: { L: 2000, P: 8000 },
  beam_simple: { L: 4000, P: 12000, w: 5 },
  column: { L: 3000, n: 2, P: 80000 },
  bolt: { d: 12, L: 40, F: 9000 },
  rivet: { d: 16, t: 10, p: 48, n: 3 },
  fillet_weld: { z: 7, a: 5, l: 120 },
  gear: { m: 4, z: 24 },
  belt: { D1: 120, D2: 300, C: 700 },
  spring_coil: { D: 30, d: 4, n: 5, L: 60 },
  spring_leaf: { L: 1000, t: 8, n: 5 },
  vessel_cylinder: { D: 500, t: 8, p: 1.2 },
  notch_fillet: { D: 60, d: 40, r: 4 },
  notch_hole: { w: 80, d: 20 },
  pipe: { D: 100, L: 600, Q: 0.02 },
  journal_bearing: { d: 50, l: 60, W: 12000 },
  flange_coupling: { D: 160, db: 16, n: 6, d: 60, T: 900000 },
  section_box: { b: 100, h: 150, t: 6 },
  section_channel: { b: 75, h: 150, tw: 7, tf: 10 },
  beam_fixed: { L: 3000, P: 15000 },
  beam_overhang: { L: 2500, a: 800, P: 6000 },
  // 압축(음수)과 인장이 함께 걸린 값. 부호가 뜻을 갖는 유일한 도해다.
  mohr_circle: { sx: 80, sy: -20, txy: 30 },
  snap_fit: { t: 2, L: 18, y: 2.5, alpha: 30 },
  rib_wall: { t: 2.5, tr: 1.25, H: 6 },
  screw_boss: { d: 3, D: 6, d1: 2.4, h: 6 },
  drop_impact: { H: 1000, s: 1.5 },
  fin_array: { s: 8, t: 1.2, H: 35, n: 8 },
  // 세탁기 탈수 1440 rpm = 24 Hz. 격리 영역(f/fn = 3)인 값이다.
  vib_mount: { f: 24, fn: 8 },
  hinge_torque: { W: 15, Lg: 120, theta: 105, Tf: 2000 },
  press_fit: { d: 20, delta: 0.03, D: 40, L: 25 },
  gasket_seal: { h0: 12, h: 9, w: 10 },
  tol_stack: { n: 5, t: 0.1, g: 0.35 },
  draft_angle: { H: 30, theta: 1, w: 60 },
  // 플라스틱(70)과 알루미늄(23). TV 데코가 여름·겨울에 미는 그 조합이다.
  thermal_gap: { L: 1000, dT: 30, a1: 70, a2: 23 },
}
