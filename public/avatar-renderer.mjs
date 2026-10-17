// src/expression-breath.mjs
var clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function blinkOpen(t) {
  if (t < 0 || t > 0.34) return 1;
  if (t < 0.13) return 0.5 + 0.5 * Math.cos(t / 0.13 * Math.PI);
  if (t < 0.17) return 0;
  return 0.5 - 0.5 * Math.cos((t - 0.17) / 0.17 * Math.PI);
}
function reactionFrame(s, route = "original") {
  const t = s.time, skill = route !== "original";
  let x = s.headX + Math.sin(t * 0.7) * (skill ? 1.8 : 1.2), y = s.headY + Math.sin(t * 0.9) * (skill ? 0.95 : 0.65), z = Math.sin(t * 0.8) * (skill ? 1.9 : 1.3), gx = s.gazeX * 0.45, gy = s.gazeY * 0.28, eyes = 0, face = 0, open = 0, form = 0.1, eye = 1, stroke = 0;
  if (s.follow && s.reaction === "idle") {
    x += s.pointerX * 4;
    y += s.pointerY * 1.5;
    gx += s.pointerX * 0.48;
    gy += s.pointerY * 0.28;
  }
  switch (s.reaction) {
    case "drawing":
      y -= 4;
      z = -3 + Math.sin(t * 2.3);
      gx = Math.sin(t * 1.8) * 0.12;
      gy = -0.42;
      stroke = Math.sin(t * 5.5);
      break;
    case "thinking":
      y -= 2;
      z = -1.5;
      eyes = face = 1;
      eye = 0;
      break;
    case "confident":
      x += 4;
      y += 3;
      z = 5;
      eyes = face = 5;
      gx = 0.12;
      gy = 0.15;
      break;
    case "happy":
      y += Math.sin(t * 4.5) * 3;
      z = 3 + Math.sin(t * 2.3) * 3;
      eyes = face = 2;
      eye = 0;
      break;
    case "closed":
      eyes = face = 3;
      eye = 0;
      break;
    case "sad":
      eyes = face = 4;
      break;
  }
  if (s.talking) {
    face = 0;
    open = clamp((0.5 + 0.5 * Math.sin(t * 12)) * (0.55 + 0.45 * Math.sin(t * 3.4) ** 2), 0, 1);
    form = 0.2 + Math.sin(t * 3.3) * 0.5;
  }
  if (!eyes) eye = blinkOpen(t - s.blinkAt);
  return { ParamAngleX: clamp(x, -16, 16), ParamAngleY: clamp(y, -6, 6), ParamAngleZ: clamp(z, -10, 10), ParamBodyAngleX: Math.sin(t * 0.5) * (skill ? 1.25 : 0.7), ParamBodyAngleZ: Math.sin(t * 0.65) * (skill ? 1 : 0.5), ParamEyeBallX: clamp(gx, -0.6, 0.6), ParamEyeBallY: clamp(gy, -0.42, 0.42), ParamEyeLOpen: eye, ParamEyeROpen: eye, ParamMouthOpenY: open, ParamMouthForm: form, ParamBrowLY: 0.05, ParamBrowRY: 0.05, ParamPaintedEyes: eyes, ParamPaintedFace: face, ParamDrawingBody: s.reaction === "drawing" ? 1 : 0, ParamDrawingStroke: stroke, ParamBreath: 0.5 + Math.sin(t * 1.25) * (skill ? 0.48 : 0.35) };
}

// src/cast-expression-reactions.mjs
var REACTIONS = [["idle", "\u5F85\u673A"], ["drawing", "\u6B63\u5728\u753B\u753B"], ["finished", "\u753B\u5B8C\u7B49\u4EBA\u731C"], ["confident", "\u5DF2\u63D0\u4EA4\xB7\u81EA\u4FE1"], ["uncertain", "\u5DF2\u63D0\u4EA4\xB7\u72B9\u8C6B"], ["random", "\u5DF2\u63D0\u4EA4\xB7\u778E\u8499"], ["happy", "\u731C\u4E2D\u5E86\u795D"], ["spectator", "\u5DF2\u7B54\u5BF9\xB7\u5403\u74DC"], ["sad", "\u731C\u9519"]];
var base = { finished: "confident", uncertain: "idle", random: "idle", spectator: "confident" };
function reactionFrame2(state, route) {
  const mapped = { ...state, reaction: base[state.reaction] || state.reaction };
  const frame = reactionFrame(mapped, route);
  if (state.reaction === "finished") {
    frame.ParamDrawingBody = 1;
    frame.ParamDrawingStroke = 0;
  }
  if (route === "original") {
    if (state.character === "deepseek" && frame.ParamPaintedEyes === 5) frame.ParamPaintedEyes = frame.ParamPaintedFace = 0;
    return frame;
  }
  if (state.reaction === "drawing") frame.ParamEyeBallY = 0.85;
  const index = REACTIONS.findIndex(([id]) => id === state.reaction);
  frame.ParamPaintedEyes = frame.ParamPaintedFace = Math.max(0, index);
  frame.ParamEyeLOpen = frame.ParamEyeROpen = blinkOpen(state.time - state.blinkAt);
  return frame;
}

// src/expression-agentkit-driver.mjs
var ALIASES = { drawingFinished: "finished", thinking: "idle", closed: "idle" };
var ExpressionAgentKitDriver = class {
  constructor(id) {
    this.id = id;
    this.previous = null;
  }
  frame({ state = "idle", time = 0, blinkAt = -100, x = 0, y = 0, headX = 0, headY = 0, eyesClosed = false, reduce = false }, dt = 0) {
    const p = reactionFrame2({ character: this.id, reaction: ALIASES[state] || state, time: reduce ? 0 : time, blinkAt, headX, headY, gazeX: 0, gazeY: 0, pointerX: x, pointerY: y, follow: true, talking: false }, "kit");
    if (eyesClosed || state === "closed") p.ParamEyeLOpen = p.ParamEyeROpen = 0;
    if (this.previous && dt > 0) {
      const k = 1 - Math.exp(-dt * 8);
      for (const id of ["ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamEyeBallX", "ParamEyeBallY"]) p[id] = this.previous[id] + (p[id] - this.previous[id]) * k;
    }
    this.previous = { ...p };
    return p;
  }
};

// src/expression-regions.mjs
var FACES = { "mimo": [315, 65, 135, 153], "minimax": [318, 65, 132, 153], "deepseek": [296, 57, 159, 181], "gemini": [316, 115, 132, 128], "claude": [308, 59, 177, 181], "chatgpt": [323, 81, 119, 149], "grok": [326, 118, 121, 142], "glm": [307, 66, 141, 154], "kimi": [301, 84, 141, 158], "qwen": [322, 89, 135, 139], "doubao": [328, 51, 126, 147] };
function expressionRegion(id, view) {
  const [x, y, w, h] = FACES[id];
  return view === "full" ? { x: 128, y: 0, w: 512, h: 768 } : view === "face" ? { x: x - 42, y: Math.max(0, y - 78), w: w + 84, h: h + 116 } : { x: 190, y: 0, w: 390, h: 440 };
}

// src/original-reactions.mjs
var clamp2 = (x, a, b) => Math.max(a, Math.min(b, x));
function blinkOpen2(t) {
  if (t < 0 || t > 0.34) return 1;
  if (t < 0.13) return 0.5 + 0.5 * Math.cos(t / 0.13 * Math.PI);
  if (t < 0.17) return 0;
  return 0.5 - 0.5 * Math.cos((t - 0.17) / 0.17 * Math.PI);
}
function reactionFrame3(s, route = "original") {
  const t = s.time, skill = route !== "original";
  let x = s.headX + Math.sin(t * 0.7) * (skill ? 1.8 : 1.2), y = s.headY + Math.sin(t * 0.9) * (skill ? 0.95 : 0.65), z = Math.sin(t * 0.8) * (skill ? 1.9 : 1.3), gx = s.gazeX * 0.45, gy = s.gazeY * 0.28, eyes = 0, face = 0, open = 0, form = 0.1, eye = 1, stroke = 0;
  if (s.follow && s.reaction === "idle") {
    x += s.pointerX * 4;
    y += s.pointerY * 1.5;
    gx += s.pointerX * 0.48;
    gy += s.pointerY * 0.28;
  }
  switch (s.reaction) {
    case "drawing":
      y -= 4;
      z = -3 + Math.sin(t * 2.3);
      gx = Math.sin(t * 1.8) * 0.12;
      gy = -0.42;
      stroke = Math.sin(t * 5.5);
      break;
    case "thinking":
      y -= 2;
      z = -1.5;
      eyes = face = 1;
      eye = 0;
      break;
    case "confident":
      x += 4;
      y += 3;
      z = 5;
      eyes = face = 5;
      gx = 0.12;
      gy = 0.15;
      break;
    case "happy":
      y += Math.sin(t * 4.5) * 3;
      z = 3 + Math.sin(t * 2.3) * 3;
      eyes = face = 2;
      eye = 0;
      break;
    case "closed":
      eyes = face = 3;
      eye = 0;
      break;
    case "sad":
      eyes = face = 4;
      break;
  }
  if (s.talking) {
    face = 0;
    open = clamp2((0.5 + 0.5 * Math.sin(t * 12)) * (0.55 + 0.45 * Math.sin(t * 3.4) ** 2), 0, 1);
    form = 0.2 + Math.sin(t * 3.3) * 0.5;
  }
  if (!eyes) eye = blinkOpen2(t - s.blinkAt);
  return { ParamAngleX: clamp2(x, -16, 16), ParamAngleY: clamp2(y, -6, 6), ParamAngleZ: clamp2(z, -10, 10), ParamBodyAngleX: Math.sin(t * 0.5) * (skill ? 1.25 : 0.7), ParamBodyAngleZ: Math.sin(t * 0.65) * (skill ? 1 : 0.5), ParamEyeBallX: clamp2(gx, -0.6, 0.6), ParamEyeBallY: clamp2(gy, -0.42, 0.42), ParamEyeLOpen: eye, ParamEyeROpen: eye, ParamMouthOpenY: open, ParamMouthForm: form, ParamBrowLY: 0.05, ParamBrowRY: 0.05, ParamPaintedEyes: eyes, ParamPaintedFace: face, ParamDrawingBody: s.reaction === "drawing" ? 1 : 0, ParamDrawingStroke: stroke, ParamBreath: 0.5 + Math.sin(t * 1.25) * (skill ? 0.48 : 0.35) };
}

// src/ds-reactions.mjs
var clamp3 = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function blinkOpen3(elapsed) {
  if (elapsed < 0 || elapsed > 0.32) return 1;
  if (elapsed < 0.12) return 1 - Math.sin(elapsed / 0.12 * Math.PI / 2);
  if (elapsed < 0.16) return 0;
  return 0.5 - 0.5 * Math.cos((elapsed - 0.16) / 0.16 * Math.PI);
}
function reactionFrame4({
  reaction = "idle",
  time = 0,
  since = time,
  headX = 0,
  headY = 0,
  gazeX = 0,
  gazeY = 0,
  blink = 1,
  original = false
} = {}) {
  let x = headX + Math.sin(time * 0.7) * 2, y = headY + Math.sin(time * 0.9) * 1.2;
  let z = Math.sin(time * 0.8) * 2, eye = 1, eyes = 0, face = 0, gx = gazeX * 0.5, gy = gazeY * 0.3;
  let brow = 0.05, mouth = 0.12, open = 0.03;
  switch (reaction) {
    case "drawing":
      x = headX + Math.sin(since * 2.4) * 3;
      y = headY - 6;
      z = -5 + Math.sin(since * 3.3) * 2.5;
      gx = Math.sin(since * 2.4) * 0.2;
      gy = -0.7;
      mouth = 0.3;
      open = 0;
      break;
    case "thinking":
      x = headX + Math.sin(time * 0.65) * 1.5;
      y = headY - 3.5;
      z = -1.5 + Math.sin(time * 0.65) * 1.2;
      eye = 0;
      eyes = 1;
      face = 1;
      gx = gy = brow = mouth = open = 0;
      break;
    case "confident":
      x = headX + 5;
      y = headY + 5;
      z = 7 + Math.sin(since * 1.6) * 2;
      gx = 0.2;
      gy = 0.25;
      brow = 0.65;
      mouth = 0.8;
      open = 0;
      if (original) {
        eyes = 2;
        face = 0;
        eye = 0;
      } else {
        face = 5;
      }
      break;
    case "happy":
      y = headY + Math.sin(since * 4.5) * 6;
      z = 5 + Math.sin(since * 2.3) * 5;
      eyes = face = 2;
      eye = 0;
      brow = 0.8;
      mouth = 1;
      open = 0.9 + Math.sin(since * 3) * 0.1;
      break;
    case "closed":
      eyes = face = 3;
      eye = 0;
      gx = gy = brow = mouth = open = 0;
      break;
    case "sad":
      x = headX;
      y = headY + Math.sin(since * 9) * Math.exp(-since * 3) * 4;
      z = Math.sin(time * 0.8) * 1.2;
      eyes = face = 4;
      gx = gy = brow = mouth = open = 0;
      break;
  }
  if (eyes === 0) {
    if (original) {
      if (blink < 0.65) eyes = 3;
    } else eye = blink;
  }
  return {
    ParamAngleX: clamp3(x, -22, 22),
    ParamAngleY: clamp3(y, -7, 7),
    ParamAngleZ: clamp3(z, -15, 15),
    ParamEyeBallX: clamp3(gx, -1, 1),
    ParamEyeBallY: clamp3(gy, -1, 1),
    ParamEyeLOpen: original ? 1 : eye,
    ParamEyeROpen: original ? 1 : eye,
    ParamBrowLY: brow,
    ParamBrowRY: brow,
    ParamMouthForm: mouth,
    ParamMouthOpenY: open,
    ParamPaintedEyes: eyes,
    ParamPaintedFace: face,
    ParamDrawingBody: reaction === "drawing" ? 1 : 0,
    ParamBreath: 0.5 + Math.sin(time * 1.25) * 0.45
  };
}

// src/original-agentkit-driver.mjs
var CORE_MEMORY_BYTES = 512 * 1024 * 1024;
var ALIASES2 = { drawingFinished: "idle", uncertain: "thinking", random: "confident", spectator: "idle" };
var OriginalAgentKitDriver = class {
  constructor(id = "grok") {
    this.id = id;
    this.previous = null;
  }
  frame({ state = "idle", time = 0, since = time, blinkAt = -100, x = 0, y = 0, headX = 0, headY = 0, eyesClosed = false, reduce = false }, dt = 0) {
    const p = this.id === "deepseek" ? reactionFrame4({ reaction: ALIASES2[state] || state, time: reduce ? 0 : time, since: reduce ? 0 : since, headX, headY, gazeX: x, gazeY: y, blink: blinkOpen3(time - blinkAt) }) : reactionFrame3({ reaction: ALIASES2[state] || state, time: reduce ? 0 : time, blinkAt, headX, headY, gazeX: 0, gazeY: 0, pointerX: x, pointerY: y, follow: true, talking: false }, "kit");
    if (eyesClosed) {
      p.ParamEyeLOpen = p.ParamEyeROpen = 0;
      p.ParamPaintedEyes = 3;
    }
    if (this.previous && dt > 0) {
      const ds = this.id === "deepseek", k = 1 - Math.exp(-dt * (ds ? 5 : 8));
      for (const id of ["ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamEyeBallX", "ParamEyeBallY", ...ds ? ["ParamBrowLY", "ParamBrowRY", "ParamMouthForm", "ParamMouthOpenY"] : []]) p[id] = this.previous[id] + (p[id] - this.previous[id]) * k;
    }
    this.previous = { ...p };
    return p;
  }
};

// src/original-regions.mjs
var FACES2 = { "gemini": [316, 115, 132, 128], "claude": [308, 59, 177, 181], "chatgpt": [323, 81, 119, 149], "grok": [326, 118, 121, 142], "glm": [307, 66, 141, 154], "kimi": [301, 84, 141, 158], "qwen": [322, 89, 135, 139], "doubao": [328, 51, 126, 147] };
function sourceRegion(id, view) {
  if (id === "deepseek") return view === "full" ? { x: 100, y: 0, w: 568, h: 768 } : view === "face" ? { x: 275, y: 38, w: 205, h: 221 } : { x: 158, y: 22, w: 450, h: 425 };
  const [x, y, w, h] = FACES2[id];
  return view === "full" ? { x: 128, y: 0, w: 512, h: 768 } : view === "face" ? { x: x - 42, y: Math.max(0, y - 78), w: w + 84, h: h + 116 } : { x: 190, y: 0, w: 390, h: 440 };
}

// vendor/cubism-framework/src/id/cubismid.ts
var CubismId = class _CubismId {
  /**
   * 内部で使用するCubismIdクラス生成メソッド
   *
   * @param id ID文字列
   * @return CubismId
   * @note 指定したID文字列からCubismIdを取得する際は
   *       CubismIdManager().getId(id)を使用してください
   */
  static createIdInternal(id) {
    return new _CubismId(id);
  }
  /**
   * ID名を取得する
   */
  getString() {
    return this._id;
  }
  /**
   * idを比較
   * @param c 比較するid
   * @return 同じならばtrue,異なっていればfalseを返す
   */
  isEqual(c) {
    if (typeof c === "string") {
      return this._id == c;
    } else if (c instanceof _CubismId) {
      return this._id == c._id;
    }
    return false;
  }
  /**
   * idを比較
   * @param c 比較するid
   * @return 同じならばtrue,異なっていればfalseを返す
   */
  isNotEqual(c) {
    if (typeof c == "string") {
      return !(this._id == c);
    } else if (c instanceof _CubismId) {
      return !(this._id == c._id);
    }
    return false;
  }
  /**
   * プライベートコンストラクタ
   *
   * @note ユーザーによる生成は許可しません
   */
  constructor(id) {
    this._id = id;
  }
  _id;
  // ID名
};
var Live2DCubismFramework;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismId = CubismId;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));

// vendor/cubism-framework/src/id/cubismidmanager.ts
var CubismIdManager = class {
  /**
   * コンストラクタ
   */
  constructor() {
    this._ids = new Array();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (let i = 0; i < this._ids.length; ++i) {
      this._ids[i] = void 0;
    }
    this._ids = null;
  }
  /**
   * ID名をリストから登録
   *
   * @param ids ID名リスト
   * @param count IDの個数
   */
  registerIds(ids) {
    for (let i = 0; i < ids.length; i++) {
      this.registerId(ids[i]);
    }
  }
  /**
   * ID名を登録
   *
   * @param id ID名
   */
  registerId(id) {
    let result = null;
    if ("string" == typeof id) {
      if ((result = this.findId(id)) != null) {
        return result;
      }
      result = CubismId.createIdInternal(id);
      this._ids.push(result);
    } else {
      return this.registerId(id);
    }
    return result;
  }
  /**
   * ID名からIDを取得する
   *
   * @param id ID名
   */
  getId(id) {
    return this.registerId(id);
  }
  /**
   * ID名からIDの確認
   *
   * @return true 存在する
   * @return false 存在しない
   */
  isExist(id) {
    if ("string" == typeof id) {
      return this.findId(id) != null;
    }
    return this.isExist(id);
  }
  /**
   * ID名からIDを検索する。
   *
   * @param id ID名
   * @return 登録されているID。なければNULL。
   */
  findId(id) {
    for (let i = 0; i < this._ids.length; ++i) {
      if (this._ids[i].getString() == id) {
        return this._ids[i];
      }
    }
    return null;
  }
  _ids;
  // 登録されているIDのリスト
};
var Live2DCubismFramework2;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismIdManager = CubismIdManager;
})(Live2DCubismFramework2 || (Live2DCubismFramework2 = {}));

// vendor/cubism-framework/src/math/cubismvector2.ts
var CubismVector2 = class _CubismVector2 {
  /**
   * コンストラクタ
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.x = x == void 0 ? 0 : x;
    this.y = y == void 0 ? 0 : y;
  }
  x;
  y;
  /**
   * ベクトルの加算
   *
   * @param vector2 加算するベクトル値
   * @return 加算結果 ベクトル値
   */
  add(vector2) {
    const ret = new _CubismVector2(0, 0);
    ret.x = this.x + vector2.x;
    ret.y = this.y + vector2.y;
    return ret;
  }
  /**
   * ベクトルの減算
   *
   * @param vector2 減算するベクトル値
   * @return 減算結果 ベクトル値
   */
  substract(vector2) {
    const ret = new _CubismVector2(0, 0);
    ret.x = this.x - vector2.x;
    ret.y = this.y - vector2.y;
    return ret;
  }
  /**
   * ベクトルの乗算
   *
   * @param vector2 乗算するベクトル値
   * @return 乗算結果 ベクトル値
   */
  multiply(vector2) {
    const ret = new _CubismVector2(0, 0);
    ret.x = this.x * vector2.x;
    ret.y = this.y * vector2.y;
    return ret;
  }
  /**
   * ベクトルの乗算(スカラー)
   *
   * @param scalar 乗算するスカラー値
   * @return 乗算結果 ベクトル値
   */
  multiplyByScaler(scalar) {
    return this.multiply(new _CubismVector2(scalar, scalar));
  }
  /**
   * ベクトルの除算
   *
   * @param vector2 除算するベクトル値
   * @return 除算結果 ベクトル値
   */
  division(vector2) {
    const ret = new _CubismVector2(0, 0);
    ret.x = this.x / vector2.x;
    ret.y = this.y / vector2.y;
    return ret;
  }
  /**
   * ベクトルの除算(スカラー)
   *
   * @param scalar 除算するスカラー値
   * @return 除算結果 ベクトル値
   */
  divisionByScalar(scalar) {
    return this.division(new _CubismVector2(scalar, scalar));
  }
  /**
   * ベクトルの長さを取得する
   *
   * @return ベクトルの長さ
   */
  getLength() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /**
   * ベクトルの距離の取得
   *
   * @param a 点
   * @return ベクトルの距離
   */
  getDistanceWith(a) {
    return Math.sqrt(
      (this.x - a.x) * (this.x - a.x) + (this.y - a.y) * (this.y - a.y)
    );
  }
  /**
   * ドット積の計算
   *
   * @param a 値
   * @return 結果
   */
  dot(a) {
    return this.x * a.x + this.y * a.y;
  }
  /**
   * 正規化の適用
   */
  normalize() {
    const length = Math.pow(this.x * this.x + this.y * this.y, 0.5);
    this.x = this.x / length;
    this.y = this.y / length;
  }
  /**
   * 等しさの確認（等しいか？）
   *
   * 値が等しいか？
   *
   * @param rhs 確認する値
   * @return true 値は等しい
   * @return false 値は等しくない
   */
  isEqual(rhs) {
    return this.x == rhs.x && this.y == rhs.y;
  }
  /**
   * 等しさの確認（等しくないか？）
   *
   * 値が等しくないか？
   *
   * @param rhs 確認する値
   * @return true 値は等しくない
   * @return false 値は等しい
   */
  isNotEqual(rhs) {
    return !this.isEqual(rhs);
  }
};
var Live2DCubismFramework3;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismVector2 = CubismVector2;
})(Live2DCubismFramework3 || (Live2DCubismFramework3 = {}));

// vendor/cubism-framework/src/math/cubismmath.ts
var CubismMath = class _CubismMath {
  static Epsilon = 1e-5;
  /**
   * 第一引数の値を最小値と最大値の範囲に収めた値を返す
   *
   * @param value 収められる値
   * @param min   範囲の最小値
   * @param max   範囲の最大値
   * @return 最小値と最大値の範囲に収めた値
   */
  static range(value, min, max) {
    if (value < min) {
      value = min;
    } else if (value > max) {
      value = max;
    }
    return value;
  }
  /**
   * サイン関数の値を求める
   *
   * @param x 角度値（ラジアン）
   * @return サイン関数sin(x)の値
   */
  static sin(x) {
    return Math.sin(x);
  }
  /**
   * コサイン関数の値を求める
   *
   * @param x 角度値(ラジアン)
   * @return コサイン関数cos(x)の値
   */
  static cos(x) {
    return Math.cos(x);
  }
  /**
   * 値の絶対値を求める
   *
   * @param x 絶対値を求める値
   * @return 値の絶対値
   */
  static abs(x) {
    return Math.abs(x);
  }
  /**
   * 平方根(ルート)を求める
   * @param x -> 平方根を求める値
   * @return 値の平方根
   */
  static sqrt(x) {
    return Math.sqrt(x);
  }
  /**
   * 立方根を求める
   * @param x -> 立方根を求める値
   * @return 値の立方根
   */
  static cbrt(x) {
    if (x === 0) {
      return x;
    }
    let cx = x;
    const isNegativeNumber = cx < 0;
    if (isNegativeNumber) {
      cx = -cx;
    }
    let ret;
    if (cx === Infinity) {
      ret = Infinity;
    } else {
      ret = Math.exp(Math.log(cx) / 3);
      ret = (cx / (ret * ret) + 2 * ret) / 3;
    }
    return isNegativeNumber ? -ret : ret;
  }
  /**
   * イージング処理されたサインを求める
   * フェードイン・アウト時のイージングに利用できる
   *
   * @param value イージングを行う値
   * @return イージング処理されたサイン値
   */
  static getEasingSine(value) {
    if (value < 0) {
      return 0;
    } else if (value > 1) {
      return 1;
    }
    return 0.5 - 0.5 * this.cos(value * Math.PI);
  }
  /**
   * 大きい方の値を返す
   *
   * @param left 左辺の値
   * @param right 右辺の値
   * @return 大きい方の値
   */
  static max(left, right) {
    return left > right ? left : right;
  }
  /**
   * 小さい方の値を返す
   *
   * @param left  左辺の値
   * @param right 右辺の値
   * @return 小さい方の値
   */
  static min(left, right) {
    return left > right ? right : left;
  }
  static clamp(val, min, max) {
    if (val < min) {
      return min;
    } else if (max < val) {
      return max;
    }
    return val;
  }
  /**
   * 角度値をラジアン値に変換する
   *
   * @param degrees   角度値
   * @return 角度値から変換したラジアン値
   */
  static degreesToRadian(degrees) {
    return degrees / 180 * Math.PI;
  }
  /**
   * ラジアン値を角度値に変換する
   *
   * @param radian    ラジアン値
   * @return ラジアン値から変換した角度値
   */
  static radianToDegrees(radian) {
    return radian * 180 / Math.PI;
  }
  /**
   * ２つのベクトルからラジアン値を求める
   *
   * @param from  始点ベクトル
   * @param to    終点ベクトル
   * @return ラジアン値から求めた方向ベクトル
   */
  static directionToRadian(from, to) {
    const q1 = Math.atan2(to.y, to.x);
    const q2 = Math.atan2(from.y, from.x);
    let ret = q1 - q2;
    while (ret < -Math.PI) {
      ret += Math.PI * 2;
    }
    while (ret > Math.PI) {
      ret -= Math.PI * 2;
    }
    return ret;
  }
  /**
   * ２つのベクトルから角度値を求める
   *
   * @param from  始点ベクトル
   * @param to    終点ベクトル
   * @return 角度値から求めた方向ベクトル
   */
  static directionToDegrees(from, to) {
    const radian = this.directionToRadian(from, to);
    let degree = this.radianToDegrees(radian);
    if (to.x - from.x > 0) {
      degree = -degree;
    }
    return degree;
  }
  /**
   * ラジアン値を方向ベクトルに変換する。
   *
   * @param totalAngle    ラジアン値
   * @return ラジアン値から変換した方向ベクトル
   */
  static radianToDirection(totalAngle) {
    const ret = new CubismVector2();
    ret.x = this.sin(totalAngle);
    ret.y = this.cos(totalAngle);
    return ret;
  }
  /**
   * 三次方程式の三次項の係数が0になったときに補欠的に二次方程式の解をもとめる。
   * a * x^2 + b * x + c = 0
   *
   * @param   a -> 二次項の係数値
   * @param   b -> 一次項の係数値
   * @param   c -> 定数項の値
   * @return  二次方程式の解
   */
  static quadraticEquation(a, b, c) {
    if (this.abs(a) < _CubismMath.Epsilon) {
      if (this.abs(b) < _CubismMath.Epsilon) {
        return -c;
      }
      return -c / b;
    }
    return -(b + this.sqrt(b * b - 4 * a * c)) / (2 * a);
  }
  /**
   * カルダノの公式によってベジェのt値に該当する３次方程式の解を求める。
   * 重解になったときには0.0～1.0の値になる解を返す。
   *
   * a * x^3 + b * x^2 + c * x + d = 0
   *
   * @param   a -> 三次項の係数値
   * @param   b -> 二次項の係数値
   * @param   c -> 一次項の係数値
   * @param   d -> 定数項の値
   * @return  0.0～1.0の間にある解
   */
  static cardanoAlgorithmForBezier(a, b, c, d) {
    if (this.abs(a) < _CubismMath.Epsilon) {
      return this.range(this.quadraticEquation(b, c, d), 0, 1);
    }
    const ba = b / a;
    const ca = c / a;
    const da = d / a;
    const p = (3 * ca - ba * ba) / 3;
    const p3 = p / 3;
    const q = (2 * ba * ba * ba - 9 * ba * ca + 27 * da) / 27;
    const q2 = q / 2;
    const discriminant = q2 * q2 + p3 * p3 * p3;
    const center = 0.5;
    const threshold = center + 0.01;
    if (discriminant < 0) {
      const mp3 = -p / 3;
      const mp33 = mp3 * mp3 * mp3;
      const r = this.sqrt(mp33);
      const t = -q / (2 * r);
      const cosphi = this.range(t, -1, 1);
      const phi = Math.acos(cosphi);
      const crtr = this.cbrt(r);
      const t1 = 2 * crtr;
      const root12 = t1 * this.cos(phi / 3) - ba / 3;
      if (this.abs(root12 - center) < threshold) {
        return this.range(root12, 0, 1);
      }
      const root2 = t1 * this.cos((phi + 2 * Math.PI) / 3) - ba / 3;
      if (this.abs(root2 - center) < threshold) {
        return this.range(root2, 0, 1);
      }
      const root3 = t1 * this.cos((phi + 4 * Math.PI) / 3) - ba / 3;
      return this.range(root3, 0, 1);
    }
    if (discriminant == 0) {
      let u12;
      if (q2 < 0) {
        u12 = this.cbrt(-q2);
      } else {
        u12 = -this.cbrt(q2);
      }
      const root12 = 2 * u12 - ba / 3;
      if (this.abs(root12 - center) < threshold) {
        return this.range(root12, 0, 1);
      }
      const root2 = -u12 - ba / 3;
      return this.range(root2, 0, 1);
    }
    const sd = this.sqrt(discriminant);
    const u1 = this.cbrt(sd - q2);
    const v1 = this.cbrt(sd + q2);
    const root1 = u1 - v1 - ba / 3;
    return this.range(root1, 0, 1);
  }
  /**
   * 浮動小数点の余りを求める。
   *
   * @param dividend 被除数（割られる値）
   * @param divisor 除数（割る値）
   * @return 余り
   */
  static mod(dividend, divisor) {
    if (!isFinite(dividend) || divisor === 0 || isNaN(dividend) || isNaN(divisor)) {
      console.warn(
        `divided: ${dividend}, divisor: ${divisor} mod() returns 'NaN'.`
      );
      return NaN;
    }
    const absDividend = Math.abs(dividend);
    const absDivisor = Math.abs(divisor);
    let result = absDividend - Math.floor(absDividend / absDivisor) * absDivisor;
    result *= Math.sign(dividend);
    return result;
  }
  /**
   * コンストラクタ
   */
  constructor() {
  }
};
var Live2DCubismFramework4;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismMath = CubismMath;
})(Live2DCubismFramework4 || (Live2DCubismFramework4 = {}));

// vendor/cubism-framework/src/math/cubismmatrix44.ts
var CubismMatrix44 = class _CubismMatrix44 {
  /**
   * コンストラクタ
   */
  constructor() {
    this._tr = new Float32Array(16);
    this.loadIdentity();
  }
  /**
   * 受け取った２つの行列の乗算を行う。
   *
   * @param a 行列a
   * @param b 行列b
   *
   * @return 乗算結果の行列
   */
  static multiply(a, b, dst) {
    const c = new Float32Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    const n = 4;
    for (let i = 0; i < n; ++i) {
      for (let j = 0; j < n; ++j) {
        for (let k = 0; k < n; ++k) {
          c[j + i * 4] += a[k + i * 4] * b[j + k * 4];
        }
      }
    }
    for (let i = 0; i < 16; ++i) {
      dst[i] = c[i];
    }
  }
  /**
   * 単位行列に初期化する
   */
  loadIdentity() {
    const c = new Float32Array([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ]);
    this.setMatrix(c);
  }
  /**
   * 行列を設定
   *
   * @param tr 16個の浮動小数点数で表される4x4の行列
   */
  setMatrix(tr) {
    for (let i = 0; i < 16; ++i) {
      this._tr[i] = tr[i];
    }
  }
  /**
   * 行列を浮動小数点数の配列で取得
   *
   * @return 16個の浮動小数点数で表される4x4の行列
   */
  getArray() {
    return this._tr;
  }
  /**
   * X軸の拡大率を取得
   *
   * @return X軸の拡大率
   */
  getScaleX() {
    return this._tr[0];
  }
  /**
   * Y軸の拡大率を取得する
   *
   * @return Y軸の拡大率
   */
  getScaleY() {
    return this._tr[5];
  }
  /**
   * X軸の移動量を取得
   *
   * @return X軸の移動量
   */
  getTranslateX() {
    return this._tr[12];
  }
  /**
   * Y軸の移動量を取得
   *
   * @return Y軸の移動量
   */
  getTranslateY() {
    return this._tr[13];
  }
  /**
   * X軸の値を現在の行列で計算
   *
   * @param src X軸の値
   *
   * @return 現在の行列で計算されたX軸の値
   */
  transformX(src) {
    return this._tr[0] * src + this._tr[12];
  }
  /**
   * Y軸の値を現在の行列で計算
   *
   * @param src Y軸の値
   *
   * @return 現在の行列で計算されたY軸の値
   */
  transformY(src) {
    return this._tr[5] * src + this._tr[13];
  }
  /**
   * X軸の値を現在の行列で逆計算
   */
  invertTransformX(src) {
    return (src - this._tr[12]) / this._tr[0];
  }
  /**
   * Y軸の値を現在の行列で逆計算
   */
  invertTransformY(src) {
    return (src - this._tr[13]) / this._tr[5];
  }
  /**
   * 現在の行列の位置を起点にして移動
   *
   * 現在の行列の位置を起点にして相対的に移動する。
   *
   * @param x X軸の移動量
   * @param y Y軸の移動量
   */
  translateRelative(x, y) {
    const tr1 = new Float32Array([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      x,
      y,
      0,
      1
    ]);
    _CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }
  /**
   * 現在の行列の位置を移動
   *
   * 現在の行列の位置を指定した位置へ移動する
   *
   * @param x X軸の移動量
   * @param y y軸の移動量
   */
  translate(x, y) {
    this._tr[12] = x;
    this._tr[13] = y;
  }
  /**
   * 現在の行列のX軸の位置を指定した位置へ移動する
   *
   * @param x X軸の移動量
   */
  translateX(x) {
    this._tr[12] = x;
  }
  /**
   * 現在の行列のY軸の位置を指定した位置へ移動する
   *
   * @param y Y軸の移動量
   */
  translateY(y) {
    this._tr[13] = y;
  }
  /**
   * 現在の行列の拡大率を相対的に設定する
   *
   * @param x X軸の拡大率
   * @param y Y軸の拡大率
   */
  scaleRelative(x, y) {
    const tr1 = new Float32Array([
      x,
      0,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ]);
    _CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }
  /**
   * 現在の行列の拡大率を指定した倍率に設定する
   *
   * @param x X軸の拡大率
   * @param y Y軸の拡大率
   */
  scale(x, y) {
    this._tr[0] = x;
    this._tr[5] = y;
  }
  /**
   * 引数で与えられた行列にこの行列を乗算する。
   * (引数で与えられた行列) * (この行列)
   *
   * @note 関数名と実際の計算内容に乖離があるため、今後計算順が修正される可能性があります。
   * @param m 行列
   */
  multiplyByMatrix(m) {
    _CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
  }
  /**
   * 現在の行列の逆行列を求める。
   *
   * @return 現在の行列で計算された逆行列の値を返す
   */
  getInvert() {
    const r00 = this._tr[0];
    const r10 = this._tr[1];
    const r20 = this._tr[2];
    const r01 = this._tr[4];
    const r11 = this._tr[5];
    const r21 = this._tr[6];
    const r02 = this._tr[8];
    const r12 = this._tr[9];
    const r22 = this._tr[10];
    const tx = this._tr[12];
    const ty = this._tr[13];
    const tz = this._tr[14];
    const det = r00 * (r11 * r22 - r12 * r21) - r01 * (r10 * r22 - r12 * r20) + r02 * (r10 * r21 - r11 * r20);
    const dst = new _CubismMatrix44();
    if (CubismMath.abs(det) < CubismMath.Epsilon) {
      dst.loadIdentity();
      return dst;
    }
    const invDet = 1 / det;
    const inv00 = (r11 * r22 - r12 * r21) * invDet;
    const inv01 = -(r01 * r22 - r02 * r21) * invDet;
    const inv02 = (r01 * r12 - r02 * r11) * invDet;
    const inv10 = -(r10 * r22 - r12 * r20) * invDet;
    const inv11 = (r00 * r22 - r02 * r20) * invDet;
    const inv12 = -(r00 * r12 - r02 * r10) * invDet;
    const inv20 = (r10 * r21 - r11 * r20) * invDet;
    const inv21 = -(r00 * r21 - r01 * r20) * invDet;
    const inv22 = (r00 * r11 - r01 * r10) * invDet;
    dst._tr[0] = inv00;
    dst._tr[1] = inv10;
    dst._tr[2] = inv20;
    dst._tr[3] = 0;
    dst._tr[4] = inv01;
    dst._tr[5] = inv11;
    dst._tr[6] = inv21;
    dst._tr[7] = 0;
    dst._tr[8] = inv02;
    dst._tr[9] = inv12;
    dst._tr[10] = inv22;
    dst._tr[11] = 0;
    dst._tr[12] = -(inv00 * tx + inv01 * ty + inv02 * tz);
    dst._tr[13] = -(inv10 * tx + inv11 * ty + inv12 * tz);
    dst._tr[14] = -(inv20 * tx + inv21 * ty + inv22 * tz);
    dst._tr[15] = 1;
    return dst;
  }
  /**
   * オブジェクトのコピーを生成する
   */
  clone() {
    const cloneMatrix = new _CubismMatrix44();
    for (let i = 0; i < this._tr.length; i++) {
      cloneMatrix._tr[i] = this._tr[i];
    }
    return cloneMatrix;
  }
  _tr;
  // 4x4行列データ
};
var Live2DCubismFramework5;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismMatrix44 = CubismMatrix44;
})(Live2DCubismFramework5 || (Live2DCubismFramework5 = {}));

// vendor/cubism-framework/src/type/csmrectf.ts
var csmRect = class {
  /**
   * コンストラクタ
   * @param x 左端X座標
   * @param y 上端Y座標
   * @param w 幅
   * @param h 高さ
   */
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }
  /**
   * 矩形中央のX座標を取得する
   */
  getCenterX() {
    return this.x + 0.5 * this.width;
  }
  /**
   * 矩形中央のY座標を取得する
   */
  getCenterY() {
    return this.y + 0.5 * this.height;
  }
  /**
   * 右側のX座標を取得する
   */
  getRight() {
    return this.x + this.width;
  }
  /**
   * 下端のY座標を取得する
   */
  getBottom() {
    return this.y + this.height;
  }
  /**
   * 矩形に値をセットする
   * @param r 矩形のインスタンス
   */
  setRect(r) {
    this.x = r.x;
    this.y = r.y;
    this.width = r.width;
    this.height = r.height;
  }
  /**
   * 矩形中央を軸にして縦横を拡縮する
   * @param w 幅方向に拡縮する量
   * @param h 高さ方向に拡縮する量
   */
  expand(w, h) {
    this.x -= w;
    this.y -= h;
    this.width += w * 2;
    this.height += h * 2;
  }
  x;
  // 左端X座標
  y;
  // 上端Y座標
  width;
  // 幅
  height;
  // 高さ
};
var Live2DCubismFramework6;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.csmRect = csmRect;
})(Live2DCubismFramework6 || (Live2DCubismFramework6 = {}));

// vendor/cubism-framework/src/cubismframeworkconfig.ts
var CSM_LOG_LEVEL_VERBOSE = 0;
var CSM_LOG_LEVEL_DEBUG = 1;
var CSM_LOG_LEVEL_INFO = 2;
var CSM_LOG_LEVEL_WARNING = 3;
var CSM_LOG_LEVEL_ERROR = 4;
var CSM_LOG_LEVEL = CSM_LOG_LEVEL_VERBOSE;

// vendor/cubism-framework/src/utils/cubismdebug.ts
var CubismLogPrint = (level, fmt, args) => {
  CubismDebug.print(level, "[CSM]" + fmt, args);
};
var CubismLogPrintIn = (level, fmt, args) => {
  CubismLogPrint(level, fmt + "\n", args);
};
var CSM_ASSERT = (expr) => {
  console.assert(expr);
};
var CubismLogVerbose;
var CubismLogDebug;
var CubismLogInfo;
var CubismLogWarning;
var CubismLogError;
if (CSM_LOG_LEVEL <= CSM_LOG_LEVEL_VERBOSE) {
  CubismLogVerbose = (fmt, ...args) => {
    CubismLogPrintIn(0 /* LogLevel_Verbose */, "[V]" + fmt, args);
  };
  CubismLogDebug = (fmt, ...args) => {
    CubismLogPrintIn(1 /* LogLevel_Debug */, "[D]" + fmt, args);
  };
  CubismLogInfo = (fmt, ...args) => {
    CubismLogPrintIn(2 /* LogLevel_Info */, "[I]" + fmt, args);
  };
  CubismLogWarning = (fmt, ...args) => {
    CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
  };
  CubismLogError = (fmt, ...args) => {
    CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_DEBUG) {
  CubismLogDebug = (fmt, ...args) => {
    CubismLogPrintIn(1 /* LogLevel_Debug */, "[D]" + fmt, args);
  };
  CubismLogInfo = (fmt, ...args) => {
    CubismLogPrintIn(2 /* LogLevel_Info */, "[I]" + fmt, args);
  };
  CubismLogWarning = (fmt, ...args) => {
    CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
  };
  CubismLogError = (fmt, ...args) => {
    CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_INFO) {
  CubismLogInfo = (fmt, ...args) => {
    CubismLogPrintIn(2 /* LogLevel_Info */, "[I]" + fmt, args);
  };
  CubismLogWarning = (fmt, ...args) => {
    CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
  };
  CubismLogError = (fmt, ...args) => {
    CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_WARNING) {
  CubismLogWarning = (fmt, ...args) => {
    CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
  };
  CubismLogError = (fmt, ...args) => {
    CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_ERROR) {
  CubismLogError = (fmt, ...args) => {
    CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
  };
}
var CubismDebug = class {
  /**
   * ログを出力する。第一引数にログレベルを設定する。
   * CubismFramework.initialize()時にオプションで設定されたログ出力レベルを下回る場合はログに出さない。
   *
   * @param logLevel ログレベルの設定
   * @param format 書式付き文字列
   * @param args 可変長引数
   */
  static print(logLevel, format, args) {
    if (logLevel < CubismFramework.getLoggingLevel()) {
      return;
    }
    const logPrint = CubismFramework.coreLogFunction;
    if (!logPrint) return;
    const buffer = format.replace(/\{(\d+)\}/g, (m, k) => {
      return args[k];
    });
    logPrint(buffer);
  }
  /**
   * データから指定した長さだけダンプ出力する。
   * CubismFramework.initialize()時にオプションで設定されたログ出力レベルを下回る場合はログに出さない。
   *
   * @param logLevel ログレベルの設定
   * @param data ダンプするデータ
   * @param length ダンプする長さ
   */
  static dumpBytes(logLevel, data, length) {
    for (let i = 0; i < length; i++) {
      if (i % 16 == 0 && i > 0) this.print(logLevel, "\n");
      else if (i % 8 == 0 && i > 0) this.print(logLevel, "  ");
      this.print(logLevel, "{0} ", [data[i] & 255]);
    }
    this.print(logLevel, "\n");
  }
  /**
   * private コンストラクタ
   */
  constructor() {
  }
};
var Live2DCubismFramework7;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismDebug = CubismDebug;
})(Live2DCubismFramework7 || (Live2DCubismFramework7 = {}));

// vendor/cubism-framework/src/rendering/cubismrenderer.ts
var CubismRenderer = class {
  /**
   * レンダラのインスタンスを生成して取得する
   *
   * @return レンダラのインスタンス
   */
  static create() {
    return null;
  }
  /**
   * レンダラのインスタンスを解放する
   */
  static delete(renderer) {
    renderer = null;
  }
  /**
   * レンダラの初期化処理を実行する
   * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
   *
   * @param model モデルのインスタンス
   */
  initialize(model) {
    this._model = model;
    if (model.isBlendModeEnabled()) {
      this.useHighPrecisionMask(true);
      CubismLogInfo(
        "This model uses a high-resolution mask because it operates in blend mode."
      );
    }
  }
  /**
   * モデルを描画する
   * @param shaderPath ブレンドモード用シェーダのパス
   */
  drawModel(shaderPath = null) {
    if (this.getModel() == null) return;
    this.doDrawModel(shaderPath);
  }
  /**
   * Model-View-Projection 行列をセットする
   * 配列は複製されるので、元の配列は外で破棄して良い
   *
   * @param matrix44 Model-View-Projection 行列
   */
  setMvpMatrix(matrix44) {
    this._mvpMatrix4x4.setMatrix(matrix44.getArray());
  }
  /**
   * Model-View-Projection 行列を取得する
   *
   * @return Model-View-Projection 行列
   */
  getMvpMatrix() {
    return this._mvpMatrix4x4;
  }
  /**
   * モデルの色をセットする
   * 各色0.0~1.0の間で指定する（1.0が標準の状態）
   *
   * @param red 赤チャンネルの値
   * @param green 緑チャンネルの値
   * @param blue 青チャンネルの値
   * @param alpha αチャンネルの値
   */
  setModelColor(red, green, blue, alpha) {
    this._modelColor.r = CubismMath.clamp(red, 0, 1);
    this._modelColor.g = CubismMath.clamp(green, 0, 1);
    this._modelColor.b = CubismMath.clamp(blue, 0, 1);
    this._modelColor.a = CubismMath.clamp(alpha, 0, 1);
  }
  /**
   * モデルの色を取得する
   * 各色0.0~1.0の間で指定する(1.0が標準の状態)
   *
   * @return RGBAのカラー情報
   */
  getModelColor() {
    return JSON.parse(JSON.stringify(this._modelColor));
  }
  /**
   * 透明度を考慮したモデルの色を計算する。
   *
   * @param opacity 透明度
   *
   * @return RGBAのカラー情報
   */
  getModelColorWithOpacity(opacity) {
    const modelColorRGBA = this.getModelColor();
    modelColorRGBA.a *= opacity;
    if (this.isPremultipliedAlpha()) {
      modelColorRGBA.r *= modelColorRGBA.a;
      modelColorRGBA.g *= modelColorRGBA.a;
      modelColorRGBA.b *= modelColorRGBA.a;
    }
    return modelColorRGBA;
  }
  /**
   * 乗算済みαの有効・無効をセットする
   * 有効にするならtrue、無効にするならfalseをセットする
   */
  setIsPremultipliedAlpha(enable) {
    this._isPremultipliedAlpha = enable;
  }
  /**
   * 乗算済みαの有効・無効を取得する
   * @return true 乗算済みのα有効
   *         false 乗算済みのα無効
   */
  isPremultipliedAlpha() {
    return this._isPremultipliedAlpha;
  }
  /**
   * カリング（片面描画）の有効・無効をセットする。
   * 有効にするならtrue、無効にするならfalseをセットする
   */
  setIsCulling(culling) {
    this._isCulling = culling;
  }
  /**
   * カリング（片面描画）の有効・無効を取得する。
   *
   * @return true カリング有効
   *         false カリング無効
   */
  isCulling() {
    return this._isCulling;
  }
  /**
   * テクスチャの異方性フィルタリングのパラメータをセットする
   * パラメータ値の影響度はレンダラの実装に依存する
   *
   * @param n パラメータの値
   */
  setAnisotropy(n) {
    this._anisotropy = n;
  }
  /**
   * テクスチャの異方性フィルタリングのパラメータをセットする
   *
   * @return 異方性フィルタリングのパラメータ
   */
  getAnisotropy() {
    return this._anisotropy;
  }
  /**
   * レンダリングするモデルを取得する
   *
   * @return レンダリングするモデル
   */
  getModel() {
    return this._model;
  }
  /**
   * マスク描画の方式を変更する。
   * falseの場合、マスクを1枚のテクスチャに分割してレンダリングする（デフォルト）
   * 高速だが、マスク個数の上限が36に限定され、質も荒くなる
   * trueの場合、パーツ描画の前にその都度必要なマスクを描き直す
   * レンダリング品質は高いが描画処理負荷は増す
   *
   * @param high 高精細マスクに切り替えるか？
   */
  useHighPrecisionMask(high) {
    this._useHighPrecisionMask = high;
  }
  /**
   * マスクの描画方式を取得する
   *
   * @return true 高精細方式
   *         false デフォルト
   */
  isUsingHighPrecisionMask() {
    return this._useHighPrecisionMask;
  }
  /**
   * モデルを描画したバッファのサイズを設定
   *
   * @param[in]   width  -> モデルを描画したバッファの幅
   * @param[in]   height -> モデルを描画したバッファの高さ
   */
  setRenderTargetSize(width, height) {
    this._modelRenderTargetWidth = width;
    this._modelRenderTargetHeight = height;
  }
  /**
   * コンストラクタ
   */
  constructor(width, height) {
    this._modelRenderTargetWidth = width;
    this._modelRenderTargetHeight = height;
    this._isCulling = false;
    this._isPremultipliedAlpha = false;
    this._anisotropy = 0;
    this._model = null;
    this._modelColor = new CubismTextureColor();
    this._useHighPrecisionMask = false;
    this._mvpMatrix4x4 = new CubismMatrix44();
    this._mvpMatrix4x4.loadIdentity();
  }
  /**
   * レンダラが保持する静的なリソースを開放する
   */
  static staticRelease;
  _mvpMatrix4x4;
  // Model-View-Projection 行列
  _modelColor;
  // モデル自体のカラー（RGBA）
  _isCulling;
  // カリングが有効ならtrue
  _isPremultipliedAlpha;
  // 乗算済みαならtrue
  _anisotropy;
  // テクスチャの異方性フィルタリングのパラメータ
  _model;
  // レンダリング対象のモデル
  _useHighPrecisionMask;
  // falseの場合、マスクを纏めて描画する trueの場合、マスクはパーツ描画ごとに書き直す
  _modelRenderTargetWidth;
  _modelRenderTargetHeight;
};
var CubismBlendMode = /* @__PURE__ */ ((CubismBlendMode2) => {
  CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Normal"] = 0] = "CubismBlendMode_Normal";
  CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Additive"] = 1] = "CubismBlendMode_Additive";
  CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Multiplicative"] = 2] = "CubismBlendMode_Multiplicative";
  return CubismBlendMode2;
})(CubismBlendMode || {});
var CubismTextureColor = class {
  /**
   * コンストラクタ
   */
  constructor(r = 1, g = 1, b = 1, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
  r;
  // 赤チャンネル
  g;
  // 緑チャンネル
  b;
  // 青チャンネル
  a;
  // αチャンネル
};
var CubismClippingContext = class {
  /**
   * 引数付きコンストラクタ
   */
  constructor(clippingDrawableIndices, clipCount) {
    this._clippingIdList = clippingDrawableIndices;
    this._clippingIdCount = clipCount;
    this._allClippedDrawRect = new csmRect();
    this._layoutBounds = new csmRect();
    this._clippedDrawableIndexList = [];
    this._clippedOffscreenIndexList = [];
    this._matrixForMask = new CubismMatrix44();
    this._matrixForDraw = new CubismMatrix44();
    this._bufferIndex = 0;
    this._layoutChannelIndex = 0;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    if (this._layoutBounds != null) {
      this._layoutBounds = null;
    }
    if (this._allClippedDrawRect != null) {
      this._allClippedDrawRect = null;
    }
    if (this._clippedDrawableIndexList != null) {
      this._clippedDrawableIndexList = null;
    }
    if (this._clippedOffscreenIndexList != null) {
      this._clippedOffscreenIndexList = null;
    }
  }
  /**
   * このマスクにクリップされる描画オブジェクトを追加する
   *
   * @param drawableIndex クリッピング対象に追加する描画オブジェクトのインデックス
   */
  addClippedDrawable(drawableIndex) {
    this._clippedDrawableIndexList.push(drawableIndex);
  }
  /**
   * このマスクにクリップされるオフスクリーンオブジェクトを追加する
   *
   * @param offscreenIndex クリッピング対象に追加するオフスクリーンオブジェクトのインデックス
   */
  addClippedOffscreen(offscreenIndex) {
    this._clippedOffscreenIndexList.push(offscreenIndex);
  }
  _isUsing;
  // 現在の描画状態でマスクの準備が必要ならtrue
  _clippingIdList;
  // クリッピングマスクのIDリスト
  _clippingIdCount;
  // クリッピングマスクの数
  _layoutChannelIndex;
  // RGBAのいずれのチャンネルにこのクリップを配置するか（0:R, 1:G, 2:B, 3:A）
  _layoutBounds;
  // マスク用チャンネルのどの領域にマスクを入れるか（View座標-1~1, UVは0~1に直す）
  _allClippedDrawRect;
  // このクリッピングで、クリッピングされるすべての描画オブジェクトの囲み矩形（毎回更新）
  _matrixForMask;
  // マスクの位置計算結果を保持する行列
  _matrixForDraw;
  // 描画オブジェクトの位置計算結果を保持する行列
  _clippedDrawableIndexList;
  // このマスクにクリップされる描画オブジェクトのリスト
  _clippedOffscreenIndexList;
  // このマスクにクリップされるオフスクリーンオブジェクトのリスト
  _bufferIndex;
  // このマスクが割り当てられるレンダーテクスチャ（フレームバッファ）やカラーバッファのインデックス
};
var Live2DCubismFramework8;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismBlendMode = CubismBlendMode;
  Live2DCubismFramework19.CubismRenderer = CubismRenderer;
  Live2DCubismFramework19.CubismTextureColor = CubismTextureColor;
})(Live2DCubismFramework8 || (Live2DCubismFramework8 = {}));

// vendor/cubism-framework/src/utils/cubismjsonextension.ts
var CubismJsonExtension = class _CubismJsonExtension {
  static parseJsonObject(obj, map) {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] == "boolean") {
        const convValue = Boolean(obj[key]);
        map.put(key, new JsonBoolean(convValue));
      } else if (typeof obj[key] == "string") {
        const convValue = String(obj[key]);
        map.put(key, new JsonString(convValue));
      } else if (typeof obj[key] == "number") {
        const convValue = Number(obj[key]);
        map.put(key, new JsonFloat(convValue));
      } else if (obj[key] instanceof Array) {
        map.put(
          key,
          _CubismJsonExtension.parseJsonArray(obj[key])
        );
      } else if (obj[key] instanceof Object) {
        map.put(
          key,
          _CubismJsonExtension.parseJsonObject(obj[key], new JsonMap())
        );
      } else if (obj[key] == null) {
        map.put(key, new JsonNullvalue());
      } else {
        map.put(key, obj[key]);
      }
    });
    return map;
  }
  static parseJsonArray(obj) {
    const arr = new JsonArray();
    Object.keys(obj).forEach((key) => {
      const convKey = Number(key);
      if (typeof convKey == "number") {
        if (typeof obj[key] == "boolean") {
          const convValue = Boolean(obj[key]);
          arr.add(new JsonBoolean(convValue));
        } else if (typeof obj[key] == "string") {
          const convValue = String(obj[key]);
          arr.add(new JsonString(convValue));
        } else if (typeof obj[key] == "number") {
          const convValue = Number(obj[key]);
          arr.add(new JsonFloat(convValue));
        } else if (obj[key] instanceof Array) {
          arr.add(this.parseJsonArray(obj[key]));
        } else if (obj[key] instanceof Object) {
          arr.add(this.parseJsonObject(obj[key], new JsonMap()));
        } else if (obj[key] == null) {
          arr.add(new JsonNullvalue());
        } else {
          arr.add(obj[key]);
        }
      } else if (obj[key] instanceof Array) {
        arr.add(this.parseJsonArray(obj[key]));
      } else if (obj[key] instanceof Object) {
        arr.add(this.parseJsonObject(obj[key], new JsonMap()));
      } else if (obj[key] == null) {
        arr.add(new JsonNullvalue());
      } else {
        const convValue = Array(obj[key]);
        for (let i = 0; i < convValue.length; i++) {
          arr.add(convValue[i]);
        }
      }
    });
    return arr;
  }
};

// vendor/cubism-framework/src/utils/cubismjson.ts
var CSM_JSON_ERROR_TYPE_MISMATCH = "Error: type mismatch";
var CSM_JSON_ERROR_INDEX_OF_BOUNDS = "Error: index out of bounds";
var Value2 = class _Value {
  /**
   * コンストラクタ
   */
  constructor() {
  }
  /**
   * 要素を文字列型で返す(string)
   */
  getRawString(defaultValue, indent) {
    return this.getString(defaultValue, indent);
  }
  /**
   * 要素を数値型で返す(number)
   */
  toInt(defaultValue = 0) {
    return defaultValue;
  }
  /**
   * 要素を数値型で返す(number)
   */
  toFloat(defaultValue = 0) {
    return defaultValue;
  }
  /**
   * 要素を真偽値で返す(boolean)
   */
  toBoolean(defaultValue = false) {
    return defaultValue;
  }
  /**
   * サイズを返す
   */
  getSize() {
    return 0;
  }
  /**
   * 要素を配列で返す(Value[])
   */
  getArray(defaultValue = null) {
    return defaultValue;
  }
  /**
   * 要素をコンテナで返す(array)
   */
  getVector(defaultValue = new Array()) {
    return defaultValue;
  }
  /**
   * 要素をマップで返す(Map<String, Value>)
   */
  getMap(defaultValue) {
    return defaultValue;
  }
  /**
   * 添字演算子[index]
   */
  getValueByIndex(index) {
    return _Value.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * 添字演算子[string]
   */
  getValueByString(s) {
    return _Value.nullValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * マップのキー一覧をコンテナで返す
   *
   * @return マップのキーの一覧
   */
  getKeys() {
    return _Value.dummyKeys;
  }
  /**
   * Valueの種類がエラー値ならtrue
   */
  isError() {
    return false;
  }
  /**
   * Valueの種類がnullならtrue
   */
  isNull() {
    return false;
  }
  /**
   * Valueの種類が真偽値ならtrue
   */
  isBool() {
    return false;
  }
  /**
   * Valueの種類が数値型ならtrue
   */
  isFloat() {
    return false;
  }
  /**
   * Valueの種類が文字列ならtrue
   */
  isString() {
    return false;
  }
  /**
   * Valueの種類が配列ならtrue
   */
  isArray() {
    return false;
  }
  /**
   * Valueの種類がマップ型ならtrue
   */
  isMap() {
    return false;
  }
  equals(value) {
    return false;
  }
  /**
   * Valueの値が静的ならtrue、静的なら解放しない
   */
  isStatic() {
    return false;
  }
  /**
   * Valueにエラー値をセットする
   */
  setErrorNotForClientCall(errorStr) {
    return JsonError.errorValue;
  }
  /**
   * 初期化用メソッド
   */
  static staticInitializeNotForClientCall() {
    JsonBoolean.trueValue = new JsonBoolean(true);
    JsonBoolean.falseValue = new JsonBoolean(false);
    _Value.errorValue = new JsonError("ERROR", true);
    _Value.nullValue = new JsonNullvalue();
    _Value.dummyKeys = new Array();
  }
  /**
   * リリース用メソッド
   */
  static staticReleaseNotForClientCall() {
    JsonBoolean.trueValue = null;
    JsonBoolean.falseValue = null;
    _Value.errorValue = null;
    _Value.nullValue = null;
    _Value.dummyKeys = null;
  }
  _stringBuffer;
  // 文字列バッファ
  static dummyKeys;
  // ダミーキー
  static errorValue;
  // 一時的な返り値として返すエラー。 CubismFramework::Disposeするまではdeleteしない
  static nullValue;
  // 明示的に連想配列をany型で指定
};
var CubismJson = class _CubismJson {
  /**
   * コンストラクタ
   */
  constructor(buffer, length) {
    this._error = null;
    this._lineCount = 0;
    this._root = null;
    if (buffer != void 0) {
      this.parseBytes(buffer, length, this._parseCallback);
    }
  }
  /**
   * バイトデータから直接ロードしてパースする
   *
   * @param buffer バッファ
   * @param size バッファサイズ
   * @return CubismJsonクラスのインスタンス。失敗したらNULL
   */
  static create(buffer, size) {
    const json = new _CubismJson();
    const succeeded = json.parseBytes(
      buffer,
      size,
      json._parseCallback
    );
    if (!succeeded) {
      _CubismJson.delete(json);
      return null;
    } else {
      return json;
    }
  }
  /**
   * パースしたJSONオブジェクトの解放処理
   *
   * @param instance CubismJsonクラスのインスタンス
   */
  static delete(instance) {
    instance = null;
  }
  /**
   * パースしたJSONのルート要素を返す
   */
  getRoot() {
    return this._root;
  }
  /**
   *  UnicodeのバイナリをStringに変換
   *
   * @param buffer 変換するバイナリデータ
   * @return 変換後の文字列
   */
  static arrayBufferToString(buffer) {
    const uint8Array = new Uint8Array(buffer);
    let str = "";
    for (let i = 0, len = uint8Array.length; i < len; ++i) {
      str += "%" + this.pad(uint8Array[i].toString(16));
    }
    str = decodeURIComponent(str);
    return str;
  }
  /**
   * エンコード、パディング
   */
  static pad(n) {
    return n.length < 2 ? "0" + n : n;
  }
  /**
   * JSONのパースを実行する
   * @param buffer    パース対象のデータバイト
   * @param size      データバイトのサイズ
   * return true : 成功
   * return false: 失敗
   */
  parseBytes(buffer, size, parseCallback) {
    const endPos = new Array(1);
    const decodeBuffer = _CubismJson.arrayBufferToString(buffer);
    if (parseCallback == void 0) {
      this._root = this.parseValue(decodeBuffer, size, 0, endPos);
    } else {
      this._root = parseCallback(JSON.parse(decodeBuffer), new JsonMap());
    }
    if (this._error) {
      let strbuf = "\0";
      strbuf = "Json parse error : @line " + (this._lineCount + 1) + "\n";
      this._root = new JsonString(strbuf);
      CubismLogInfo("{0}", this._root.getRawString());
      return false;
    } else if (this._root == null) {
      this._root = new JsonError(this._error, false);
      return false;
    }
    return true;
  }
  /**
   * パース時のエラー値を返す
   */
  getParseError() {
    return this._error;
  }
  /**
   * ルート要素の次の要素がファイルの終端だったらtrueを返す
   */
  checkEndOfFile() {
    return this._root.getArray()[1].equals("EOF");
  }
  /**
   * JSONエレメントからValue(float,String,Value*,Array,null,true,false)をパースする
   * エレメントの書式に応じて内部でParseString(), ParseObject(), ParseArray()を呼ぶ
   *
   * @param   buffer      JSONエレメントのバッファ
   * @param   length      パースする長さ
   * @param   begin       パースを開始する位置
   * @param   outEndPos   パース終了時の位置
   * @return      パースから取得したValueオブジェクト
   */
  parseValue(buffer, length, begin, outEndPos) {
    if (this._error) return null;
    let o = null;
    let i = begin;
    let f;
    for (; i < length; i++) {
      const c = buffer[i];
      switch (c) {
        case "-":
        case ".":
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          const afterString = new Array(1);
          f = strtod(buffer.slice(i), afterString);
          outEndPos[0] = buffer.indexOf(afterString[0]);
          return new JsonFloat(f);
        }
        case '"':
          return new JsonString(
            this.parseString(buffer, length, i + 1, outEndPos)
          );
        // \"の次の文字から
        case "[":
          o = this.parseArray(buffer, length, i + 1, outEndPos);
          return o;
        case "{":
          o = this.parseObject(buffer, length, i + 1, outEndPos);
          return o;
        case "n":
          if (i + 3 < length) {
            o = new JsonNullvalue();
            outEndPos[0] = i + 4;
          } else {
            this._error = "parse null";
          }
          return o;
        case "t":
          if (i + 3 < length) {
            o = JsonBoolean.trueValue;
            outEndPos[0] = i + 4;
          } else {
            this._error = "parse true";
          }
          return o;
        case "f":
          if (i + 4 < length) {
            o = JsonBoolean.falseValue;
            outEndPos[0] = i + 5;
          } else {
            this._error = "illegal ',' position";
          }
          return o;
        case ",":
          this._error = "illegal ',' position";
          return null;
        case "]":
          outEndPos[0] = i;
          return null;
        case "\n":
          this._lineCount++;
        // falls through
        case " ":
        case "	":
        case "\r":
        default:
          break;
      }
    }
    this._error = "illegal end of value";
    return null;
  }
  /**
   * 次の「"」までの文字列をパースする。
   *
   * @param   string  ->  パース対象の文字列
   * @param   length  ->  パースする長さ
   * @param   begin   ->  パースを開始する位置
   * @param  outEndPos   ->  パース終了時の位置
   * @return      パースした文F字列要素
   */
  parseString(string, length, begin, outEndPos) {
    if (this._error) {
      return null;
    }
    if (!string) {
      this._error = "string is null";
      return null;
    }
    let i = begin;
    let c, c2;
    let ret = "";
    let bufStart = begin;
    for (; i < length; i++) {
      c = string[i];
      switch (c) {
        case '"': {
          outEndPos[0] = i + 1;
          ret += string.substr(bufStart, i - bufStart);
          return ret;
        }
        // falls through
        case "//": {
          i++;
          if (i - 1 > bufStart) {
            ret += string.substr(bufStart, i - bufStart);
          }
          bufStart = i + 1;
          if (i < length) {
            c2 = string[i];
            switch (c2) {
              case "\\":
                ret += "\\";
                break;
              case '"':
                ret += '"';
                break;
              case "/":
                ret += "/";
                break;
              case "b":
                ret += "\b";
                break;
              case "f":
                ret += "\f";
                break;
              case "n":
                ret += "\n";
                break;
              case "r":
                ret += "\r";
                break;
              case "t":
                ret += "	";
                break;
              case "u":
                this._error = "parse string/unicord escape not supported";
                break;
              default:
                break;
            }
          } else {
            this._error = "parse string/escape error";
          }
        }
        // falls through
        default: {
          break;
        }
      }
    }
    this._error = "parse string/illegal end";
    return null;
  }
  /**
   * JSONのオブジェクトエレメントをパースしてValueオブジェクトを返す
   *
   * @param buffer    JSONエレメントのバッファ
   * @param length    パースする長さ
   * @param begin     パースを開始する位置
   * @param outEndPos パース終了時の位置
   * @return パースから取得したValueオブジェクト
   */
  parseObject(buffer, length, begin, outEndPos) {
    if (this._error) {
      return null;
    }
    if (!buffer) {
      this._error = "buffer is null";
      return null;
    }
    const ret = new JsonMap();
    let key = "";
    let i = begin;
    let c = "";
    const localRetEndPos2 = Array(1);
    let ok = false;
    for (; i < length; i++) {
      FOR_LOOP: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case '"':
            key = this.parseString(buffer, length, i + 1, localRetEndPos2);
            if (this._error) {
              return null;
            }
            i = localRetEndPos2[0];
            ok = true;
            break FOR_LOOP;
          //-- loopから出る
          case "}":
            outEndPos[0] = i + 1;
            return ret;
          // 空
          case ":":
            this._error = "illegal ':' position";
            break;
          case "\n":
            this._lineCount++;
          // falls through
          default:
            break;
        }
      }
      if (!ok) {
        this._error = "key not found";
        return null;
      }
      ok = false;
      FOR_LOOP2: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case ":":
            ok = true;
            i++;
            break FOR_LOOP2;
          case "}":
            this._error = "illegal '}' position";
            break;
          // falls through
          case "\n":
            this._lineCount++;
          // case ' ': case '\t' : case '\r':
          // falls through
          default:
            break;
        }
      }
      if (!ok) {
        this._error = "':' not found";
        return null;
      }
      const value = this.parseValue(buffer, length, i, localRetEndPos2);
      if (this._error) {
        return null;
      }
      i = localRetEndPos2[0];
      ret.put(key, value);
      FOR_LOOP3: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case ",":
            break FOR_LOOP3;
          case "}":
            outEndPos[0] = i + 1;
            return ret;
          // 正常終了
          case "\n":
            this._lineCount++;
          // falls through
          default:
            break;
        }
      }
    }
    this._error = "illegal end of perseObject";
    return null;
  }
  /**
   * 次の「"」までの文字列をパースする。
   * @param buffer    JSONエレメントのバッファ
   * @param length    パースする長さ
   * @param begin     パースを開始する位置
   * @param outEndPos パース終了時の位置
   * @return パースから取得したValueオブジェクト
   */
  parseArray(buffer, length, begin, outEndPos) {
    if (this._error) {
      return null;
    }
    if (!buffer) {
      this._error = "buffer is null";
      return null;
    }
    let ret = new JsonArray();
    let i = begin;
    let c;
    const localRetEndpos2 = new Array(1);
    for (; i < length; i++) {
      const value = this.parseValue(buffer, length, i, localRetEndpos2);
      if (this._error) {
        return null;
      }
      i = localRetEndpos2[0];
      if (value) {
        ret.add(value);
      }
      FOR_LOOP: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case ",":
            break FOR_LOOP;
          case "]":
            outEndPos[0] = i + 1;
            return ret;
          // 終了
          case "\n":
            ++this._lineCount;
          //case ' ': case '\t': case '\r':
          // falls through
          default:
            break;
        }
      }
    }
    ret = void 0;
    this._error = "illegal end of parseObject";
    return null;
  }
  _parseCallback = CubismJsonExtension.parseJsonObject;
  // パース時に使う処理のコールバック関数
  _error;
  // パース時のエラー
  _lineCount;
  // エラー報告に用いる行数カウント
  _root;
  // パースされたルート要素
};
var JsonFloat = class extends Value2 {
  /**
   * コンストラクタ
   */
  constructor(v) {
    super();
    this._value = v;
  }
  /**
   * Valueの種類が数値型ならtrue
   */
  isFloat() {
    return true;
  }
  /**
   * 要素を文字列で返す(string型)
   */
  getString(defaultValue, indent) {
    const strbuf = "\0";
    this._value = parseFloat(strbuf);
    this._stringBuffer = strbuf;
    return this._stringBuffer;
  }
  /**
   * 要素を数値型で返す(number)
   */
  toInt(defaultValue = 0) {
    return parseInt(this._value.toString());
  }
  /**
   * 要素を数値型で返す(number)
   */
  toFloat(defaultValue = 0) {
    return this._value;
  }
  equals(value) {
    if ("number" === typeof value) {
      if (Math.round(value)) {
        return false;
      } else {
        return value == this._value;
      }
    }
    return false;
  }
  _value;
  // JSON要素の値
};
var JsonBoolean = class extends Value2 {
  /**
   * Valueの種類が真偽値ならtrue
   */
  isBool() {
    return true;
  }
  /**
   * 要素を真偽値で返す(boolean)
   */
  toBoolean(defaultValue = false) {
    return this._boolValue;
  }
  /**
   * 要素を文字列で返す(string型)
   */
  getString(defaultValue, indent) {
    this._stringBuffer = this._boolValue ? "true" : "false";
    return this._stringBuffer;
  }
  equals(value) {
    if ("boolean" === typeof value) {
      return value == this._boolValue;
    }
    return false;
  }
  /**
   * Valueの値が静的ならtrue, 静的なら解放しない
   */
  isStatic() {
    return true;
  }
  /**
   * 引数付きコンストラクタ
   */
  constructor(v) {
    super();
    this._boolValue = v;
  }
  static trueValue;
  // true
  static falseValue;
  // false
  _boolValue;
  // JSON要素の値
};
var JsonString = class extends Value2 {
  /**
   * 引数付きコンストラクタ
   */
  constructor(s) {
    super();
    this._stringBuffer = s;
  }
  /**
   * Valueの種類が文字列ならtrue
   */
  isString() {
    return true;
  }
  /**
   * 要素を文字列で返す(string型)
   */
  getString(defaultValue, indent) {
    return this._stringBuffer;
  }
  equals(value) {
    if ("string" === typeof value) {
      return this._stringBuffer == value;
    }
    return false;
  }
};
var JsonError = class extends JsonString {
  /**
   * Valueの値が静的ならtrue、静的なら解放しない
   */
  isStatic() {
    return this._isStatic;
  }
  /**
   * エラー情報をセットする
   */
  setErrorNotForClientCall(s) {
    this._stringBuffer = s;
    return this;
  }
  /**
   * 引数付きコンストラクタ
   */
  constructor(s, isStatic) {
    if ("string" === typeof s) {
      super(s);
    } else {
      super(s);
    }
    this._isStatic = isStatic;
  }
  /**
   * Valueの種類がエラー値ならtrue
   */
  isError() {
    return true;
  }
  _isStatic;
  // 静的なValueかどうか
};
var JsonNullvalue = class extends Value2 {
  /**
   * Valueの種類がNULL値ならtrue
   */
  isNull() {
    return true;
  }
  /**
   * 要素を文字列で返す(string型)
   */
  getString(defaultValue, indent) {
    return this._stringBuffer;
  }
  /**
   * Valueの値が静的ならtrue, 静的なら解放しない
   */
  isStatic() {
    return true;
  }
  /**
   * Valueにエラー値をセットする
   */
  setErrorNotForClientCall(s) {
    this._stringBuffer = s;
    return JsonError.nullValue;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._stringBuffer = "NullValue";
  }
};
var JsonArray = class extends Value2 {
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._array = new Array();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (let i = 0; i < this._array.length; i++) {
      let v = this._array[i];
      if (v && !v.isStatic()) {
        v = void 0;
        v = null;
      }
    }
  }
  /**
   * Valueの種類が配列ならtrue
   */
  isArray() {
    return true;
  }
  /**
   * 添字演算子[index]
   */
  getValueByIndex(index) {
    if (index < 0 || this._array.length <= index) {
      return Value2.errorValue.setErrorNotForClientCall(
        CSM_JSON_ERROR_INDEX_OF_BOUNDS
      );
    }
    const v = this._array[index];
    if (v == null) {
      return Value2.nullValue;
    }
    return v;
  }
  /**
   * 添字演算子[string]
   */
  getValueByString(s) {
    return Value2.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * 要素を文字列で返す(string型)
   */
  getString(defaultValue, indent) {
    const stringBuffer = indent + "[\n";
    for (let i = 0; i < this._array.length; i++) {
      const v = this._array[i];
      this._stringBuffer += indent + "" + v.getString(indent + " ") + "\n";
    }
    this._stringBuffer = stringBuffer + indent + "]\n";
    return this._stringBuffer;
  }
  /**
   * 配列要素を追加する
   * @param v 追加する要素
   */
  add(v) {
    this._array.push(v);
  }
  /**
   * 要素をコンテナで返す(Array<Value>)
   */
  getVector(defaultValue = null) {
    return this._array;
  }
  /**
   * 要素の数を返す
   */
  getSize() {
    return this._array.length;
  }
  _array;
  // JSON要素の値
};
var JsonMap = class extends Value2 {
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._map = /* @__PURE__ */ new Map();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._map.clear();
  }
  /**
   * Valueの値がMap型ならtrue
   */
  isMap() {
    return true;
  }
  /**
   * 添字演算子[string]
   */
  getValueByString(s) {
    const ret = this._map.get(s);
    if (ret != void 0) {
      return ret;
    }
    return Value2.nullValue;
  }
  /**
   * 添字演算子[index]
   */
  getValueByIndex(index) {
    return Value2.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * 要素を文字列で返す(string型)
   */
  getString(defaultValue, indent) {
    this._stringBuffer = indent + "{\n";
    for (const element of this._map) {
      const key = element[0];
      const v = element[1];
      this._stringBuffer += indent + " " + key + " : " + v.getString(indent + "   ") + " \n";
    }
    this._stringBuffer += indent + "}\n";
    return this._stringBuffer;
  }
  /**
   * 要素をMap型で返す
   */
  getMap(defaultValue) {
    return this._map;
  }
  /**
   * Mapに要素を追加する
   */
  put(key, v) {
    this._map.set(key, v);
  }
  /**
   * Mapからキーのリストを取得する
   */
  getKeys() {
    if (!this._keys) {
      this._keys = [...this._map.keys()];
    }
    return this._keys;
  }
  /**
   * Mapの要素数を取得する
   */
  getSize() {
    return this._keys.length;
  }
  _map;
  // JSON要素の値
  _keys;
  // JSON要素の値
};
var Live2DCubismFramework9;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismJson = CubismJson;
  Live2DCubismFramework19.JsonArray = JsonArray;
  Live2DCubismFramework19.JsonBoolean = JsonBoolean;
  Live2DCubismFramework19.JsonError = JsonError;
  Live2DCubismFramework19.JsonFloat = JsonFloat;
  Live2DCubismFramework19.JsonMap = JsonMap;
  Live2DCubismFramework19.JsonNullvalue = JsonNullvalue;
  Live2DCubismFramework19.JsonString = JsonString;
  Live2DCubismFramework19.Value = Value2;
})(Live2DCubismFramework9 || (Live2DCubismFramework9 = {}));

// vendor/cubism-framework/src/live2dcubismframework.ts
function strtod(s, endPtr) {
  let index = 0;
  for (let i = 1; ; i++) {
    const testC = s.slice(i - 1, i);
    if (testC == "e" || testC == "-" || testC == "E") {
      continue;
    }
    const test = s.substring(0, i);
    const number = Number(test);
    if (isNaN(number)) {
      break;
    }
    index = i;
  }
  let d = parseFloat(s);
  if (isNaN(d)) {
    d = NaN;
  }
  endPtr[0] = s.slice(index);
  return d;
}
var s_isStarted = false;
var s_isInitialized = false;
var s_option = null;
var s_cubismIdManager = null;
var Constant = Object.freeze({
  vertexOffset: 0,
  // メッシュ頂点のオフセット値
  vertexStep: 2
  // メッシュ頂点のステップ値
});
function csmDelete(address) {
  if (!address) {
    return;
  }
  address = void 0;
}
var CubismFramework = class {
  /**
   * Cubism FrameworkのAPIを使用可能にする。
   *  APIを実行する前に必ずこの関数を実行すること。
   *  一度準備が完了して以降は、再び実行しても内部処理がスキップされます。
   *
   * @param    option      Optionクラスのインスタンス
   *
   * @return   準備処理が完了したらtrueが返ります。
   */
  static startUp(option = null) {
    if (s_isStarted) {
      CubismLogInfo("CubismFramework.startUp() is already done.");
      return s_isStarted;
    }
    s_option = option;
    if (s_option != null) {
      Live2DCubismCore.Logging.csmSetLogFunction(s_option.logFunction);
    }
    s_isStarted = true;
    if (s_isStarted) {
      const version = Live2DCubismCore.Version.csmGetVersion();
      const major = (version & 4278190080) >> 24;
      const minor = (version & 16711680) >> 16;
      const patch = version & 65535;
      const versionNumber = version;
      CubismLogInfo(
        `Live2D Cubism Core version: {0}.{1}.{2} ({3})`,
        ("00" + major).slice(-2),
        ("00" + minor).slice(-2),
        ("0000" + patch).slice(-4),
        versionNumber
      );
    }
    CubismLogInfo("CubismFramework.startUp() is complete.");
    return s_isStarted;
  }
  /**
   * StartUp()で初期化したCubismFrameworkの各パラメータをクリアします。
   * Dispose()したCubismFrameworkを再利用する際に利用してください。
   */
  static cleanUp() {
    s_isStarted = false;
    s_isInitialized = false;
    s_option = null;
    s_cubismIdManager = null;
  }
  /**
   * Cubism Framework内のリソースを初期化してモデルを表示可能な状態にします。<br>
   *     再度Initialize()するには先にDispose()を実行する必要があります。
   *
   * @param memorySize 初期化時メモリ量 [byte(s)]
   *    複数モデル表示時などにモデルが更新されない際に使用してください。
   *    指定する際は必ず1024*1024*16 byte(16MB)以上の値を指定してください。
   *    それ以外はすべて1024*1024*16 byteに丸めます。
   */
  static initialize(memorySize = 0) {
    CSM_ASSERT(s_isStarted);
    if (!s_isStarted) {
      CubismLogWarning("CubismFramework is not started.");
      return;
    }
    if (s_isInitialized) {
      CubismLogWarning(
        "CubismFramework.initialize() skipped, already initialized."
      );
      return;
    }
    Value2.staticInitializeNotForClientCall();
    s_cubismIdManager = new CubismIdManager();
    Live2DCubismCore.Memory.initializeAmountOfMemory(memorySize);
    s_isInitialized = true;
    CubismLogInfo("CubismFramework.initialize() is complete.");
  }
  /**
   * Cubism Framework内の全てのリソースを解放します。
   *      ただし、外部で確保されたリソースについては解放しません。
   *      外部で適切に破棄する必要があります。
   */
  static dispose() {
    CSM_ASSERT(s_isStarted);
    if (!s_isStarted) {
      CubismLogWarning("CubismFramework is not started.");
      return;
    }
    if (!s_isInitialized) {
      CubismLogWarning("CubismFramework.dispose() skipped, not initialized.");
      return;
    }
    Value2.staticReleaseNotForClientCall();
    s_cubismIdManager.release();
    s_cubismIdManager = null;
    CubismRenderer.staticRelease();
    s_isInitialized = false;
    CubismLogInfo("CubismFramework.dispose() is complete.");
  }
  /**
   * Cubism FrameworkのAPIを使用する準備が完了したかどうか
   * @return APIを使用する準備が完了していればtrueが返ります。
   */
  static isStarted() {
    return s_isStarted;
  }
  /**
   * Cubism Frameworkのリソース初期化がすでに行われているかどうか
   * @return リソース確保が完了していればtrueが返ります
   */
  static isInitialized() {
    return s_isInitialized;
  }
  /**
   * Core APIにバインドしたログ関数を実行する
   *
   * @praram message ログメッセージ
   */
  static coreLogFunction(message) {
    if (!Live2DCubismCore.Logging.csmGetLogFunction()) {
      return;
    }
    Live2DCubismCore.Logging.csmGetLogFunction()(message);
  }
  /**
   * 現在のログ出力レベル設定の値を返す。
   *
   * @return  現在のログ出力レベル設定の値
   */
  static getLoggingLevel() {
    if (s_option != null) {
      return s_option.loggingLevel;
    }
    return 5 /* LogLevel_Off */;
  }
  /**
   * IDマネージャのインスタンスを取得する
   * @return CubismManagerクラスのインスタンス
   */
  static getIdManager() {
    return s_cubismIdManager;
  }
  /**
   * 静的クラスとして使用する
   * インスタンス化させない
   */
  constructor() {
  }
};
var Live2DCubismFramework10;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.Constant = Constant;
  Live2DCubismFramework19.csmDelete = csmDelete;
  Live2DCubismFramework19.CubismFramework = CubismFramework;
})(Live2DCubismFramework10 || (Live2DCubismFramework10 = {}));

// vendor/cubism-framework/src/model/cubismmodelmultiplyandscreencolor.ts
var ColorData = class {
  constructor(isOverridden = false, color = new CubismTextureColor()) {
    this.isOverridden = isOverridden;
    this.color = color;
  }
  isOverridden;
  color;
};
var CubismModelMultiplyAndScreenColor = class {
  _model;
  // CubismModel
  _isOverriddenModelMultiplyColors;
  _isOverriddenModelScreenColors;
  _userPartScreenColors;
  _userPartMultiplyColors;
  _userDrawableScreenColors;
  _userDrawableMultiplyColors;
  _userOffscreenScreenColors;
  _userOffscreenMultiplyColors;
  /**
   * Constructor.
   *
   * @param model cubism model.
   */
  constructor(model) {
    this._model = model;
    this._isOverriddenModelMultiplyColors = false;
    this._isOverriddenModelScreenColors = false;
    this._userPartScreenColors = [];
    this._userPartMultiplyColors = [];
    this._userDrawableScreenColors = [];
    this._userDrawableMultiplyColors = [];
    this._userOffscreenScreenColors = [];
    this._userOffscreenMultiplyColors = [];
  }
  /**
   * Initialization for using multiply and screen colors.
   *
   * @param partCount number of parts.
   * @param drawableCount number of drawables.
   * @param offscreenCount number of offscreen.
   */
  initialize(partCount, drawableCount, offscreenCount) {
    const userMultiplyColor = new ColorData(
      false,
      new CubismTextureColor(1, 1, 1, 1)
    );
    const userScreenColor = new ColorData(
      false,
      new CubismTextureColor(0, 0, 0, 1)
    );
    this._userPartMultiplyColors = new Array(partCount);
    this._userPartScreenColors = new Array(partCount);
    for (let i = 0; i < partCount; i++) {
      this._userPartMultiplyColors[i] = new ColorData(
        userMultiplyColor.isOverridden,
        new CubismTextureColor(
          userMultiplyColor.color.r,
          userMultiplyColor.color.g,
          userMultiplyColor.color.b,
          userMultiplyColor.color.a
        )
      );
      this._userPartScreenColors[i] = new ColorData(
        userScreenColor.isOverridden,
        new CubismTextureColor(
          userScreenColor.color.r,
          userScreenColor.color.g,
          userScreenColor.color.b,
          userScreenColor.color.a
        )
      );
    }
    this._userDrawableMultiplyColors = new Array(drawableCount);
    this._userDrawableScreenColors = new Array(drawableCount);
    for (let i = 0; i < drawableCount; i++) {
      this._userDrawableMultiplyColors[i] = new ColorData(
        userMultiplyColor.isOverridden,
        new CubismTextureColor(
          userMultiplyColor.color.r,
          userMultiplyColor.color.g,
          userMultiplyColor.color.b,
          userMultiplyColor.color.a
        )
      );
      this._userDrawableScreenColors[i] = new ColorData(
        userScreenColor.isOverridden,
        new CubismTextureColor(
          userScreenColor.color.r,
          userScreenColor.color.g,
          userScreenColor.color.b,
          userScreenColor.color.a
        )
      );
    }
    this._userOffscreenMultiplyColors = new Array(offscreenCount);
    this._userOffscreenScreenColors = new Array(offscreenCount);
    for (let i = 0; i < offscreenCount; i++) {
      this._userOffscreenMultiplyColors[i] = new ColorData(
        userMultiplyColor.isOverridden,
        new CubismTextureColor(
          userMultiplyColor.color.r,
          userMultiplyColor.color.g,
          userMultiplyColor.color.b,
          userMultiplyColor.color.a
        )
      );
      this._userOffscreenScreenColors[i] = new ColorData(
        userScreenColor.isOverridden,
        new CubismTextureColor(
          userScreenColor.color.r,
          userScreenColor.color.g,
          userScreenColor.color.b,
          userScreenColor.color.a
        )
      );
    }
  }
  /**
   * Outputs a warning message for index out of range errors.
   *
   * @param functionName Name of the calling function
   * @param index The invalid index value
   * @param maxIndex The maximum valid index (length - 1)
   */
  warnIndexOutOfRange(functionName, index, maxIndex) {
    CubismLogWarning(
      `${functionName}: index is out of range. index=${index}, valid range=[0, ${maxIndex}].`
    );
  }
  /**
   * Validates if the given part index is within valid range.
   *
   * @param index Part index to validate
   * @param functionName Name of the calling function for error reporting
   * @return true if the index is valid; otherwise false
   */
  isValidPartIndex(index, functionName) {
    if (index < 0 || index >= this._model.getPartCount()) {
      this.warnIndexOutOfRange(
        functionName,
        index,
        this._model.getPartCount() - 1
      );
      return false;
    }
    return true;
  }
  /**
   * Validates if the given drawable index is within valid range.
   *
   * @param index Drawable index to validate
   * @param functionName Name of the calling function for error reporting
   * @return true if the index is valid; otherwise false
   */
  isValidDrawableIndex(index, functionName) {
    if (index < 0 || index >= this._model.getDrawableCount()) {
      this.warnIndexOutOfRange(
        functionName,
        index,
        this._model.getDrawableCount() - 1
      );
      return false;
    }
    return true;
  }
  /**
   * Validates if the given offscreen index is within valid range.
   *
   * @param index Offscreen index to validate
   * @param functionName Name of the calling function for error reporting
   * @return true if the index is valid; otherwise false
   */
  isValidOffscreenIndex(index, functionName) {
    if (index < 0 || index >= this._model.getOffscreenCount()) {
      this.warnIndexOutOfRange(
        functionName,
        index,
        this._model.getOffscreenCount() - 1
      );
      return false;
    }
    return true;
  }
  /**
   * Sets the flag indicating whether the color set at runtime is used as the multiply color for the entire model during rendering.
   *
   * @param value true if the color set at runtime is to be used; otherwise false.
   */
  setMultiplyColorEnabled(value) {
    this._isOverriddenModelMultiplyColors = value;
  }
  /**
   * Returns the flag indicating whether the color set at runtime is used as the multiply color for the entire model during rendering.
   *
   * @return true if the color set at runtime is used; otherwise false.
   */
  getMultiplyColorEnabled() {
    return this._isOverriddenModelMultiplyColors;
  }
  /**
   * Sets the flag indicating whether the color set at runtime is used as the screen color for the entire model during rendering.
   *
   * @param value true if the color set at runtime is to be used; otherwise false.
   */
  setScreenColorEnabled(value) {
    this._isOverriddenModelScreenColors = value;
  }
  /**
   * Returns the flag indicating whether the color set at runtime is used as the screen color for the entire model during rendering.
   *
   * @return true if the color set at runtime is used; otherwise false.
   */
  getScreenColorEnabled() {
    return this._isOverriddenModelScreenColors;
  }
  /**
   * Sets whether the part multiply color is overridden by the SDK.
   * Use true to use the color information from the SDK, or false to use the color information from the model.
   *
   * @param partIndex Part index
   * @param value true enable override, false to disable
   */
  setPartMultiplyColorEnabled(partIndex, value) {
    if (!this.isValidPartIndex(partIndex, "setPartMultiplyColorEnabled")) {
      return;
    }
    this.setPartColorEnabled(
      partIndex,
      value,
      this._userPartMultiplyColors,
      this._userDrawableMultiplyColors,
      this._userOffscreenMultiplyColors
    );
  }
  /**
   * Checks whether the part multiply color is overridden by the SDK.
   *
   * @param partIndex Part index
   *
   * @return true if the color information from the SDK is used; otherwise false.
   */
  getPartMultiplyColorEnabled(partIndex) {
    if (!this.isValidPartIndex(partIndex, "getPartMultiplyColorEnabled")) {
      return false;
    }
    return this._userPartMultiplyColors[partIndex].isOverridden;
  }
  /**
   * Sets whether the part screen color is overridden by the SDK.
   * Use true to use the color information from the SDK, or false to use the color information from the model.
   *
   * @param partIndex Part index
   * @param value true enable override, false to disable
   */
  setPartScreenColorEnabled(partIndex, value) {
    if (!this.isValidPartIndex(partIndex, "setPartScreenColorEnabled")) {
      return;
    }
    this.setPartColorEnabled(
      partIndex,
      value,
      this._userPartScreenColors,
      this._userDrawableScreenColors,
      this._userOffscreenScreenColors
    );
  }
  /**
   * Checks whether the part screen color is overridden by the SDK.
   *
   * @param partIndex Part index
   *
   * @return true if the color information from the SDK is used; otherwise false.
   */
  getPartScreenColorEnabled(partIndex) {
    if (!this.isValidPartIndex(partIndex, "getPartScreenColorEnabled")) {
      return false;
    }
    return this._userPartScreenColors[partIndex].isOverridden;
  }
  /**
   * Sets the multiply color of the part.
   *
   * @param partIndex Part index
   * @param color Multiply color to be set (CubismTextureColor)
   */
  setPartMultiplyColorByTextureColor(partIndex, color) {
    if (!this.isValidPartIndex(partIndex, "setPartMultiplyColorByTextureColor")) {
      return;
    }
    this.setPartMultiplyColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * Sets the multiply color of the part.
   *
   * @param partIndex Part index
   * @param r Red value of the multiply color to be set
   * @param g Green value of the multiply color to be set
   * @param b Blue value of the multiply color to be set
   * @param a Alpha value of the multiply color to be set
   */
  setPartMultiplyColorByRGBA(partIndex, r, g, b, a = 1) {
    if (!this.isValidPartIndex(partIndex, "setPartMultiplyColorByRGBA")) {
      return;
    }
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartMultiplyColors,
      this._userDrawableMultiplyColors,
      this._userOffscreenMultiplyColors
    );
  }
  /**
   * Returns the multiply color of the part.
   *
   * @param partIndex Part index
   *
   * @return Multiply color (CubismTextureColor)
   */
  getPartMultiplyColor(partIndex) {
    if (!this.isValidPartIndex(partIndex, "getPartMultiplyColor")) {
      return new CubismTextureColor(1, 1, 1, 1);
    }
    return this._userPartMultiplyColors[partIndex].color;
  }
  /**
   * Sets the screen color of the part.
   *
   * @param partIndex Part index
   * @param color Screen color to be set (CubismTextureColor)
   */
  setPartScreenColorByTextureColor(partIndex, color) {
    if (!this.isValidPartIndex(partIndex, "setPartScreenColorByTextureColor")) {
      return;
    }
    this.setPartScreenColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * Sets the screen color of the part.
   *
   * @param partIndex Part index
   * @param r Red value of the screen color to be set
   * @param g Green value of the screen color to be set
   * @param b Blue value of the screen color to be set
   * @param a Alpha value of the screen color to be set
   */
  setPartScreenColorByRGBA(partIndex, r, g, b, a = 1) {
    if (!this.isValidPartIndex(partIndex, "setPartScreenColorByRGBA")) {
      return;
    }
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartScreenColors,
      this._userDrawableScreenColors,
      this._userOffscreenScreenColors
    );
  }
  /**
   * Returns the screen color of the part.
   *
   * @param partIndex Part index
   *
   * @return Screen color (CubismTextureColor)
   */
  getPartScreenColor(partIndex) {
    if (!this.isValidPartIndex(partIndex, "getPartScreenColor")) {
      return new CubismTextureColor(0, 0, 0, 1);
    }
    return this._userPartScreenColors[partIndex].color;
  }
  /**
   * Sets the flag indicating whether the color set at runtime is used as the multiply color for the drawable during rendering.
   *
   * @param drawableIndex Drawable index
   * @param value true if the color set at runtime is to be used; otherwise false.
   */
  setDrawableMultiplyColorEnabled(drawableIndex, value) {
    if (!this.isValidDrawableIndex(
      drawableIndex,
      "setDrawableMultiplyColorEnabled"
    )) {
      return;
    }
    this._userDrawableMultiplyColors[drawableIndex].isOverridden = value;
  }
  /**
   * Returns the flag indicating whether the color set at runtime is used as the multiply color for the drawable during rendering.
   *
   * @param drawableIndex Drawable index
   *
   * @return true if the color set at runtime is used; otherwise false.
   */
  getDrawableMultiplyColorEnabled(drawableIndex) {
    if (!this.isValidDrawableIndex(
      drawableIndex,
      "getDrawableMultiplyColorEnabled"
    )) {
      return false;
    }
    return this._userDrawableMultiplyColors[drawableIndex].isOverridden;
  }
  /**
   * Sets the flag indicating whether the color set at runtime is used as the screen color for the drawable during rendering.
   *
   * @param drawableIndex Drawable index
   * @param value true if the color set at runtime is to be used; otherwise false.
   */
  setDrawableScreenColorEnabled(drawableIndex, value) {
    if (!this.isValidDrawableIndex(drawableIndex, "setDrawableScreenColorEnabled")) {
      return;
    }
    this._userDrawableScreenColors[drawableIndex].isOverridden = value;
  }
  /**
   * Returns the flag indicating whether the color set at runtime is used as the screen color for the drawable during rendering.
   *
   * @param drawableIndex Drawable index
   *
   * @return true if the color set at runtime is used; otherwise false.
   */
  getDrawableScreenColorEnabled(drawableIndex) {
    if (!this.isValidDrawableIndex(drawableIndex, "getDrawableScreenColorEnabled")) {
      return false;
    }
    return this._userDrawableScreenColors[drawableIndex].isOverridden;
  }
  /**
   * Sets the multiply color of the drawable.
   *
   * @param drawableIndex Drawable index
   * @param color Multiply color to be set (CubismTextureColor)
   */
  setDrawableMultiplyColorByTextureColor(drawableIndex, color) {
    if (!this.isValidDrawableIndex(
      drawableIndex,
      "setDrawableMultiplyColorByTextureColor"
    )) {
      return;
    }
    this.setDrawableMultiplyColorByRGBA(
      drawableIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * Sets the multiply color of the drawable.
   *
   * @param drawableIndex Drawable index
   * @param r Red value of the multiply color to be set
   * @param g Green value of the multiply color to be set
   * @param b Blue value of the multiply color to be set
   * @param a Alpha value of the multiply color to be set
   */
  setDrawableMultiplyColorByRGBA(drawableIndex, r, g, b, a = 1) {
    if (!this.isValidDrawableIndex(
      drawableIndex,
      "setDrawableMultiplyColorByRGBA"
    )) {
      return;
    }
    this._userDrawableMultiplyColors[drawableIndex].color.r = r;
    this._userDrawableMultiplyColors[drawableIndex].color.g = g;
    this._userDrawableMultiplyColors[drawableIndex].color.b = b;
    this._userDrawableMultiplyColors[drawableIndex].color.a = a;
  }
  /**
   * Returns the multiply color from the list of drawables.
   *
   * @param drawableIndex Drawable index
   *
   * @return Multiply color (CubismTextureColor)
   */
  getDrawableMultiplyColor(drawableIndex) {
    if (!this.isValidDrawableIndex(drawableIndex, "getDrawableMultiplyColor")) {
      return new CubismTextureColor(1, 1, 1, 1);
    }
    if (this.getMultiplyColorEnabled() || this.getDrawableMultiplyColorEnabled(drawableIndex)) {
      return this._userDrawableMultiplyColors[drawableIndex].color;
    }
    return this._model.getDrawableMultiplyColor(drawableIndex);
  }
  /**
   * Sets the screen color of the drawable.
   *
   * @param drawableIndex Drawable index
   * @param color Screen color to be set (CubismTextureColor)
   */
  setDrawableScreenColorByTextureColor(drawableIndex, color) {
    if (!this.isValidDrawableIndex(
      drawableIndex,
      "setDrawableScreenColorByTextureColor"
    )) {
      return;
    }
    this.setDrawableScreenColorByRGBA(
      drawableIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * Sets the screen color of the drawable.
   *
   * @param drawableIndex Drawable index
   * @param r Red value of the screen color to be set
   * @param g Green value of the screen color to be set
   * @param b Blue value of the screen color to be set
   * @param a Alpha value of the screen color to be set
   */
  setDrawableScreenColorByRGBA(drawableIndex, r, g, b, a = 1) {
    if (!this.isValidDrawableIndex(drawableIndex, "setDrawableScreenColorByRGBA")) {
      return;
    }
    this._userDrawableScreenColors[drawableIndex].color.r = r;
    this._userDrawableScreenColors[drawableIndex].color.g = g;
    this._userDrawableScreenColors[drawableIndex].color.b = b;
    this._userDrawableScreenColors[drawableIndex].color.a = a;
  }
  /**
   * Returns the screen color from the list of drawables.
   *
   * @param drawableIndex Drawable index
   *
   * @return Screen color (CubismTextureColor)
   */
  getDrawableScreenColor(drawableIndex) {
    if (!this.isValidDrawableIndex(drawableIndex, "getDrawableScreenColor")) {
      return new CubismTextureColor(0, 0, 0, 1);
    }
    if (this.getScreenColorEnabled() || this.getDrawableScreenColorEnabled(drawableIndex)) {
      return this._userDrawableScreenColors[drawableIndex].color;
    }
    return this._model.getDrawableScreenColor(drawableIndex);
  }
  /**
   * Sets whether the offscreen multiply color is overridden by the SDK.
   * Use true to use the color information from the SDK, or false to use the color information from the model.
   *
   * @param offscreenIndex Offscreen index
   * @param value true enable override, false to disable
   */
  setOffscreenMultiplyColorEnabled(offscreenIndex, value) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "setOffscreenMultiplyColorEnabled"
    )) {
      return;
    }
    this._userOffscreenMultiplyColors[offscreenIndex].isOverridden = value;
  }
  /**
   * Checks whether the offscreen multiply color is overridden by the SDK.
   *
   * @param offscreenIndex Offscreen index
   *
   * @return true if the color information from the SDK is used; otherwise false.
   */
  getOffscreenMultiplyColorEnabled(offscreenIndex) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "getOffscreenMultiplyColorEnabled"
    )) {
      return false;
    }
    return this._userOffscreenMultiplyColors[offscreenIndex].isOverridden;
  }
  /**
   * Sets whether the offscreen screen color is overridden by the SDK.
   * Use true to use the color information from the SDK, or false to use the color information from the model.
   *
   * @param offscreenIndex Offscreen index
   * @param value true enable override, false to disable
   */
  setOffscreenScreenColorEnabled(offscreenIndex, value) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "setOffscreenScreenColorEnabled"
    )) {
      return;
    }
    this._userOffscreenScreenColors[offscreenIndex].isOverridden = value;
  }
  /**
   * Checks whether the offscreen screen color is overridden by the SDK.
   *
   * @param offscreenIndex Offscreen index
   *
   * @return true if the color information from the SDK is used; otherwise false.
   */
  getOffscreenScreenColorEnabled(offscreenIndex) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "getOffscreenScreenColorEnabled"
    )) {
      return false;
    }
    return this._userOffscreenScreenColors[offscreenIndex].isOverridden;
  }
  /**
   * Sets the multiply color of the offscreen.
   *
   * @param offscreenIndex Offsscreen index
   * @param color Multiply color to be set (CubismTextureColor)
   */
  setOffscreenMultiplyColorByTextureColor(offscreenIndex, color) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "setOffscreenMultiplyColorByTextureColor"
    )) {
      return;
    }
    this.setOffscreenMultiplyColorByRGBA(
      offscreenIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * Sets the multiply color of the offscreen.
   *
   * @param offscreenIndex Offsscreen index
   * @param r Red value of the multiply color to be set
   * @param g Green value of the multiply color to be set
   * @param b Blue value of the multiply color to be set
   * @param a Alpha value of the multiply color to be set
   */
  setOffscreenMultiplyColorByRGBA(offscreenIndex, r, g, b, a = 1) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "setOffscreenMultiplyColorByRGBA"
    )) {
      return;
    }
    this._userOffscreenMultiplyColors[offscreenIndex].color.r = r;
    this._userOffscreenMultiplyColors[offscreenIndex].color.g = g;
    this._userOffscreenMultiplyColors[offscreenIndex].color.b = b;
    this._userOffscreenMultiplyColors[offscreenIndex].color.a = a;
  }
  /**
   * Returns the multiply color from the list of offscreen.
   *
   * @param offscreenIndex Offsscreen index
   *
   * @return Multiply color (CubismTextureColor)
   */
  getOffscreenMultiplyColor(offscreenIndex) {
    if (!this.isValidOffscreenIndex(offscreenIndex, "getOffscreenMultiplyColor")) {
      return new CubismTextureColor(1, 1, 1, 1);
    }
    if (this.getMultiplyColorEnabled() || this.getOffscreenMultiplyColorEnabled(offscreenIndex)) {
      return this._userOffscreenMultiplyColors[offscreenIndex].color;
    }
    return this._model.getOffscreenMultiplyColor(offscreenIndex);
  }
  /**
   * Sets the screen color of the offscreen.
   *
   * @param offscreenIndex Offsscreen index
   * @param color Screen color to be set (CubismTextureColor)
   */
  setOffscreenScreenColorByTextureColor(offscreenIndex, color) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "setOffscreenScreenColorByTextureColor"
    )) {
      return;
    }
    this.setOffscreenScreenColorByRGBA(
      offscreenIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * Sets the screen color of the offscreen.
   *
   * @param offscreenIndex Offsscreen index
   * @param r Red value of the screen color to be set
   * @param g Green value of the screen color to be set
   * @param b Blue value of the screen color to be set
   * @param a Alpha value of the screen color to be set
   */
  setOffscreenScreenColorByRGBA(offscreenIndex, r, g, b, a = 1) {
    if (!this.isValidOffscreenIndex(
      offscreenIndex,
      "setOffscreenScreenColorByRGBA"
    )) {
      return;
    }
    this._userOffscreenScreenColors[offscreenIndex].color.r = r;
    this._userOffscreenScreenColors[offscreenIndex].color.g = g;
    this._userOffscreenScreenColors[offscreenIndex].color.b = b;
    this._userOffscreenScreenColors[offscreenIndex].color.a = a;
  }
  /**
   * Returns the screen color from the list of offscreen.
   *
   * @param offscreenIndex Offsscreen index
   *
   * @return Screen color (CubismTextureColor)
   */
  getOffscreenScreenColor(offscreenIndex) {
    if (!this.isValidOffscreenIndex(offscreenIndex, "getOffscreenScreenColor")) {
      return new CubismTextureColor(0, 0, 0, 1);
    }
    if (this.getScreenColorEnabled() || this.getOffscreenScreenColorEnabled(offscreenIndex)) {
      return this._userOffscreenScreenColors[offscreenIndex].color;
    }
    return this._model.getOffscreenScreenColor(offscreenIndex);
  }
  /**
   * Sets the part color with hierarchical propagation (internal method)
   */
  setPartColor(partIndex, r, g, b, a, partColors, drawableColors, offscreenColors) {
    partColors[partIndex].color.r = r;
    partColors[partIndex].color.g = g;
    partColors[partIndex].color.b = b;
    partColors[partIndex].color.a = a;
    if (partColors[partIndex].isOverridden) {
      const offscreenIndices = this._model.getPartOffscreenIndices();
      const offscreenIndex = offscreenIndices[partIndex];
      if (offscreenIndex == NoOffscreenIndex) {
        const partsHierarchy = this._model.getPartsHierarchy();
        if (partsHierarchy && partsHierarchy[partIndex]) {
          for (let i = 0; i < partsHierarchy[partIndex].objects.length; ++i) {
            const objectInfo = partsHierarchy[partIndex].objects[i];
            if (objectInfo.objectType === 0 /* CubismModelObjectType_Drawable */) {
              const drawableIndex = objectInfo.objectIndex;
              drawableColors[drawableIndex].color.r = r;
              drawableColors[drawableIndex].color.g = g;
              drawableColors[drawableIndex].color.b = b;
              drawableColors[drawableIndex].color.a = a;
            } else {
              const childPartIndex = objectInfo.objectIndex;
              this.setPartColor(
                childPartIndex,
                r,
                g,
                b,
                a,
                partColors,
                drawableColors,
                offscreenColors
              );
            }
          }
        }
      } else {
        offscreenColors[offscreenIndex].color.r = r;
        offscreenColors[offscreenIndex].color.g = g;
        offscreenColors[offscreenIndex].color.b = b;
        offscreenColors[offscreenIndex].color.a = a;
      }
    }
  }
  /**
   * Sets the part color enabled flag with hierarchical propagation (internal method)
   */
  setPartColorEnabled(partIndex, value, partColors, drawableColors, offscreenColors) {
    partColors[partIndex].isOverridden = value;
    const offscreenIndices = this._model.getPartOffscreenIndices();
    const offscreenIndex = offscreenIndices[partIndex];
    if (offscreenIndex == NoOffscreenIndex) {
      const partsHierarchy = this._model.getPartsHierarchy();
      if (partsHierarchy && partsHierarchy[partIndex]) {
        for (let i = 0; i < partsHierarchy[partIndex].objects.length; ++i) {
          const objectInfo = partsHierarchy[partIndex].objects[i];
          if (objectInfo.objectType === 0 /* CubismModelObjectType_Drawable */) {
            const drawableIndex = objectInfo.objectIndex;
            drawableColors[drawableIndex].isOverridden = value;
            if (value) {
              drawableColors[drawableIndex].color.r = partColors[partIndex].color.r;
              drawableColors[drawableIndex].color.g = partColors[partIndex].color.g;
              drawableColors[drawableIndex].color.b = partColors[partIndex].color.b;
              drawableColors[drawableIndex].color.a = partColors[partIndex].color.a;
            }
          } else {
            const childPartIndex = objectInfo.objectIndex;
            if (value) {
              partColors[childPartIndex].color.r = partColors[partIndex].color.r;
              partColors[childPartIndex].color.g = partColors[partIndex].color.g;
              partColors[childPartIndex].color.b = partColors[partIndex].color.b;
              partColors[childPartIndex].color.a = partColors[partIndex].color.a;
            }
            this.setPartColorEnabled(
              childPartIndex,
              value,
              partColors,
              drawableColors,
              offscreenColors
            );
          }
        }
      }
    } else {
      offscreenColors[offscreenIndex].isOverridden = value;
      if (value) {
        offscreenColors[offscreenIndex].color.r = partColors[partIndex].color.r;
        offscreenColors[offscreenIndex].color.g = partColors[partIndex].color.g;
        offscreenColors[offscreenIndex].color.b = partColors[partIndex].color.b;
        offscreenColors[offscreenIndex].color.a = partColors[partIndex].color.a;
      }
    }
  }
};

// vendor/cubism-framework/src/model/cubismmodel.ts
var NoParentIndex = -1;
var NoOffscreenIndex = -1;
var CubismColorBlend = ((CubismColorBlend2) => {
  CubismColorBlend2[CubismColorBlend2["ColorBlend_None"] = -1] = "ColorBlend_None";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Normal"] = Live2DCubismCore.ColorBlendType_Normal] = "ColorBlend_Normal";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_AddGlow"] = Live2DCubismCore.ColorBlendType_AddGlow] = "ColorBlend_AddGlow";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Add"] = Live2DCubismCore.ColorBlendType_Add] = "ColorBlend_Add";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Darken"] = Live2DCubismCore.ColorBlendType_Darken] = "ColorBlend_Darken";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Multiply"] = Live2DCubismCore.ColorBlendType_Multiply] = "ColorBlend_Multiply";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_ColorBurn"] = Live2DCubismCore.ColorBlendType_ColorBurn] = "ColorBlend_ColorBurn";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_LinearBurn"] = Live2DCubismCore.ColorBlendType_LinearBurn] = "ColorBlend_LinearBurn";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Lighten"] = Live2DCubismCore.ColorBlendType_Lighten] = "ColorBlend_Lighten";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Screen"] = Live2DCubismCore.ColorBlendType_Screen] = "ColorBlend_Screen";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_ColorDodge"] = Live2DCubismCore.ColorBlendType_ColorDodge] = "ColorBlend_ColorDodge";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Overlay"] = Live2DCubismCore.ColorBlendType_Overlay] = "ColorBlend_Overlay";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_SoftLight"] = Live2DCubismCore.ColorBlendType_SoftLight] = "ColorBlend_SoftLight";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_HardLight"] = Live2DCubismCore.ColorBlendType_HardLight] = "ColorBlend_HardLight";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_LinearLight"] = Live2DCubismCore.ColorBlendType_LinearLight] = "ColorBlend_LinearLight";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Hue"] = Live2DCubismCore.ColorBlendType_Hue] = "ColorBlend_Hue";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_Color"] = Live2DCubismCore.ColorBlendType_Color] = "ColorBlend_Color";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_AddCompatible"] = Live2DCubismCore.ColorBlendType_AddCompatible] = "ColorBlend_AddCompatible";
  CubismColorBlend2[CubismColorBlend2["ColorBlend_MultiplyCompatible"] = Live2DCubismCore.ColorBlendType_MultiplyCompatible] = "ColorBlend_MultiplyCompatible";
  return CubismColorBlend2;
})(CubismColorBlend || {});
var CubismAlphaBlend = /* @__PURE__ */ ((CubismAlphaBlend2) => {
  CubismAlphaBlend2[CubismAlphaBlend2["AlphaBlend_None"] = -1] = "AlphaBlend_None";
  CubismAlphaBlend2[CubismAlphaBlend2["AlphaBlend_Over"] = 0] = "AlphaBlend_Over";
  CubismAlphaBlend2[CubismAlphaBlend2["AlphaBlend_Atop"] = 1] = "AlphaBlend_Atop";
  CubismAlphaBlend2[CubismAlphaBlend2["AlphaBlend_Out"] = 2] = "AlphaBlend_Out";
  CubismAlphaBlend2[CubismAlphaBlend2["AlphaBlend_ConjointOver"] = 3] = "AlphaBlend_ConjointOver";
  CubismAlphaBlend2[CubismAlphaBlend2["AlphaBlend_DisjointOver"] = 4] = "AlphaBlend_DisjointOver";
  return CubismAlphaBlend2;
})(CubismAlphaBlend || {});
var ParameterRepeatData = class {
  /**
   * Constructor
   *
   * @param isOverridden whether to be overriden
   * @param isParameterRepeated override flag for settings
   */
  constructor(isOverridden = false, isParameterRepeated = false) {
    this.isOverridden = isOverridden;
    this.isParameterRepeated = isParameterRepeated;
  }
  /**
   * Whether to be overridden
   */
  isOverridden;
  /**
   * Override flag for settings
   */
  isParameterRepeated;
};
var CullingData = class {
  /**
   * コンストラクタ
   *
   * @param isOverridden
   * @param isCulling
   */
  constructor(isOverridden = false, isCulling = false) {
    this.isOverridden = isOverridden;
    this.isCulling = isCulling;
  }
  isOverridden;
  isCulling;
};
var PartChildDrawObjects = class {
  drawableIndices;
  offscreenIndices;
  constructor(drawableIndices = new Array(), offscreenIndices = new Array()) {
    this.drawableIndices = drawableIndices;
    this.offscreenIndices = offscreenIndices;
  }
};
var CubismModelObjectInfo = class {
  objectType;
  // オブジェクトのタイプ (Drawable / Parts)
  objectIndex;
  // オブジェクトインデックス
  constructor(objectIndex, objectType) {
    this.objectIndex = objectIndex;
    this.objectType = objectType;
  }
};
var CubismModelPartInfo = class {
  objects;
  childDrawObjects;
  constructor(objects = new Array(), childDrawObjects = new PartChildDrawObjects()) {
    this.objects = objects;
    this.childDrawObjects = childDrawObjects;
  }
  // 子オブジェクト数を返す関数
  getChildObjectCount() {
    return this.objects.length;
  }
};
var CubismModel = class {
  /**
   * モデルのパラメータの更新
   */
  update() {
    this._model.update();
    this._model.drawables.resetDynamicFlags();
  }
  /**
   * PixelsPerUnitを取得する
   * @return PixelsPerUnit
   */
  getPixelsPerUnit() {
    if (this._model == null) {
      return 0;
    }
    return this._model.canvasinfo.PixelsPerUnit;
  }
  /**
   * キャンバスの幅を取得する
   */
  getCanvasWidth() {
    if (this._model == null) {
      return 0;
    }
    return this._model.canvasinfo.CanvasWidth / this._model.canvasinfo.PixelsPerUnit;
  }
  /**
   * キャンバスの高さを取得する
   */
  getCanvasHeight() {
    if (this._model == null) {
      return 0;
    }
    return this._model.canvasinfo.CanvasHeight / this._model.canvasinfo.PixelsPerUnit;
  }
  /**
   * パラメータを保存する
   */
  saveParameters() {
    const parameterCount = this._model.parameters.count;
    const savedParameterCount = this._savedParameters.length;
    for (let i = 0; i < parameterCount; ++i) {
      if (i < savedParameterCount) {
        this._savedParameters[i] = this._parameterValues[i];
      } else {
        this._savedParameters.push(this._parameterValues[i]);
      }
    }
  }
  /**
   * 乗算色・スクリーン色管理クラスを取得する
   *
   * @return CubismModelMultiplyAndScreenColorのインスタンス
   */
  getOverrideMultiplyAndScreenColor() {
    return this._overrideMultiplyAndScreenColor;
  }
  /**
   * Checks whether parameter repetition is performed for the entire model.
   *
   * @return true if parameter repetition is performed for the entire model; otherwise returns false.
   */
  getOverrideFlagForModelParameterRepeat() {
    return this._isOverriddenParameterRepeat;
  }
  /**
   * Sets whether parameter repetition is performed for the entire model.
   * Use true to perform parameter repetition for the entire model, or false to not perform it.
   */
  setOverrideFlagForModelParameterRepeat(isRepeat) {
    this._isOverriddenParameterRepeat = isRepeat;
  }
  /**
   * Returns the flag indicating whether to override the parameter repeat.
   *
   * @param parameterIndex Parameter index
   *
   * @return true if the parameter repeat is overridden, false otherwise.
   */
  getOverrideFlagForParameterRepeat(parameterIndex) {
    return this._userParameterRepeatDataList[parameterIndex].isOverridden;
  }
  /**
   * Sets the flag indicating whether to override the parameter repeat.
   *
   * @param parameterIndex Parameter index
   * @param value true if it is to be overridden; otherwise, false.
   */
  setOverrideFlagForParameterRepeat(parameterIndex, value) {
    this._userParameterRepeatDataList[parameterIndex].isOverridden = value;
  }
  /**
   * Returns the repeat flag.
   *
   * @param parameterIndex Parameter index
   *
   * @return true if repeating, false otherwise.
   */
  getRepeatFlagForParameterRepeat(parameterIndex) {
    return this._userParameterRepeatDataList[parameterIndex].isParameterRepeated;
  }
  /**
   * Sets the repeat flag.
   *
   * @param parameterIndex Parameter index
   * @param value true to enable repeating, false otherwise.
   */
  setRepeatFlagForParameterRepeat(parameterIndex, value) {
    this._userParameterRepeatDataList[parameterIndex].isParameterRepeated = value;
  }
  /**
   * Drawableのカリング情報を取得する。
   *
   * @param   drawableIndex   Drawableのインデックス
   *
   * @return  Drawableのカリング情報
   */
  getDrawableCulling(drawableIndex) {
    if (this.getOverrideFlagForModelCullings() || this.getOverrideFlagForDrawableCullings(drawableIndex)) {
      return this._userDrawableCullings[drawableIndex].isCulling;
    }
    const constantFlags = this._model.drawables.constantFlags;
    return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(
      constantFlags[drawableIndex]
    );
  }
  /**
   * Drawableのカリング情報を設定する。
   *
   * @param drawableIndex Drawableのインデックス
   * @param isCulling カリング情報
   */
  setDrawableCulling(drawableIndex, isCulling) {
    this._userDrawableCullings[drawableIndex].isCulling = isCulling;
  }
  /**
   * Offscreenのカリング情報を取得する。
   *
   * @param   offscreenIndex   Offscreenのインデックス
   *
   * @return  Offscreenのカリング情報
   */
  getOffscreenCulling(offscreenIndex) {
    if (this.getOverrideFlagForModelCullings() || this.getOverrideFlagForOffscreenCullings(offscreenIndex)) {
      return this._userOffscreenCullings[offscreenIndex].isCulling;
    }
    const constantFlags = this._model.offscreens.constantFlags;
    return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(
      constantFlags[offscreenIndex]
    );
  }
  /**
   * Offscreenのカリング設定を設定する。
   *
   * @param offscreenIndex Offscreenのインデックス
   * @param isCulling カリング情報
   */
  setOffscreenCulling(offscreenIndex, isCulling) {
    this._userOffscreenCullings[offscreenIndex].isCulling = isCulling;
  }
  /**
   * SDKからモデル全体のカリング設定を上書きするか。
   *
   * @return  true    ->  SDK上のカリング設定を使用
   *          false   ->  モデルのカリング設定を使用
   */
  getOverrideFlagForModelCullings() {
    return this._isOverriddenCullings;
  }
  /**
   * SDKからモデル全体のカリング設定を上書きするかを設定する。
   *
   * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  setOverrideFlagForModelCullings(isOverriddenCullings) {
    this._isOverriddenCullings = isOverriddenCullings;
  }
  /**
   *
   * @param drawableIndex Drawableのインデックス
   * @return  true    ->  SDK上のカリング設定を使用
   *          false   ->  モデルのカリング設定を使用
   */
  getOverrideFlagForDrawableCullings(drawableIndex) {
    return this._userDrawableCullings[drawableIndex].isOverridden;
  }
  /**
   * @param offscreenIndex Offscreenのインデックス
   * @return  true    ->  SDK上のカリング設定を使用
   *          false   ->  モデルのカリング設定を使用
   */
  getOverrideFlagForOffscreenCullings(offscreenIndex) {
    return this._userOffscreenCullings[offscreenIndex].isOverridden;
  }
  /**
   *
   * @param drawableIndex Drawableのインデックス
   * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  setOverrideFlagForDrawableCullings(drawableIndex, isOverriddenCullings) {
    this._userDrawableCullings[drawableIndex].isOverridden = isOverriddenCullings;
  }
  /**
   * モデルの不透明度を取得する
   *
   * @return 不透明度の値
   */
  getModelOapcity() {
    return this._modelOpacity;
  }
  /**
   * モデルの不透明度を設定する
   *
   * @param value 不透明度の値
   */
  setModelOapcity(value) {
    this._modelOpacity = value;
  }
  /**
   * モデルを取得
   */
  getModel() {
    return this._model;
  }
  /**
   * パーツのインデックスを取得
   * @param partId パーツのID
   * @return パーツのインデックス
   */
  getPartIndex(partId) {
    let partIndex;
    const partCount = this._model.parts.count;
    for (partIndex = 0; partIndex < partCount; ++partIndex) {
      if (partId == this._partIds[partIndex]) {
        return partIndex;
      }
    }
    if (this._notExistPartId.has(partId)) {
      return this._notExistPartId.get(partId);
    }
    partIndex = partCount + this._notExistPartId.size;
    this._notExistPartId.set(partId, partIndex);
    this._notExistPartOpacities.set(partIndex, null);
    return partIndex;
  }
  /**
   * パーツのIDを取得する。
   *
   * @param partIndex 取得するパーツのインデックス
   * @return パーツのID
   */
  getPartId(partIndex) {
    const partId = this._model.parts.ids[partIndex];
    return CubismFramework.getIdManager().getId(partId);
  }
  /**
   * パーツの個数の取得
   * @return パーツの個数
   */
  getPartCount() {
    const partCount = this._model.parts.count;
    return partCount;
  }
  /**
   * パーツのオフスクリーンインデックスの取得
   * @param partIndex パーツのインデックス
   * @return オフスクリーンインデックスのリスト
   */
  getPartOffscreenIndices() {
    const offscreenIndices = this._model.parts.offscreenIndices;
    return offscreenIndices;
  }
  /**
   * パーツの親パーツインデックスのリストを取得
   *
   * @return パーツの親パーツインデックスのリスト
   */
  getPartParentPartIndices() {
    const parentIndices = this._model.parts.parentIndices;
    return parentIndices;
  }
  /**
   * パーツの不透明度の設定(Index)
   * @param partIndex パーツのインデックス
   * @param opacity 不透明度
   */
  setPartOpacityByIndex(partIndex, opacity) {
    if (this._notExistPartOpacities.has(partIndex)) {
      this._notExistPartOpacities.set(partIndex, opacity);
      return;
    }
    CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
    this._partOpacities[partIndex] = opacity;
  }
  /**
   * パーツの不透明度の設定(Id)
   * @param partId パーツのID
   * @param opacity パーツの不透明度
   */
  setPartOpacityById(partId, opacity) {
    const index = this.getPartIndex(partId);
    if (index < 0) {
      return;
    }
    this.setPartOpacityByIndex(index, opacity);
  }
  /**
   * パーツの不透明度の取得(index)
   * @param partIndex パーツのインデックス
   * @return パーツの不透明度
   */
  getPartOpacityByIndex(partIndex) {
    if (this._notExistPartOpacities.has(partIndex)) {
      return this._notExistPartOpacities.get(partIndex);
    }
    CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
    return this._partOpacities[partIndex];
  }
  /**
   * パーツの不透明度の取得(id)
   * @param partId パーツのＩｄ
   * @return パーツの不透明度
   */
  getPartOpacityById(partId) {
    const index = this.getPartIndex(partId);
    if (index < 0) {
      return 0;
    }
    return this.getPartOpacityByIndex(index);
  }
  /**
   * パラメータのインデックスの取得
   * @param パラメータID
   * @return パラメータのインデックス
   */
  getParameterIndex(parameterId) {
    let parameterIndex;
    const idCount = this._model.parameters.count;
    for (parameterIndex = 0; parameterIndex < idCount; ++parameterIndex) {
      if (parameterId != this._parameterIds[parameterIndex]) {
        continue;
      }
      return parameterIndex;
    }
    if (this._notExistParameterId.has(parameterId)) {
      return this._notExistParameterId.get(parameterId);
    }
    parameterIndex = this._model.parameters.count + this._notExistParameterId.size;
    this._notExistParameterId.set(parameterId, parameterIndex);
    this._notExistParameterValues.set(parameterIndex, null);
    return parameterIndex;
  }
  /**
   * パラメータの個数の取得
   * @return パラメータの個数
   */
  getParameterCount() {
    return this._model.parameters.count;
  }
  /**
   * パラメータの種類の取得
   * @param parameterIndex パラメータのインデックス
   * @return csmParameterType_Normal -> 通常のパラメータ
   *          csmParameterType_BlendShape -> ブレンドシェイプパラメータ
   */
  getParameterType(parameterIndex) {
    return this._model.parameters.types[parameterIndex];
  }
  /**
   * パラメータの最大値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータの最大値
   */
  getParameterMaximumValue(parameterIndex) {
    return this._model.parameters.maximumValues[parameterIndex];
  }
  /**
   * パラメータの最小値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータの最小値
   */
  getParameterMinimumValue(parameterIndex) {
    return this._model.parameters.minimumValues[parameterIndex];
  }
  /**
   * パラメータのデフォルト値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータのデフォルト値
   */
  getParameterDefaultValue(parameterIndex) {
    return this._model.parameters.defaultValues[parameterIndex];
  }
  /**
   * 指定したパラメータindexのIDを取得
   *
   * @param parameterIndex パラメータのインデックス
   * @return パラメータID
   */
  getParameterId(parameterIndex) {
    return CubismFramework.getIdManager().getId(
      this._model.parameters.ids[parameterIndex]
    );
  }
  /**
   * パラメータの値の取得
   * @param parameterIndex    パラメータのインデックス
   * @return パラメータの値
   */
  getParameterValueByIndex(parameterIndex) {
    if (this._notExistParameterValues.has(parameterIndex)) {
      return this._notExistParameterValues.get(parameterIndex);
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    return this._parameterValues[parameterIndex];
  }
  /**
   * パラメータの値の取得
   * @param parameterId    パラメータのID
   * @return パラメータの値
   */
  getParameterValueById(parameterId) {
    const parameterIndex = this.getParameterIndex(parameterId);
    return this.getParameterValueByIndex(parameterIndex);
  }
  /**
   * パラメータの値の設定
   * @param parameterIndex パラメータのインデックス
   * @param value パラメータの値
   * @param weight 重み
   */
  setParameterValueByIndex(parameterIndex, value, weight = 1) {
    if (this._notExistParameterValues.has(parameterIndex)) {
      this._notExistParameterValues.set(
        parameterIndex,
        weight == 1 ? value : this._notExistParameterValues.get(parameterIndex) * (1 - weight) + value * weight
      );
      return;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    if (this.isRepeat(parameterIndex)) {
      value = this.getParameterRepeatValue(parameterIndex, value);
    } else {
      value = this.getParameterClampValue(parameterIndex, value);
    }
    this._parameterValues[parameterIndex] = weight == 1 ? value : this._parameterValues[parameterIndex] = this._parameterValues[parameterIndex] * (1 - weight) + value * weight;
  }
  /**
   * パラメータの値の設定
   * @param parameterId パラメータのID
   * @param value パラメータの値
   * @param weight 重み
   */
  setParameterValueById(parameterId, value, weight = 1) {
    const index = this.getParameterIndex(parameterId);
    this.setParameterValueByIndex(index, value, weight);
  }
  /**
   * パラメータの値の加算(index)
   * @param parameterIndex パラメータインデックス
   * @param value 加算する値
   * @param weight 重み
   */
  addParameterValueByIndex(parameterIndex, value, weight = 1) {
    this.setParameterValueByIndex(
      parameterIndex,
      this.getParameterValueByIndex(parameterIndex) + value * weight
    );
  }
  /**
   * パラメータの値の加算(id)
   * @param parameterId パラメータＩＤ
   * @param value 加算する値
   * @param weight 重み
   */
  addParameterValueById(parameterId, value, weight = 1) {
    const index = this.getParameterIndex(parameterId);
    this.addParameterValueByIndex(index, value, weight);
  }
  /**
   * Gets whether the parameter has the repeat setting.
   *
   * @param parameterIndex Parameter index
   *
   * @return true if it is set, otherwise returns false.
   */
  isRepeat(parameterIndex) {
    if (this._notExistParameterValues.has(parameterIndex)) {
      return false;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    let isRepeat;
    if (this._isOverriddenParameterRepeat || this._userParameterRepeatDataList[parameterIndex].isOverridden) {
      isRepeat = this._userParameterRepeatDataList[parameterIndex].isParameterRepeated;
    } else {
      isRepeat = this._model.parameters.repeats[parameterIndex] != 0;
    }
    return isRepeat;
  }
  /**
   * Returns the calculated result ensuring the value falls within the parameter's range.
   *
   * @param parameterIndex Parameter index
   * @param value Parameter value
   *
   * @return a value that falls within the parameter’s range. If the parameter does not exist, returns it as is.
   */
  getParameterRepeatValue(parameterIndex, value) {
    if (this._notExistParameterValues.has(parameterIndex)) {
      return value;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    const maxValue = this._model.parameters.maximumValues[parameterIndex];
    const minValue = this._model.parameters.minimumValues[parameterIndex];
    const valueSize = maxValue - minValue;
    if (maxValue < value) {
      const overValue = CubismMath.mod(value - maxValue, valueSize);
      if (!Number.isNaN(overValue)) {
        value = minValue + overValue;
      } else {
        value = maxValue;
      }
    }
    if (value < minValue) {
      const overValue = CubismMath.mod(minValue - value, valueSize);
      if (!Number.isNaN(overValue)) {
        value = maxValue - overValue;
      } else {
        value = minValue;
      }
    }
    return value;
  }
  /**
   * Returns the result of clamping the value to ensure it falls within the parameter's range.
   *
   * @param parameterIndex Parameter index
   * @param value Parameter value
   *
   * @return the clamped value. If the parameter does not exist, returns it as is.
   */
  getParameterClampValue(parameterIndex, value) {
    if (this._notExistParameterValues.has(parameterIndex)) {
      return value;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    const maxValue = this._model.parameters.maximumValues[parameterIndex];
    const minValue = this._model.parameters.minimumValues[parameterIndex];
    return CubismMath.clamp(value, minValue, maxValue);
  }
  /**
   * Returns the repeat of the parameter.
   *
   * @param parameterIndex Parameter index
   *
   * @return the raw data parameter repeat from the Cubism Core.
   */
  getParameterRepeats(parameterIndex) {
    return this._model.parameters.repeats[parameterIndex] != 0;
  }
  /**
   * パラメータの値の乗算
   * @param parameterId パラメータのID
   * @param value 乗算する値
   * @param weight 重み
   */
  multiplyParameterValueById(parameterId, value, weight = 1) {
    const index = this.getParameterIndex(parameterId);
    this.multiplyParameterValueByIndex(index, value, weight);
  }
  /**
   * パラメータの値の乗算
   * @param parameterIndex パラメータのインデックス
   * @param value 乗算する値
   * @param weight 重み
   */
  multiplyParameterValueByIndex(parameterIndex, value, weight = 1) {
    this.setParameterValueByIndex(
      parameterIndex,
      this.getParameterValueByIndex(parameterIndex) * (1 + (value - 1) * weight)
    );
  }
  /**
   * Drawableのインデックスの取得
   * @param drawableId DrawableのID
   * @return Drawableのインデックス
   */
  getDrawableIndex(drawableId) {
    const drawableCount = this._model.drawables.count;
    for (let drawableIndex = 0; drawableIndex < drawableCount; ++drawableIndex) {
      if (this._drawableIds[drawableIndex] == drawableId) {
        return drawableIndex;
      }
    }
    return -1;
  }
  /**
   * Drawableの個数の取得
   * @return drawableの個数
   */
  getDrawableCount() {
    const drawableCount = this._model.drawables.count;
    return drawableCount;
  }
  /**
   * DrawableのIDを取得する
   * @param drawableIndex Drawableのインデックス
   * @return drawableのID
   */
  getDrawableId(drawableIndex) {
    const parameterIds = this._model.drawables.ids;
    return CubismFramework.getIdManager().getId(parameterIds[drawableIndex]);
  }
  /**
   * Drawableの描画順リストの取得
   * @return Drawableの描画順リスト
   */
  getRenderOrders() {
    const renderOrders = this._model.getRenderOrders();
    return renderOrders;
  }
  /**
   * Drawableのテクスチャインデックスの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのテクスチャインデックス
   */
  getDrawableTextureIndex(drawableIndex) {
    const textureIndices = this._model.drawables.textureIndices;
    return textureIndices[drawableIndex];
  }
  /**
   * DrawableのVertexPositionsの変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの頂点情報が変化したかを取得する。
   *
   * @param   drawableIndex   Drawableのインデックス
   * @return  true    Drawableの頂点情報が直近のCubismModel.update関数で変化した
   *          false   Drawableの頂点情報が直近のCubismModel.update関数で変化していない
   */
  getDrawableDynamicFlagVertexPositionsDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasVertexPositionsDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの頂点インデックスの個数の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点インデックスの個数
   */
  getDrawableVertexIndexCount(drawableIndex) {
    const indexCounts = this._model.drawables.indexCounts;
    return indexCounts[drawableIndex];
  }
  /**
   * Drawableの頂点の個数の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点の個数
   */
  getDrawableVertexCount(drawableIndex) {
    const vertexCounts = this._model.drawables.vertexCounts;
    return vertexCounts[drawableIndex];
  }
  /**
   * Drawableの頂点リストの取得
   * @param drawableIndex drawableのインデックス
   * @return drawableの頂点リスト
   */
  getDrawableVertices(drawableIndex) {
    return this.getDrawableVertexPositions(drawableIndex);
  }
  /**
   * Drawableの頂点インデックスリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点インデックスリスト
   */
  getDrawableVertexIndices(drawableIndex) {
    const indicesArray = this._model.drawables.indices;
    return indicesArray[drawableIndex];
  }
  /**
   * Drawableの頂点リストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点リスト
   */
  getDrawableVertexPositions(drawableIndex) {
    const verticesArray = this._model.drawables.vertexPositions;
    return verticesArray[drawableIndex];
  }
  /**
   * Drawableの頂点のUVリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点UVリスト
   */
  getDrawableVertexUvs(drawableIndex) {
    const uvsArray = this._model.drawables.vertexUvs;
    return uvsArray[drawableIndex];
  }
  /**
   * Drawableの不透明度の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの不透明度
   */
  getDrawableOpacity(drawableIndex) {
    const opacities = this._model.drawables.opacities;
    return opacities[drawableIndex];
  }
  /**
   * Drawableの乗算色の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの乗算色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  getDrawableMultiplyColor(drawableIndex) {
    if (this._drawableMultiplyColors == null) {
      this._drawableMultiplyColors = new Array(
        this._model.drawables.count
      );
      this._drawableMultiplyColors.fill(new CubismTextureColor());
    }
    const multiplyColors = this._model.drawables.multiplyColors;
    const index = drawableIndex * 4;
    this._drawableMultiplyColors[drawableIndex].r = multiplyColors[index];
    this._drawableMultiplyColors[drawableIndex].g = multiplyColors[index + 1];
    this._drawableMultiplyColors[drawableIndex].b = multiplyColors[index + 2];
    this._drawableMultiplyColors[drawableIndex].a = multiplyColors[index + 3];
    return this._drawableMultiplyColors[drawableIndex];
  }
  /**
   * Drawableのスクリーン色の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのスクリーン色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  getDrawableScreenColor(drawableIndex) {
    if (this._drawableScreenColors == null) {
      this._drawableScreenColors = new Array(
        this._model.drawables.count
      );
      this._drawableScreenColors.fill(new CubismTextureColor());
    }
    const screenColors = this._model.drawables.screenColors;
    const index = drawableIndex * 4;
    this._drawableScreenColors[drawableIndex].r = screenColors[index];
    this._drawableScreenColors[drawableIndex].g = screenColors[index + 1];
    this._drawableScreenColors[drawableIndex].b = screenColors[index + 2];
    this._drawableScreenColors[drawableIndex].a = screenColors[index + 3];
    return this._drawableScreenColors[drawableIndex];
  }
  /**
   * Offscreenの乗算色の取得
   * @param offscreenIndex Offscreenのインデックス
   * @return Offscreenの乗算色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  getOffscreenMultiplyColor(offscreenIndex) {
    if (this._offscreenMultiplyColors == null) {
      this._offscreenMultiplyColors = new Array(
        this._model.offscreens.count
      );
      this._offscreenMultiplyColors.fill(new CubismTextureColor());
    }
    const multiplyColors = this._model.offscreens.multiplyColors;
    const index = offscreenIndex * 4;
    this._offscreenMultiplyColors[offscreenIndex].r = multiplyColors[index];
    this._offscreenMultiplyColors[offscreenIndex].g = multiplyColors[index + 1];
    this._offscreenMultiplyColors[offscreenIndex].b = multiplyColors[index + 2];
    this._offscreenMultiplyColors[offscreenIndex].a = multiplyColors[index + 3];
    return this._offscreenMultiplyColors[offscreenIndex];
  }
  /**
   * Offscreenのスクリーン色の取得
   * @param offscreenIndex Offscreenのインデックス
   * @return Offscreenのスクリーン色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  getOffscreenScreenColor(offscreenIndex) {
    if (this._offscreenScreenColors == null) {
      this._offscreenScreenColors = new Array(
        this._model.offscreens.count
      );
      this._offscreenScreenColors.fill(new CubismTextureColor());
    }
    const screenColors = this._model.offscreens.screenColors;
    const index = offscreenIndex * 4;
    this._offscreenScreenColors[offscreenIndex].r = screenColors[index];
    this._offscreenScreenColors[offscreenIndex].g = screenColors[index + 1];
    this._offscreenScreenColors[offscreenIndex].b = screenColors[index + 2];
    this._offscreenScreenColors[offscreenIndex].a = screenColors[index + 3];
    return this._offscreenScreenColors[offscreenIndex];
  }
  /**
   * Drawableの親パーツのインデックスの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの親パーツのインデックス
   */
  getDrawableParentPartIndex(drawableIndex) {
    return this._model.drawables.parentPartIndices[drawableIndex];
  }
  /**
   * Drawableのブレンドモードを取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのブレンドモード
   */
  getDrawableBlendMode(drawableIndex) {
    const constantFlags = this._model.drawables.constantFlags;
    return Live2DCubismCore.Utils.hasBlendAdditiveBit(
      constantFlags[drawableIndex]
    ) ? 1 /* CubismBlendMode_Additive */ : Live2DCubismCore.Utils.hasBlendMultiplicativeBit(
      constantFlags[drawableIndex]
    ) ? 2 /* CubismBlendMode_Multiplicative */ : 0 /* CubismBlendMode_Normal */;
  }
  /**
   * Drawableのカラーブレンドの取得(Cubism 5.3 以降)
   *
   * @param drawableIndex Drawableのインデックス
   * @return Drawableのカラーブレンド
   */
  getDrawableColorBlend(drawableIndex) {
    if (this._drawableColorBlends[drawableIndex] == -1 /* ColorBlend_None */) {
      this._drawableColorBlends[drawableIndex] = this._model.drawables.blendModes[drawableIndex] & 255;
    }
    return this._drawableColorBlends[drawableIndex];
  }
  /**
   * Drawableのアルファブレンドの取得(Cubism 5.3 以降)
   *
   * @param drawableIndex Drawableのインデックス
   * @return Drawableのアルファブレンド
   */
  getDrawableAlphaBlend(drawableIndex) {
    if (this._drawableAlphaBlends[drawableIndex] == -1 /* AlphaBlend_None */) {
      this._drawableAlphaBlends[drawableIndex] = this._model.drawables.blendModes[drawableIndex] >> 8 & 255;
    }
    return this._drawableAlphaBlends[drawableIndex];
  }
  /**
   * Drawableのマスクの反転使用の取得
   *
   * Drawableのマスク使用時の反転設定を取得する。
   * マスクを使用しない場合は無視される。
   *
   * @param drawableIndex Drawableのインデックス
   * @return Drawableの反転設定
   */
  getDrawableInvertedMaskBit(drawableIndex) {
    const constantFlags = this._model.drawables.constantFlags;
    return Live2DCubismCore.Utils.hasIsInvertedMaskBit(
      constantFlags[drawableIndex]
    );
  }
  /**
   * Drawableのクリッピングマスクリストの取得
   * @return Drawableのクリッピングマスクリスト
   */
  getDrawableMasks() {
    const masks = this._model.drawables.masks;
    return masks;
  }
  /**
   * Drawableのクリッピングマスクの個数リストの取得
   * @return Drawableのクリッピングマスクの個数リスト
   */
  getDrawableMaskCounts() {
    const maskCounts = this._model.drawables.maskCounts;
    return maskCounts;
  }
  /**
   * クリッピングマスクの使用状態
   *
   * @return true クリッピングマスクを使用している
   * @return false クリッピングマスクを使用していない
   */
  isUsingMasking() {
    for (let d = 0; d < this._model.drawables.count; ++d) {
      if (this._model.drawables.maskCounts[d] <= 0) {
        continue;
      }
      return true;
    }
    return false;
  }
  /**
   * Offscreenでクリッピングマスクを使用しているかどうかを取得
   *
   * @return true クリッピングマスクをオフスクリーンで使用している
   */
  isUsingMaskingForOffscreen() {
    for (let d = 0; d < this.getOffscreenCount(); ++d) {
      if (this._model.offscreens.maskCounts[d] <= 0) {
        continue;
      }
      return true;
    }
    return false;
  }
  /**
   * Drawableの表示情報を取得する
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableが表示
   * @return false Drawableが非表示
   */
  getDrawableDynamicFlagIsVisible(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasIsVisibleBit(dynamicFlags[drawableIndex]);
  }
  /**
   * DrawableのDrawOrderの変化情報の取得
   *
   * 直近のCubismModel.update関数でdrawableのdrawOrderが変化したかを取得する。
   * drawOrderはartMesh上で指定する0から1000の情報
   * @param drawableIndex drawableのインデックス
   * @return true drawableの不透明度が直近のCubismModel.update関数で変化した
   * @return false drawableの不透明度が直近のCubismModel.update関数で変化している
   */
  getDrawableDynamicFlagVisibilityDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasVisibilityDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの不透明度の変化情報の取得
   *
   * 直近のCubismModel.update関数でdrawableの不透明度が変化したかを取得する。
   *
   * @param drawableIndex drawableのインデックス
   * @return true Drawableの不透明度が直近のCubismModel.update関数で変化した
   * @return false Drawableの不透明度が直近のCubismModel.update関数で変化してない
   */
  getDrawableDynamicFlagOpacityDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasOpacityDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの描画順序の変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの描画の順序が変化したかを取得する。
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableの描画の順序が直近のCubismModel.update関数で変化した
   * @return false Drawableの描画の順序が直近のCubismModel.update関数で変化してない
   */
  getDrawableDynamicFlagRenderOrderDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasRenderOrderDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの乗算色・スクリーン色の変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの乗算色・スクリーン色が変化したかを取得する。
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化した
   * @return false Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化してない
   */
  getDrawableDynamicFlagBlendColorDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasBlendColorDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * オフスクリーンの個数を取得する
   * @return オフスクリーンの個数
   */
  getOffscreenCount() {
    return this._model.offscreens.count;
  }
  /**
   * Offscreenのカラーブレンドの取得(Cubism 5.3 以降)
   *
   * @param offscreenIndex Offscreenのインデックス
   * @return Offscreenのカラーブレンド
   */
  getOffscreenColorBlend(offscreenIndex) {
    if (this._offscreenColorBlends[offscreenIndex] == -1 /* ColorBlend_None */) {
      this._offscreenColorBlends[offscreenIndex] = this._model.offscreens.blendModes[offscreenIndex] & 255;
    }
    return this._offscreenColorBlends[offscreenIndex];
  }
  /**
   * Offscreenのアルファブレンドの取得(Cubism 5.3 以降)
   *
   * @param offscreenIndex Offscreenのインデックス
   * @return Offscreenのアルファブレンド
   */
  getOffscreenAlphaBlend(offscreenIndex) {
    if (this._offscreenAlphaBlends[offscreenIndex] == -1 /* AlphaBlend_None */) {
      this._offscreenAlphaBlends[offscreenIndex] = this._model.offscreens.blendModes[offscreenIndex] >> 8 & 255;
    }
    return this._offscreenAlphaBlends[offscreenIndex];
  }
  /**
   * オフスクリーンのオーナーインデックス配列を取得する
   * @return オフスクリーンのオーナーインデックス配列
   */
  getOffscreenOwnerIndices() {
    return this._model.offscreens.ownerIndices;
  }
  /**
   * オフスクリーンの不透明度を取得
   * @param offscreenIndex オフスクリーンのインデックス
   * @return 不透明度
   */
  getOffscreenOpacity(offscreenIndex) {
    if (offscreenIndex < 0 || offscreenIndex >= this._model.offscreens.count) {
      return 1;
    }
    return this._model.offscreens.opacities[offscreenIndex];
  }
  /**
   * オフスクリーンのクリッピングマスクリストの取得
   * @return オフスクリーンのクリッピングマスクリスト
   */
  getOffscreenMasks() {
    return this._model.offscreens.masks;
  }
  /**
   * オフスクリーンのクリッピングマスクの個数リストの取得
   * @return オフスクリーンのクリッピングマスクの個数リスト
   */
  getOffscreenMaskCounts() {
    return this._model.offscreens.maskCounts;
  }
  /**
   * オフスクリーンのマスク反転設定を取得する
   * @param offscreenIndex オフスクリーンのインデックス
   * @return オフスクリーンのマスク反転設定
   */
  getOffscreenInvertedMask(offscreenIndex) {
    const constantFlags = this._model.offscreens.constantFlags;
    return Live2DCubismCore.Utils.hasIsInvertedMaskBit(
      constantFlags[offscreenIndex]
    );
  }
  /**
   * ブレンドモード使用判定
   * @return ブレンドモードを使用しているか
   */
  isBlendModeEnabled() {
    return this._isBlendModeEnabled;
  }
  /**
   * 保存されたパラメータの読み込み
   */
  loadParameters() {
    let parameterCount = this._model.parameters.count;
    const savedParameterCount = this._savedParameters.length;
    if (parameterCount > savedParameterCount) {
      parameterCount = savedParameterCount;
    }
    for (let i = 0; i < parameterCount; ++i) {
      this._parameterValues[i] = this._savedParameters[i];
    }
  }
  /**
   * 初期化する
   */
  initialize() {
    CSM_ASSERT(this._model);
    this._parameterValues = this._model.parameters.values;
    this._partOpacities = this._model.parts.opacities;
    this._offscreenOpacities = this._model.offscreens.opacities;
    this._parameterMaximumValues = this._model.parameters.maximumValues;
    this._parameterMinimumValues = this._model.parameters.minimumValues;
    {
      const parameterIds = this._model.parameters.ids;
      const parameterCount = this._model.parameters.count;
      this._parameterIds.length = parameterCount;
      this._userParameterRepeatDataList.length = parameterCount;
      for (let i = 0; i < parameterCount; ++i) {
        this._parameterIds[i] = CubismFramework.getIdManager().getId(
          parameterIds[i]
        );
        this._userParameterRepeatDataList[i] = new ParameterRepeatData(
          false,
          false
        );
      }
    }
    const partCount = this._model.parts.count;
    {
      const partIds = this._model.parts.ids;
      this._partIds.length = partCount;
      for (let i = 0; i < partCount; ++i) {
        this._partIds[i] = CubismFramework.getIdManager().getId(partIds[i]);
      }
    }
    {
      const drawableIds = this._model.drawables.ids;
      const drawableCount = this._model.drawables.count;
      this._userDrawableCullings.length = drawableCount;
      const userCulling = new CullingData(false, false);
      this._userOffscreenCullings.length = this._model.offscreens.count;
      const userOffscreenCulling = new CullingData(false, false);
      {
        for (let i = 0; i < drawableCount; ++i) {
          this._drawableIds.push(
            CubismFramework.getIdManager().getId(drawableIds[i])
          );
          this._userDrawableCullings[i] = userCulling;
        }
      }
      {
        for (let i = 0; i < this._model.offscreens.count; ++i) {
          this._userOffscreenCullings[i] = userOffscreenCulling;
        }
      }
      if (this.getOffscreenCount() > 0) {
        this._isBlendModeEnabled = true;
      } else {
        const blendModes = this._model.drawables.blendModes;
        for (let i = 0; i < drawableCount; ++i) {
          const colorBlendType = this.getDrawableColorBlend(i);
          const alphaBlendType = this.getDrawableAlphaBlend(i);
          if (!(colorBlendType == CubismColorBlend.ColorBlend_Normal && alphaBlendType == 0 /* AlphaBlend_Over */) && colorBlendType != CubismColorBlend.ColorBlend_AddCompatible && colorBlendType != CubismColorBlend.ColorBlend_MultiplyCompatible) {
            this._isBlendModeEnabled = true;
            break;
          }
        }
      }
      this.setupPartsHierarchy();
      const offscreenCount = this.getOffscreenCount();
      this._overrideMultiplyAndScreenColor.initialize(
        partCount,
        drawableCount,
        offscreenCount
      );
    }
  }
  /**
   * パーツ階層構造を取得する
   * @return パーツ階層構造の配列
   */
  getPartsHierarchy() {
    return this._partsHierarchy;
  }
  /**
   * パーツ階層構造をセットアップする
   */
  setupPartsHierarchy() {
    this._partsHierarchy.length = 0;
    const partCount = this.getPartCount();
    this._partsHierarchy.length = partCount;
    for (let i = 0; i < partCount; ++i) {
      const partInfo = new CubismModelPartInfo();
      this._partsHierarchy[i] = partInfo;
    }
    for (let i = 0; i < partCount; ++i) {
      const parentPartIndex = this.getPartParentPartIndices()[i];
      if (parentPartIndex === NoParentIndex) {
        continue;
      }
      for (let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex) {
        if (partIndex === parentPartIndex) {
          const objectInfo = new CubismModelObjectInfo(
            i,
            1 /* CubismModelObjectType_Parts */
          );
          this._partsHierarchy[partIndex].objects.push(objectInfo);
          break;
        }
      }
    }
    const drawableCount = this.getDrawableCount();
    for (let i = 0; i < drawableCount; ++i) {
      const parentPartIndex = this.getDrawableParentPartIndex(i);
      if (parentPartIndex === NoParentIndex) {
        continue;
      }
      for (let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex) {
        if (partIndex === parentPartIndex) {
          const objectInfo = new CubismModelObjectInfo(
            i,
            0 /* CubismModelObjectType_Drawable */
          );
          this._partsHierarchy[partIndex].objects.push(objectInfo);
          break;
        }
      }
    }
    for (let i = 0; i < this._partsHierarchy.length; ++i) {
      this.getPartChildDrawObjects(i);
    }
  }
  /**
   * 指定したパーツの子描画オブジェクト情報を取得・構築する
   * @param partInfoIndex パーツ情報のインデックス
   * @return PartChildDrawObjects
   */
  getPartChildDrawObjects(partInfoIndex) {
    if (this._partsHierarchy[partInfoIndex].getChildObjectCount() < 1) {
      return this._partsHierarchy[partInfoIndex].childDrawObjects;
    }
    const childDrawObjects = this._partsHierarchy[partInfoIndex].childDrawObjects;
    if (childDrawObjects.drawableIndices.length !== 0 || childDrawObjects.offscreenIndices.length !== 0) {
      return childDrawObjects;
    }
    const objects = this._partsHierarchy[partInfoIndex].objects;
    for (let i = 0; i < objects.length; ++i) {
      const obj = objects[i];
      if (obj.objectType === 1 /* CubismModelObjectType_Parts */) {
        this.getPartChildDrawObjects(obj.objectIndex);
        const childToChildDrawObjects = this._partsHierarchy[obj.objectIndex].childDrawObjects;
        childDrawObjects.drawableIndices.push(
          ...childToChildDrawObjects.drawableIndices
        );
        childDrawObjects.offscreenIndices.push(
          ...childToChildDrawObjects.offscreenIndices
        );
        const offscreenIndices = this.getOffscreenIndices();
        const offscreenIndex = offscreenIndices ? offscreenIndices[obj.objectIndex] : NoOffscreenIndex;
        if (offscreenIndex !== NoOffscreenIndex) {
          childDrawObjects.offscreenIndices.push(offscreenIndex);
        }
      } else if (obj.objectType === 0 /* CubismModelObjectType_Drawable */) {
        childDrawObjects.drawableIndices.push(obj.objectIndex);
      }
    }
    return childDrawObjects;
  }
  /**
   * パーツのオフスクリーンインデックス配列を取得
   * @return Int32Array offscreenIndices
   */
  getOffscreenIndices() {
    return this._model.parts.offscreenIndices;
  }
  /**
   * コンストラクタ
   * @param model モデル
   */
  constructor(model) {
    this._model = model;
    this._parameterValues = null;
    this._parameterMaximumValues = null;
    this._parameterMinimumValues = null;
    this._partOpacities = null;
    this._offscreenOpacities = null;
    this._savedParameters = new Array();
    this._parameterIds = new Array();
    this._drawableIds = new Array();
    this._partIds = new Array();
    this._isOverriddenParameterRepeat = true;
    this._isOverriddenCullings = false;
    this._modelOpacity = 1;
    this._overrideMultiplyAndScreenColor = new CubismModelMultiplyAndScreenColor(this);
    this._isBlendModeEnabled = false;
    this._drawableColorBlends = null;
    this._drawableAlphaBlends = null;
    this._offscreenColorBlends = null;
    this._offscreenAlphaBlends = null;
    this._drawableMultiplyColors = null;
    this._drawableScreenColors = null;
    this._offscreenMultiplyColors = null;
    this._offscreenScreenColors = null;
    this._userParameterRepeatDataList = new Array();
    this._userDrawableCullings = new Array();
    this._userOffscreenCullings = new Array();
    this._partsHierarchy = new Array();
    this._notExistPartId = /* @__PURE__ */ new Map();
    this._notExistParameterId = /* @__PURE__ */ new Map();
    this._notExistParameterValues = /* @__PURE__ */ new Map();
    this._notExistPartOpacities = /* @__PURE__ */ new Map();
    this._drawableColorBlends = new Array(
      model.drawables.count
    ).fill(-1 /* ColorBlend_None */);
    this._drawableAlphaBlends = new Array(
      model.drawables.count
    ).fill(-1 /* AlphaBlend_None */);
    this._offscreenColorBlends = new Array(
      model.offscreens.count
    ).fill(-1 /* ColorBlend_None */);
    this._offscreenAlphaBlends = new Array(
      model.offscreens.count
    ).fill(-1 /* AlphaBlend_None */);
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._model.release();
    this._model = null;
    this._drawableColorBlends = null;
    this._drawableAlphaBlends = null;
    this._offscreenColorBlends = null;
    this._offscreenAlphaBlends = null;
    this._drawableMultiplyColors = null;
    this._drawableScreenColors = null;
    this._offscreenMultiplyColors = null;
    this._offscreenScreenColors = null;
  }
  _notExistPartOpacities;
  // 存在していないパーツの不透明度のリスト
  _notExistPartId;
  // 存在していないパーツIDのリスト
  _notExistParameterValues;
  // 存在していないパラメータの値のリスト
  _notExistParameterId;
  // 存在していないパラメータIDのリスト
  _savedParameters;
  // 保存されたパラメータ
  /**
   * Flag to determine whether to override model-wide parameter repeats on the SDK
   */
  _isOverriddenParameterRepeat;
  _overrideMultiplyAndScreenColor;
  // 乗算色・スクリーン色の管理クラス
  /**
   * List to manage ParameterRepeat and Override flag to be set for each Parameter
   */
  _userParameterRepeatDataList;
  _partsHierarchy;
  // Partの親子構造
  _model;
  // モデル
  _parameterValues;
  // パラメータの値のリスト
  _parameterMaximumValues;
  // パラメータの最大値のリスト
  _parameterMinimumValues;
  // パラメータの最小値のリスト
  _partOpacities;
  // パーツの不透明度のリスト
  _offscreenOpacities;
  // オフスクリーンの不透明度のリスト
  _modelOpacity;
  // モデルの不透明度
  _parameterIds;
  _partIds;
  _drawableIds;
  _isOverriddenCullings;
  // モデルのカリング設定をすべて上書きするか？
  _userDrawableCullings;
  // カリング設定の配列
  _userOffscreenCullings;
  // オフスクリーンのカリング設定を使用するか？
  _isBlendModeEnabled;
  // ブレンドモードを使用しているか
  _drawableColorBlends;
  // Drawableのカラーブレンドの配列
  _drawableAlphaBlends;
  // Drawableのアルファブレンドの配列
  _offscreenColorBlends;
  // Offscreen のカラーブレンドの配列
  _offscreenAlphaBlends;
  // Offscreen のアルファブレンドの配列
  _drawableMultiplyColors;
  // Drawableの乗算色の配列
  _drawableScreenColors;
  // Drawableのスクリーン色の配列
  _offscreenMultiplyColors;
  // Offscreenの乗算色の配列
  _offscreenScreenColors;
  // Offscreenのスクリーン色の配列
};
var Live2DCubismFramework11;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismModel = CubismModel;
})(Live2DCubismFramework11 || (Live2DCubismFramework11 = {}));

// vendor/cubism-framework/src/model/cubismmoc.ts
var CubismMoc = class _CubismMoc {
  /**
   * Mocデータの作成
   */
  static create(mocBytes, shouldCheckMocConsistency) {
    let cubismMoc = null;
    if (shouldCheckMocConsistency) {
      const consistency = this.hasMocConsistency(mocBytes);
      if (!consistency) {
        CubismLogError(`Inconsistent MOC3.`);
        return cubismMoc;
      }
    }
    const moc = Live2DCubismCore.Moc.fromArrayBuffer(mocBytes);
    if (moc) {
      cubismMoc = new _CubismMoc(moc);
      cubismMoc._mocVersion = Live2DCubismCore.Version.csmGetMocVersion(mocBytes);
    }
    return cubismMoc;
  }
  /**
   * Mocデータを削除
   *
   * Mocデータを削除する
   */
  static delete(moc) {
    moc._moc._release();
    moc._moc = null;
    moc = null;
  }
  /**
   * モデルを作成する
   *
   * @return Mocデータから作成されたモデル
   */
  createModel() {
    let cubismModel = null;
    const model = Live2DCubismCore.Model.fromMoc(
      this._moc
    );
    if (model) {
      cubismModel = new CubismModel(model);
      cubismModel.initialize();
      ++this._modelCount;
    }
    return cubismModel;
  }
  /**
   * モデルを削除する
   */
  deleteModel(model) {
    if (model != null) {
      model.release();
      model = null;
      --this._modelCount;
    }
  }
  /**
   * コンストラクタ
   */
  constructor(moc) {
    this._moc = moc;
    this._modelCount = 0;
    this._mocVersion = 0;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    CSM_ASSERT(this._modelCount == 0);
    this._moc._release();
    this._moc = null;
  }
  /**
   * 最新の.moc3 Versionを取得
   */
  getLatestMocVersion() {
    return Live2DCubismCore.Version.csmGetLatestMocVersion();
  }
  /**
   * 読み込んだモデルの.moc3 Versionを取得
   */
  getMocVersion() {
    return this._mocVersion;
  }
  /**
   * Mocファイルのbufferから.moc3 Versionを取得
   * @param mocBytes Mocファイルのバイト配列
   * @returns .moc3 Version番号
   */
  static getMocVersionFromBuffer(mocBytes) {
    return Live2DCubismCore.Version.csmGetMocVersion(mocBytes);
  }
  /**
   * .moc3 の整合性を検証する
   */
  static hasMocConsistency(mocBytes) {
    const isConsistent = Live2DCubismCore.Moc.prototype.hasMocConsistency(mocBytes);
    return isConsistent === 1 ? true : false;
  }
  _moc;
  // Mocデータ
  _modelCount;
  // Mocデータから作られたモデルの個数
  _mocVersion;
  // 読み込んだモデルの.moc3 Version
};
var Live2DCubismFramework12;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismMoc = CubismMoc;
})(Live2DCubismFramework12 || (Live2DCubismFramework12 = {}));

// vendor/cubism-framework/src/utils/cubismarrayutils.ts
function updateSize(curArray, newSize, value = null, callPlacementNew = null) {
  const curSize = curArray.length;
  if (curSize < newSize) {
    if (callPlacementNew) {
      for (let i = curArray.length; i < newSize; i++) {
        if (typeof value == "function") {
          curArray[i] = JSON.parse(JSON.stringify(new value()));
        } else {
          curArray[i] = value;
        }
      }
    } else {
      for (let i = curArray.length; i < newSize; i++) {
        curArray[i] = value;
      }
    }
  } else {
    curArray.length = newSize;
  }
}

// vendor/cubism-framework/src/rendering/cubismclippingmanager.ts
var ColorChannelCount = 4;
var ClippingMaskMaxCountOnDefault = 36;
var ClippingMaskMaxCountOnMultiRenderTexture = 32;
var CubismClippingManager = class {
  /**
   * コンストラクタ
   */
  constructor(clippingContextFactory) {
    this._renderTextureCount = 0;
    this._clippingMaskBufferSize = 256;
    this._clippingContextListForMask = new Array();
    this._clippingContextListForDraw = new Array();
    this._clippingContextListForOffscreen = new Array();
    this._tmpBoundsOnModel = new csmRect();
    this._tmpMatrix = new CubismMatrix44();
    this._tmpMatrixForMask = new CubismMatrix44();
    this._tmpMatrixForDraw = new CubismMatrix44();
    this._clearedMaskBufferFlags = new Array();
    this._clippingContexttConstructor = clippingContextFactory;
    this._channelColors = [
      new CubismTextureColor(1, 0, 0, 0),
      new CubismTextureColor(0, 1, 0, 0),
      new CubismTextureColor(0, 0, 1, 0),
      new CubismTextureColor(0, 0, 0, 1)
    ];
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (let i = 0; i < this._clippingContextListForMask.length; i++) {
      if (this._clippingContextListForMask[i]) {
        this._clippingContextListForMask[i].release();
        this._clippingContextListForMask[i] = void 0;
      }
      this._clippingContextListForMask[i] = null;
    }
    this._clippingContextListForMask = null;
    for (let i = 0; i < this._clippingContextListForDraw.length; i++) {
      this._clippingContextListForDraw[i] = null;
    }
    this._clippingContextListForDraw = null;
    for (let i = 0; i < this._channelColors.length; i++) {
      this._channelColors[i] = null;
    }
    this._channelColors = null;
    if (this._clearedMaskBufferFlags != null) {
      this._clearedMaskBufferFlags.length = 0;
    }
    this._clearedMaskBufferFlags = null;
  }
  /**
   * マネージャの初期化処理
   * クリッピングマスクを使う描画オブジェクトの登録を行う
   * @param model モデルのインスタンス
   * @param renderTextureCount バッファの生成数
   */
  initializeForDrawable(model, renderTextureCount) {
    if (renderTextureCount % 1 != 0) {
      CubismLogWarning(
        "The number of render textures must be specified as an integer. The decimal point is rounded down and corrected to an integer."
      );
      renderTextureCount = ~~renderTextureCount;
    }
    if (renderTextureCount < 1) {
      CubismLogWarning(
        "The number of render textures must be an integer greater than or equal to 1. Set the number of render textures to 1."
      );
    }
    this._renderTextureCount = renderTextureCount < 1 ? 1 : renderTextureCount;
    this._clearedMaskBufferFlags = new Array(this._renderTextureCount);
    this._clippingContextListForDraw.length = model.getDrawableCount();
    for (let i = 0; i < model.getDrawableCount(); i++) {
      if (model.getDrawableMaskCounts()[i] <= 0) {
        this._clippingContextListForDraw[i] = null;
        continue;
      }
      let clippingContext = this.findSameClip(
        model.getDrawableMasks()[i],
        model.getDrawableMaskCounts()[i]
      );
      if (clippingContext == null) {
        clippingContext = new this._clippingContexttConstructor(
          this,
          model.getDrawableMasks()[i],
          model.getDrawableMaskCounts()[i]
        );
        this._clippingContextListForMask.push(clippingContext);
      }
      clippingContext.addClippedDrawable(i);
      this._clippingContextListForDraw[i] = clippingContext;
    }
  }
  /**
   * オフスクリーン用の初期化処理
   *
   * @param model モデルのインスタンス
   * @param maskBufferCount オフスクリーン用のマスクバッファの数
   */
  initializeForOffscreen(model, maskBufferCount) {
    this._renderTextureCount = maskBufferCount;
    this._clearedMaskBufferFlags.length = this._renderTextureCount;
    for (let i = 0; i < this._renderTextureCount; ++i) {
      this._clearedMaskBufferFlags[i] = false;
    }
    this._clippingContextListForOffscreen.length = model.getOffscreenCount();
    for (let i = 0; i < model.getOffscreenCount(); ++i) {
      if (model.getOffscreenMaskCounts()[i] <= 0) {
        this._clippingContextListForOffscreen.push(null);
        continue;
      }
      let cc = this.findSameClip(
        model.getOffscreenMasks()[i],
        model.getOffscreenMaskCounts()[i]
      );
      if (cc == null) {
        cc = new this._clippingContexttConstructor(
          this,
          model.getOffscreenMasks()[i],
          model.getOffscreenMaskCounts()[i]
        );
        this._clippingContextListForMask.push(cc);
      }
      cc.addClippedOffscreen(i);
      this._clippingContextListForOffscreen[i] = cc;
    }
  }
  /**
   * 既にマスクを作っているかを確認
   * 作っている様であれば該当するクリッピングマスクのインスタンスを返す
   * 作っていなければNULLを返す
   * @param drawableMasks 描画オブジェクトをマスクする描画オブジェクトのリスト
   * @param drawableMaskCounts 描画オブジェクトをマスクする描画オブジェクトの数
   * @return 該当するクリッピングマスクが存在すればインスタンスを返し、なければNULLを返す
   */
  findSameClip(drawableMasks, drawableMaskCounts) {
    for (let i = 0; i < this._clippingContextListForMask.length; i++) {
      const clippingContext = this._clippingContextListForMask[i];
      const count = clippingContext._clippingIdCount;
      if (count != drawableMaskCounts) {
        continue;
      }
      let sameCount = 0;
      for (let j = 0; j < count; j++) {
        const clipId = clippingContext._clippingIdList[j];
        for (let k = 0; k < count; k++) {
          if (drawableMasks[k] == clipId) {
            sameCount++;
            break;
          }
        }
      }
      if (sameCount == count) {
        return clippingContext;
      }
    }
    return null;
  }
  /**
   * 高精細マスク処理用の行列を計算する
   * @param model モデルのインスタンス
   * @param isRightHanded 処理が右手系であるか
   */
  setupMatrixForHighPrecision(model, isRightHanded) {
    let usingClipCount = 0;
    for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
      const cc = this._clippingContextListForMask[clipIndex];
      this.calcClippedDrawableTotalBounds(model, cc);
      if (cc._isUsing) {
        usingClipCount++;
      }
    }
    if (usingClipCount > 0) {
      this.setupLayoutBounds(0);
      if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
        this._clearedMaskBufferFlags.length = this._renderTextureCount;
        for (let i = 0; i < this._renderTextureCount; i++) {
          this._clearedMaskBufferFlags[i] = false;
        }
      } else {
        for (let i = 0; i < this._renderTextureCount; i++) {
          this._clearedMaskBufferFlags[i] = false;
        }
      }
      for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
        const clipContext = this._clippingContextListForMask[clipIndex];
        const allClippedDrawRect = clipContext._allClippedDrawRect;
        const layoutBoundsOnTex01 = clipContext._layoutBounds;
        const margin = 0.05;
        let scaleX = 0;
        let scaleY = 0;
        const ppu = model.getPixelsPerUnit();
        const maskPixelSize = clipContext.getClippingManager().getClippingMaskBufferSize();
        const physicalMaskWidth = layoutBoundsOnTex01.width * maskPixelSize;
        const physicalMaskHeight = layoutBoundsOnTex01.height * maskPixelSize;
        this._tmpBoundsOnModel.setRect(allClippedDrawRect);
        if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
          this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0);
          scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
        } else {
          scaleX = ppu / physicalMaskWidth;
        }
        if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
          this._tmpBoundsOnModel.expand(
            0,
            allClippedDrawRect.height * margin
          );
          scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
        } else {
          scaleY = ppu / physicalMaskHeight;
        }
        this.createMatrixForMask(
          isRightHanded,
          layoutBoundsOnTex01,
          scaleX,
          scaleY
        );
        clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
        clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
      }
    }
  }
  /**
   * オフスクリーンの高精細マスク処理用の行列を計算する
   *
   * @param model モデルのインスタンス
   * @param isRightHanded 処理が右手系であるか
   * @param mvp モデルビュー投影行列
   */
  setupMatrixForOffscreenHighPrecision(model, isRightHanded, mvp) {
    let usingClipCount = 0;
    for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
      const cc = this._clippingContextListForMask[clipIndex];
      this.calcClippedOffscreenTotalBounds(model, cc);
      if (cc._isUsing) {
        usingClipCount++;
      }
    }
    if (usingClipCount <= 0) {
      return;
    }
    this.setupLayoutBounds(0);
    if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
      this._clearedMaskBufferFlags.length = this._renderTextureCount;
      for (let i = 0; i < this._renderTextureCount; ++i) {
        this._clearedMaskBufferFlags[i] = false;
      }
    } else {
      for (let i = 0; i < this._renderTextureCount; ++i) {
        this._clearedMaskBufferFlags[i] = false;
      }
    }
    for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
      const clipContext = this._clippingContextListForMask[clipIndex];
      const allClippedDrawRect = clipContext._allClippedDrawRect;
      const layoutBoundsOnTex01 = clipContext._layoutBounds;
      const margin = 0.05;
      let scaleX = 0;
      let scaleY = 0;
      const ppu = model.getPixelsPerUnit();
      const maskPixel = clipContext.getClippingManager().getClippingMaskBufferSize();
      const physicalMaskWidth = layoutBoundsOnTex01.width * maskPixel;
      const physicalMaskHeight = layoutBoundsOnTex01.height * maskPixel;
      this._tmpBoundsOnModel.setRect(allClippedDrawRect);
      if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
        this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0);
        scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
      } else {
        scaleX = ppu / physicalMaskWidth;
      }
      if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
        this._tmpBoundsOnModel.expand(0, allClippedDrawRect.height * margin);
        scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
      } else {
        scaleY = ppu / physicalMaskHeight;
      }
      this.createMatrixForMask(
        isRightHanded,
        layoutBoundsOnTex01,
        scaleX,
        scaleY
      );
      clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
      clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
      const invertMvp = mvp.getInvert();
      clipContext._matrixForDraw.multiplyByMatrix(invertMvp);
    }
  }
  /**
   * マスクを使う描画オブジェクトの全体の矩形を計算する。
   *
   * @param model モデルのインスタンス
   * @param clippingContext クリッピングコンテキスト
   */
  calcClippedOffscreenTotalBounds(model, clippingContext) {
    let clippedDrawTotalMinX = Number.MAX_VALUE, clippedDrawTotalMinY = Number.MAX_VALUE;
    let clippedDrawTotalMaxX = -Number.MAX_VALUE, clippedDrawTotalMaxY = -Number.MAX_VALUE;
    const clippedOffscreenCount = clippingContext._clippedOffscreenIndexList.length;
    const clippedOffscreenChildDrawableIndexList = new Array();
    for (let clippedOffscreenIndex = 0; clippedOffscreenIndex < clippedOffscreenCount; clippedOffscreenIndex++) {
      const offscreenIndex = clippingContext._clippedOffscreenIndexList[clippedOffscreenIndex];
      this.getOffscreenChildDrawableIndexList(
        model,
        offscreenIndex,
        clippedOffscreenChildDrawableIndexList
      );
    }
    const childDrawableCount = clippedOffscreenChildDrawableIndexList.length;
    for (let childDrawableIndex = 0; childDrawableIndex < childDrawableCount; childDrawableIndex++) {
      const drawableVertexCount = model.getDrawableVertexCount(
        clippedOffscreenChildDrawableIndexList[childDrawableIndex]
      );
      const drawableVertexes = model.getDrawableVertices(
        clippedOffscreenChildDrawableIndexList[childDrawableIndex]
      );
      let minX = Number.MAX_VALUE, minY = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE, maxY = -Number.MAX_VALUE;
      const loop = drawableVertexCount * Constant.vertexStep;
      for (let pi = Constant.vertexOffset; pi < loop; pi += Constant.vertexStep) {
        const x = drawableVertexes[pi];
        const y = drawableVertexes[pi + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (minX == Number.MAX_VALUE) continue;
      if (minX < clippedDrawTotalMinX) clippedDrawTotalMinX = minX;
      if (minY < clippedDrawTotalMinY) clippedDrawTotalMinY = minY;
      if (maxX > clippedDrawTotalMaxX) clippedDrawTotalMaxX = maxX;
      if (maxY > clippedDrawTotalMaxY) clippedDrawTotalMaxY = maxY;
    }
    if (clippedDrawTotalMinX == Number.MAX_VALUE) {
      clippingContext._allClippedDrawRect.x = 0;
      clippingContext._allClippedDrawRect.y = 0;
      clippingContext._allClippedDrawRect.width = 0;
      clippingContext._allClippedDrawRect.height = 0;
      clippingContext._isUsing = false;
    } else {
      clippingContext._isUsing = true;
      const w = clippedDrawTotalMaxX - clippedDrawTotalMinX;
      const h = clippedDrawTotalMaxY - clippedDrawTotalMinY;
      clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
      clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
      clippingContext._allClippedDrawRect.width = w;
      clippingContext._allClippedDrawRect.height = h;
    }
  }
  /**
   * マスクを使う描画オブジェクトの全体の矩形を計算する。
   *
   * @param model モデルのインスタンス
   * @param offscreenIndex オフスクリーンのインデックス
   * @param childDrawableIndexList オフスクリーンの子Drawableのインデックスリスト
   */
  getOffscreenChildDrawableIndexList(model, offscreenIndex, childDrawableIndexList) {
    const ownerIndex = model.getOffscreenOwnerIndices()[offscreenIndex];
    this.getPartChildDrawableIndexList(
      model,
      ownerIndex,
      childDrawableIndexList
    );
  }
  /**
   * パーツの子Drawableのインデックスリストを取得する。
   *
   * @param model モデルのインスタンス
   * @param partIndex パーツのインデックス
   * @param childDrawableIndexList パーツの子Drawableのインデックスリスト
   */
  getPartChildDrawableIndexList(model, partIndex, childDrawableIndexList) {
    const childDrawObjects = model.getPartsHierarchy()[partIndex].childDrawObjects;
    childDrawableIndexList.push(...childDrawObjects.drawableIndices);
    for (let i = 0; i < childDrawObjects.offscreenIndices.length; ++i) {
      this.getOffscreenChildDrawableIndexList(
        model,
        childDrawObjects.offscreenIndices[i],
        childDrawableIndexList
      );
    }
  }
  /**
   * マスク作成・描画用の行列を作成する。
   * @param isRightHanded 座標を右手系として扱うかを指定
   * @param layoutBoundsOnTex01 マスクを収める領域
   * @param scaleX 描画オブジェクトの伸縮率
   * @param scaleY 描画オブジェクトの伸縮率
   */
  createMatrixForMask(isRightHanded, layoutBoundsOnTex01, scaleX, scaleY) {
    this._tmpMatrix.loadIdentity();
    {
      this._tmpMatrix.translateRelative(-1, -1);
      this._tmpMatrix.scaleRelative(2, 2);
    }
    {
      this._tmpMatrix.translateRelative(
        layoutBoundsOnTex01.x,
        layoutBoundsOnTex01.y
      );
      this._tmpMatrix.scaleRelative(scaleX, scaleY);
      this._tmpMatrix.translateRelative(
        -this._tmpBoundsOnModel.x,
        -this._tmpBoundsOnModel.y
      );
    }
    this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());
    this._tmpMatrix.loadIdentity();
    {
      this._tmpMatrix.translateRelative(
        layoutBoundsOnTex01.x,
        layoutBoundsOnTex01.y * (isRightHanded ? -1 : 1)
      );
      this._tmpMatrix.scaleRelative(
        scaleX,
        scaleY * (isRightHanded ? -1 : 1)
      );
      this._tmpMatrix.translateRelative(
        -this._tmpBoundsOnModel.x,
        -this._tmpBoundsOnModel.y
      );
    }
    this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
  }
  /**
   * クリッピングコンテキストを配置するレイアウト
   * 指定された数のレンダーテクスチャを極力いっぱいに使ってマスクをレイアウトする
   * マスクグループの数が4以下ならRGBA各チャンネルに一つずつマスクを配置し、5以上6以下ならRGBAを2,2,1,1と配置する。
   *
   * @param usingClipCount 配置するクリッピングコンテキストの数
   */
  setupLayoutBounds(usingClipCount) {
    const useClippingMaskMaxCount = this._renderTextureCount <= 1 ? ClippingMaskMaxCountOnDefault : ClippingMaskMaxCountOnMultiRenderTexture * this._renderTextureCount;
    if (usingClipCount <= 0 || usingClipCount > useClippingMaskMaxCount) {
      if (usingClipCount > useClippingMaskMaxCount) {
        CubismLogError(
          "not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}",
          usingClipCount - useClippingMaskMaxCount,
          this._renderTextureCount,
          usingClipCount
        );
      }
      for (let index = 0; index < this._clippingContextListForMask.length; index++) {
        const clipContext = this._clippingContextListForMask[index];
        clipContext._layoutChannelIndex = 0;
        clipContext._layoutBounds.x = 0;
        clipContext._layoutBounds.y = 0;
        clipContext._layoutBounds.width = 1;
        clipContext._layoutBounds.height = 1;
        clipContext._bufferIndex = 0;
      }
      return;
    }
    const layoutCountMaxValue = this._renderTextureCount <= 1 ? 9 : 8;
    let countPerSheetDiv = usingClipCount / this._renderTextureCount;
    const reduceLayoutTextureCount = usingClipCount % this._renderTextureCount;
    countPerSheetDiv = Math.ceil(countPerSheetDiv);
    let divCount = countPerSheetDiv / ColorChannelCount;
    const modCount = countPerSheetDiv % ColorChannelCount;
    divCount = ~~divCount;
    let curClipIndex = 0;
    for (let renderTextureIndex = 0; renderTextureIndex < this._renderTextureCount; renderTextureIndex++) {
      for (let channelIndex = 0; channelIndex < ColorChannelCount; channelIndex++) {
        let layoutCount = divCount + (channelIndex < modCount ? 1 : 0);
        const checkChannelIndex = modCount + (divCount < 1 ? -1 : 0);
        if (channelIndex == checkChannelIndex && reduceLayoutTextureCount > 0) {
          layoutCount -= !(renderTextureIndex < reduceLayoutTextureCount) ? 1 : 0;
        }
        if (layoutCount == 0) {
        } else if (layoutCount == 1) {
          const clipContext = this._clippingContextListForMask[curClipIndex++];
          clipContext._layoutChannelIndex = channelIndex;
          clipContext._layoutBounds.x = 0;
          clipContext._layoutBounds.y = 0;
          clipContext._layoutBounds.width = 1;
          clipContext._layoutBounds.height = 1;
          clipContext._bufferIndex = renderTextureIndex;
        } else if (layoutCount == 2) {
          for (let i = 0; i < layoutCount; i++) {
            let xpos = i % 2;
            xpos = ~~xpos;
            const cc = this._clippingContextListForMask[curClipIndex++];
            cc._layoutChannelIndex = channelIndex;
            cc._layoutBounds.x = xpos * 0.5;
            cc._layoutBounds.y = 0;
            cc._layoutBounds.width = 0.5;
            cc._layoutBounds.height = 1;
            cc._bufferIndex = renderTextureIndex;
          }
        } else if (layoutCount <= 4) {
          for (let i = 0; i < layoutCount; i++) {
            let xpos = i % 2;
            let ypos = i / 2;
            xpos = ~~xpos;
            ypos = ~~ypos;
            const cc = this._clippingContextListForMask[curClipIndex++];
            cc._layoutChannelIndex = channelIndex;
            cc._layoutBounds.x = xpos * 0.5;
            cc._layoutBounds.y = ypos * 0.5;
            cc._layoutBounds.width = 0.5;
            cc._layoutBounds.height = 0.5;
            cc._bufferIndex = renderTextureIndex;
          }
        } else if (layoutCount <= layoutCountMaxValue) {
          for (let i = 0; i < layoutCount; i++) {
            let xpos = i % 3;
            let ypos = i / 3;
            xpos = ~~xpos;
            ypos = ~~ypos;
            const cc = this._clippingContextListForMask[curClipIndex++];
            cc._layoutChannelIndex = channelIndex;
            cc._layoutBounds.x = xpos / 3;
            cc._layoutBounds.y = ypos / 3;
            cc._layoutBounds.width = 1 / 3;
            cc._layoutBounds.height = 1 / 3;
            cc._bufferIndex = renderTextureIndex;
          }
        } else {
          CubismLogError(
            "not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}",
            usingClipCount - useClippingMaskMaxCount,
            this._renderTextureCount,
            usingClipCount
          );
          for (let index = 0; index < layoutCount; index++) {
            const cc = this._clippingContextListForMask[curClipIndex++];
            cc._layoutChannelIndex = 0;
            cc._layoutBounds.x = 0;
            cc._layoutBounds.y = 0;
            cc._layoutBounds.width = 1;
            cc._layoutBounds.height = 1;
            cc._bufferIndex = 0;
          }
        }
      }
    }
  }
  /**
   * マスクされる描画オブジェクト群全体を囲む矩形（モデル座標系）を計算する
   * @param model モデルのインスタンス
   * @param clippingContext クリッピングマスクのコンテキスト
   */
  calcClippedDrawableTotalBounds(model, clippingContext) {
    let clippedDrawTotalMinX = Number.MAX_VALUE;
    let clippedDrawTotalMinY = Number.MAX_VALUE;
    let clippedDrawTotalMaxX = Number.MIN_VALUE;
    let clippedDrawTotalMaxY = Number.MIN_VALUE;
    const clippedDrawCount = clippingContext._clippedDrawableIndexList.length;
    for (let clippedDrawableIndex = 0; clippedDrawableIndex < clippedDrawCount; clippedDrawableIndex++) {
      const drawableIndex = clippingContext._clippedDrawableIndexList[clippedDrawableIndex];
      const drawableVertexCount = model.getDrawableVertexCount(drawableIndex);
      const drawableVertexes = model.getDrawableVertices(drawableIndex);
      let minX = Number.MAX_VALUE;
      let minY = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE;
      let maxY = -Number.MAX_VALUE;
      const loop = drawableVertexCount * Constant.vertexStep;
      for (let pi = Constant.vertexOffset; pi < loop; pi += Constant.vertexStep) {
        const x = drawableVertexes[pi];
        const y = drawableVertexes[pi + 1];
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
      if (minX == Number.MAX_VALUE) {
        continue;
      }
      if (minX < clippedDrawTotalMinX) {
        clippedDrawTotalMinX = minX;
      }
      if (minY < clippedDrawTotalMinY) {
        clippedDrawTotalMinY = minY;
      }
      if (maxX > clippedDrawTotalMaxX) {
        clippedDrawTotalMaxX = maxX;
      }
      if (maxY > clippedDrawTotalMaxY) {
        clippedDrawTotalMaxY = maxY;
      }
      if (clippedDrawTotalMinX == Number.MAX_VALUE) {
        clippingContext._allClippedDrawRect.x = 0;
        clippingContext._allClippedDrawRect.y = 0;
        clippingContext._allClippedDrawRect.width = 0;
        clippingContext._allClippedDrawRect.height = 0;
        clippingContext._isUsing = false;
      } else {
        clippingContext._isUsing = true;
        const w = clippedDrawTotalMaxX - clippedDrawTotalMinX;
        const h = clippedDrawTotalMaxY - clippedDrawTotalMinY;
        clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
        clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
        clippingContext._allClippedDrawRect.width = w;
        clippingContext._allClippedDrawRect.height = h;
      }
    }
  }
  /**
   * 画面描画に使用するクリッピングマスクのリストを取得する
   * @return 画面描画に使用するクリッピングマスクのリスト
   */
  getClippingContextListForDraw() {
    return this._clippingContextListForDraw;
  }
  getClippingContextListForOffscreen() {
    return this._clippingContextListForOffscreen;
  }
  /**
   * クリッピングマスクバッファのサイズを取得する
   * @return クリッピングマスクバッファのサイズ
   */
  getClippingMaskBufferSize() {
    return this._clippingMaskBufferSize;
  }
  /**
   * このバッファのレンダーテクスチャの枚数を取得する
   * @return このバッファのレンダーテクスチャの枚数
   */
  getRenderTextureCount() {
    return this._renderTextureCount;
  }
  /**
   * カラーチャンネル（RGBA）のフラグを取得する
   * @param channelNo カラーチャンネル（RGBA）の番号（0:R, 1:G, 2:B, 3:A）
   */
  getChannelFlagAsColor(channelNo) {
    return this._channelColors[channelNo];
  }
  /**
   * クリッピングマスクバッファのサイズを設定する
   * @param size クリッピングマスクバッファのサイズ
   */
  setClippingMaskBufferSize(size) {
    this._clippingMaskBufferSize = size;
  }
  _clearedMaskBufferFlags;
  //マスクのクリアフラグの配列
  _channelColors;
  _clippingContextListForMask;
  // マスク用クリッピングコンテキストのリスト
  _clippingContextListForDraw;
  // 描画用クリッピングコンテキストのリスト
  _clippingContextListForOffscreen;
  // オフスクリーン用クリッピングコンテキストのリスト
  _clippingMaskBufferSize;
  // クリッピングマスクのバッファサイズ（初期値:256）
  _renderTextureCount;
  // 生成するレンダーテクスチャの枚数
  _tmpMatrix;
  // マスク計算用の行列
  _tmpMatrixForMask;
  // マスク計算用の行列
  _tmpMatrixForDraw;
  // マスク計算用の行列
  _tmpBoundsOnModel;
  // マスク配置計算用の矩形
  _clippingContexttConstructor;
};

// vendor/cubism-framework/src/rendering/cubismrendertarget_webgl.ts
var CubismRenderTarget_WebGL = class {
  /**
   * WebGL2RenderingContext.blitFramebuffer() でバッファのコピーを行う。
   *
   * @param src コピー元のオフスクリーンサーフェス
   * @param dst コピー先のオフスクリーンサーフェス
   */
  static copyBuffer(gl, src, dst) {
    if (src == null || dst == null) {
      return;
    }
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error("WebGL2RenderingContext is required for buffer copy.");
    }
    const previousFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.getRenderTexture());
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.getRenderTexture());
    gl.blitFramebuffer(
      0,
      0,
      src.getBufferWidth(),
      src.getBufferHeight(),
      0,
      0,
      dst.getBufferWidth(),
      dst.getBufferHeight(),
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  }
  /**
   * 描画を開始する。
   *
   * @param restoreFbo EndDraw時に復元するFBOを指定する。nullを指定すると、beginDraw時に現在のFBOを記憶しておく。
   */
  beginDraw(restoreFbo = null) {
    if (this._renderTexture == null) {
      console.error("_renderTexture is null");
      return;
    }
    if (restoreFbo == null) {
      this._oldFbo = this._gl.getParameter(this._gl.FRAMEBUFFER_BINDING);
    } else {
      this._oldFbo = restoreFbo;
    }
    this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._renderTexture);
  }
  /**
   * 描画を終了し、バックバッファのサーフェイスを復元する。
   */
  endDraw() {
    this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._oldFbo);
  }
  /**
   * バインドされているカラーバッファのクリアを行う。
   *
   * @param r 赤の成分 (0.0 - 1.0)
   * @param g 緑の成分 (0.0 - 1.0)
   * @param b 青の成分 (0.0 - 1.0)
   * @param a アルファの成分 (0.0 - 1.0)
   */
  clear(r, g, b, a) {
    this._gl.clearColor(r, g, b, a);
    this._gl.clear(this._gl.COLOR_BUFFER_BIT);
  }
  /**
   * オフスクリーンサーフェスを作成する。
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   *          NOTE: Cubism 5.3以降のモデルが使用される場合はWebGL2RenderingContextを使用すること。
   * @param displayBufferWidth オフスクリーンサーフェスの幅
   * @param displayBufferHeight オフスクリーンサーフェスの高さ
   * @param previousFramebuffer 前のフレームバッファ
   *
   * @return 成功した場合はtrue、失敗した場合はfalse
   */
  createRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
    this.destroyRenderTarget();
    this._colorBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._colorBuffer);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      displayBufferWidth,
      displayBufferHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const ret = gl.createFramebuffer();
    if (ret == null) {
      CubismLogError("Failed to create framebuffer");
      return false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, ret);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this._colorBuffer,
      0
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      CubismLogError("Framebuffer is not complete");
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      gl.deleteFramebuffer(ret);
      this.destroyRenderTarget();
      return false;
    }
    this._renderTexture = ret;
    this._bufferWidth = displayBufferWidth;
    this._bufferHeight = displayBufferHeight;
    this._gl = gl;
    return true;
  }
  /**
   * レンダーターゲットを破棄する。
   */
  destroyRenderTarget() {
    if (this._colorBuffer) {
      this._gl.bindTexture(this._gl.TEXTURE_2D, null);
      this._gl.deleteTexture(this._colorBuffer);
      this._colorBuffer = null;
    }
    if (this._renderTexture) {
      this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
      this._gl.deleteFramebuffer(this._renderTexture);
      this._renderTexture = null;
    }
  }
  /**
   * WebGLのコンテキストを取得する。
   *
   * @return WebGLRenderingContextまたはWebGL2RenderingContext
   */
  getGL() {
    return this._gl;
  }
  /**
   * レンダーテクスチャを取得する。
   *
   * @return WebGLFramebuffer
   */
  getRenderTexture() {
    return this._renderTexture;
  }
  /**
   * カラーバッファを取得する。
   *
   * @return WebGLTexture
   */
  getColorBuffer() {
    return this._colorBuffer;
  }
  /**
   * カラーバッファの幅を取得する。
   *
   * @return カラーバッファの幅
   */
  getBufferWidth() {
    return this._bufferWidth;
  }
  /**
   * カラーバッファの高さを取得する。
   *
   * @return カラーバッファの高さ
   */
  getBufferHeight() {
    return this._bufferHeight;
  }
  /**
   * オフスクリーンサーフェスが有効かどうかを確認する。
   *
   * @return 有効な場合はtrue、無効な場合はfalse
   */
  isValid() {
    return this._renderTexture != null;
  }
  /**
   * 以前のフレームバッファを取得する。
   *
   * @return 以前のフレームバッファ
   */
  getOldFBO() {
    return this._oldFbo;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._gl = null;
    this._colorBuffer = null;
    this._renderTexture = null;
    this._bufferWidth = 0;
    this._bufferHeight = 0;
    this._oldFbo = null;
  }
  _gl;
  // WebGLのコンテキスト
  _colorBuffer;
  // カラーバッファ
  _renderTexture;
  // フレームバッファ
  _bufferWidth;
  // カラーバッファの幅
  _bufferHeight;
  // カラーバッファの高さ
  _oldFbo;
  // 以前のフレームバッファ
};
var Live2DCubismFramework13;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismOffscreenSurface_WebGL = CubismRenderTarget_WebGL;
})(Live2DCubismFramework13 || (Live2DCubismFramework13 = {}));

// vendor/cubism-framework/src/rendering/cubismshader_webgl.ts
var VertShaderSrcPath = "vertshadersrc.vert";
var VertShaderSrcMaskedPath = "vertshadersrcmasked.vert";
var VertShaderSrcSetupMaskPath = "vertshadersrcsetupmask.vert";
var FragShaderSrcSetupMaskPath = "fragshadersrcsetupmask.frag";
var FragShaderSrcPremultipliedAlphaPath = "fragshadersrcpremultipliedalpha.frag";
var FragShaderSrcMaskPremultipliedAlphaPath = "fragshadersrcmaskpremultipliedalpha.frag";
var FragShaderSrcMaskInvertedPremultipliedAlphaPath = "fragshadersrcmaskinvertedpremultipliedalpha.frag";
var VertShaderSrcCopyPath = "vertshadersrccopy.vert";
var FragShaderSrcCopyPath = "fragshadersrccopy.frag";
var FragShaderSrcColorBlendPath = "fragshadersrccolorblend.frag";
var FragShaderSrcAlphaBlendPath = "fragshadersrcalphablend.frag";
var VertShaderSrcBlendPath = "vertshadersrcblend.vert";
var FragShaderSrcBlendPath = "fragshadersrcpremultipliedalphablend.frag";
var ColorBlendPrefix = "ColorBlend_";
var AlphaBlendPrefix = "AlphaBlend_";
var s_instance;
var s_renderTargetVertexArray = new Float32Array([
  -1,
  -1,
  1,
  -1,
  -1,
  1,
  1,
  1
]);
var s_renderTargetUvArray = new Float32Array([
  0,
  0,
  1,
  0,
  0,
  1,
  1,
  1
]);
var s_renderTargetReverseUvArray = new Float32Array([
  0,
  1,
  1,
  1,
  0,
  0,
  1,
  0
]);
var CubismShader_WebGL = class {
  /**
   * 非同期でシェーダーをパスから読み込む
   *
   * @param url シェーダーのURL
   *
   * @return シェーダーのソースコード
   */
  async loadShader(url) {
    const response = await fetch(url);
    return await response.text();
  }
  /**
   * ブレンドモード用のシェーダーを読み込む
   */
  async loadShaders() {
    const shaderDir = this._shaderPath ?? this._defaultShaderPath;
    const shaderFiles = [
      { path: shaderDir + VertShaderSrcPath, prop: "_vertShaderSrc" },
      {
        path: shaderDir + VertShaderSrcMaskedPath,
        prop: "_vertShaderSrcMasked"
      },
      {
        path: shaderDir + VertShaderSrcSetupMaskPath,
        prop: "_vertShaderSrcSetupMask"
      },
      {
        path: shaderDir + FragShaderSrcSetupMaskPath,
        prop: "_fragShaderSrcSetupMask"
      },
      {
        path: shaderDir + FragShaderSrcPremultipliedAlphaPath,
        prop: "_fragShaderSrcPremultipliedAlpha"
      },
      {
        path: shaderDir + FragShaderSrcMaskPremultipliedAlphaPath,
        prop: "_fragShaderSrcMaskPremultipliedAlpha"
      },
      {
        path: shaderDir + FragShaderSrcMaskInvertedPremultipliedAlphaPath,
        prop: "_fragShaderSrcMaskInvertedPremultipliedAlpha"
      },
      { path: shaderDir + VertShaderSrcCopyPath, prop: "_vertShaderSrcCopy" },
      { path: shaderDir + FragShaderSrcCopyPath, prop: "_fragShaderSrcCopy" },
      {
        path: shaderDir + FragShaderSrcColorBlendPath,
        prop: "_fragShaderSrcColorBlend"
      },
      {
        path: shaderDir + FragShaderSrcAlphaBlendPath,
        prop: "_fragShaderSrcAlphaBlend"
      },
      { path: shaderDir + VertShaderSrcBlendPath, prop: "_vertShaderSrcBlend" },
      { path: shaderDir + FragShaderSrcBlendPath, prop: "_fragShaderSrcBlend" }
    ];
    const results = await Promise.all(
      shaderFiles.map(
        (file) => this.loadShader(file.path).then((data) => ({ prop: file.prop, data })).catch((error) => {
          console.error(`Error loading ${file.path} shader:`, error);
          return { prop: file.prop, data: "" };
        })
      )
    );
    results.forEach((result) => {
      this[result.prop] = result.data;
    });
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._shaderSets = new Array();
    this._isShaderLoading = false;
    this._isShaderLoaded = false;
    this._colorBlendMap = /* @__PURE__ */ new Map();
    this._colorBlendValues = new Array();
    const colorBlendKeys = Object.keys(CubismColorBlend);
    const colorBlendRawValues = Object.keys(CubismColorBlend).map(
      (k) => CubismColorBlend[k]
    );
    for (let i = 0; i < colorBlendKeys.length; i++) {
      const colorBlendKey = colorBlendKeys[i];
      if (colorBlendKey.includes(ColorBlendPrefix)) {
        const blendModeName = colorBlendKey.slice(ColorBlendPrefix.length);
        const colorBlendNumber = parseInt(colorBlendRawValues[i].toString());
        this._colorBlendMap.set(colorBlendNumber, blendModeName);
        this._colorBlendValues.push(colorBlendNumber);
      }
    }
    this._alphaBlendMap = /* @__PURE__ */ new Map();
    this._alphaBlendValues = new Array();
    const alphaBlendKeys = Object.keys(CubismAlphaBlend);
    const alphaBlendRawValues = Object.keys(CubismAlphaBlend).map(
      (k) => CubismAlphaBlend[k]
    );
    for (let i = 0; i < alphaBlendKeys.length; i++) {
      const alphaBlendKey = alphaBlendKeys[i];
      if (alphaBlendKey.includes(AlphaBlendPrefix)) {
        const blendModeName = alphaBlendKey.slice(AlphaBlendPrefix.length);
        const alphaBlendNumber = parseInt(alphaBlendRawValues[i].toString());
        this._alphaBlendMap.set(alphaBlendNumber, blendModeName);
        this._alphaBlendValues.push(alphaBlendNumber);
      }
    }
    this._blendShaderSetMap = /* @__PURE__ */ new Map();
    this._shaderCount = 10 /* ShaderNames_ShaderCount */ + 1 + (this._colorBlendValues.length - 3) * (this._alphaBlendValues.length - 1) * 3;
    this._defaultShaderPath = "../../Framework/Shaders/WebGL/";
    this._shaderPath = this._defaultShaderPath;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this.releaseShaderProgram();
  }
  /**
   * 描画用のシェーダプログラムの一連のセットアップを実行する
   *
   * @param renderer レンダラー
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  setupShaderProgramForDrawable(renderer, model, index) {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError("NoPremultipliedAlpha is not allowed");
    }
    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }
    if (this._isShaderLoaded == false) {
      CubismLogWarning("Shader program is not initialized.");
      return;
    }
    let srcColor;
    let dstColor;
    let srcAlpha;
    let dstAlpha;
    const masked = renderer.getClippingContextBufferForDrawable() != null;
    const invertedMask = model.getDrawableInvertedMaskBit(index);
    const offset = masked ? invertedMask ? 2 : 1 : 0;
    let shaderSet;
    let isUsingCompatible = true;
    if (model.isBlendModeEnabled()) {
      const colorBlendMode = model.getDrawableColorBlend(index);
      const alphaBlendMode = model.getDrawableAlphaBlend(index);
      if (colorBlendMode == -1 /* ColorBlend_None */ || alphaBlendMode == -1 /* AlphaBlend_None */ || colorBlendMode == CubismColorBlend.ColorBlend_Normal && alphaBlendMode == 0 /* AlphaBlend_Over */) {
        shaderSet = this._shaderSets[1 /* ShaderNames_NormalPremultipliedAlpha */ + offset];
        srcColor = this.gl.ONE;
        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
        srcAlpha = this.gl.ONE;
        dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
      } else {
        switch (colorBlendMode) {
          // Cubism 5.2以前のシェーダを使用する。
          case CubismColorBlend.ColorBlend_AddCompatible:
            shaderSet = this._shaderSets[4 /* ShaderNames_AddPremultipliedAlpha */ + offset];
            srcColor = this.gl.ONE;
            dstColor = this.gl.ONE;
            srcAlpha = this.gl.ZERO;
            dstAlpha = this.gl.ONE;
            break;
          // Cubism 5.2以前のシェーダを使用する。
          case CubismColorBlend.ColorBlend_MultiplyCompatible:
            shaderSet = this._shaderSets[7 /* ShaderNames_MultPremultipliedAlpha */ + offset];
            srcColor = this.gl.DST_COLOR;
            dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
            srcAlpha = this.gl.ZERO;
            dstAlpha = this.gl.ONE;
            break;
          // ブレンドモードの組み合わせでシェーダーを決定
          default:
            {
              const srcBuffer = renderer._currentOffscreen != null ? renderer._currentOffscreen : renderer.getModelRenderTarget(0);
              CubismRenderTarget_WebGL.copyBuffer(
                this.gl,
                srcBuffer,
                renderer.getModelRenderTarget(1)
              );
              const baseShaderSetIndex = this._blendShaderSetMap.get(
                this._colorBlendMap.get(colorBlendMode) + this._alphaBlendMap.get(alphaBlendMode)
              );
              shaderSet = this._shaderSets[baseShaderSetIndex + offset];
              srcColor = this.gl.ONE;
              dstColor = this.gl.ZERO;
              srcAlpha = this.gl.ONE;
              dstAlpha = this.gl.ZERO;
              isUsingCompatible = false;
            }
            break;
        }
      }
    } else {
      switch (model.getDrawableBlendMode(index)) {
        case 0 /* CubismBlendMode_Normal */:
        default:
          shaderSet = this._shaderSets[1 /* ShaderNames_NormalPremultipliedAlpha */ + offset];
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ONE;
          dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
          break;
        case 1 /* CubismBlendMode_Additive */:
          shaderSet = this._shaderSets[4 /* ShaderNames_AddPremultipliedAlpha */ + offset];
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
        case 2 /* CubismBlendMode_Multiplicative */:
          shaderSet = this._shaderSets[7 /* ShaderNames_MultPremultipliedAlpha */ + offset];
          srcColor = this.gl.DST_COLOR;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
      }
    }
    this.gl.useProgram(shaderSet.shaderProgram);
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    const vertexArray = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    if (masked) {
      this.gl.activeTexture(this.gl.TEXTURE1);
      const tex = renderer.getDrawableMaskBuffer(
        renderer.getClippingContextBufferForDrawable()._bufferIndex
      ).getColorBuffer();
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
      this.gl.uniformMatrix4fv(
        shaderSet.uniformClipMatrixLocation,
        false,
        renderer.getClippingContextBufferForDrawable()._matrixForDraw.getArray()
      );
      const channelIndex = renderer.getClippingContextBufferForDrawable()._layoutChannelIndex;
      const colorChannel = renderer.getClippingContextBufferForDrawable().getClippingManager().getChannelFlagAsColor(channelIndex);
      this.gl.uniform4f(
        shaderSet.uniformChannelFlagLocation,
        colorChannel.r,
        colorChannel.g,
        colorChannel.b,
        colorChannel.a
      );
      if (model.isBlendModeEnabled()) {
        this.gl.uniform1f(
          shaderSet.uniformInvertMaskFlagLocation,
          invertedMask ? 1 : 0
        );
      }
    }
    const textureNo = model.getDrawableTextureIndex(index);
    const textureId = renderer.getBindedTextures().get(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
    const matrix4x4 = renderer.getMvpMatrix();
    this.gl.uniformMatrix4fv(
      shaderSet.uniformMatrixLocation,
      false,
      matrix4x4.getArray()
    );
    let baseColor = null;
    if (model.isBlendModeEnabled()) {
      const drawableOpacity = model.getDrawableOpacity(index);
      baseColor = new CubismTextureColor(
        drawableOpacity,
        drawableOpacity,
        drawableOpacity,
        drawableOpacity
      );
    } else {
      baseColor = renderer.getModelColorWithOpacity(
        model.getDrawableOpacity(index)
      );
    }
    const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
    const multiplyColor = multiplyAndScreenColor.getDrawableMultiplyColor(index);
    const screenColor = multiplyAndScreenColor.getDrawableScreenColor(index);
    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );
    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );
    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );
    if (model.isBlendModeEnabled()) {
      this.gl.activeTexture(this.gl.TEXTURE2);
      if (!isUsingCompatible) {
        const tex = renderer.getModelRenderTarget(1).getColorBuffer();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
      }
    }
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray = model.getDrawableVertexIndices(index);
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );
    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }
  /**
   * オフスクリーン用のシェーダプログラムの一連のセットアップを実行する
   *
   * @param renderer レンダラー
   * @param model 描画対象のモデル
   * @param offscreen 描画対象のオフスクリーン
   */
  setupShaderProgramForOffscreen(renderer, model, offscreen) {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError("NoPremultipliedAlpha is not allowed");
    }
    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }
    if (this._isShaderLoaded == false) {
      CubismLogWarning("Shader program is not initialized.");
      return;
    }
    let srcColor;
    let dstColor;
    let srcAlpha;
    let dstAlpha;
    const offscreenIndex = offscreen.getOffscreenIndex();
    const masked = renderer.getClippingContextBufferForOffscreen() != null;
    const invertedMask = model.getOffscreenInvertedMask(offscreenIndex);
    const offset = masked ? invertedMask ? 2 : 1 : 0;
    let shaderSet;
    let isUsingCompatible = true;
    const colorBlendMode = model.getOffscreenColorBlend(offscreenIndex);
    const alphaBlendMode = model.getOffscreenAlphaBlend(offscreenIndex);
    if (colorBlendMode == -1 /* ColorBlend_None */ || alphaBlendMode == -1 /* AlphaBlend_None */ || colorBlendMode == CubismColorBlend.ColorBlend_Normal && alphaBlendMode == 0 /* AlphaBlend_Over */) {
      shaderSet = this._shaderSets[1 /* ShaderNames_NormalPremultipliedAlpha */ + offset];
      srcColor = this.gl.ONE;
      dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
      srcAlpha = this.gl.ONE;
      dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
    } else {
      switch (colorBlendMode) {
        // Cubism 5.2以前のシェーダを使用する。
        case CubismColorBlend.ColorBlend_AddCompatible:
          shaderSet = this._shaderSets[4 /* ShaderNames_AddPremultipliedAlpha */ + offset];
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
        case CubismColorBlend.ColorBlend_MultiplyCompatible:
          shaderSet = this._shaderSets[7 /* ShaderNames_MultPremultipliedAlpha */ + offset];
          srcColor = this.gl.DST_COLOR;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
        default:
          {
            const srcBuffer = offscreen.getOldOffscreen() != null ? offscreen.getOldOffscreen() : renderer.getModelRenderTarget(0);
            CubismRenderTarget_WebGL.copyBuffer(
              this.gl,
              srcBuffer,
              renderer.getModelRenderTarget(1)
            );
            const baseShaderSetIndex = this._blendShaderSetMap.get(
              this._colorBlendMap.get(colorBlendMode) + this._alphaBlendMap.get(alphaBlendMode)
            );
            shaderSet = this._shaderSets[baseShaderSetIndex + offset];
            srcColor = this.gl.ONE;
            dstColor = this.gl.ZERO;
            srcAlpha = this.gl.ONE;
            dstAlpha = this.gl.ZERO;
            isUsingCompatible = false;
          }
          break;
      }
    }
    this.gl.useProgram(shaderSet.shaderProgram);
    CubismRenderTarget_WebGL.copyBuffer(
      this.gl,
      offscreen,
      renderer.getModelRenderTarget(2)
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    const tex0 = renderer.getModelRenderTarget(2).getColorBuffer();
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex0);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
    const matrix4x4 = new CubismMatrix44();
    matrix4x4.loadIdentity();
    this.gl.uniformMatrix4fv(
      shaderSet.uniformMatrixLocation,
      false,
      matrix4x4.getArray()
    );
    const offscreenOpacity = model.getOffscreenOpacity(offscreenIndex);
    const baseColor = new CubismTextureColor(
      offscreenOpacity,
      offscreenOpacity,
      offscreenOpacity,
      offscreenOpacity
    );
    const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
    const multiplyColor = multiplyAndScreenColor.getOffscreenMultiplyColor(offscreenIndex);
    const screenColor = multiplyAndScreenColor.getOffscreenScreenColor(offscreenIndex);
    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );
    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );
    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );
    this.gl.activeTexture(this.gl.TEXTURE2);
    if (!isUsingCompatible) {
      const tex1 = renderer.getModelRenderTarget(1).getColorBuffer();
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex1);
      this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
    }
    if (masked) {
      this.gl.activeTexture(this.gl.TEXTURE1);
      const tex2 = renderer.getOffscreenMaskBuffer(
        renderer.getClippingContextBufferForOffscreen()._bufferIndex
      ).getColorBuffer();
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex2);
      this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
      this.gl.uniformMatrix4fv(
        shaderSet.uniformClipMatrixLocation,
        false,
        renderer.getClippingContextBufferForOffscreen()._matrixForDraw.getArray()
      );
      const channelIndex = renderer.getClippingContextBufferForOffscreen()._layoutChannelIndex;
      const colorChannel = renderer.getClippingContextBufferForOffscreen().getClippingManager().getChannelFlagAsColor(channelIndex);
      this.gl.uniform4f(
        shaderSet.uniformChannelFlagLocation,
        colorChannel.r,
        colorChannel.g,
        colorChannel.b,
        colorChannel.a
      );
      if (model.isBlendModeEnabled()) {
        this.gl.uniform1f(
          shaderSet.uniformInvertMaskFlagLocation,
          invertedMask ? 1 : 0
        );
      }
    }
    if (!renderer._bufferData.vertex) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetVertexArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );
    if (!renderer._bufferData.uv) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetReverseUvArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );
    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }
  /**
   * マスク用のシェーダプログラムの一連のセットアップを実行する
   *
   * @param renderer レンダラー
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  setupShaderProgramForMask(renderer, model, index) {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError("NoPremultipliedAlpha is not allowed");
    }
    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }
    if (this._isShaderLoaded == false) {
      CubismLogWarning("Shader program is not initialized.");
      return;
    }
    const shaderSet = this._shaderSets[0 /* ShaderNames_SetupMask */];
    this.gl.useProgram(shaderSet.shaderProgram);
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    const vertexArray = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const textureNo = model.getDrawableTextureIndex(index);
    const textureId = renderer.getBindedTextures().get(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    const channelIndex = renderer.getClippingContextBufferForMask()._layoutChannelIndex;
    const colorChannel = renderer.getClippingContextBufferForMask().getClippingManager().getChannelFlagAsColor(channelIndex);
    this.gl.uniform4f(
      shaderSet.uniformChannelFlagLocation,
      colorChannel.r,
      colorChannel.g,
      colorChannel.b,
      colorChannel.a
    );
    this.gl.uniformMatrix4fv(
      shaderSet.uniformClipMatrixLocation,
      false,
      renderer.getClippingContextBufferForMask()._matrixForMask.getArray()
    );
    const rect = renderer.getClippingContextBufferForMask()._layoutBounds;
    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      rect.x * 2 - 1,
      rect.y * 2 - 1,
      rect.getRight() * 2 - 1,
      rect.getBottom() * 2 - 1
    );
    const srcColor = this.gl.ZERO;
    const dstColor = this.gl.ONE_MINUS_SRC_COLOR;
    const srcAlpha = this.gl.ZERO;
    const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray = model.getDrawableVertexIndices(index);
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );
    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }
  /**
   * オフスクリーンのレンダリングターゲット用のシェーダープログラムを設定する
   *
   * @param renderer レンダラー
   */
  setupShaderProgramForOffscreenRenderTarget(renderer) {
    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }
    if (this._isShaderLoaded == false) {
      CubismLogWarning("Shader program is not initialized.");
      return;
    }
    const baseColor = renderer.getModelColor();
    baseColor.r *= baseColor.a;
    baseColor.g *= baseColor.a;
    baseColor.b *= baseColor.a;
    this.copyTexture(renderer, baseColor);
  }
  /**
   * オフスクリーンのレンダリングターゲットの内容をコピーする
   *
   * @param renderer レンダラー
   * @param baseColor ベースカラー
   */
  copyTexture(renderer, baseColor) {
    const srcColor = this.gl.ONE;
    const dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
    const srcAlpha = this.gl.ONE;
    const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
    const shaderSet = this._shaderSets[10];
    this.gl.useProgram(shaderSet.shaderProgram);
    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    const tex = renderer.getModelRenderTarget(0).getColorBuffer();
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
    if (!renderer._bufferData.vertex) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetVertexArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );
    if (!renderer._bufferData.uv) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetUvArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );
    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }
  /**
   * シェーダープログラムを解放する
   */
  releaseShaderProgram() {
    for (let i = 0; i < this._shaderSets.length; i++) {
      this.gl.deleteProgram(this._shaderSets[i].shaderProgram);
      this._shaderSets[i].shaderProgram = 0;
      this._shaderSets[i] = void 0;
      this._shaderSets[i] = null;
    }
  }
  /**
   * シェーダープログラムを初期化する
   *
   * @param vertShaderSrc 頂点シェーダのソース
   * @param fragShaderSrc フラグメントシェーダのソース
   */
  generateShaders() {
    if (this._isShaderLoading) {
      return;
    }
    this._isShaderLoading = true;
    this._isShaderLoaded = false;
    this._shaderSets.length = this._shaderCount;
    for (let i = 0; i < this._shaderCount; i++) {
      this._shaderSets[i] = new CubismShaderSet();
    }
    this.loadShaders().then(() => {
      this.registerShader();
      this.registerBlendShader();
      this._isShaderLoading = false;
      this._isShaderLoaded = true;
    }).catch((error) => {
      this._isShaderLoading = false;
      console.error("Failed to load shaders:", error);
    });
  }
  /**
   * シェーダープログラムを登録する
   */
  registerShader() {
    const vertexShaderSrc = this._vertShaderSrc;
    const vertexShaderSrcMasked = this._vertShaderSrcMasked;
    const vertexShaderSrcSetupMask = this._vertShaderSrcSetupMask;
    const fragmentShaderSrcSetupMask = this._fragShaderSrcSetupMask;
    const fragmentShaderSrcPremultipliedAlpha = this._fragShaderSrcPremultipliedAlpha;
    const fragmentShaderSrcMaskPremultipliedAlpha = this._fragShaderSrcMaskPremultipliedAlpha;
    const fragmentShaderSrcMaskInvertedPremultipliedAlpha = this._fragShaderSrcMaskInvertedPremultipliedAlpha;
    this._shaderSets[0].shaderProgram = this.loadShaderProgram(
      vertexShaderSrcSetupMask,
      fragmentShaderSrcSetupMask
    );
    this._shaderSets[1].shaderProgram = this.loadShaderProgram(
      vertexShaderSrc,
      fragmentShaderSrcPremultipliedAlpha
    );
    this._shaderSets[2].shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskPremultipliedAlpha
    );
    this._shaderSets[3].shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskInvertedPremultipliedAlpha
    );
    this._shaderSets[4].shaderProgram = this._shaderSets[1].shaderProgram;
    this._shaderSets[5].shaderProgram = this._shaderSets[2].shaderProgram;
    this._shaderSets[6].shaderProgram = this._shaderSets[3].shaderProgram;
    this._shaderSets[7].shaderProgram = this._shaderSets[1].shaderProgram;
    this._shaderSets[8].shaderProgram = this._shaderSets[2].shaderProgram;
    this._shaderSets[9].shaderProgram = this._shaderSets[3].shaderProgram;
    this._shaderSets[0].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[0].shaderProgram,
      "a_position"
    );
    this._shaderSets[0].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[0].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[0].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[0].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets[0].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets[0].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[1].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[1].shaderProgram,
      "a_position"
    );
    this._shaderSets[1].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[1].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[1].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[1].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[1].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[1].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[1].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[2].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[2].shaderProgram,
      "a_position"
    );
    this._shaderSets[2].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[2].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[2].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[2].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "s_texture1"
    );
    this._shaderSets[2].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[2].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets[2].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets[2].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[2].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[2].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[3].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[3].shaderProgram,
      "a_position"
    );
    this._shaderSets[3].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[3].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[3].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[3].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "s_texture1"
    );
    this._shaderSets[3].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[3].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets[3].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets[3].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[3].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[3].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[4].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[4].shaderProgram,
      "a_position"
    );
    this._shaderSets[4].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[4].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[4].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[4].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[4].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[4].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[4].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[5].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[5].shaderProgram,
      "a_position"
    );
    this._shaderSets[5].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[5].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[5].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[5].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "s_texture1"
    );
    this._shaderSets[5].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[5].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets[5].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets[5].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[5].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[5].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[6].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[6].shaderProgram,
      "a_position"
    );
    this._shaderSets[6].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[6].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[6].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[6].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "s_texture1"
    );
    this._shaderSets[6].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[6].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets[6].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets[6].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[6].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[6].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[7].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[7].shaderProgram,
      "a_position"
    );
    this._shaderSets[7].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[7].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[7].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[7].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[7].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[7].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[7].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[8].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[8].shaderProgram,
      "a_position"
    );
    this._shaderSets[8].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[8].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[8].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[8].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "s_texture1"
    );
    this._shaderSets[8].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[8].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets[8].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets[8].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[8].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[8].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      "u_screenColor"
    );
    this._shaderSets[9].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[9].shaderProgram,
      "a_position"
    );
    this._shaderSets[9].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[9].shaderProgram,
      "a_texCoord"
    );
    this._shaderSets[9].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "s_texture0"
    );
    this._shaderSets[9].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "s_texture1"
    );
    this._shaderSets[9].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "u_matrix"
    );
    this._shaderSets[9].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets[9].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets[9].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "u_baseColor"
    );
    this._shaderSets[9].uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets[9].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      "u_screenColor"
    );
  }
  /**
   * ブレンドモード用のシェーダープログラムを登録する
   */
  registerBlendShader() {
    const vertShaderSrcCopy = this._vertShaderSrcCopy;
    const fragShaderSrcCopy = this._fragShaderSrcCopy;
    const copyShaderSet = this._shaderSets[10];
    copyShaderSet.shaderProgram = this.loadShaderProgram(
      vertShaderSrcCopy,
      fragShaderSrcCopy
    );
    copyShaderSet.attributeTexCoordLocation = this.gl.getAttribLocation(
      copyShaderSet.shaderProgram,
      "a_texCoord"
    );
    copyShaderSet.attributePositionLocation = this.gl.getAttribLocation(
      copyShaderSet.shaderProgram,
      "a_position"
    );
    copyShaderSet.uniformBaseColorLocation = this.gl.getUniformLocation(
      copyShaderSet.shaderProgram,
      "u_baseColor"
    );
    let shaderSetIndex = 11;
    for (let colorBlendIndex = 0; colorBlendIndex < this._colorBlendValues.length; colorBlendIndex++) {
      if (this._colorBlendValues[colorBlendIndex] == -1 /* ColorBlend_None */ || this._colorBlendValues[colorBlendIndex] == CubismColorBlend.ColorBlend_AddCompatible || this._colorBlendValues[colorBlendIndex] == CubismColorBlend.ColorBlend_MultiplyCompatible) {
        continue;
      }
      const colorBlendValue = this._colorBlendValues[colorBlendIndex];
      const colorBlendName = this._colorBlendMap.get(colorBlendValue).toUpperCase();
      const colorBlendMacro = `#define COLOR_BLEND_${colorBlendName}
`;
      for (let alphablendIndex = 0; alphablendIndex < this._alphaBlendValues.length; alphablendIndex++) {
        if (this._alphaBlendValues[alphablendIndex] == -1 /* AlphaBlend_None */ || this._colorBlendValues[colorBlendIndex] == CubismColorBlend.ColorBlend_Normal && this._alphaBlendValues[alphablendIndex] == 0 /* AlphaBlend_Over */) {
          continue;
        }
        const alphaBlendValue = this._alphaBlendValues[alphablendIndex];
        const alphaBlendName = this._alphaBlendMap.get(alphaBlendValue).toUpperCase();
        const alphaBlendMacro = `#define ALPHA_BLEND_${alphaBlendName}
`;
        this.generateBlendShader(
          colorBlendMacro,
          alphaBlendMacro,
          shaderSetIndex
        );
        this._blendShaderSetMap.set(
          this._colorBlendMap.get(this._colorBlendValues[colorBlendIndex]) + this._alphaBlendMap.get(this._alphaBlendValues[alphablendIndex]),
          shaderSetIndex
        );
        shaderSetIndex += 3 /* ShaderType_Count */;
      }
    }
  }
  /**
   * ブレンドモード用のシェーダープログラムを生成する
   *
   * @param colorBlendMacro カラーブレンド用のマクロ
   * @param alphaBlendMacro アルファブレンド用のマクロ
   * @param shaderSetBaseIndex _shaderSets のインデックス
   */
  generateBlendShader(colorBlendMacro, alphaBlendMacro, shaderSetBaseIndex) {
    for (let shaderTypeIndex = 0; shaderTypeIndex < 3 /* ShaderType_Count */; shaderTypeIndex++) {
      let vertexShaderSrc = "";
      let fragmentShaderStr = "precision mediump float;\n";
      const shaderSetIndex = shaderSetBaseIndex + shaderTypeIndex;
      fragmentShaderStr += colorBlendMacro;
      fragmentShaderStr += alphaBlendMacro;
      fragmentShaderStr += this._fragShaderSrcColorBlend;
      fragmentShaderStr += this._fragShaderSrcAlphaBlend;
      if (shaderTypeIndex == 1 /* ShaderType_Masked */ || shaderTypeIndex == 2 /* ShaderType_MaskedInverted */) {
        const clippingMaskMacro = "#define CLIPPING_MASK\n";
        vertexShaderSrc += clippingMaskMacro;
        fragmentShaderStr += clippingMaskMacro;
      }
      vertexShaderSrc += this._vertShaderSrcBlend;
      fragmentShaderStr += this._fragShaderSrcBlend;
      this._shaderSets[shaderSetIndex].shaderProgram = this.loadShaderProgram(
        vertexShaderSrc,
        fragmentShaderStr
      );
      this._shaderSets[shaderSetIndex].attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "a_position"
      );
      this._shaderSets[shaderSetIndex].attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "a_texCoord"
      );
      this._shaderSets[shaderSetIndex].samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "s_texture0"
      );
      this._shaderSets[shaderSetIndex].uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "u_matrix"
      );
      this._shaderSets[shaderSetIndex].uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "u_baseColor"
      );
      this._shaderSets[shaderSetIndex].uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets[shaderSetIndex].uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "u_screenColor"
      );
      this._shaderSets[shaderSetIndex].samplerFrameBufferTextureLocation = this.gl.getUniformLocation(
        this._shaderSets[shaderSetIndex].shaderProgram,
        "s_blendTexture"
      );
      if (shaderTypeIndex == 1 /* ShaderType_Masked */ || shaderTypeIndex == 2 /* ShaderType_MaskedInverted */) {
        this._shaderSets[shaderSetIndex].samplerTexture1Location = this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          "s_texture1"
        );
        this._shaderSets[shaderSetIndex].uniformClipMatrixLocation = this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          "u_clipMatrix"
        );
        this._shaderSets[shaderSetIndex].uniformChannelFlagLocation = this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          "u_channelFlag"
        );
        this._shaderSets[shaderSetIndex].uniformInvertMaskFlagLocation = this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          "u_invertClippingMask"
        );
      }
    }
  }
  /**
   * シェーダプログラムをロードしてアドレスを返す
   *
   * @param vertexShaderSource    頂点シェーダのソース
   * @param fragmentShaderSource  フラグメントシェーダのソース
   *
   * @return シェーダプログラムのアドレス
   */
  loadShaderProgram(vertexShaderSource, fragmentShaderSource) {
    let shaderProgram = this.gl.createProgram();
    let vertShader = this.compileShaderSource(
      this.gl.VERTEX_SHADER,
      vertexShaderSource
    );
    if (!vertShader) {
      CubismLogError("Vertex shader compile error!");
      return 0;
    }
    let fragShader = this.compileShaderSource(
      this.gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    if (!fragShader) {
      CubismLogError("Fragment shader compile error!");
      return 0;
    }
    this.gl.attachShader(shaderProgram, vertShader);
    this.gl.attachShader(shaderProgram, fragShader);
    this.gl.linkProgram(shaderProgram);
    const linkStatus = this.gl.getProgramParameter(
      shaderProgram,
      this.gl.LINK_STATUS
    );
    if (!linkStatus) {
      CubismLogError("Failed to link program: {0}", shaderProgram);
      this.gl.deleteShader(vertShader);
      vertShader = 0;
      this.gl.deleteShader(fragShader);
      fragShader = 0;
      if (shaderProgram) {
        this.gl.deleteProgram(shaderProgram);
        shaderProgram = 0;
      }
      return 0;
    }
    this.gl.deleteShader(vertShader);
    this.gl.deleteShader(fragShader);
    return shaderProgram;
  }
  /**
   * シェーダープログラムをコンパイルする
   *
   * @param shaderType シェーダタイプ(Vertex/Fragment)
   * @param shaderSource シェーダソースコード
   *
   * @return コンパイルされたシェーダープログラム
   */
  compileShaderSource(shaderType, shaderSource) {
    const source = shaderSource;
    const shader = this.gl.createShader(shaderType);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!shader) {
      const log = this.gl.getShaderInfoLog(shader);
      CubismLogError("Shader compile log: {0} ", log);
    }
    const status = this.gl.getShaderParameter(
      shader,
      this.gl.COMPILE_STATUS
    );
    if (!status) {
      const log = this.gl.getShaderInfoLog(shader);
      CubismLogError("Shader compile log: {0} ", log);
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  /**
   * WebGLレンダリングコンテキストを設定する
   *
   * @param gl WebGLレンダリングコンテキスト
   */
  setGl(gl) {
    this.gl = gl;
  }
  /**
   * ブレンドモード用のシェーダーパスを設定する
   *
   * @param shaderPath シェーダーパス
   */
  setShaderPath(shaderPath) {
    this._shaderPath = shaderPath;
  }
  /**
   * シェーダーパスを取得する
   *
   * @return シェーダーパス
   */
  getShaderPath() {
    return this._shaderPath;
  }
  _shaderSets;
  // ロードしたシェーダープログラムを保持する変数
  gl;
  // webglコンテキスト
  _colorBlendMap;
  // カラーブレンドの値と名称を紐づけする変数
  _alphaBlendMap;
  // アルファブレンドの値と名称を紐づけする変数
  _colorBlendValues;
  // カラーブレンドの値を保持する変数
  _alphaBlendValues;
  // アルファブレンドの値を保持する変数
  _blendShaderSetMap;
  // ブレンドモード用のシェーダーの名称とインデックスを紐づけする変数
  _shaderCount;
  // シェーダープログラムの数
  _vertShaderSrc;
  // 頂点シェーダーのソース
  _vertShaderSrcMasked;
  // マスク用の頂点シェーダーのソース
  _vertShaderSrcSetupMask;
  // マスク用の頂点シェーダーのソース
  _fragShaderSrcSetupMask;
  // マスク用のフラグメントシェーダーのソース
  _fragShaderSrcPremultipliedAlpha;
  // プレマルチプライドアルファ用のフラグメントシェーダーのソース
  _fragShaderSrcMaskPremultipliedAlpha;
  // マスク用プレマルチプライドアルファのフラグメントシェーダーのソース
  _fragShaderSrcMaskInvertedPremultipliedAlpha;
  // 反転マスク用プレマルチプライドアルファのフラグメントシェーダーのソース
  _vertShaderSrcCopy;
  // 頂点シェーダーのソース
  _fragShaderSrcCopy;
  // コピー用のフラグメントシェーダーのソース
  _fragShaderSrcColorBlend;
  // ブレンドモード用のシェーダーのソース
  _fragShaderSrcAlphaBlend;
  // アルファブレンド用のシェーダーのソース
  _vertShaderSrcBlend;
  // 頂点シェーダーのソース
  _fragShaderSrcBlend;
  // フラグメントシェーダーのソース
  _isShaderLoading;
  // シェーダーの読み込み中かどうか
  _isShaderLoaded;
  // シェーダーの読み込みが完了したかどうか
  _defaultShaderPath;
  // デフォルトのシェーダーパス
  _shaderPath;
  // シェーダーパス
};
var CubismShaderManager_WebGL = class _CubismShaderManager_WebGL {
  /**
   * インスタンスを取得する（シングルトン）
   *
   * @return インスタンス
   */
  static getInstance() {
    if (s_instance == null) {
      s_instance = new _CubismShaderManager_WebGL();
    }
    return s_instance;
  }
  /**
   * インスタンスを開放する（シングルトン）
   */
  static deleteInstance() {
    if (s_instance) {
      s_instance.release();
      s_instance = null;
    }
  }
  /**
   * Privateなコンストラクタ
   */
  constructor() {
    this._shaderMap = /* @__PURE__ */ new Map();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (const item of this._shaderMap) {
      item[1].release();
    }
    this._shaderMap.clear();
  }
  /**
   * GLContextをキーにShaderを取得する
   *
   * @param gl glコンテキスト
   *
   * @return shaderを返す
   */
  getShader(gl) {
    return this._shaderMap.get(gl);
  }
  /**
   * GLContextを登録する
   *
   * @param gl glコンテキスト
   */
  setGlContext(gl) {
    if (!this._shaderMap.has(gl)) {
      const instance = new CubismShader_WebGL();
      instance.setGl(gl);
      this._shaderMap.set(gl, instance);
    }
  }
  /**
   * GLContextごとのShaderを保持する変数
   */
  _shaderMap;
};
var CubismShaderSet = class {
  shaderProgram;
  // シェーダープログラムのアドレス
  attributePositionLocation;
  // シェーダープログラムに渡す変数のアドレス（Position）
  attributeTexCoordLocation;
  // シェーダープログラムに渡す変数のアドレス（TexCoord）
  uniformMatrixLocation;
  // シェーダープログラムに渡す変数のアドレス（Matrix）
  uniformClipMatrixLocation;
  // シェーダープログラムに渡す変数のアドレス（ClipMatrix）
  samplerTexture0Location;
  // シェーダープログラムに渡す変数のアドレス（Texture0）
  samplerTexture1Location;
  // シェーダープログラムに渡す変数のアドレス（Texture1）
  uniformBaseColorLocation;
  // シェーダープログラムに渡す変数のアドレス（BaseColor）
  uniformChannelFlagLocation;
  // シェーダープログラムに渡す変数のアドレス（ChannelFlag）
  uniformMultiplyColorLocation;
  // シェーダープログラムに渡す変数のアドレス（MultiplyColor）
  uniformScreenColorLocation;
  // シェーダープログラムに渡す変数のアドレス（ScreenColor）
  samplerFrameBufferTextureLocation;
  // シェーダープログラムに渡す変数のアドレス（BlendTexture）
  uniformInvertMaskFlagLocation;
  // シェーダープログラムに渡す変数のアドレス（InvertMask）
};
var ShaderNames = /* @__PURE__ */ ((ShaderNames2) => {
  ShaderNames2[ShaderNames2["ShaderNames_SetupMask"] = 0] = "ShaderNames_SetupMask";
  ShaderNames2[ShaderNames2["ShaderNames_NormalPremultipliedAlpha"] = 1] = "ShaderNames_NormalPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_NormalMaskedPremultipliedAlpha"] = 2] = "ShaderNames_NormalMaskedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_NomralMaskedInvertedPremultipliedAlpha"] = 3] = "ShaderNames_NomralMaskedInvertedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_AddPremultipliedAlpha"] = 4] = "ShaderNames_AddPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_AddMaskedPremultipliedAlpha"] = 5] = "ShaderNames_AddMaskedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_AddMaskedPremultipliedAlphaInverted"] = 6] = "ShaderNames_AddMaskedPremultipliedAlphaInverted";
  ShaderNames2[ShaderNames2["ShaderNames_MultPremultipliedAlpha"] = 7] = "ShaderNames_MultPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_MultMaskedPremultipliedAlpha"] = 8] = "ShaderNames_MultMaskedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_MultMaskedPremultipliedAlphaInverted"] = 9] = "ShaderNames_MultMaskedPremultipliedAlphaInverted";
  ShaderNames2[ShaderNames2["ShaderNames_ShaderCount"] = 10] = "ShaderNames_ShaderCount";
  return ShaderNames2;
})(ShaderNames || {});
var Live2DCubismFramework14;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismShaderSet = CubismShaderSet;
  Live2DCubismFramework19.CubismShader_WebGL = CubismShader_WebGL;
  Live2DCubismFramework19.CubismShaderManager_WebGL = CubismShaderManager_WebGL;
  Live2DCubismFramework19.ShaderNames = ShaderNames;
})(Live2DCubismFramework14 || (Live2DCubismFramework14 = {}));

// vendor/cubism-framework/src/rendering/cubismoffscreenmanager.ts
var CubismRenderTargetContainer = class {
  /**
   * Constructor
   *
   * @param colorBuffer カラーバッファ
   * @param renderTexture レンダーテクスチャ
   * @param inUse 使用中かどうか
   */
  constructor(colorBuffer = null, renderTexture = null, inUse = false) {
    this.colorBuffer = colorBuffer;
    this.renderTexture = renderTexture;
    this.inUse = inUse;
  }
  clear() {
    this.colorBuffer = null;
    this.renderTexture = null;
    this.inUse = false;
  }
  /**
   * カラーバッファを取得
   *
   * @returns カラーバッファ
   */
  getColorBuffer() {
    return this.colorBuffer;
  }
  /**
   * レンダーテクスチャを取得
   *
   * @returns レンダーテクスチャ
   */
  getRenderTexture() {
    return this.renderTexture;
  }
  colorBuffer;
  // colorBuffer
  renderTexture;
  // renderTarget
  inUse;
  // Whether this container's render target is currently in use
};
var CubismWebGLContextManager = class {
  constructor(gl) {
    this.gl = gl;
    this.offscreenRenderTargetContainers = new Array();
    this.previousActiveRenderTextureMaxCount = 0;
    this.currentActiveRenderTextureCount = 0;
    this.hasResetThisFrame = false;
    this.width = 0;
    this.height = 0;
  }
  release() {
    if (this.offscreenRenderTargetContainers != null) {
      for (let index = 0; index < this.offscreenRenderTargetContainers.length; ++index) {
        const container = this.offscreenRenderTargetContainers[index];
        this.gl.deleteTexture(container.colorBuffer);
        this.gl.deleteFramebuffer(container.renderTexture);
      }
      this.offscreenRenderTargetContainers.length = 0;
      this.offscreenRenderTargetContainers = null;
    }
  }
  gl;
  // WebGLContext
  offscreenRenderTargetContainers;
  // オフスクリーン描画用レンダーターゲットのリスト
  previousActiveRenderTextureMaxCount;
  // 直前のアクティブなレンダーターゲットの最大数
  currentActiveRenderTextureCount;
  // 現在のアクティブなレンダーターゲットの数
  hasResetThisFrame;
  // 今フレームでリセットされたかどうか
  width;
  // 幅
  height;
  // 高さ
};
var CubismWebGLOffscreenManager = class _CubismWebGLOffscreenManager {
  /**
   * コンストラクタ
   */
  constructor() {
    this._contextManagers = /* @__PURE__ */ new Map();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    if (this._contextManagers != null) {
      for (const manager of this._contextManagers.values()) {
        manager.release();
      }
      this._contextManagers.clear();
      this._contextManagers = null;
    }
    _CubismWebGLOffscreenManager._instance = null;
  }
  /**
   * インスタンスの取得
   *
   * @return インスタンス
   */
  static getInstance() {
    if (this._instance == null) {
      this._instance = new _CubismWebGLOffscreenManager();
    }
    return this._instance;
  }
  /**
   * WebGLContextに対応するマネージャーを取得または作成
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @return WebGLContextManager
   */
  getContextManager(gl) {
    if (!this._contextManagers.has(gl)) {
      this._contextManagers.set(gl, new CubismWebGLContextManager(gl));
    }
    return this._contextManagers.get(gl);
  }
  /**
   * 指定されたWebGLContextのマネージャーを削除
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   */
  removeContext(gl) {
    if (this._contextManagers.has(gl)) {
      const manager = this._contextManagers.get(gl);
      manager.release();
      this._contextManagers.delete(gl);
    }
  }
  /**
   * 初期化処理
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @param width 幅
   * @param height 高さ
   */
  initialize(gl, width, height) {
    const contextManager = this.getContextManager(gl);
    if (contextManager.offscreenRenderTargetContainers != null) {
      for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
        const container = contextManager.offscreenRenderTargetContainers[index];
        contextManager.gl.deleteTexture(container.colorBuffer);
        contextManager.gl.deleteFramebuffer(container.renderTexture);
        container.clear();
      }
      contextManager.offscreenRenderTargetContainers.length = 0;
    } else {
      contextManager.offscreenRenderTargetContainers = new Array();
    }
    contextManager.width = width;
    contextManager.height = height;
    contextManager.previousActiveRenderTextureMaxCount = 0;
    contextManager.currentActiveRenderTextureCount = 0;
    contextManager.hasResetThisFrame = false;
  }
  /**
   * モデルを描画する前に呼び出すフレーム開始時の処理を行う
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   */
  beginFrameProcess(gl) {
    const contextManager = this.getContextManager(gl);
    if (contextManager.hasResetThisFrame) {
      return;
    }
    contextManager.previousActiveRenderTextureMaxCount = 0;
    contextManager.hasResetThisFrame = true;
  }
  /**
   * モデルの描画が終わった後に呼び出すフレーム終了時の処理
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   */
  endFrameProcess(gl) {
    const contextManager = this.getContextManager(gl);
    contextManager.hasResetThisFrame = false;
  }
  /**
   * コンテナサイズの取得
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   */
  getContainerSize(gl) {
    const contextManager = this.getContextManager(gl);
    if (contextManager.offscreenRenderTargetContainers == null) {
      return 0;
    }
    return contextManager.offscreenRenderTargetContainers.length;
  }
  /**
   * 使用可能なリソースコンテナの取得
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @param width 幅
   * @param height 高さ
   * @param previousFramebuffer 前のフレームバッファ
   * @return 使用可能なリソースコンテナ
   */
  getOffscreenRenderTargetContainers(gl, width, height, previousFramebuffer) {
    const contextManager = this.getContextManager(gl);
    if (contextManager.width != width || contextManager.height != height || contextManager.offscreenRenderTargetContainers == null) {
      this.initialize(gl, width, height);
    }
    this.updateRenderTargetContainerCount(gl);
    const container = this.getUnusedOffscreenRenderTargetContainer(gl);
    if (container != null) {
      return container;
    }
    const offscreenRenderTextureContainer = this.createOffscreenRenderTargetContainer(
      gl,
      width,
      height,
      previousFramebuffer
    );
    return offscreenRenderTextureContainer;
  }
  /**
   * リソースコンテナの使用状態を取得
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @param renderTexture WebGLFramebuffer
   * @return 使用中はtrue、未使用の場合はfalse
   */
  getUsingRenderTextureState(gl, renderTexture) {
    const contextManager = this.getContextManager(gl);
    for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
      if (contextManager.offscreenRenderTargetContainers[index].renderTexture == renderTexture) {
        return contextManager.offscreenRenderTargetContainers[index].inUse;
      }
    }
    return true;
  }
  /**
   * リソースコンテナの使用を開始する。
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @param renderTexture WebGLFramebuffer
   */
  startUsingRenderTexture(gl, renderTexture) {
    const contextManager = this.getContextManager(gl);
    for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
      if (contextManager.offscreenRenderTargetContainers[index].renderTexture != renderTexture) {
        continue;
      }
      contextManager.offscreenRenderTargetContainers[index].inUse = true;
      this.updateRenderTargetContainerCount(gl);
      break;
    }
  }
  /**
   * リソースコンテナの使用を終了する。
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @param renderTexture WebGLFramebuffer
   */
  stopUsingRenderTexture(gl, renderTexture) {
    const contextManager = this.getContextManager(gl);
    for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
      if (contextManager.offscreenRenderTargetContainers[index].renderTexture != renderTexture) {
        continue;
      }
      contextManager.offscreenRenderTargetContainers[index].inUse = false;
      contextManager.currentActiveRenderTextureCount--;
      if (contextManager.currentActiveRenderTextureCount < 0) {
        contextManager.currentActiveRenderTextureCount = 0;
      }
      break;
    }
  }
  /**
   * リソースコンテナの使用を全て終了する。
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   */
  stopUsingAllRenderTextures(gl) {
    const contextManager = this.getContextManager(gl);
    for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
      contextManager.offscreenRenderTargetContainers[index].inUse = false;
    }
    contextManager.currentActiveRenderTextureCount = 0;
  }
  /**
   * 使用されていないリソースコンテナを解放する。
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   */
  releaseStaleRenderTextures(gl) {
    const contextManager = this.getContextManager(gl);
    const listSize = contextManager.offscreenRenderTargetContainers.length;
    if (contextManager.hasResetThisFrame || listSize === 0) {
      return;
    }
    let findPos = 0;
    let resize = contextManager.previousActiveRenderTextureMaxCount;
    for (let i = listSize; contextManager.previousActiveRenderTextureMaxCount < i; --i) {
      const index = i - 1;
      if (contextManager.offscreenRenderTargetContainers[index].inUse) {
        let isFind = false;
        for (; findPos < contextManager.previousActiveRenderTextureMaxCount; ++findPos) {
          if (!contextManager.offscreenRenderTargetContainers[findPos].inUse) {
            const tempContainer = contextManager.offscreenRenderTargetContainers[findPos];
            contextManager.offscreenRenderTargetContainers[findPos] = contextManager.offscreenRenderTargetContainers[index];
            contextManager.offscreenRenderTargetContainers[findPos].inUse = true;
            contextManager.offscreenRenderTargetContainers[index] = tempContainer;
            contextManager.offscreenRenderTargetContainers[index].inUse = false;
            isFind = true;
            break;
          }
        }
        if (!isFind) {
          resize = i;
          break;
        }
      }
      const container = contextManager.offscreenRenderTargetContainers[index];
      contextManager.gl.bindTexture(contextManager.gl.TEXTURE_2D, null);
      contextManager.gl.deleteTexture(container.colorBuffer);
      contextManager.gl.bindFramebuffer(contextManager.gl.FRAMEBUFFER, null);
      contextManager.gl.deleteFramebuffer(container.renderTexture);
      container.clear();
    }
    updateSize(contextManager.offscreenRenderTargetContainers, resize);
  }
  /**
   * 直前のアクティブなレンダーターゲットの最大数を取得
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @returns 直前のアクティブなレンダーターゲットの最大数
   */
  getPreviousActiveRenderTextureCount(gl) {
    const contextManager = this.getContextManager(gl);
    return contextManager.previousActiveRenderTextureMaxCount;
  }
  /**
   * 現在のアクティブなレンダーターゲットの数を取得
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @returns 現在のアクティブなレンダーターゲットの数
   */
  getCurrentActiveRenderTextureCount(gl) {
    const contextManager = this.getContextManager(gl);
    return contextManager.currentActiveRenderTextureCount;
  }
  /**
   * 現在のアクティブなレンダーターゲットの数を更新
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   */
  updateRenderTargetContainerCount(gl) {
    const contextManager = this.getContextManager(gl);
    ++contextManager.currentActiveRenderTextureCount;
    contextManager.previousActiveRenderTextureMaxCount = contextManager.currentActiveRenderTextureCount > contextManager.previousActiveRenderTextureMaxCount ? contextManager.currentActiveRenderTextureCount : contextManager.previousActiveRenderTextureMaxCount;
  }
  /**
   * 使用されていないリソースコンテナの取得
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @return 使用されていないリソースコンテナ
   */
  getUnusedOffscreenRenderTargetContainer(gl) {
    const contextManager = this.getContextManager(gl);
    for (let index = 0; index < contextManager.offscreenRenderTargetContainers.length; ++index) {
      const container = contextManager.offscreenRenderTargetContainers[index];
      if (container.inUse == false) {
        container.inUse = true;
        return container;
      }
    }
    return null;
  }
  /**
   * 新たにリソースコンテナを作成する。
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   * @param width 幅
   * @param height 高さ
   * @param previousFramebuffer 前のフレームバッファ
   * @return 作成されたリソースコンテナ
   */
  createOffscreenRenderTargetContainer(gl, width, height, previousFramebuffer) {
    const renderTarget = new CubismRenderTarget_WebGL();
    if (!renderTarget.createRenderTarget(gl, width, height, previousFramebuffer)) {
      CubismLogError("Failed to create offscreen render texture.");
      return null;
    }
    const offscreenRenderTextureContainer = new CubismRenderTargetContainer(
      renderTarget.getColorBuffer(),
      renderTarget.getRenderTexture(),
      true
    );
    const contextManager = this.getContextManager(gl);
    contextManager.offscreenRenderTargetContainers.push(
      offscreenRenderTextureContainer
    );
    return offscreenRenderTextureContainer;
  }
  static _instance;
  // オフスクリーン描画用レンダーターゲットマネージャ
  _contextManagers;
  // WebGLContextごとのマネージャー
};

// vendor/cubism-framework/src/rendering/cubismoffscreenrendertarget_webgl.ts
var CubismOffscreenRenderTarget_WebGL = class extends CubismRenderTarget_WebGL {
  /**
   * リソースコンテナマネージャを初期化する。
   *
   * @param displayBufferWidth レンダーターゲットの幅
   * @param displayBufferHeight レンダーターゲットの高さ
   */
  initializeOffscreenManager(gl, displayBufferWidth, displayBufferHeight) {
    this._gl = gl;
    this._webGLOffscreenManager = CubismWebGLOffscreenManager.getInstance();
    if (this._webGLOffscreenManager.getContainerSize(gl) === 0) {
      this._webGLOffscreenManager.initialize(
        gl,
        displayBufferWidth,
        displayBufferHeight
      );
    }
  }
  /**
   * オフスクリーン描画用レンダーターゲットをセットする。
   *
   * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
   *          NOTE: Cubism 5.3以降のモデルが使用される場合はWebGL2RenderingContextを使用すること。
   * @param displayBufferWidth レンダーターゲットの幅
   * @param displayBufferHeight レンダーターゲットの高さ
   * @param previousFramebuffer 前のフレームバッファ
   */
  setOffscreenRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
    if (this._webGLOffscreenManager == null) {
      this.initializeOffscreenManager(
        gl,
        displayBufferWidth,
        displayBufferHeight
      );
    }
    const offscreenRenderTargetContainer = this._webGLOffscreenManager.getOffscreenRenderTargetContainers(
      gl,
      displayBufferWidth,
      displayBufferHeight,
      previousFramebuffer
    );
    if (offscreenRenderTargetContainer == null) {
      CubismLogError("Failed to acquire offscreen render texture container.");
      return;
    }
    this._colorBuffer = offscreenRenderTargetContainer.getColorBuffer();
    this._renderTexture = offscreenRenderTargetContainer.getRenderTexture();
    this._bufferWidth = displayBufferWidth;
    this._bufferHeight = displayBufferHeight;
    this._gl = gl;
    if (this._renderTexture == null) {
      this._renderTexture = previousFramebuffer;
      CubismLogError("Failed to create offscreen render texture.");
    }
    return;
  }
  /**
   * リソースコンテナの使用状態を取得
   *
   * @return 使用中はtrue、未使用の場合はfalse
   */
  getUsingRenderTextureState() {
    if (this._webGLOffscreenManager == null || this._gl == null) {
      return true;
    }
    return this._webGLOffscreenManager.getUsingRenderTextureState(
      this._gl,
      this._renderTexture
    );
  }
  /**
   * リソースコンテナの使用を開始する。
   */
  startUsingRenderTexture() {
    if (this._webGLOffscreenManager == null || this._gl == null) {
      return;
    }
    this._webGLOffscreenManager.startUsingRenderTexture(
      this._gl,
      this._renderTexture
    );
  }
  /**
   * リソースコンテナの使用を終了する。
   */
  stopUsingRenderTexture() {
    if (this._webGLOffscreenManager == null || this._gl == null) {
      return;
    }
    this._webGLOffscreenManager.stopUsingRenderTexture(
      this._gl,
      this._renderTexture
    );
  }
  /**
   * オフスクリーンのインデックスを設定する。
   *
   * @param offscreenIndex オフスクリーンのインデックス
   */
  setOffscreenIndex(offscreenIndex) {
    this._offscreenIndex = offscreenIndex;
  }
  /**
   * オフスクリーンのインデックスを取得する。
   *
   * @return オフスクリーンのインデックス
   */
  getOffscreenIndex() {
    return this._offscreenIndex;
  }
  /**
   * 以前のオフスクリーン描画用レンダーターゲットを設定する。
   *
   * @param oldOffscreen 以前のオフスクリーン描画用レンダーターゲット
   */
  setOldOffscreen(oldOffscreen) {
    this._oldOffscreen = oldOffscreen;
  }
  /**
   * 以前のオフスクリーン描画用レンダーターゲットを取得する。
   *
   * @return 以前のオフスクリーン描画用レンダーターゲット
   */
  getOldOffscreen() {
    return this._oldOffscreen;
  }
  /**
   * 親のオフスクリーン描画用レンダーターゲットを設定する。
   *
   * @param parentOffscreenRenderTarget 親のオフスクリーン描画用レンダーターゲット
   */
  setParentPartOffscreen(parentOffscreenRenderTarget) {
    this._parentOffscreenRenderTarget = parentOffscreenRenderTarget;
  }
  /**
   * 親のオフスクリーン描画用レンダーターゲットを取得する。
   *
   * @return 親のオフスクリーン描画用レンダーターゲット
   */
  getParentPartOffscreen() {
    return this._parentOffscreenRenderTarget;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._offscreenIndex = -1;
    this._parentOffscreenRenderTarget = null;
    this._oldOffscreen = null;
    this._webGLOffscreenManager = null;
  }
  release() {
    if (this._webGLOffscreenManager != null && this._gl != null && this._renderTexture != null) {
      this._webGLOffscreenManager.stopUsingRenderTexture(
        this._gl,
        this._renderTexture
      );
    }
    if (this._colorBuffer && this._gl) {
      this._gl.deleteTexture(this._colorBuffer);
      this._colorBuffer = null;
    }
    if (this._renderTexture && this._gl) {
      this._gl.deleteFramebuffer(this._renderTexture);
      this._renderTexture = null;
    }
    if (this._webGLOffscreenManager != null) {
      this._webGLOffscreenManager = null;
    }
    this._oldOffscreen = null;
    this._parentOffscreenRenderTarget = null;
  }
  _offscreenIndex;
  // オフスクリーンのインデックス
  _parentOffscreenRenderTarget;
  // 親のオフスクリーン描画用レンダーターゲット
  _oldOffscreen;
  // 以前のオフスクリーン描画用レンダーターゲット
  _webGLOffscreenManager;
  // オフスクリーン描画用レンダーターゲットマネージャ
  _gl;
  // WebGLコンテキスト
};

// vendor/cubism-framework/src/rendering/cubismrenderer_webgl.ts
var s_invalidValue = -1;
var s_renderTargetIndexArray = new Uint16Array([
  0,
  1,
  2,
  2,
  1,
  3
]);
var CubismClippingManager_WebGL = class extends CubismClippingManager {
  /**
   * WebGLレンダリングコンテキストを設定する
   *
   * @param gl WebGLレンダリングコンテキスト
   */
  setGL(gl) {
    this.gl = gl;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    super(CubismClippingContext_WebGL);
  }
  /**
   * クリッピングコンテキストを作成する。モデル描画時に実行する。
   *
   * @param model モデルのインスタンス
   * @param renderer レンダラのインスタンス
   * @param lastFbo フレームバッファ
   * @param lastViewport ビューポート
   * @param drawObjectType 描画オブジェクトのタイプ
   */
  setupClippingContext(model, renderer, lastFbo, lastViewport, drawObjectType) {
    let usingClipCount = 0;
    for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
      const cc = this._clippingContextListForMask[clipIndex];
      switch (drawObjectType) {
        case 0 /* DrawableObjectType_Drawable */:
        default:
          this.calcClippedDrawableTotalBounds(model, cc);
          break;
        case 1 /* DrawableObjectType_Offscreen */:
          this.calcClippedOffscreenTotalBounds(model, cc);
          break;
      }
      if (cc._isUsing) {
        usingClipCount++;
      }
    }
    if (usingClipCount <= 0) {
      return;
    }
    this.gl.viewport(
      0,
      0,
      this._clippingMaskBufferSize,
      this._clippingMaskBufferSize
    );
    switch (drawObjectType) {
      case 0 /* DrawableObjectType_Drawable */:
      default:
        this._currentMaskBuffer = renderer.getDrawableMaskBuffer(0);
        break;
      case 1 /* DrawableObjectType_Offscreen */:
        this._currentMaskBuffer = renderer.getOffscreenMaskBuffer(0);
        break;
    }
    this._currentMaskBuffer.beginDraw(lastFbo);
    renderer.preDraw();
    this.setupLayoutBounds(usingClipCount);
    if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
      this._clearedMaskBufferFlags.length = 0;
      this._clearedMaskBufferFlags = new Array(
        this._renderTextureCount
      );
      for (let i = 0; i < this._clearedMaskBufferFlags.length; i++) {
        this._clearedMaskBufferFlags[i] = false;
      }
    }
    for (let index = 0; index < this._clearedMaskBufferFlags.length; index++) {
      this._clearedMaskBufferFlags[index] = false;
    }
    for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++) {
      const clipContext = this._clippingContextListForMask[clipIndex];
      const allClipedDrawRect = clipContext._allClippedDrawRect;
      const layoutBoundsOnTex01 = clipContext._layoutBounds;
      const margin = 0.05;
      let scaleX = 0;
      let scaleY = 0;
      let maskBuffer;
      switch (drawObjectType) {
        case 0 /* DrawableObjectType_Drawable */:
        default:
          maskBuffer = renderer.getDrawableMaskBuffer(clipContext._bufferIndex);
          break;
        case 1 /* DrawableObjectType_Offscreen */:
          maskBuffer = renderer.getOffscreenMaskBuffer(
            clipContext._bufferIndex
          );
          break;
      }
      if (this._currentMaskBuffer != maskBuffer) {
        this._currentMaskBuffer.endDraw();
        this._currentMaskBuffer = maskBuffer;
        this._currentMaskBuffer.beginDraw(lastFbo);
        renderer.preDraw();
      }
      this._tmpBoundsOnModel.setRect(allClipedDrawRect);
      this._tmpBoundsOnModel.expand(
        allClipedDrawRect.width * margin,
        allClipedDrawRect.height * margin
      );
      scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
      scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
      this.createMatrixForMask(false, layoutBoundsOnTex01, scaleX, scaleY);
      clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
      clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
      if (drawObjectType == 1 /* DrawableObjectType_Offscreen */) {
        const invertMvp = renderer.getMvpMatrix().getInvert();
        clipContext._matrixForDraw.multiplyByMatrix(invertMvp);
      }
      const clipDrawCount = clipContext._clippingIdCount;
      for (let i = 0; i < clipDrawCount; i++) {
        const clipDrawIndex = clipContext._clippingIdList[i];
        if (!model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
          continue;
        }
        renderer.setIsCulling(model.getDrawableCulling(clipDrawIndex) != false);
        if (!this._clearedMaskBufferFlags[clipContext._bufferIndex]) {
          this.gl.clearColor(1, 1, 1, 1);
          this.gl.clear(this.gl.COLOR_BUFFER_BIT);
          this._clearedMaskBufferFlags[clipContext._bufferIndex] = true;
        }
        renderer.setClippingContextBufferForMask(clipContext);
        renderer.drawMeshWebGL(model, clipDrawIndex);
      }
    }
    this._currentMaskBuffer.endDraw();
    renderer.setClippingContextBufferForMask(null);
    this.gl.viewport(
      lastViewport[0],
      lastViewport[1],
      lastViewport[2],
      lastViewport[3]
    );
  }
  /**
   * マスクの合計数をカウント
   *
   * @return マスクの合計数を返す
   */
  getClippingMaskCount() {
    return this._clippingContextListForMask.length;
  }
  _currentMaskBuffer;
  // マスク用オフスクリーンサーフェス
  gl;
  // WebGLレンダリングコンテキスト
};
var CubismClippingContext_WebGL = class extends CubismClippingContext {
  /**
   * 引数付きコンストラクタ
   *
   * @param manager マスクを管理しているマネージャのインスタンス
   * @param clippingDrawableIndices クリップしているDrawableのインデックスリスト
   * @param clipCount クリップしているDrawableの個数
   */
  constructor(manager, clippingDrawableIndices, clipCount) {
    super(clippingDrawableIndices, clipCount);
    this._owner = manager;
  }
  /**
   * このマスクを管理するマネージャのインスタンスを取得する
   *
   * @return クリッピングマネージャのインスタンス
   */
  getClippingManager() {
    return this._owner;
  }
  /**
   * WebGLレンダリングコンテキストを設定する
   *
   * @param gl WebGLレンダリングコンテキスト
   */
  setGl(gl) {
    this._owner.setGL(gl);
  }
  _owner;
  // このマスクを管理しているマネージャのインスタンス
};
var CubismRendererProfile_WebGL = class {
  /**
   * WebGLの有効・無効をセットする
   *
   * @param index 有効・無効にする機能
   * @param enabled trueなら有効にする
   */
  setGlEnable(index, enabled) {
    if (enabled) this.gl.enable(index);
    else this.gl.disable(index);
  }
  /**
   * WebGLのVertex Attribute Array機能の有効・無効をセットする
   *
   * @param   index   有効・無効にする機能
   * @param   enabled trueなら有効にする
   */
  setGlEnableVertexAttribArray(index, enabled) {
    if (enabled) this.gl.enableVertexAttribArray(index);
    else this.gl.disableVertexAttribArray(index);
  }
  /**
   * WebGLのステートを保持する
   */
  save() {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    this._lastArrayBufferBinding = this.gl.getParameter(
      this.gl.ARRAY_BUFFER_BINDING
    );
    this._lastElementArrayBufferBinding = this.gl.getParameter(
      this.gl.ELEMENT_ARRAY_BUFFER_BINDING
    );
    this._lastProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    this._lastActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this._lastTexture1Binding2D = this.gl.getParameter(
      this.gl.TEXTURE_BINDING_2D
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    this._lastTexture0Binding2D = this.gl.getParameter(
      this.gl.TEXTURE_BINDING_2D
    );
    this._lastVertexAttribArrayEnabled[0] = this.gl.getVertexAttrib(
      0,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[1] = this.gl.getVertexAttrib(
      1,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[2] = this.gl.getVertexAttrib(
      2,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[3] = this.gl.getVertexAttrib(
      3,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastScissorTest = this.gl.isEnabled(this.gl.SCISSOR_TEST);
    this._lastStencilTest = this.gl.isEnabled(this.gl.STENCIL_TEST);
    this._lastDepthTest = this.gl.isEnabled(this.gl.DEPTH_TEST);
    this._lastCullFace = this.gl.isEnabled(this.gl.CULL_FACE);
    this._lastBlend = this.gl.isEnabled(this.gl.BLEND);
    this._lastFrontFace = this.gl.getParameter(this.gl.FRONT_FACE);
    this._lastColorMask = this.gl.getParameter(this.gl.COLOR_WRITEMASK);
    this._lastBlending[0] = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
    this._lastBlending[1] = this.gl.getParameter(this.gl.BLEND_DST_RGB);
    this._lastBlending[2] = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
    this._lastBlending[3] = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);
  }
  /**
   * 保持したWebGLのステートを復帰させる
   */
  restore() {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    this.gl.useProgram(this._lastProgram);
    this.setGlEnableVertexAttribArray(0, this._lastVertexAttribArrayEnabled[0]);
    this.setGlEnableVertexAttribArray(1, this._lastVertexAttribArrayEnabled[1]);
    this.setGlEnableVertexAttribArray(2, this._lastVertexAttribArrayEnabled[2]);
    this.setGlEnableVertexAttribArray(3, this._lastVertexAttribArrayEnabled[3]);
    this.setGlEnable(this.gl.SCISSOR_TEST, this._lastScissorTest);
    this.setGlEnable(this.gl.STENCIL_TEST, this._lastStencilTest);
    this.setGlEnable(this.gl.DEPTH_TEST, this._lastDepthTest);
    this.setGlEnable(this.gl.CULL_FACE, this._lastCullFace);
    this.setGlEnable(this.gl.BLEND, this._lastBlend);
    this.gl.frontFace(this._lastFrontFace);
    this.gl.colorMask(
      this._lastColorMask[0],
      this._lastColorMask[1],
      this._lastColorMask[2],
      this._lastColorMask[3]
    );
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this._lastArrayBufferBinding);
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      this._lastElementArrayBufferBinding
    );
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture1Binding2D);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture0Binding2D);
    this.gl.activeTexture(this._lastActiveTexture);
    this.gl.blendFuncSeparate(
      this._lastBlending[0],
      this._lastBlending[1],
      this._lastBlending[2],
      this._lastBlending[3]
    );
  }
  /**
   * WebGLレンダリングコンテキストを設定する
   *
   * @param gl WebGLレンダリングコンテキスト
   */
  setGl(gl) {
    this.gl = gl;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._lastVertexAttribArrayEnabled = new Array(4);
    this._lastColorMask = new Array(4);
    this._lastBlending = new Array(4);
  }
  _lastArrayBufferBinding;
  ///< モデル描画直前の頂点バッファ
  _lastElementArrayBufferBinding;
  ///< モデル描画直前のElementバッファ
  _lastProgram;
  ///< モデル描画直前のシェーダプログラムバッファ
  _lastActiveTexture;
  ///< モデル描画直前のアクティブなテクスチャ
  _lastTexture0Binding2D;
  ///< モデル描画直前のテクスチャユニット0
  _lastTexture1Binding2D;
  ///< モデル描画直前のテクスチャユニット1
  _lastVertexAttribArrayEnabled;
  ///< モデル描画直前のテクスチャユニット1
  _lastScissorTest;
  ///< モデル描画直前のGL_VERTEX_ATTRIB_ARRAY_ENABLEDパラメータ
  _lastBlend;
  ///< モデル描画直前のGL_SCISSOR_TESTパラメータ
  _lastStencilTest;
  ///< モデル描画直前のGL_STENCIL_TESTパラメータ
  _lastDepthTest;
  ///< モデル描画直前のGL_DEPTH_TESTパラメータ
  _lastCullFace;
  ///< モデル描画直前のGL_CULL_FACEパラメータ
  _lastFrontFace;
  ///< モデル描画直前のGL_CULL_FACEパラメータ
  _lastColorMask;
  ///< モデル描画直前のGL_COLOR_WRITEMASKパラメータ
  _lastBlending;
  ///< モデル描画直前のカラーブレンディングパラメータ
  gl;
};
var CubismRenderer_WebGL = class extends CubismRenderer {
  /**
   * レンダラの初期化処理を実行する
   * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
   * NOTE: WebGLコンテキストが初期化されていない可能性があるため、ここではWebGLコンテキストを使う初期化は行わない。
   *
   * @param model モデルのインスタンス
   * @param maskBufferCount バッファの生成数
   */
  initialize(model, maskBufferCount = 1) {
    if (model.isUsingMasking()) {
      this._drawableClippingManager = new CubismClippingManager_WebGL();
      this._drawableClippingManager.initializeForDrawable(
        model,
        maskBufferCount
      );
    }
    if (model.isUsingMaskingForOffscreen()) {
      this._offscreenClippingManager = new CubismClippingManager_WebGL();
      this._offscreenClippingManager.initializeForOffscreen(
        model,
        maskBufferCount
      );
    }
    updateSize(
      this._sortedObjectsIndexList,
      model.getDrawableCount() + (model.getOffscreenCount ? model.getOffscreenCount() : 0),
      0,
      true
    );
    updateSize(
      this._sortedObjectsTypeList,
      model.getDrawableCount() + (model.getOffscreenCount ? model.getOffscreenCount() : 0),
      0,
      true
    );
    super.initialize(model);
  }
  /**
   * オフスクリーンの親を探して設定する
   *
   * @param model モデルのインスタンス
   * @param offscreenCount オフスクリーンの数
   */
  setupParentOffscreens(model, offscreenCount) {
    let parentOffscreen;
    for (let offscreenIndex = 0; offscreenIndex < offscreenCount; ++offscreenIndex) {
      parentOffscreen = null;
      const ownerIndex = model.getOffscreenOwnerIndices()[offscreenIndex];
      let parentIndex = model.getPartParentPartIndices()[ownerIndex];
      while (parentIndex != NoParentIndex) {
        for (let i = 0; i < offscreenCount; ++i) {
          const ownerIndex2 = model.getOffscreenOwnerIndices()[this._offscreenList[i].getOffscreenIndex()];
          if (ownerIndex2 != parentIndex) {
            continue;
          }
          parentOffscreen = this._offscreenList[i];
          break;
        }
        if (parentOffscreen != null) {
          break;
        }
        parentIndex = model.getPartParentPartIndices()[parentIndex];
      }
      this._offscreenList[offscreenIndex].setParentPartOffscreen(
        parentOffscreen
      );
    }
  }
  /**
   * WebGLテクスチャのバインド処理
   * CubismRendererにテクスチャを設定し、CubismRenderer内でその画像を参照するためのIndex値を戻り値とする
   *
   * @param modelTextureNo セットするモデルテクスチャの番号
   * @param glTextureNo WebGLテクスチャの番号
   */
  bindTexture(modelTextureNo, glTexture) {
    this._textures.set(modelTextureNo, glTexture);
  }
  /**
   * WebGLにバインドされたテクスチャのリストを取得する
   *
   * @return テクスチャのリスト
   */
  getBindedTextures() {
    return this._textures;
  }
  /**
   * クリッピングマスクバッファのサイズを設定する
   * マスク用のFrameBufferを破棄、再作成する為処理コストは高い
   *
   * @param size クリッピングマスクバッファのサイズ
   */
  setClippingMaskBufferSize(size) {
    if (!this._model.isUsingMasking()) {
      return;
    }
    const renderTextureCount = this._drawableClippingManager.getRenderTextureCount();
    this._drawableClippingManager.release();
    this._drawableClippingManager = void 0;
    this._drawableClippingManager = null;
    this._drawableClippingManager = new CubismClippingManager_WebGL();
    this._drawableClippingManager.setClippingMaskBufferSize(size);
    this._drawableClippingManager.initializeForDrawable(
      this.getModel(),
      renderTextureCount
      // インスタンス破棄前に保存したレンダーテクスチャの数
    );
  }
  /**
   * クリッピングマスクバッファのサイズを取得する
   *
   * @return クリッピングマスクバッファのサイズ
   */
  getClippingMaskBufferSize() {
    return this._model.isUsingMasking() ? this._drawableClippingManager.getClippingMaskBufferSize() : s_invalidValue;
  }
  /**
   * ブレンドモード用のフレームバッファを取得する
   *
   * @return ブレンドモード用のフレームバッファ
   */
  getModelRenderTarget(index) {
    return this._modelRenderTargets[index];
  }
  /**
   * レンダーテクスチャの枚数を取得する
   * @return レンダーテクスチャの枚数
   */
  getRenderTextureCount() {
    return this._model.isUsingMasking() ? this._drawableClippingManager.getRenderTextureCount() : s_invalidValue;
  }
  /**
   * コンストラクタ
   */
  constructor(width, height) {
    super(width, height);
    this._clippingContextBufferForMask = null;
    this._clippingContextBufferForDraw = null;
    this._rendererProfile = new CubismRendererProfile_WebGL();
    this._textures = /* @__PURE__ */ new Map();
    this._sortedObjectsIndexList = new Array();
    this._sortedObjectsTypeList = new Array();
    this._bufferData = {
      vertex: WebGLBuffer = null,
      uv: WebGLBuffer = null,
      index: WebGLBuffer = null
    };
    this._modelRenderTargets = new Array();
    this._drawableMasks = new Array();
    this._currentFbo = null;
    this._drawableClippingManager = null;
    this._offscreenClippingManager = null;
    this._offscreenMasks = new Array();
    this._offscreenList = new Array();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    if (this._drawableClippingManager) {
      this._drawableClippingManager.release();
      this._drawableClippingManager = void 0;
      this._drawableClippingManager = null;
    }
    if (this.gl == null) {
      return;
    }
    this.gl.deleteBuffer(this._bufferData.vertex);
    this._bufferData.vertex = null;
    this.gl.deleteBuffer(this._bufferData.uv);
    this._bufferData.uv = null;
    this.gl.deleteBuffer(this._bufferData.index);
    this._bufferData.index = null;
    this._bufferData = null;
    this._textures = null;
    for (let i = 0; i < this._modelRenderTargets.length; i++) {
      if (this._modelRenderTargets[i] != null && this._modelRenderTargets[i].isValid()) {
        this._modelRenderTargets[i].destroyRenderTarget();
      }
    }
    this._modelRenderTargets.length = 0;
    this._modelRenderTargets = null;
    for (let i = 0; i < this._drawableMasks.length; i++) {
      if (this._drawableMasks[i] != null && this._drawableMasks[i].isValid()) {
        this._drawableMasks[i].destroyRenderTarget();
      }
    }
    this._drawableMasks.length = 0;
    this._drawableMasks = null;
    for (let i = 0; i < this._offscreenMasks.length; i++) {
      if (this._offscreenMasks[i] != null && this._offscreenMasks[i].isValid()) {
        this._offscreenMasks[i].destroyRenderTarget();
      }
    }
    this._offscreenMasks.length = 0;
    this._offscreenMasks = null;
    for (let i = 0; i < this._offscreenList.length; i++) {
      if (this._offscreenList[i] != null && this._offscreenList[i].isValid()) {
        this._offscreenList[i].destroyRenderTarget();
      }
    }
    this._offscreenList.length = 0;
    this._offscreenList = null;
    this._offscreenClippingManager = null;
    this._drawableClippingManager = null;
    this._clippingContextBufferForMask = null;
    this._clippingContextBufferForDraw = null;
    this._rendererProfile = null;
    this._sortedObjectsIndexList = null;
    this._sortedObjectsTypeList = null;
    this._currentFbo = null;
    this._model = null;
    this.gl = null;
  }
  /**
   * Shaderの読み込みを行う
   * @param shaderPath シェーダのパス
   */
  loadShaders(shaderPath = null) {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    if (CubismShaderManager_WebGL.getInstance().getShader(this.gl)._shaderSets.length == 0 || !CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded) {
      const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl);
      if (shaderPath != null) {
        shader.setShaderPath(shaderPath);
      }
      shader.generateShaders();
    }
  }
  /**
   * モデルを描画する実際の処理
   * @param shaderPath シェーダのパス
   */
  doDrawModel(shaderPath = null) {
    this.loadShaders(shaderPath);
    this.beforeDrawModelRenderTarget();
    const lastFbo = this.gl.getParameter(
      this.gl.FRAMEBUFFER_BINDING
    );
    const lastViewport = this.gl.getParameter(this.gl.VIEWPORT);
    if (this._drawableClippingManager != null) {
      this.preDraw();
      for (let i = 0; i < this._drawableClippingManager.getRenderTextureCount(); ++i) {
        if (this._drawableMasks[i].getBufferWidth() != this._drawableClippingManager.getClippingMaskBufferSize() || this._drawableMasks[i].getBufferHeight() != this._drawableClippingManager.getClippingMaskBufferSize()) {
          this._drawableMasks[i].createRenderTarget(
            this.gl,
            this._drawableClippingManager.getClippingMaskBufferSize(),
            this._drawableClippingManager.getClippingMaskBufferSize(),
            lastFbo
          );
        }
      }
      if (this.isUsingHighPrecisionMask()) {
        this._drawableClippingManager.setupMatrixForHighPrecision(
          this.getModel(),
          false
        );
      } else {
        this._drawableClippingManager.setupClippingContext(
          this.getModel(),
          this,
          lastFbo,
          lastViewport,
          0 /* DrawableObjectType_Drawable */
        );
      }
    }
    if (this._offscreenClippingManager != null) {
      this.preDraw();
      for (let i = 0; i < this._offscreenClippingManager.getRenderTextureCount(); ++i) {
        if (this._offscreenMasks[i].getBufferWidth() != this._offscreenClippingManager.getClippingMaskBufferSize() || this._offscreenMasks[i].getBufferHeight() != this._offscreenClippingManager.getClippingMaskBufferSize()) {
          this._offscreenMasks[i].createRenderTarget(
            this.gl,
            this._offscreenClippingManager.getClippingMaskBufferSize(),
            this._offscreenClippingManager.getClippingMaskBufferSize(),
            lastFbo
          );
        }
      }
      if (this.isUsingHighPrecisionMask()) {
        this._offscreenClippingManager.setupMatrixForOffscreenHighPrecision(
          this.getModel(),
          false,
          this.getMvpMatrix()
        );
      } else {
        this._offscreenClippingManager.setupClippingContext(
          this.getModel(),
          this,
          lastFbo,
          lastViewport,
          1 /* DrawableObjectType_Offscreen */
        );
      }
    }
    this.preDraw();
    this.drawObjectLoop(lastFbo);
    this.afterDrawModelRenderTarget();
  }
  /**
   * 描画オブジェクトのループ処理を行う。
   *
   * @param lastFbo 前回のフレームバッファ
   */
  drawObjectLoop(lastFbo) {
    const model = this.getModel();
    const drawableCount = model.getDrawableCount();
    const offscreenCount = model.getOffscreenCount();
    const totalCount = drawableCount + offscreenCount;
    const renderOrder = model.getRenderOrders();
    this._currentOffscreen = null;
    this._currentFbo = lastFbo;
    this._modelRootFbo = lastFbo;
    for (let i = 0; i < totalCount; ++i) {
      const order = renderOrder[i];
      if (i < drawableCount) {
        this._sortedObjectsIndexList[order] = i;
        this._sortedObjectsTypeList[order] = 0 /* DrawableObjectType_Drawable */;
      } else if (i < totalCount) {
        this._sortedObjectsIndexList[order] = i - drawableCount;
        this._sortedObjectsTypeList[order] = 1 /* DrawableObjectType_Offscreen */;
      }
    }
    for (let i = 0; i < totalCount; ++i) {
      const objectIndex = this._sortedObjectsIndexList[i];
      const objectType = this._sortedObjectsTypeList[i];
      this.renderObject(objectIndex, objectType);
    }
    while (this._currentOffscreen != null) {
      this.submitDrawToParentOffscreen(
        this._currentOffscreen.getOffscreenIndex(),
        1 /* DrawableObjectType_Offscreen */
      );
    }
  }
  /**
   * 描画オブジェクトを描画する。
   *
   * @param objectIndex 描画対象のオブジェクトのインデックス
   * @param objectType 描画対象のオブジェクトのタイプ
   * @param lastFbo 前回のフレームバッファ
   * @param lastViewport 前回のビューポート
   */
  renderObject(objectIndex, objectType) {
    switch (objectType) {
      case 0 /* DrawableObjectType_Drawable */:
        this.drawDrawable(objectIndex, this._modelRootFbo);
        break;
      case 1 /* DrawableObjectType_Offscreen */:
        this.addOffscreen(objectIndex);
        break;
      default:
        CubismLogError("Unknown object type: " + objectType);
        break;
    }
  }
  /**
   * 描画オブジェクト（アートメッシュ）を描画する。
   *
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  drawDrawable(drawableIndex, rootFbo) {
    if (!this.getModel().getDrawableDynamicFlagIsVisible(drawableIndex)) {
      return;
    }
    this.submitDrawToParentOffscreen(
      drawableIndex,
      0 /* DrawableObjectType_Drawable */
    );
    const clipContext = this._drawableClippingManager != null ? this._drawableClippingManager.getClippingContextListForDraw()[drawableIndex] : null;
    if (clipContext != null && this.isUsingHighPrecisionMask()) {
      if (clipContext._isUsing) {
        this.gl.viewport(
          0,
          0,
          this._drawableClippingManager.getClippingMaskBufferSize(),
          this._drawableClippingManager.getClippingMaskBufferSize()
        );
        this.preDraw();
        this.getDrawableMaskBuffer(clipContext._bufferIndex).beginDraw(
          this._currentFbo
        );
        this.gl.clearColor(1, 1, 1, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
      {
        const clipDrawCount = clipContext._clippingIdCount;
        for (let index = 0; index < clipDrawCount; index++) {
          const clipDrawIndex = clipContext._clippingIdList[index];
          if (!this._model.getDrawableDynamicFlagVertexPositionsDidChange(
            clipDrawIndex
          )) {
            continue;
          }
          this.setIsCulling(
            this._model.getDrawableCulling(clipDrawIndex) != false
          );
          this.setClippingContextBufferForMask(clipContext);
          this.drawMeshWebGL(this._model, clipDrawIndex);
        }
        this.getDrawableMaskBuffer(clipContext._bufferIndex).endDraw();
        this.setClippingContextBufferForMask(null);
        this.gl.viewport(
          0,
          0,
          this._modelRenderTargetWidth,
          this._modelRenderTargetHeight
        );
        this.preDraw();
      }
    }
    this.setClippingContextBufferForDrawable(clipContext);
    this.setIsCulling(this.getModel().getDrawableCulling(drawableIndex));
    this.drawMeshWebGL(this._model, drawableIndex);
  }
  /**
   * 描画オブジェクト（アートメッシュ）を描画する。
   *
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  drawMeshWebGL(model, index) {
    if (this.isCulling()) {
      this.gl.enable(this.gl.CULL_FACE);
    } else {
      this.gl.disable(this.gl.CULL_FACE);
    }
    this.gl.frontFace(this.gl.CCW);
    if (this.isGeneratingMask()) {
      CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForMask(this, model, index);
    } else {
      CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForDrawable(this, model, index);
    }
    if (!CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded) {
      return;
    }
    {
      const indexCount = model.getDrawableVertexIndexCount(index);
      this.gl.drawElements(
        this.gl.TRIANGLES,
        indexCount,
        this.gl.UNSIGNED_SHORT,
        0
      );
    }
    this.gl.useProgram(null);
    this.setClippingContextBufferForDrawable(null);
    this.setClippingContextBufferForMask(null);
  }
  /**
   * オフスクリーンを親のオフスクリーンにコピーする。
   *
   * @param objectIndex オブジェクトのインデックス
   * @param objectType  オブジェクトの種類
   */
  submitDrawToParentOffscreen(objectIndex, objectType) {
    if (this._currentOffscreen == null || objectIndex == s_invalidValue) {
      return;
    }
    const currentOwnerIndex = this.getModel().getOffscreenOwnerIndices()[this._currentOffscreen.getOffscreenIndex()];
    if (currentOwnerIndex == s_invalidValue) {
      return;
    }
    let targetParentIndex = NoParentIndex;
    switch (objectType) {
      case 0 /* DrawableObjectType_Drawable */:
        targetParentIndex = this.getModel().getDrawableParentPartIndex(objectIndex);
        break;
      case 1 /* DrawableObjectType_Offscreen */:
        targetParentIndex = this.getModel().getPartParentPartIndices()[this.getModel().getOffscreenOwnerIndices()[objectIndex]];
        break;
      default:
        return;
    }
    while (targetParentIndex != NoParentIndex) {
      if (targetParentIndex == currentOwnerIndex) {
        return;
      }
      targetParentIndex = this.getModel().getPartParentPartIndices()[targetParentIndex];
    }
    this.drawOffscreen(this._currentOffscreen);
    this.submitDrawToParentOffscreen(objectIndex, objectType);
  }
  /**
   * 描画オブジェクト（オフスクリーン）を追加する。
   *
   * @param offscreenIndex オフスクリーンのインデックス
   */
  addOffscreen(offscreenIndex) {
    if (this._currentOffscreen != null && this._currentOffscreen.getOffscreenIndex() != offscreenIndex) {
      let isParent = false;
      const ownerIndex = this.getModel().getOffscreenOwnerIndices()[offscreenIndex];
      let parentIndex = this.getModel().getPartParentPartIndices()[ownerIndex];
      const currentOffscreenIndex = this._currentOffscreen.getOffscreenIndex();
      const currentOffscreenOwnerIndex = this.getModel().getOffscreenOwnerIndices()[currentOffscreenIndex];
      while (parentIndex != NoParentIndex) {
        if (parentIndex == currentOffscreenOwnerIndex) {
          isParent = true;
          break;
        }
        parentIndex = this.getModel().getPartParentPartIndices()[parentIndex];
      }
      if (!isParent) {
        this.submitDrawToParentOffscreen(
          offscreenIndex,
          1 /* DrawableObjectType_Offscreen */
        );
      }
    }
    const offscreen = this._offscreenList[offscreenIndex];
    if (offscreen.getRenderTexture() == null || offscreen.getBufferWidth() != this._modelRenderTargetWidth || offscreen.getBufferHeight() != this._modelRenderTargetHeight || offscreen.getUsingRenderTextureState()) {
      offscreen.setOffscreenRenderTarget(
        this.gl,
        this._modelRenderTargetWidth,
        this._modelRenderTargetHeight,
        this._currentFbo
      );
    } else {
      offscreen.startUsingRenderTexture();
    }
    const oldOffscreen = offscreen.getParentPartOffscreen();
    offscreen.setOldOffscreen(oldOffscreen);
    let oldFBO = null;
    if (oldOffscreen != null) {
      oldFBO = oldOffscreen.getRenderTexture();
    }
    if (oldFBO == null) {
      oldFBO = this._modelRootFbo;
    }
    offscreen.beginDraw(oldFBO);
    this.gl.viewport(
      0,
      0,
      this._modelRenderTargetWidth,
      this._modelRenderTargetHeight
    );
    offscreen.clear(0, 0, 0, 0);
    this._currentOffscreen = offscreen;
    this._currentFbo = offscreen.getRenderTexture();
  }
  /**
   * オフスクリーン描画を行う。
   *
   * @param offscreen オフスクリーンレンダリングターゲット
   */
  drawOffscreen(offscreen) {
    const offscreenIndex = offscreen.getOffscreenIndex();
    const clipContext = this._offscreenClippingManager != null ? this._offscreenClippingManager.getClippingContextListForOffscreen()[offscreenIndex] : null;
    if (clipContext != null && this.isUsingHighPrecisionMask()) {
      if (clipContext._isUsing) {
        this.gl.viewport(
          0,
          0,
          this._offscreenClippingManager.getClippingMaskBufferSize(),
          this._offscreenClippingManager.getClippingMaskBufferSize()
        );
        this.preDraw();
        this.getOffscreenMaskBuffer(clipContext._bufferIndex).beginDraw(
          this._currentFbo
        );
        this.gl.clearColor(1, 1, 1, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
      {
        const clipDrawCount = clipContext._clippingIdCount;
        for (let index = 0; index < clipDrawCount; index++) {
          const clipDrawIndex = clipContext._clippingIdList[index];
          if (!this.getModel().getDrawableDynamicFlagVertexPositionsDidChange(
            clipDrawIndex
          )) {
            continue;
          }
          this.setIsCulling(
            this.getModel().getDrawableCulling(clipDrawIndex) != false
          );
          this.setClippingContextBufferForMask(clipContext);
          this.drawMeshWebGL(this.getModel(), clipDrawIndex);
        }
      }
      {
        this.getOffscreenMaskBuffer(clipContext._bufferIndex).endDraw();
        this.setClippingContextBufferForMask(null);
        this.gl.viewport(
          0,
          0,
          this._modelRenderTargetWidth,
          this._modelRenderTargetHeight
        );
        this.preDraw();
      }
    }
    this.setClippingContextBufferForOffscreen(clipContext);
    this.setIsCulling(this._model.getOffscreenCulling(offscreenIndex) != false);
    this.drawOffscreenWebGL(this.getModel(), offscreen);
  }
  /**
   * オフスクリーン描画のWebGL実装
   *
   * @param model モデル
   * @param index オフスクリーンインデックス
   */
  drawOffscreenWebGL(model, offscreen) {
    if (this.isCulling()) {
      this.gl.enable(this.gl.CULL_FACE);
    } else {
      this.gl.disable(this.gl.CULL_FACE);
    }
    this.gl.frontFace(this.gl.CCW);
    CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForOffscreen(this, model, offscreen);
    offscreen.endDraw();
    this._currentOffscreen = this._currentOffscreen.getOldOffscreen();
    this._currentFbo = offscreen.getOldFBO();
    if (this._currentFbo == null) {
      this._currentOffscreen = this._modelRenderTargets[0];
      this._currentFbo = this._modelRenderTargets[0].getRenderTexture();
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this._currentFbo);
    }
    {
      const indexBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        s_renderTargetIndexArray,
        this.gl.STATIC_DRAW
      );
      this.gl.drawElements(
        this.gl.TRIANGLES,
        s_renderTargetIndexArray.length,
        this.gl.UNSIGNED_SHORT,
        0
      );
      this.gl.deleteBuffer(indexBuffer);
    }
    offscreen.stopUsingRenderTexture();
    this.gl.useProgram(null);
    this.setClippingContextBufferForMask(null);
    this.setClippingContextBufferForOffscreen(null);
  }
  /**
   * モデル描画直前のレンダラのステートを保持する
   */
  saveProfile() {
    this._rendererProfile.save();
  }
  /**
   * モデル描画直前のレンダラのステートを復帰させる
   */
  restoreProfile() {
    this._rendererProfile.restore();
  }
  /**
   * モデル描画直前のオフスクリーン設定を行う
   */
  beforeDrawModelRenderTarget() {
    if (this._modelRenderTargets.length == 0) {
      return;
    }
    for (let i = 0; i < this._modelRenderTargets.length; ++i) {
      if (this._modelRenderTargets[i].getBufferWidth() != this._modelRenderTargetWidth || this._modelRenderTargets[i].getBufferHeight() != this._modelRenderTargetHeight) {
        this._modelRenderTargets[i].createRenderTarget(
          this.gl,
          this._modelRenderTargetWidth,
          this._modelRenderTargetHeight,
          this._currentFbo
        );
      }
    }
    this._modelRenderTargets[0].beginDraw();
    this._modelRenderTargets[0].clear(0, 0, 0, 0);
  }
  /**
   * モデル描画後のオフスクリーン設定を行う
   */
  afterDrawModelRenderTarget() {
    if (this._modelRenderTargets.length == 0) {
      return;
    }
    this._modelRenderTargets[0].endDraw();
    CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForOffscreenRenderTarget(this);
    if (CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded) {
      const indexBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        s_renderTargetIndexArray,
        this.gl.STATIC_DRAW
      );
      this.gl.drawElements(
        this.gl.TRIANGLES,
        s_renderTargetIndexArray.length,
        this.gl.UNSIGNED_SHORT,
        0
      );
      this.gl.deleteBuffer(indexBuffer);
    }
    this.gl.useProgram(null);
  }
  /**
   * オフスクリーンのクリッピングマスクのバッファを取得する
   *
   * @param index オフスクリーンのクリッピングマスクのバッファのインデックス
   *
   * @return オフスクリーンのクリッピングマスクのバッファへのポインタ
   */
  getOffscreenMaskBuffer(index) {
    return this._offscreenMasks[index];
  }
  /**
   * レンダラが保持する静的なリソースを解放する
   * WebGLの静的なシェーダープログラムを解放する
   */
  static doStaticRelease() {
    CubismShaderManager_WebGL.deleteInstance();
  }
  /**
   * レンダーステートを設定する
   *
   * @param fbo アプリケーション側で指定しているフレームバッファ
   * @param viewport ビューポート
   */
  setRenderState(fbo, viewport) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
    this.gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    if (this._modelRenderTargetWidth != viewport[2] || this._modelRenderTargetHeight != viewport[3]) {
      this._modelRenderTargetWidth = viewport[2];
      this._modelRenderTargetHeight = viewport[3];
    }
  }
  /**
   * 描画開始時の追加処理
   * モデルを描画する前にクリッピングマスクに必要な処理を実装している
   */
  preDraw() {
    this.gl.disable(this.gl.SCISSOR_TEST);
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.frontFace(this.gl.CW);
    this.gl.enable(this.gl.BLEND);
    this.gl.colorMask(true, true, true, true);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    if (this.getAnisotropy() > 0 && this._extension) {
      for (let i = 0; i < this._textures.size; ++i) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._textures.get(i));
        this.gl.texParameterf(
          this.gl.TEXTURE_2D,
          this._extension.TEXTURE_MAX_ANISOTROPY_EXT,
          this.getAnisotropy()
        );
      }
    }
  }
  /**
   * Drawableのマスク用のオフスクリーンサーフェースを取得する
   *
   * @param index オフスクリーンサーフェースのインデックス
   *
   * @return マスク用のオフスクリーンサーフェース
   */
  getDrawableMaskBuffer(index) {
    return this._drawableMasks[index];
  }
  /**
   * マスクテクスチャに描画するクリッピングコンテキストをセットする
   */
  setClippingContextBufferForMask(clip) {
    this._clippingContextBufferForMask = clip;
  }
  /**
   * マスクテクスチャに描画するクリッピングコンテキストを取得する
   *
   * @return マスクテクスチャに描画するクリッピングコンテキスト
   */
  getClippingContextBufferForMask() {
    return this._clippingContextBufferForMask;
  }
  /**
   * Drawableの画面上に描画するクリッピングコンテキストをセットする
   *
   * @param clip drawableで画面上に描画するクリッピングコンテキスト
   */
  setClippingContextBufferForDrawable(clip) {
    this._clippingContextBufferForDraw = clip;
  }
  /**
   * Drawableの画面上に描画するクリッピングコンテキストを取得する
   *
   * @return Drawableの画面上に描画するクリッピングコンテキスト
   */
  getClippingContextBufferForDrawable() {
    return this._clippingContextBufferForDraw;
  }
  /**
   * offscreenで画面上に描画するクリッピングコンテキストをセットする。
   *
   * @param clip offscreenで画面上に描画するクリッピングコンテキスト
   */
  setClippingContextBufferForOffscreen(clip) {
    this._clippingContextBufferForOffscreen = clip;
  }
  /**
   * offscreenで画面上に描画するクリッピングコンテキストを取得する。
   *
   * @return offscreenで画面上に描画するクリッピングコンテキスト
   */
  getClippingContextBufferForOffscreen() {
    return this._clippingContextBufferForOffscreen;
  }
  /**
   * マスク生成時かを判定する
   *
   * @return 判定値
   */
  isGeneratingMask() {
    return this.getClippingContextBufferForMask() != null;
  }
  /**
   * glの設定
   */
  startUp(gl) {
    this.gl = gl;
    if (this._drawableClippingManager) {
      this._drawableClippingManager.setGL(gl);
    }
    if (this._offscreenClippingManager) {
      this._offscreenClippingManager.setGL(gl);
    }
    CubismShaderManager_WebGL.getInstance().setGlContext(gl);
    this._rendererProfile.setGl(gl);
    this._extension = this.gl.getExtension("EXT_texture_filter_anisotropic") || this.gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") || this.gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
    if (this._model.isUsingMasking()) {
      this._drawableMasks.length = this._drawableClippingManager.getRenderTextureCount();
      for (let i = 0; i < this._drawableMasks.length; ++i) {
        const renderTarget = new CubismRenderTarget_WebGL();
        renderTarget.createRenderTarget(
          this.gl,
          this._drawableClippingManager.getClippingMaskBufferSize(),
          this._drawableClippingManager.getClippingMaskBufferSize(),
          this._currentFbo
        );
        this._drawableMasks[i] = renderTarget;
      }
    }
    if (this._model.isBlendModeEnabled()) {
      this._modelRenderTargets.length = 0;
      const createSize = 3;
      this._modelRenderTargets.length = createSize;
      for (let i = 0; i < createSize; ++i) {
        const offscreenRenderTarget = new CubismOffscreenRenderTarget_WebGL();
        offscreenRenderTarget.createRenderTarget(
          this.gl,
          this._modelRenderTargetWidth,
          this._modelRenderTargetHeight,
          this._currentFbo
        );
        this._modelRenderTargets[i] = offscreenRenderTarget;
      }
      if (this._model.isUsingMaskingForOffscreen()) {
        this._offscreenMasks.length = this._offscreenClippingManager.getRenderTextureCount();
        for (let i = 0; i < this._offscreenMasks.length; ++i) {
          const offscreenMask = new CubismRenderTarget_WebGL();
          offscreenMask.createRenderTarget(
            this.gl,
            this._offscreenClippingManager.getClippingMaskBufferSize(),
            this._offscreenClippingManager.getClippingMaskBufferSize(),
            this._currentFbo
          );
          this._offscreenMasks[i] = offscreenMask;
        }
      }
      const offscreenCount = this._model.getOffscreenCount();
      if (offscreenCount > 0) {
        this._offscreenList = new Array(
          offscreenCount
        );
        for (let offscreenIndex = 0; offscreenIndex < offscreenCount; ++offscreenIndex) {
          const offscreenRenderTarget = new CubismOffscreenRenderTarget_WebGL();
          offscreenRenderTarget.setOffscreenIndex(offscreenIndex);
          this._offscreenList[offscreenIndex] = offscreenRenderTarget;
        }
        this.setupParentOffscreens(this._model, offscreenCount);
      }
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this._currentFbo);
  }
  _textures;
  // モデルが参照するテクスチャとレンダラでバインドしているテクスチャとのマップ
  _sortedObjectsIndexList;
  // 描画オブジェクトのインデックスを描画順に並べたリスト
  _sortedObjectsTypeList;
  // 描画オブジェクトのオブジェクトタイプを描画順に並べたリスト
  _rendererProfile;
  _drawableClippingManager;
  // クリッピングマスク管理オブジェクト
  _clippingContextBufferForMask;
  // マスクテクスチャに描画するためのクリッピングコンテキスト
  _clippingContextBufferForDraw;
  // 画面上描画するためのクリッピングコンテキスト
  _clippingContextBufferForOffscreen;
  // オフスクリーン描画用のクリッピングコンテキスト
  _offscreenClippingManager;
  // オフスクリーン描画用のクリッピングマスク管理オブジェクト
  _modelRenderTargets;
  ///< モデル全体を描画する先のフレームバッファ
  _drawableMasks;
  // マスク用のオフスクリーンサーフェースのリスト
  _offscreenMasks;
  ///< オフスクリーン機能マスク描画用のフレームバッファ
  _offscreenList;
  ///< モデルのオフスクリーン
  _currentFbo;
  ///< 現在のフレームバッファオブジェクト
  _currentOffscreen;
  // 現在のオフスクリーン
  _modelRootFbo;
  // モデルのルートフレームバッファ
  _bufferData;
  // 頂点バッファデータ
  _extension;
  // 拡張機能
  gl;
  // webglコンテキスト
};
CubismRenderer.staticRelease = () => {
  CubismRenderer_WebGL.doStaticRelease();
};
var Live2DCubismFramework15;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismClippingContext = CubismClippingContext_WebGL;
  Live2DCubismFramework19.CubismClippingManager_WebGL = CubismClippingManager_WebGL;
  Live2DCubismFramework19.CubismRenderer_WebGL = CubismRenderer_WebGL;
})(Live2DCubismFramework15 || (Live2DCubismFramework15 = {}));

// vendor/cubism-framework/src/physics/cubismphysicsinternal.ts
var CubismPhysicsTargetType = /* @__PURE__ */ ((CubismPhysicsTargetType2) => {
  CubismPhysicsTargetType2[CubismPhysicsTargetType2["CubismPhysicsTargetType_Parameter"] = 0] = "CubismPhysicsTargetType_Parameter";
  return CubismPhysicsTargetType2;
})(CubismPhysicsTargetType || {});
var CubismPhysicsSource = /* @__PURE__ */ ((CubismPhysicsSource2) => {
  CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_X"] = 0] = "CubismPhysicsSource_X";
  CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_Y"] = 1] = "CubismPhysicsSource_Y";
  CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_Angle"] = 2] = "CubismPhysicsSource_Angle";
  return CubismPhysicsSource2;
})(CubismPhysicsSource || {});
var PhysicsJsonEffectiveForces = class {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }
  gravity;
  // 重力
  wind;
  // 風
};
var CubismPhysicsParameter = class {
  id;
  // パラメータ
  targetType;
  // 適用先の種類
};
var CubismPhysicsNormalization = class {
  minimum;
  // 最大値
  maximum;
  // 最小値
  defalut;
  // デフォルト値
};
var CubismPhysicsParticle = class {
  constructor() {
    this.initialPosition = new CubismVector2(0, 0);
    this.position = new CubismVector2(0, 0);
    this.lastPosition = new CubismVector2(0, 0);
    this.lastGravity = new CubismVector2(0, 0);
    this.force = new CubismVector2(0, 0);
    this.velocity = new CubismVector2(0, 0);
  }
  initialPosition;
  // 初期位置
  mobility;
  // 動きやすさ
  delay;
  // 遅れ
  acceleration;
  // 加速度
  radius;
  // 距離
  position;
  // 現在の位置
  lastPosition;
  // 最後の位置
  lastGravity;
  // 最後の重力
  force;
  // 現在かかっている力
  velocity;
  // 現在の速度
};
var CubismPhysicsSubRig = class {
  constructor() {
    this.normalizationPosition = new CubismPhysicsNormalization();
    this.normalizationAngle = new CubismPhysicsNormalization();
  }
  inputCount;
  // 入力の個数
  outputCount;
  // 出力の個数
  particleCount;
  // 物理点の個数
  baseInputIndex;
  // 入力の最初のインデックス
  baseOutputIndex;
  // 出力の最初のインデックス
  baseParticleIndex;
  // 物理点の最初のインデックス
  normalizationPosition;
  // 正規化された位置
  normalizationAngle;
  // 正規化された角度
};
var CubismPhysicsInput = class {
  constructor() {
    this.source = new CubismPhysicsParameter();
  }
  source;
  // 入力元のパラメータ
  sourceParameterIndex;
  // 入力元のパラメータのインデックス
  weight;
  // 重み
  type;
  // 入力の種類
  reflect;
  // 値が反転されているかどうか
  getNormalizedParameterValue;
  // 正規化されたパラメータ値の取得関数
};
var CubismPhysicsOutput = class {
  constructor() {
    this.destination = new CubismPhysicsParameter();
    this.translationScale = new CubismVector2(0, 0);
  }
  destination;
  // 出力先のパラメータ
  destinationParameterIndex;
  // 出力先のパラメータのインデックス
  vertexIndex;
  // 振り子のインデックス
  translationScale;
  // 移動値のスケール
  angleScale;
  // 角度のスケール
  weight;
  // 重み
  type;
  // 出力の種類
  reflect;
  // 値が反転されているかどうか
  valueBelowMinimum;
  // 最小値を下回った時の値
  valueExceededMaximum;
  // 最大値をこえた時の値
  getValue;
  // 物理演算の値の取得関数
  getScale;
  // 物理演算のスケール値の取得関数
};
var CubismPhysicsRig = class {
  constructor() {
    this.settings = new Array();
    this.inputs = new Array();
    this.outputs = new Array();
    this.particles = new Array();
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
    this.fps = 0;
  }
  subRigCount;
  // 物理演算の物理点の個数
  settings;
  // 物理演算の物理点の管理のリスト
  inputs;
  // 物理演算の入力のリスト
  outputs;
  // 物理演算の出力のリスト
  particles;
  // 物理演算の物理点のリスト
  gravity;
  // 重力
  wind;
  // 風
  fps;
  //物理演算動作FPS
};
var Live2DCubismFramework16;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismPhysicsInput = CubismPhysicsInput;
  Live2DCubismFramework19.CubismPhysicsNormalization = CubismPhysicsNormalization;
  Live2DCubismFramework19.CubismPhysicsOutput = CubismPhysicsOutput;
  Live2DCubismFramework19.CubismPhysicsParameter = CubismPhysicsParameter;
  Live2DCubismFramework19.CubismPhysicsParticle = CubismPhysicsParticle;
  Live2DCubismFramework19.CubismPhysicsRig = CubismPhysicsRig;
  Live2DCubismFramework19.CubismPhysicsSource = CubismPhysicsSource;
  Live2DCubismFramework19.CubismPhysicsSubRig = CubismPhysicsSubRig;
  Live2DCubismFramework19.CubismPhysicsTargetType = CubismPhysicsTargetType;
  Live2DCubismFramework19.PhysicsJsonEffectiveForces = PhysicsJsonEffectiveForces;
})(Live2DCubismFramework16 || (Live2DCubismFramework16 = {}));

// vendor/cubism-framework/src/physics/cubismphysicsjson.ts
var Position = "Position";
var X = "X";
var Y = "Y";
var Angle = "Angle";
var Type = "Type";
var Id = "Id";
var Meta = "Meta";
var EffectiveForces = "EffectiveForces";
var TotalInputCount = "TotalInputCount";
var TotalOutputCount = "TotalOutputCount";
var PhysicsSettingCount = "PhysicsSettingCount";
var Gravity = "Gravity";
var Wind = "Wind";
var VertexCount = "VertexCount";
var Fps = "Fps";
var PhysicsSettings = "PhysicsSettings";
var Normalization = "Normalization";
var Minimum = "Minimum";
var Maximum = "Maximum";
var Default = "Default";
var Reflect = "Reflect";
var Weight = "Weight";
var Input = "Input";
var Source = "Source";
var Output = "Output";
var Scale = "Scale";
var VertexIndex = "VertexIndex";
var Destination = "Destination";
var Vertices = "Vertices";
var Mobility = "Mobility";
var Delay = "Delay";
var Radius = "Radius";
var Acceleration = "Acceleration";
var CubismPhysicsJson = class {
  /**
   * コンストラクタ
   * @param buffer physics3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  constructor(buffer, size) {
    this._json = CubismJson.create(buffer, size);
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    CubismJson.delete(this._json);
  }
  /**
   * 重力の取得
   * @return 重力
   */
  getGravity() {
    const ret = new CubismVector2(0, 0);
    ret.x = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Gravity).getValueByString(X).toFloat();
    ret.y = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Gravity).getValueByString(Y).toFloat();
    return ret;
  }
  /**
   * 風の取得
   * @return 風
   */
  getWind() {
    const ret = new CubismVector2(0, 0);
    ret.x = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Wind).getValueByString(X).toFloat();
    ret.y = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Wind).getValueByString(Y).toFloat();
    return ret;
  }
  /**
   * 物理演算設定FPSの取得
   * @return 物理演算設定FPS
   */
  getFps() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(Fps).toFloat(0);
  }
  /**
   * 物理店の管理の個数の取得
   * @return 物理店の管理の個数
   */
  getSubRigCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(PhysicsSettingCount).toInt();
  }
  /**
   * 入力の総合計の取得
   * @return 入力の総合計
   */
  getTotalInputCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(TotalInputCount).toInt();
  }
  /**
   * 出力の総合計の取得
   * @return 出力の総合計
   */
  getTotalOutputCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(TotalOutputCount).toInt();
  }
  /**
   * 物理点の個数の取得
   * @return 物理点の個数
   */
  getVertexCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(VertexCount).toInt();
  }
  /**
   * 正規化された位置の最小値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された位置の最小値
   */
  getNormalizationPositionMinimumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Minimum).toFloat();
  }
  /**
   * 正規化された位置の最大値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された位置の最大値
   */
  getNormalizationPositionMaximumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Maximum).toFloat();
  }
  /**
   * 正規化された位置のデフォルト値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された位置のデフォルト値
   */
  getNormalizationPositionDefaultValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Default).toFloat();
  }
  /**
   * 正規化された角度の最小値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された角度の最小値
   */
  getNormalizationAngleMinimumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Minimum).toFloat();
  }
  /**
   * 正規化された角度の最大値の取得
   * @param physicsSettingIndex
   * @return 正規化された角度の最大値
   */
  getNormalizationAngleMaximumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Maximum).toFloat();
  }
  /**
   * 正規化された角度のデフォルト値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された角度のデフォルト値
   */
  getNormalizationAngleDefaultValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Default).toFloat();
  }
  /**
   * 入力の個数の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 入力の個数
   */
  getInputCount(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getVector().length;
  }
  /**
   * 入力の重みの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力の重み
   */
  getInputWeight(physicsSettingIndex, inputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Weight).toFloat();
  }
  /**
   * 入力の反転の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力の反転
   */
  getInputReflect(physicsSettingIndex, inputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Reflect).toBoolean();
  }
  /**
   * 入力の種類の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力の種類
   */
  getInputType(physicsSettingIndex, inputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Type).getRawString();
  }
  /**
   * 入力元のIDの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力元のID
   */
  getInputSourceId(physicsSettingIndex, inputIndex) {
    return CubismFramework.getIdManager().getId(
      this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Source).getValueByString(Id).getRawString()
    );
  }
  /**
   * 出力の個数の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 出力の個数
   */
  getOutputCount(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getVector().length;
  }
  /**
   * 出力の物理点のインデックスの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の物理点のインデックス
   */
  getOutputVertexIndex(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(VertexIndex).toInt();
  }
  /**
   * 出力の角度のスケールを取得する
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の角度のスケール
   */
  getOutputAngleScale(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Scale).toFloat();
  }
  /**
   * 出力の重みの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の重み
   */
  getOutputWeight(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Weight).toFloat();
  }
  /**
   * 出力先のIDの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力先のID
   */
  getOutputDestinationId(physicsSettingIndex, outputIndex) {
    return CubismFramework.getIdManager().getId(
      this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Destination).getValueByString(Id).getRawString()
    );
  }
  /**
   * 出力の種類の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の種類
   */
  getOutputType(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Type).getRawString();
  }
  /**
   * 出力の反転の取得
   * @param physicsSettingIndex 物理演算のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の反転
   */
  getOutputReflect(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Reflect).toBoolean();
  }
  /**
   * 物理点の個数の取得
   * @param physicsSettingIndex 物理演算男設定のインデックス
   * @return 物理点の個数
   */
  getParticleCount(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getVector().length;
  }
  /**
   * 物理点の動きやすさの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の動きやすさ
   */
  getParticleMobility(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Mobility).toFloat();
  }
  /**
   * 物理点の遅れの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の遅れ
   */
  getParticleDelay(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Delay).toFloat();
  }
  /**
   * 物理点の加速度の取得
   * @param physicsSettingIndex 物理演算の設定
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の加速度
   */
  getParticleAcceleration(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Acceleration).toFloat();
  }
  /**
   * 物理点の距離の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の距離
   */
  getParticleRadius(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Radius).toFloat();
  }
  /**
   * 物理点の位置の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexInde 物理点のインデックス
   * @return 物理点の位置
   */
  getParticlePosition(physicsSettingIndex, vertexIndex) {
    const ret = new CubismVector2(0, 0);
    ret.x = this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Position).getValueByString(X).toFloat();
    ret.y = this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Position).getValueByString(Y).toFloat();
    return ret;
  }
  _json;
  // physics3.jsonデータ
};
var Live2DCubismFramework17;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismPhysicsJson = CubismPhysicsJson;
})(Live2DCubismFramework17 || (Live2DCubismFramework17 = {}));

// vendor/cubism-framework/src/physics/cubismphysics.ts
var PhysicsTypeTagX = "X";
var PhysicsTypeTagY = "Y";
var PhysicsTypeTagAngle = "Angle";
var AirResistance = 5;
var MaximumWeight = 100;
var MovementThreshold = 1e-3;
var MaxDeltaTime = 5;
var CubismPhysics = class _CubismPhysics {
  /**
   * インスタンスの作成
   * @param buffer    physics3.jsonが読み込まれているバッファ
   * @param size      バッファのサイズ
   * @return 作成されたインスタンス
   */
  static create(buffer, size) {
    const ret = new _CubismPhysics();
    ret.parse(buffer, size);
    ret._physicsRig.gravity.y = 0;
    return ret;
  }
  /**
   * インスタンスを破棄する
   * @param physics 破棄するインスタンス
   */
  static delete(physics) {
    if (physics != null) {
      physics.release();
      physics = null;
    }
  }
  /**
   * physics3.jsonをパースする。
   * @param physicsJson physics3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  parse(physicsJson, size) {
    this._physicsRig = new CubismPhysicsRig();
    let json = new CubismPhysicsJson(physicsJson, size);
    this._physicsRig.gravity = json.getGravity();
    this._physicsRig.wind = json.getWind();
    this._physicsRig.subRigCount = json.getSubRigCount();
    this._physicsRig.fps = json.getFps();
    updateSize(
      this._physicsRig.settings,
      this._physicsRig.subRigCount,
      CubismPhysicsSubRig,
      true
    );
    updateSize(
      this._physicsRig.inputs,
      json.getTotalInputCount(),
      CubismPhysicsInput,
      true
    );
    updateSize(
      this._physicsRig.outputs,
      json.getTotalOutputCount(),
      CubismPhysicsOutput,
      true
    );
    updateSize(
      this._physicsRig.particles,
      json.getVertexCount(),
      CubismPhysicsParticle,
      true
    );
    this._currentRigOutputs.length = 0;
    this._previousRigOutputs.length = 0;
    let inputIndex = 0, outputIndex = 0, particleIndex = 0;
    let dstIndexCurrentRigOutputs = this._currentRigOutputs.length;
    let dstIndexPreviousRigOutputs = this._previousRigOutputs.length;
    this._currentRigOutputs.length += this._physicsRig.settings.length;
    this._previousRigOutputs.length += this._physicsRig.settings.length;
    for (let i = 0; i < this._physicsRig.settings.length; ++i) {
      this._physicsRig.settings[i].normalizationPosition.minimum = json.getNormalizationPositionMinimumValue(i);
      this._physicsRig.settings[i].normalizationPosition.maximum = json.getNormalizationPositionMaximumValue(i);
      this._physicsRig.settings[i].normalizationPosition.defalut = json.getNormalizationPositionDefaultValue(i);
      this._physicsRig.settings[i].normalizationAngle.minimum = json.getNormalizationAngleMinimumValue(i);
      this._physicsRig.settings[i].normalizationAngle.maximum = json.getNormalizationAngleMaximumValue(i);
      this._physicsRig.settings[i].normalizationAngle.defalut = json.getNormalizationAngleDefaultValue(i);
      this._physicsRig.settings[i].inputCount = json.getInputCount(i);
      this._physicsRig.settings[i].baseInputIndex = inputIndex;
      for (let j = 0; j < this._physicsRig.settings[i].inputCount; ++j) {
        this._physicsRig.inputs[inputIndex + j].sourceParameterIndex = -1;
        this._physicsRig.inputs[inputIndex + j].weight = json.getInputWeight(
          i,
          j
        );
        this._physicsRig.inputs[inputIndex + j].reflect = json.getInputReflect(
          i,
          j
        );
        if (json.getInputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.inputs[inputIndex + j].type = 0 /* CubismPhysicsSource_X */;
          this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue = getInputTranslationXFromNormalizedParameterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.inputs[inputIndex + j].type = 1 /* CubismPhysicsSource_Y */;
          this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue = getInputTranslationYFromNormalizedParamterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.inputs[inputIndex + j].type = 2 /* CubismPhysicsSource_Angle */;
          this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue = getInputAngleFromNormalizedParameterValue;
        }
        this._physicsRig.inputs[inputIndex + j].source.targetType = 0 /* CubismPhysicsTargetType_Parameter */;
        this._physicsRig.inputs[inputIndex + j].source.id = json.getInputSourceId(i, j);
      }
      inputIndex += this._physicsRig.settings[i].inputCount;
      this._physicsRig.settings[i].outputCount = json.getOutputCount(i);
      this._physicsRig.settings[i].baseOutputIndex = outputIndex;
      const currentRigOutput = new PhysicsOutput();
      updateSize(
        currentRigOutput.outputs,
        this._physicsRig.settings[i].outputCount,
        null,
        true
      );
      const previousRigOutput = new PhysicsOutput();
      updateSize(
        previousRigOutput.outputs,
        this._physicsRig.settings[i].outputCount,
        null,
        true
      );
      for (let j = 0; j < this._physicsRig.settings[i].outputCount; ++j) {
        currentRigOutput.outputs[j] = 0;
        previousRigOutput.outputs[j] = 0;
        this._physicsRig.outputs[outputIndex + j].destinationParameterIndex = -1;
        this._physicsRig.outputs[outputIndex + j].vertexIndex = json.getOutputVertexIndex(i, j);
        this._physicsRig.outputs[outputIndex + j].angleScale = json.getOutputAngleScale(i, j);
        this._physicsRig.outputs[outputIndex + j].weight = json.getOutputWeight(
          i,
          j
        );
        this._physicsRig.outputs[outputIndex + j].destination.targetType = 0 /* CubismPhysicsTargetType_Parameter */;
        this._physicsRig.outputs[outputIndex + j].destination.id = json.getOutputDestinationId(i, j);
        if (json.getOutputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.outputs[outputIndex + j].type = 0 /* CubismPhysicsSource_X */;
          this._physicsRig.outputs[outputIndex + j].getValue = getOutputTranslationX;
          this._physicsRig.outputs[outputIndex + j].getScale = getOutputScaleTranslationX;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.outputs[outputIndex + j].type = 1 /* CubismPhysicsSource_Y */;
          this._physicsRig.outputs[outputIndex + j].getValue = getOutputTranslationY;
          this._physicsRig.outputs[outputIndex + j].getScale = getOutputScaleTranslationY;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.outputs[outputIndex + j].type = 2 /* CubismPhysicsSource_Angle */;
          this._physicsRig.outputs[outputIndex + j].getValue = getOutputAngle;
          this._physicsRig.outputs[outputIndex + j].getScale = getOutputScaleAngle;
        }
        this._physicsRig.outputs[outputIndex + j].reflect = json.getOutputReflect(i, j);
      }
      this._currentRigOutputs[dstIndexCurrentRigOutputs++] = currentRigOutput;
      this._previousRigOutputs[dstIndexPreviousRigOutputs++] = previousRigOutput;
      outputIndex += this._physicsRig.settings[i].outputCount;
      this._physicsRig.settings[i].particleCount = json.getParticleCount(i);
      this._physicsRig.settings[i].baseParticleIndex = particleIndex;
      for (let j = 0; j < this._physicsRig.settings[i].particleCount; ++j) {
        this._physicsRig.particles[particleIndex + j].mobility = json.getParticleMobility(i, j);
        this._physicsRig.particles[particleIndex + j].delay = json.getParticleDelay(i, j);
        this._physicsRig.particles[particleIndex + j].acceleration = json.getParticleAcceleration(i, j);
        this._physicsRig.particles[particleIndex + j].radius = json.getParticleRadius(i, j);
        this._physicsRig.particles[particleIndex + j].position = json.getParticlePosition(i, j);
      }
      particleIndex += this._physicsRig.settings[i].particleCount;
    }
    this.initialize();
    json.release();
    json = void 0;
    json = null;
  }
  /**
   * 現在のパラメータ値で物理演算が安定化する状態を演算する。
   * @param model 物理演算の結果を適用するモデル
   */
  stabilization(model) {
    let totalAngle;
    let weight;
    let radAngle;
    let outputValue;
    const totalTranslation = new CubismVector2();
    let currentSetting;
    let currentInputs;
    let currentOutputs;
    let currentParticles;
    const parameterValues = model.getModel().parameters.values;
    const parameterMaximumValues = model.getModel().parameters.maximumValues;
    const parameterMinimumValues = model.getModel().parameters.minimumValues;
    const parameterDefaultValues = model.getModel().parameters.defaultValues;
    if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }
    if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
    }
    for (let j = 0; j < model.getParameterCount(); ++j) {
      this._parameterCaches[j] = parameterValues[j];
      this._parameterInputCaches[j] = parameterValues[j];
    }
    for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
      totalAngle = { angle: 0 };
      totalTranslation.x = 0;
      totalTranslation.y = 0;
      currentSetting = this._physicsRig.settings[settingIndex];
      currentInputs = this._physicsRig.inputs.slice(
        currentSetting.baseInputIndex
      );
      currentOutputs = this._physicsRig.outputs.slice(
        currentSetting.baseOutputIndex
      );
      currentParticles = this._physicsRig.particles.slice(
        currentSetting.baseParticleIndex
      );
      for (let i = 0; i < currentSetting.inputCount; ++i) {
        weight = currentInputs[i].weight / MaximumWeight;
        if (currentInputs[i].sourceParameterIndex == -1) {
          currentInputs[i].sourceParameterIndex = model.getParameterIndex(
            currentInputs[i].source.id
          );
        }
        currentInputs[i].getNormalizedParameterValue(
          totalTranslation,
          totalAngle,
          parameterValues[currentInputs[i].sourceParameterIndex],
          parameterMinimumValues[currentInputs[i].sourceParameterIndex],
          parameterMaximumValues[currentInputs[i].sourceParameterIndex],
          parameterDefaultValues[currentInputs[i].sourceParameterIndex],
          currentSetting.normalizationPosition,
          currentSetting.normalizationAngle,
          currentInputs[i].reflect,
          weight
        );
        this._parameterCaches[currentInputs[i].sourceParameterIndex] = parameterValues[currentInputs[i].sourceParameterIndex];
      }
      radAngle = CubismMath.degreesToRadian(-totalAngle.angle);
      totalTranslation.x = totalTranslation.x * CubismMath.cos(radAngle) - totalTranslation.y * CubismMath.sin(radAngle);
      totalTranslation.y = totalTranslation.x * CubismMath.sin(radAngle) + totalTranslation.y * CubismMath.cos(radAngle);
      updateParticlesForStabilization(
        currentParticles,
        currentSetting.particleCount,
        totalTranslation,
        totalAngle.angle,
        this._options.wind,
        MovementThreshold * currentSetting.normalizationPosition.maximum
      );
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        const particleIndex = currentOutputs[i].vertexIndex;
        if (currentOutputs[i].destinationParameterIndex == -1) {
          currentOutputs[i].destinationParameterIndex = model.getParameterIndex(
            currentOutputs[i].destination.id
          );
        }
        if (particleIndex < 1 || particleIndex >= currentSetting.particleCount) {
          continue;
        }
        let translation = new CubismVector2();
        translation = currentParticles[particleIndex].position.substract(
          currentParticles[particleIndex - 1].position
        );
        outputValue = currentOutputs[i].getValue(
          translation,
          currentParticles,
          particleIndex,
          currentOutputs[i].reflect,
          this._options.gravity
        );
        this._currentRigOutputs[settingIndex].outputs[i] = outputValue;
        this._previousRigOutputs[settingIndex].outputs[i] = outputValue;
        const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
        const outParameterCaches = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
          JSON.stringify(
            parameterValues.subarray(destinationParameterIndex)
          )
        ) : parameterValues.slice(destinationParameterIndex);
        updateOutputParameterValue(
          outParameterCaches,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          outputValue,
          currentOutputs[i]
        );
        for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
          parameterValues[offset] = this._parameterCaches[offset] = outParameterCaches[outParamIndex];
        }
      }
    }
  }
  /**
   * 物理演算の評価
   *
   * Pendulum interpolation weights
   *
   * 振り子の計算結果は保存され、パラメータへの出力は保存された前回の結果で補間されます。
   * The result of the pendulum calculation is saved and
   * the output to the parameters is interpolated with the saved previous result of the pendulum calculation.
   *
   * 図で示すと[1]と[2]で補間されます。
   * The figure shows the interpolation between [1] and [2].
   *
   * 補間の重みは最新の振り子計算タイミングと次回のタイミングの間で見た現在時間で決定する。
   * The weight of the interpolation are determined by the current time seen between
   * the latest pendulum calculation timing and the next timing.
   *
   * 図で示すと[2]と[4]の間でみた(3)の位置の重みになる。
   * Figure shows the weight of position (3) as seen between [2] and [4].
   *
   * 解釈として振り子計算のタイミングと重み計算のタイミングがズレる。
   * As an interpretation, the pendulum calculation and weights are misaligned.
   *
   * physics3.jsonにFPS情報が存在しない場合は常に前の振り子状態で設定される。
   * If there is no FPS information in physics3.json, it is always set in the previous pendulum state.
   *
   * この仕様は補間範囲を逸脱したことが原因の震えたような見た目を回避を目的にしている。
   * The purpose of this specification is to avoid the quivering appearance caused by deviations from the interpolation range.
   *
   * ------------ time -------------->
   *
   *                 |+++++|------| <- weight
   * ==[1]====#=====[2]---(3)----(4)
   *          ^ output contents
   *
   * 1:_previousRigOutputs
   * 2:_currentRigOutputs
   * 3:_currentRemainTime (now rendering)
   * 4:next particles timing
   * @param model 物理演算の結果を適用するモデル
   * @param deltaTimeSeconds デルタ時間[秒]
   */
  evaluate(model, deltaTimeSeconds) {
    let totalAngle;
    let weight;
    let radAngle;
    let outputValue;
    const totalTranslation = new CubismVector2();
    let currentSetting;
    let currentInputs;
    let currentOutputs;
    let currentParticles;
    if (0 >= deltaTimeSeconds) {
      return;
    }
    const parameterValues = model.getModel().parameters.values;
    const parameterMaximumValues = model.getModel().parameters.maximumValues;
    const parameterMinimumValues = model.getModel().parameters.minimumValues;
    const parameterDefaultValues = model.getModel().parameters.defaultValues;
    let physicsDeltaTime;
    this._currentRemainTime += deltaTimeSeconds;
    if (this._currentRemainTime > MaxDeltaTime) {
      this._currentRemainTime = 0;
    }
    if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }
    if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterInputCaches[j] = parameterValues[j];
      }
    }
    if (this._physicsRig.fps > 0) {
      physicsDeltaTime = 1 / this._physicsRig.fps;
    } else {
      physicsDeltaTime = deltaTimeSeconds;
    }
    while (this._currentRemainTime >= physicsDeltaTime) {
      for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
        currentSetting = this._physicsRig.settings[settingIndex];
        currentOutputs = this._physicsRig.outputs.slice(
          currentSetting.baseOutputIndex
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          this._previousRigOutputs[settingIndex].outputs[i] = this._currentRigOutputs[settingIndex].outputs[i];
        }
      }
      const inputWeight = physicsDeltaTime / this._currentRemainTime;
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterCaches[j] = this._parameterInputCaches[j] * (1 - inputWeight) + parameterValues[j] * inputWeight;
        this._parameterInputCaches[j] = this._parameterCaches[j];
      }
      for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
        totalAngle = { angle: 0 };
        totalTranslation.x = 0;
        totalTranslation.y = 0;
        currentSetting = this._physicsRig.settings[settingIndex];
        currentInputs = this._physicsRig.inputs.slice(
          currentSetting.baseInputIndex
        );
        currentOutputs = this._physicsRig.outputs.slice(
          currentSetting.baseOutputIndex
        );
        currentParticles = this._physicsRig.particles.slice(
          currentSetting.baseParticleIndex
        );
        for (let i = 0; i < currentSetting.inputCount; ++i) {
          weight = currentInputs[i].weight / MaximumWeight;
          if (currentInputs[i].sourceParameterIndex == -1) {
            currentInputs[i].sourceParameterIndex = model.getParameterIndex(
              currentInputs[i].source.id
            );
          }
          currentInputs[i].getNormalizedParameterValue(
            totalTranslation,
            totalAngle,
            this._parameterCaches[currentInputs[i].sourceParameterIndex],
            parameterMinimumValues[currentInputs[i].sourceParameterIndex],
            parameterMaximumValues[currentInputs[i].sourceParameterIndex],
            parameterDefaultValues[currentInputs[i].sourceParameterIndex],
            currentSetting.normalizationPosition,
            currentSetting.normalizationAngle,
            currentInputs[i].reflect,
            weight
          );
        }
        radAngle = CubismMath.degreesToRadian(-totalAngle.angle);
        totalTranslation.x = totalTranslation.x * CubismMath.cos(radAngle) - totalTranslation.y * CubismMath.sin(radAngle);
        totalTranslation.y = totalTranslation.x * CubismMath.sin(radAngle) + totalTranslation.y * CubismMath.cos(radAngle);
        updateParticles(
          currentParticles,
          currentSetting.particleCount,
          totalTranslation,
          totalAngle.angle,
          this._options.wind,
          MovementThreshold * currentSetting.normalizationPosition.maximum,
          physicsDeltaTime,
          AirResistance
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          const particleIndex = currentOutputs[i].vertexIndex;
          if (currentOutputs[i].destinationParameterIndex == -1) {
            currentOutputs[i].destinationParameterIndex = model.getParameterIndex(currentOutputs[i].destination.id);
          }
          if (particleIndex < 1 || particleIndex >= currentSetting.particleCount) {
            continue;
          }
          const translation = new CubismVector2();
          translation.x = currentParticles[particleIndex].position.x - currentParticles[particleIndex - 1].position.x;
          translation.y = currentParticles[particleIndex].position.y - currentParticles[particleIndex - 1].position.y;
          outputValue = currentOutputs[i].getValue(
            translation,
            currentParticles,
            particleIndex,
            currentOutputs[i].reflect,
            this._options.gravity
          );
          this._currentRigOutputs[settingIndex].outputs[i] = outputValue;
          const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
          const outParameterCaches = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
            JSON.stringify(
              this._parameterCaches.subarray(destinationParameterIndex)
            )
          ) : this._parameterCaches.slice(destinationParameterIndex);
          updateOutputParameterValue(
            outParameterCaches,
            parameterMinimumValues[destinationParameterIndex],
            parameterMaximumValues[destinationParameterIndex],
            outputValue,
            currentOutputs[i]
          );
          for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
            this._parameterCaches[offset] = outParameterCaches[outParamIndex];
          }
        }
      }
      this._currentRemainTime -= physicsDeltaTime;
    }
    const alpha = this._currentRemainTime / physicsDeltaTime;
    this.interpolate(model, alpha);
  }
  /**
   * 物理演算結果の適用
   * 振り子演算の最新の結果と一つ前の結果から指定した重みで適用する。
   * @param model 物理演算の結果を適用するモデル
   * @param weight 最新結果の重み
   */
  interpolate(model, weight) {
    let currentOutputs;
    let currentSetting;
    const parameterValues = model.getModel().parameters.values;
    const parameterMaximumValues = model.getModel().parameters.maximumValues;
    const parameterMinimumValues = model.getModel().parameters.minimumValues;
    for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
      currentSetting = this._physicsRig.settings[settingIndex];
      currentOutputs = this._physicsRig.outputs.slice(
        currentSetting.baseOutputIndex
      );
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        if (currentOutputs[i].destinationParameterIndex == -1) {
          continue;
        }
        const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
        const outParameterValues = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
          JSON.stringify(
            parameterValues.subarray(destinationParameterIndex)
          )
        ) : parameterValues.slice(destinationParameterIndex);
        updateOutputParameterValue(
          outParameterValues,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          this._previousRigOutputs[settingIndex].outputs[i] * (1 - weight) + this._currentRigOutputs[settingIndex].outputs[i] * weight,
          currentOutputs[i]
        );
        for (let offset = destinationParameterIndex, outParamIndex = 0; offset < parameterValues.length; offset++, outParamIndex++) {
          parameterValues[offset] = outParameterValues[outParamIndex];
        }
      }
    }
  }
  /**
   * オプションの設定
   * @param options オプション
   */
  setOptions(options) {
    this._options = options;
  }
  /**
   * オプションの取得
   * @return オプション
   */
  getOption() {
    return this._options;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._physicsRig = null;
    this._options = new Options();
    this._options.gravity.y = -1;
    this._options.gravity.x = 0;
    this._options.wind.x = 0;
    this._options.wind.y = 0;
    this._currentRigOutputs = new Array();
    this._previousRigOutputs = new Array();
    this._currentRemainTime = 0;
    this._parameterCaches = null;
    this._parameterInputCaches = null;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._physicsRig = void 0;
    this._physicsRig = null;
  }
  /**
   * 初期化する
   */
  initialize() {
    let strand;
    let currentSetting;
    let radius;
    for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
      currentSetting = this._physicsRig.settings[settingIndex];
      strand = this._physicsRig.particles.slice(
        currentSetting.baseParticleIndex
      );
      strand[0].initialPosition = new CubismVector2(0, 0);
      strand[0].lastPosition = new CubismVector2(
        strand[0].initialPosition.x,
        strand[0].initialPosition.y
      );
      strand[0].lastGravity = new CubismVector2(0, -1);
      strand[0].lastGravity.y *= -1;
      strand[0].velocity = new CubismVector2(0, 0);
      strand[0].force = new CubismVector2(0, 0);
      for (let i = 1; i < currentSetting.particleCount; ++i) {
        radius = new CubismVector2(0, 0);
        radius.y = strand[i].radius;
        strand[i].initialPosition = new CubismVector2(
          strand[i - 1].initialPosition.x + radius.x,
          strand[i - 1].initialPosition.y + radius.y
        );
        strand[i].position = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastPosition = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastGravity = new CubismVector2(0, -1);
        strand[i].lastGravity.y *= -1;
        strand[i].velocity = new CubismVector2(0, 0);
        strand[i].force = new CubismVector2(0, 0);
      }
    }
  }
  _physicsRig;
  // 物理演算のデータ
  _options;
  // オプション
  _currentRigOutputs;
  ///< 最新の振り子計算の結果
  _previousRigOutputs;
  ///< 一つ前の振り子計算の結果
  _currentRemainTime;
  ///< 物理演算が処理していない時間
  _parameterCaches;
  ///< Evaluateで利用するパラメータのキャッシュ
  _parameterInputCaches;
  ///< UpdateParticlesが動くときの入力をキャッシュ
};
var Options = class {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }
  gravity;
  // 重力方向
  wind;
  // 風の方向
};
var PhysicsOutput = class {
  constructor() {
    this.outputs = new Array(0);
  }
  outputs;
  // 物理演算出力結果
};
function sign(value) {
  let ret = 0;
  if (value > 0) {
    ret = 1;
  } else if (value < 0) {
    ret = -1;
  }
  return ret;
}
function getInputTranslationXFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
  targetTranslation.x += normalizeParameterValue(
    value,
    parameterMinimumValue,
    parameterMaximumValue,
    parameterDefaultValue,
    normalizationPosition.minimum,
    normalizationPosition.maximum,
    normalizationPosition.defalut,
    isInverted
  ) * weight;
}
function getInputTranslationYFromNormalizedParamterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
  targetTranslation.y += normalizeParameterValue(
    value,
    parameterMinimumValue,
    parameterMaximumValue,
    parameterDefaultValue,
    normalizationPosition.minimum,
    normalizationPosition.maximum,
    normalizationPosition.defalut,
    isInverted
  ) * weight;
}
function getInputAngleFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizaitionPosition, normalizationAngle, isInverted, weight) {
  targetAngle.angle += normalizeParameterValue(
    value,
    parameterMinimumValue,
    parameterMaximumValue,
    parameterDefaultValue,
    normalizationAngle.minimum,
    normalizationAngle.maximum,
    normalizationAngle.defalut,
    isInverted
  ) * weight;
}
function getOutputTranslationX(translation, particles, particleIndex, isInverted, parentGravity) {
  let outputValue = translation.x;
  if (isInverted) {
    outputValue *= -1;
  }
  return outputValue;
}
function getOutputTranslationY(translation, particles, particleIndex, isInverted, parentGravity) {
  let outputValue = translation.y;
  if (isInverted) {
    outputValue *= -1;
  }
  return outputValue;
}
function getOutputAngle(translation, particles, particleIndex, isInverted, parentGravity) {
  let outputValue;
  if (particleIndex >= 2) {
    parentGravity = particles[particleIndex - 1].position.substract(
      particles[particleIndex - 2].position
    );
  } else {
    parentGravity = parentGravity.multiplyByScaler(-1);
  }
  outputValue = CubismMath.directionToRadian(parentGravity, translation);
  if (isInverted) {
    outputValue *= -1;
  }
  return outputValue;
}
function getRangeValue(min, max) {
  const maxValue = CubismMath.max(min, max);
  const minValue = CubismMath.min(min, max);
  return CubismMath.abs(maxValue - minValue);
}
function getDefaultValue(min, max) {
  const minValue = CubismMath.min(min, max);
  return minValue + getRangeValue(min, max) / 2;
}
function getOutputScaleTranslationX(translationScale, angleScale) {
  return JSON.parse(JSON.stringify(translationScale.x));
}
function getOutputScaleTranslationY(translationScale, angleScale) {
  return JSON.parse(JSON.stringify(translationScale.y));
}
function getOutputScaleAngle(translationScale, angleScale) {
  return JSON.parse(JSON.stringify(angleScale));
}
function updateParticles(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue, deltaTimeSeconds, airResistance) {
  let delay;
  let radian;
  let direction = new CubismVector2(0, 0);
  let velocity = new CubismVector2(0, 0);
  let force = new CubismVector2(0, 0);
  let newDirection = new CubismVector2(0, 0);
  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );
  const totalRadian = CubismMath.degreesToRadian(totalAngle);
  const currentGravity = CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();
  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity.multiplyByScaler(strand[i].acceleration).add(windDirection);
    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );
    delay = strand[i].delay * deltaTimeSeconds * 30;
    direction = strand[i].position.substract(strand[i - 1].position);
    radian = CubismMath.directionToRadian(strand[i].lastGravity, currentGravity) / airResistance;
    direction.x = CubismMath.cos(radian) * direction.x - direction.y * CubismMath.sin(radian);
    direction.y = CubismMath.sin(radian) * direction.x + direction.y * CubismMath.cos(radian);
    strand[i].position = strand[i - 1].position.add(direction);
    velocity = strand[i].velocity.multiplyByScaler(delay);
    force = strand[i].force.multiplyByScaler(delay).multiplyByScaler(delay);
    strand[i].position = strand[i].position.add(velocity).add(force);
    newDirection = strand[i].position.substract(strand[i - 1].position);
    newDirection.normalize();
    strand[i].position = strand[i - 1].position.add(
      newDirection.multiplyByScaler(strand[i].radius)
    );
    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0;
    }
    if (delay != 0) {
      strand[i].velocity = strand[i].position.substract(strand[i].lastPosition);
      strand[i].velocity = strand[i].velocity.divisionByScalar(delay);
      strand[i].velocity = strand[i].velocity.multiplyByScaler(
        strand[i].mobility
      );
    }
    strand[i].force = new CubismVector2(0, 0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}
function updateParticlesForStabilization(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue) {
  let force = new CubismVector2(0, 0);
  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );
  const totalRadian = CubismMath.degreesToRadian(totalAngle);
  const currentGravity = CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();
  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity.multiplyByScaler(strand[i].acceleration).add(windDirection);
    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );
    strand[i].velocity = new CubismVector2(0, 0);
    force = strand[i].force;
    force.normalize();
    force = force.multiplyByScaler(strand[i].radius);
    strand[i].position = strand[i - 1].position.add(force);
    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0;
    }
    strand[i].force = new CubismVector2(0, 0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}
function updateOutputParameterValue(parameterValue, parameterValueMinimum, parameterValueMaximum, translation, output) {
  let value;
  const outputScale = output.getScale(
    output.translationScale,
    output.angleScale
  );
  value = translation * outputScale;
  if (value < parameterValueMinimum) {
    if (value < output.valueBelowMinimum) {
      output.valueBelowMinimum = value;
    }
    value = parameterValueMinimum;
  } else if (value > parameterValueMaximum) {
    if (value > output.valueExceededMaximum) {
      output.valueExceededMaximum = value;
    }
    value = parameterValueMaximum;
  }
  const weight = output.weight / MaximumWeight;
  if (weight >= 1) {
    parameterValue[0] = value;
  } else {
    value = parameterValue[0] * (1 - weight) + value * weight;
    parameterValue[0] = value;
  }
}
function normalizeParameterValue(value, parameterMinimum, parameterMaximum, parameterDefault, normalizedMinimum, normalizedMaximum, normalizedDefault, isInverted) {
  let result = 0;
  const maxValue = CubismMath.max(parameterMaximum, parameterMinimum);
  if (maxValue < value) {
    value = maxValue;
  }
  const minValue = CubismMath.min(parameterMaximum, parameterMinimum);
  if (minValue > value) {
    value = minValue;
  }
  const minNormValue = CubismMath.min(
    normalizedMinimum,
    normalizedMaximum
  );
  const maxNormValue = CubismMath.max(
    normalizedMinimum,
    normalizedMaximum
  );
  const middleNormValue = normalizedDefault;
  const middleValue = getDefaultValue(minValue, maxValue);
  const paramValue = value - middleValue;
  switch (sign(paramValue)) {
    case 1: {
      const nLength = maxNormValue - middleNormValue;
      const pLength = maxValue - middleValue;
      if (pLength != 0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }
      break;
    }
    case -1: {
      const nLength = minNormValue - middleNormValue;
      const pLength = minValue - middleValue;
      if (pLength != 0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }
      break;
    }
    case 0: {
      result = middleNormValue;
      break;
    }
    default: {
      break;
    }
  }
  return isInverted ? result : result * -1;
}
var Live2DCubismFramework18;
((Live2DCubismFramework19) => {
  Live2DCubismFramework19.CubismPhysics = CubismPhysics;
  Live2DCubismFramework19.Options = Options;
})(Live2DCubismFramework18 || (Live2DCubismFramework18 = {}));

// src/avatar-renderer.ts
var frameworkReady = false;
var viewSequence = 0;
var loadingModels = Promise.resolve();
var SHADERS = "/vendor/shaders/WebGL/";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function bytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`\u89D2\u8272\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25 (${r.status})`);
  return r.arrayBuffer();
}
var CharacterView = class {
  canvas;
  gl;
  moc;
  model;
  renderer;
  physics;
  textures = [];
  parameters = /* @__PURE__ */ new Map();
  defaults = [];
  state = "idle";
  time = 0;
  stateTime = 0;
  last = 0;
  frame = 0;
  paused = false;
  suspended = false;
  disposed = false;
  ready = false;
  framing = "full";
  pointer = { x: 0, y: 0 };
  pose = { x: 0, y: 0 };
  smooth = { x: 0, y: 0, z: 0, brow: 0, mouth: 0, open: 0, eye: 1, gazeX: 0, gazeY: 0 };
  nextBlink = 3.4;
  blinkAt = -10;
  eyesClosed = false;
  bounds = [];
  observer;
  // Live2D playback is explicitly controlled by the page's pause buttons.
  // A system UI-transition preference must not silently freeze this animation.
  reduce = false;
  onReady;
  onError;
  metadata;
  modelUrl;
  motion;
  rig = {};
  originalKit = false;
  expressionKit = false;
  driver;
  expressionState = "idle";
  pendingExpression = null;
  expressionSwitchAt = 0;
  constructor(canvas, options = {}) {
    canvas.dataset.viewInstance = String(++viewSequence);
    this.canvas = canvas;
    this.onReady = options.onReady || (() => {
    });
    this.onError = options.onError || (() => {
    });
    this.framing = options.framing || "full";
    this.modelUrl = options.modelUrl || "/models/agentkit-expressions-r3/deepseek/deepseek-expressions.model3.json";
    this.motion = options.motion || { sway: 1, joy: 1 };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener("pointermove", this.follow);
    canvas.addEventListener("pointerleave", this.leave);
    canvas.addEventListener("webglcontextlost", this.contextLost);
  }
  follow = (e) => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = { x: (e.clientX - r.left) / r.width * 2 - 1, y: 1 - (e.clientY - r.top) / r.height * 2 };
  };
  leave = () => {
    this.pointer = { x: 0, y: 0 };
  };
  contextLost = (e) => {
    e.preventDefault();
    this.fail(new Error("\u89D2\u8272\u663E\u793A\u6682\u65F6\u4E2D\u65AD\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u91CD\u65B0\u52A0\u8F7D\u3002"));
  };
  async load() {
    const pending = loadingModels.then(() => this.disposed ? this : this.loadNow());
    loadingModels = pending.catch(() => {
    });
    return pending;
  }
  async loadNow() {
    try {
      if (!globalThis.Live2DCubismCore) throw new Error("\u5C1A\u672A\u5B89\u88C5 Cubism Core\uFF0C\u8BF7\u6309 README \u7684 Live2D \u6B65\u9AA4\u5B89\u88C5\u3002");
      if (!frameworkReady) {
        CubismFramework.startUp();
        CubismFramework.initialize(CORE_MEMORY_BYTES);
        frameworkReady = true;
      }
      const response = await fetch(this.modelUrl);
      if (!response.ok) throw new Error("\u627E\u4E0D\u5230\u89D2\u8272\u6A21\u578B\u3002");
      const settings = await response.json(), base2 = new URL(this.modelUrl, location.href);
      if (this.disposed) return this;
      this.rig = settings.AvatarRig || {};
      this.gl = this.canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
      if (!this.gl) throw new Error("\u6D4F\u89C8\u5668\u672A\u542F\u7528 WebGL\uFF0C\u6682\u65F6\u65E0\u6CD5\u663E\u793A\u53EF\u52A8\u89D2\u8272\u3002");
      const refs = settings.FileReferences;
      const mocBytes = await bytes(new URL(refs.Moc, base2).href);
      if (this.disposed) return this;
      this.moc = CubismMoc.create(mocBytes, true);
      if (!this.moc) throw new Error("\u6A21\u578B\u5B8C\u6574\u6027\u68C0\u67E5\u672A\u901A\u8FC7\u3002");
      this.model = this.moc.createModel();
      if (!this.model) throw new Error("\u6A21\u578B\u52A0\u8F7D\u5931\u8D25\u3002");
      for (let i = 0; i < this.model.getParameterCount(); i++) {
        this.parameters.set(this.model.getParameterId(i).getString(), i);
        this.defaults.push(this.model.getParameterDefaultValue(i));
      }
      this.expressionKit = this.modelUrl.startsWith("/models/agentkit-expressions-r3/");
      this.originalKit = this.expressionKit || this.modelUrl.startsWith("/models/agentkit-original-hd/");
      if (!["ParamAngleX", "ParamAngleY", "ParamBreath"].every((id) => this.parameters.has(id)) || !["ParamPaintedEyes", "ParamPaintedHead"].some((id) => this.parameters.has(id))) throw new Error("\u6A21\u578B\u52A8\u4F5C\u53C2\u6570\u4E0D\u5B8C\u6574\u3002");
      if (this.originalKit) this.driver = new (this.expressionKit ? ExpressionAgentKitDriver : OriginalAgentKitDriver)(this.modelUrl.split("/").at(-2));
      this.model.update();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < this.model.getDrawableCount(); i++) {
        const v = this.model.getDrawableVertices(i);
        for (let j = 0; j < v.length; j += 2) {
          minX = Math.min(minX, v[j]);
          maxX = Math.max(maxX, v[j]);
          minY = Math.min(minY, v[j + 1]);
          maxY = Math.max(maxY, v[j + 1]);
        }
      }
      this.bounds = [minX, minY, maxX, maxY];
      this.renderer = new CubismRenderer_WebGL();
      this.renderer.initialize(this.model);
      this.renderer.setIsPremultipliedAlpha(true);
      if (this.originalKit) this.renderer.setClippingMaskBufferSize(1024);
      this.renderer.startUp(this.gl);
      await Promise.all(refs.Textures.map(async (file, i) => {
        const img = new Image();
        img.src = new URL(file, base2).href;
        await img.decode();
        if (this.disposed) return;
        const gl = this.gl, texture = gl.createTexture();
        this.textures.push(texture);
        if (img.width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || img.height > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error("\u6B64\u8BBE\u5907\u4E0D\u652F\u6301\u9AD8\u6E05\u89D2\u8272\u56FE\u96C6\u3002");
        this.canvas.dataset.textureSize = String(img.width);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.renderer.bindTexture(i, texture);
        img.src = "";
      }));
      if (this.disposed) return this;
      if (refs.Physics) {
        const buffer = await bytes(new URL(refs.Physics, base2).href);
        if (this.disposed) return this;
        this.physics = CubismPhysics.create(buffer, buffer.byteLength);
      }
      this.renderer.loadShaders(SHADERS);
      const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl);
      for (let i = 0; i < 150 && !shader._isShaderLoaded && !this.disposed; i++) await sleep(50);
      if (this.disposed) return this;
      if (!shader._isShaderLoaded) throw new Error("\u89D2\u8272\u7740\u8272\u5668\u52A0\u8F7D\u5931\u8D25\u3002");
      this.metadata = { drawables: this.model.getDrawableCount(), parameters: this.model.getParameterCount(), mocVersion: this.moc.getMocVersion() };
      this.canvas.dataset.modelUrl = this.modelUrl;
      this.canvas.dataset.rig = this.expressionKit ? "agentkit-expressions-r3" : this.originalKit ? "agentkit-original-hd" : "legacy";
      this.ready = true;
      this.canvas.dataset.loaded = "true";
      this.canvas.dataset.parameters = String(this.metadata.parameters);
      this.resize();
      this.render(0);
      this.onReady(this.metadata);
      if (!this.suspended) this.frame = requestAnimationFrame(this.tick);
      return this;
    } catch (e) {
      if (!this.disposed) this.fail(e);
      return this;
    }
  }
  fail(e) {
    this.paused = true;
    cancelAnimationFrame(this.frame);
    this.canvas.dataset.loaded = "error";
    this.onError(e instanceof Error ? e : new Error(String(e)));
  }
  resize() {
    if (!this.gl) return;
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    if (this.model) this.render(0);
  }
  setState(state) {
    this.canvas.dataset.state = state;
    if (this.state === state) return;
    this.stateTime = 0;
    this.state = state;
    if (this.expressionKit && this.ready && !this.paused) {
      this.pendingExpression = state;
      this.expressionSwitchAt = this.time + 0.14;
      this.blink();
    } else {
      this.expressionState = state;
      this.pendingExpression = null;
    }
    if (this.paused) this.render(0);
  }
  setFraming(framing) {
    this.framing = framing;
    this.render(0);
  }
  setPose(x, y) {
    this.pose = { x, y };
    if (this.paused) this.render(0);
  }
  blink() {
    this.blinkAt = this.time;
    this.nextBlink = this.time + 3.8;
  }
  setEyesClosed(closed) {
    this.eyesClosed = closed;
    if (this.paused) this.render(0);
  }
  setPaused(paused) {
    this.paused = paused;
    this.last = 0;
    if (paused && this.pendingExpression) {
      this.expressionState = this.pendingExpression;
      this.pendingExpression = null;
      this.render(0);
    }
  }
  setSuspended(value) {
    if (this.suspended === value || this.disposed) return;
    this.suspended = value;
    this.last = 0;
    cancelAnimationFrame(this.frame);
    if (!value && this.ready) {
      this.resize();
      this.frame = requestAnimationFrame(this.tick);
    }
  }
  set(name, value) {
    const i = this.parameters.get(name);
    if (i !== void 0) this.model.setParameterValueByIndex(i, value);
  }
  tick = (now) => {
    if (this.disposed || this.suspended) return;
    this.frame = requestAnimationFrame(this.tick);
    if (this.paused || document.hidden || this.canvas.getBoundingClientRect().width < 1) {
      this.last = 0;
      return;
    }
    if (this.last && now - this.last < 32) return;
    const dt = this.last ? Math.min((now - this.last) / 1e3, 0.07) : 0;
    this.last = now;
    try {
      this.render(dt);
    } catch (e) {
      this.fail(e);
    }
  };
  render(dt) {
    if (!this.ready || !this.model || !this.renderer || !this.canvas.width || !this.bounds.length) return;
    if (this.originalKit) {
      this.renderOriginalKit(dt);
      return;
    }
    this.time += dt;
    this.stateTime += dt;
    const t = this.time, s = this.stateTime, amp = this.reduce ? 0 : this.motion.sway || 1;
    let x = this.pointer.x * 14 + this.pose.x, y = this.pointer.y * 6 + this.pose.y, z = Math.sin(t * 0.9) * 3 * amp, brow = 0, mouth = 0.12, open = 0.03, eye = 1;
    let gazeX = this.pointer.x * 0.5, gazeY = this.pointer.y * 0.3;
    if (this.state === "thinking") {
      x = this.pose.x + Math.sin(t * 0.65) * 1.5 * amp;
      y = this.pose.y - 3.5;
      z = -1.5 + Math.sin(t * 0.65) * 1.2 * amp;
      brow = 0;
      mouth = 0;
      open = 0;
      eye = 0;
      gazeX = 0;
      gazeY = 0;
    }
    if (this.state === "happy") {
      const joy = this.reduce ? 0 : this.motion.joy || 1;
      y += Math.sin(s * 4.5) * 6 * joy;
      z += 5 + Math.sin(s * 2.3) * 5 * joy;
      brow = 0.8;
      mouth = 1;
      open = 0.9 + Math.sin(s * 3) * 0.1 * amp;
      eye = 0;
    }
    if (this.state === "drawing") {
      x = this.pose.x + Math.sin(s * 2.4) * 3 * amp;
      y = this.pose.y - 6;
      z = -5 + Math.sin(s * 3.3) * 2.5 * amp;
      gazeX = Math.sin(s * 2.4) * 0.2;
      gazeY = -0.7;
      mouth = 0.3;
      open = 0;
    }
    if (this.state === "confident") {
      x = this.pose.x + 5;
      y = this.pose.y + 5;
      z = 7 + Math.sin(s * 1.6) * 2 * amp;
      gazeX = 0.2;
      gazeY = 0.25;
      brow = 0.65;
      mouth = 0.8;
      open = 0;
    }
    if (this.state === "sad") {
      x = this.pose.x;
      y = this.pose.y + Math.sin(s * 9) * Math.exp(-s * 3) * 4 * amp;
      z = Math.sin(t * 0.8) * 1.2 * amp;
      brow = 0;
      mouth = 0;
      open = 0;
      eye = 1;
      gazeX = 0;
      gazeY = 0;
    }
    x = Math.max(-22, Math.min(22, x));
    y = Math.max(-7, Math.min(7, y));
    const mix = dt > 0 ? 1 - Math.exp(-dt * 5) : 1;
    const targets = { x, y, z, brow, mouth, open, eye, gazeX, gazeY };
    for (const key of Object.keys(targets)) this.smooth[key] += (targets[key] - this.smooth[key]) * mix;
    this.defaults.forEach((v, i) => this.model.setParameterValueByIndex(i, v));
    this.set("ParamAngleX", this.smooth.x);
    this.set("ParamAngleY", this.smooth.y);
    this.set("ParamAngleZ", this.smooth.z);
    this.set("ParamBodyAngleX", this.smooth.x * 0.25);
    this.set("ParamBodyAngleZ", this.smooth.z * 0.22 + Math.sin(t * 0.9) * 1.4 * amp);
    this.set("ParamBreath", 0.5 + Math.sin(t * 1.7) * 0.48 * amp);
    this.set("ParamDrawingBody", this.state === "drawing" ? 1 : 0);
    this.set("ParamEyeBallX", this.smooth.gazeX);
    this.set("ParamEyeBallY", this.smooth.gazeY);
    this.set("ParamBrowLY", this.smooth.brow);
    this.set("ParamBrowRY", this.smooth.brow);
    this.set("ParamMouthForm", this.smooth.mouth);
    this.set("ParamMouthOpenY", this.smooth.open);
    if (t > this.nextBlink && !this.reduce) this.blink();
    const blink = t - this.blinkAt;
    const wholeHead = this.parameters.has("ParamPaintedHead");
    const painted = wholeHead || this.parameters.has("ParamPaintedEyes");
    if (wholeHead) {
      const expression = this.state === "thinking" ? 1 : this.state === "happy" ? 2 : this.state === "closed" ? 3 : this.state === "sad" ? 4 : this.state === "confident" ? 5 : 0;
      const blinkClosed = expression === 0 && blink >= 0.025 && blink < 0.175;
      this.set("ParamPaintedHead", this.eyesClosed || blinkClosed ? 3 : expression);
      this.canvas.dataset.expressionArtwork = this.eyesClosed ? "closed" : this.state;
    } else if (painted) {
      const confident = this.state === "confident";
      const hasConfident = this.model.getParameterMaximumValue(this.parameters.get("ParamPaintedEyes")) >= 5;
      const expression = this.state === "thinking" ? 1 : this.state === "happy" ? 2 : this.state === "closed" ? 3 : this.state === "sad" ? 4 : confident ? hasConfident ? 5 : 2 : 0;
      const blinkClosed = blink >= 0.025 && blink < 0.175;
      const eyes = this.eyesClosed ? 3 : confident && this.rig.independentGaze ? blinkClosed ? 3 : 0 : confident ? 2 : expression !== 0 ? expression : blinkClosed ? 3 : expression;
      this.set("ParamPaintedEyes", eyes);
      this.set("ParamPaintedFace", this.eyesClosed ? 3 : confident && !hasConfident ? 0 : expression);
      this.canvas.dataset.expressionArtwork = this.eyesClosed ? "closed" : this.state;
    }
    const lid = painted ? 1 : this.eyesClosed ? 0 : this.smooth.eye * (blink >= 0 && blink < 0.23 ? 1 - Math.sin(blink / 0.23 * Math.PI) : 1);
    this.set("ParamEyeLOpen", lid);
    this.set("ParamEyeROpen", lid);
    if (dt > 0 && !this.reduce) this.physics?.evaluate(this.model, dt);
    this.model.update();
    this.draw();
  }
  renderOriginalKit(dt) {
    this.time += dt;
    this.stateTime += dt;
    if (this.time > this.nextBlink && !this.reduce) this.blink();
    if (this.pendingExpression && this.time >= this.expressionSwitchAt) {
      this.expressionState = this.pendingExpression;
      this.pendingExpression = null;
    }
    const p = this.driver.frame({ state: this.expressionKit ? this.expressionState : this.state, time: this.time, since: this.stateTime, blinkAt: this.blinkAt, x: this.pointer.x, y: this.pointer.y, headX: this.pose.x, headY: this.pose.y, eyesClosed: this.eyesClosed, reduce: this.reduce }, dt);
    this.defaults.forEach((v, i) => this.model.setParameterValueByIndex(i, v));
    for (const [id, value] of Object.entries(p)) this.set(id, value);
    if (dt > 0 && !this.reduce) this.physics?.evaluate(this.model, dt);
    for (const [id, value] of Object.entries(p)) this.set(id, value);
    this.canvas.dataset.expressionArtwork = this.expressionKit ? this.expressionState : this.eyesClosed ? "closed" : this.state;
    this.canvas.dataset.expressionIndex = String(p.ParamPaintedEyes);
    this.canvas.dataset.drawingBody = String(p.ParamDrawingBody);
    this.canvas.dataset.animationTime = this.time.toFixed(3);
    this.canvas.dataset.breath = this.model.getParameterValueByIndex(this.parameters.get("ParamBreath")).toFixed(3);
    this.model.update();
    this.draw();
  }
  draw() {
    const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    let [x0, y0, x1, y1] = this.bounds;
    if (this.originalKit) {
      const info = this.model.getModel().canvasinfo, ppu = info.PixelsPerUnit;
      const r = (this.expressionKit ? expressionRegion : sourceRegion)(this.modelUrl.split("/").at(-2), this.framing);
      x0 = (r.x - info.CanvasOriginX) / ppu;
      x1 = (r.x + r.w - info.CanvasOriginX) / ppu;
      y0 = (info.CanvasOriginY - r.y - r.h) / ppu;
      y1 = (info.CanvasOriginY - r.y) / ppu;
    } else if (this.framing === "face") {
      const cx = (x0 + x1) / 2, half = (x1 - x0) * 0.23;
      y0 = y1 - (y1 - y0) * 0.33;
      x0 = cx - half;
      x1 = cx + half;
    } else if (this.framing === "portrait") {
      const cx = (x0 + x1) / 2, half = (x1 - x0) * 0.36;
      y0 = y1 - (y1 - y0) * 0.58;
      x0 = cx - half;
      x1 = cx + half;
    }
    const scale = Math.min(w / (x1 - x0), h / (y1 - y0)) * (this.originalKit ? 0.94 : 0.9);
    const matrix = new CubismMatrix44(), m = matrix.getArray();
    m[0] = 2 * scale / w;
    m[5] = 2 * scale / h;
    m[12] = -(x0 + x1) * scale / w;
    m[13] = -(y0 + y1) * scale / h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.renderer.setMvpMatrix(matrix);
    this.renderer.setRenderState(null, [0, 0, w, h]);
    this.renderer.drawModel(SHADERS);
  }
  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener("pointermove", this.follow);
    this.canvas.removeEventListener("pointerleave", this.leave);
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.renderer?.release();
    this.textures.forEach((t) => this.gl.deleteTexture(t));
    if (this.model) this.moc?.deleteModel(this.model);
    this.moc?.release();
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
};
export {
  CharacterView
};
