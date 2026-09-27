/* Document corner detection worker (classic worker, no modules).
 *
 * Loaded lazily by the app when the scanner opens:
 *   new Worker(`${import.meta.env.BASE_URL}cv/detect-worker.js`)
 * It pulls in OpenCV.js (public/cv/opencv.js, copied by scripts/copy-opencv.mjs).
 * Both files are cached at runtime by the service worker (not precached).
 *
 * Protocol
 *   out: { type: 'ready' }                                  once OpenCV is initialised
 *   out: { type: 'error', id: null, message: 'load-failed' } if opencv.js cannot load
 *   in:  { id, type: 'detect', data: ArrayBuffer (RGBA), width, height }
 *   out: { id, type: 'result', quad: [{x,y} x4] | null, confidence, ms }
 *        quad is normalised 0..1 and ordered TL, TR, BR, BL.
 *   out: { id, type: 'error', message }
 */
'use strict';

var ready = false;
var loadFailed = false;
var queue = [];

// Longest side used for detection. Results are normalised, so downscaling
// is invisible to the caller and keeps the live preview fast.
var MAX_SIDE = 512;
var MIN_AREA_RATIO = 0.15;
var MAX_AREA_RATIO = 0.97;
var TOP_CONTOURS = 10;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function onReady() {
  if (ready) return;
  ready = true;
  self.postMessage({ type: 'ready' });
  var pending = queue;
  queue = [];
  for (var i = 0; i < pending.length; i++) handle(pending[i]);
}

function onLoadFailed(message) {
  loadFailed = true;
  self.postMessage({ type: 'error', id: null, message: message || 'load-failed' });
  var pending = queue;
  queue = [];
  for (var i = 0; i < pending.length; i++) {
    if (pending[i] && pending[i].id != null) {
      self.postMessage({ id: pending[i].id, type: 'error', message: 'load-failed' });
    }
  }
}

function hasMat(c) {
  return !!(c && typeof c.Mat === 'function');
}

function waitForCv() {
  var c = self.cv;
  if (hasMat(c)) {
    onReady();
    return;
  }
  if (c && typeof c.then === 'function') {
    // Emscripten MODULARIZE build: cv is a promise of the module.
    c.then(function (mod) {
      if (mod && mod !== c) {
        // Avoid an endless thenable chain if the module itself has .then.
        try { delete mod.then; } catch (e) { /* ignore */ }
        self.cv = mod;
      }
      pollForMat(0);
    }, function () {
      onLoadFailed('load-failed');
    });
    return;
  }
  if (c) {
    c.onRuntimeInitialized = function () { pollForMat(0); };
    // In case the runtime finished between importScripts and this assignment.
    pollForMat(0);
    return;
  }
  onLoadFailed('load-failed');
}

function pollForMat(tries) {
  if (ready) return;
  if (hasMat(self.cv)) {
    onReady();
    return;
  }
  if (tries > 600) { // ~30 s
    onLoadFailed('load-failed');
    return;
  }
  setTimeout(function () { pollForMat(tries + 1); }, 50);
}

self.onmessage = function (e) {
  var msg = e.data;
  if (!msg || msg.type !== 'detect') return;
  if (loadFailed) {
    self.postMessage({ id: msg.id, type: 'error', message: 'load-failed' });
    return;
  }
  if (!ready) {
    queue.push(msg);
    return;
  }
  handle(msg);
};

function handle(msg) {
  var t0 = now();
  try {
    var res = detect(msg.data, msg.width | 0, msg.height | 0);
    self.postMessage({
      id: msg.id,
      type: 'result',
      quad: res ? res.quad : null,
      confidence: res ? res.confidence : 0,
      ms: Math.round((now() - t0) * 10) / 10,
    });
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    if (typeof err === 'number' && self.cv && typeof self.cv.exceptionFromPtr === 'function') {
      try { message = self.cv.exceptionFromPtr(err).msg; } catch (e2) { /* ignore */ }
    }
    self.postMessage({ id: msg.id, type: 'error', message: message });
  }
}

/* Order 4 points TL, TR, BR, BL using sum/diff. */
function orderQuad(pts) {
  var tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0];
  for (var i = 1; i < pts.length; i++) {
    var p = pts[i];
    if (p.x + p.y < tl.x + tl.y) tl = p;
    if (p.x + p.y > br.x + br.y) br = p;
    if (p.y - p.x < tr.y - tr.x) tr = p;
    if (p.y - p.x > bl.y - bl.x) bl = p;
  }
  return [tl, tr, br, bl];
}

/* Find the largest valid quadrilateral in a binary mask. Does not delete mask. */
function bestQuadIn(cv, mask, imgArea) {
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();
  var best = null;
  try {
    cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    var n = contours.size();
    var list = [];
    for (var i = 0; i < n; i++) {
      var c = contours.get(i);
      var a = cv.contourArea(c);
      c.delete();
      if (a >= imgArea * MIN_AREA_RATIO) list.push({ i: i, a: a });
    }
    list.sort(function (p, q) { return q.a - p.a; });
    var lim = Math.min(list.length, TOP_CONTOURS);
    for (var k = 0; k < lim; k++) {
      var cnt = contours.get(list[k].i);
      var approx = new cv.Mat();
      try {
        var peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          var area = cv.contourArea(approx);
          var ratio = area / imgArea;
          if (ratio >= MIN_AREA_RATIO && ratio <= MAX_AREA_RATIO && (!best || area > best.area)) {
            var d = approx.data32S;
            best = {
              area: area,
              pts: [
                { x: d[0], y: d[1] }, { x: d[2], y: d[3] },
                { x: d[4], y: d[5] }, { x: d[6], y: d[7] },
              ],
            };
          }
        }
      } finally {
        approx.delete();
        cnt.delete();
      }
      // Contours are sorted by area; the first valid one is the largest.
      if (best) break;
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
  return best;
}

/* Clear a thin frame at the image edge so a page that touches (or nearly
 * touches) the border still yields a closed contour separate from the frame. */
function clearBorder(cv, mask, t) {
  var black = new cv.Scalar(0);
  cv.rectangle(mask, new cv.Point(0, 0), new cv.Point(mask.cols - 1, mask.rows - 1), black, t);
}

function detect(buffer, width, height) {
  var cv = self.cv;
  if (!buffer || width <= 0 || height <= 0) throw new Error('bad-input');
  if (buffer.byteLength < width * height * 4) throw new Error('bad-input');

  var rgba = null, gray = null, small = null, blur = null;
  var edges = null, bin = null, kernel3 = null, kernel5 = null;
  try {
    var pixels = new Uint8ClampedArray(buffer, 0, width * height * 4);
    rgba = cv.matFromImageData(new ImageData(pixels, width, height));
    gray = new cv.Mat();
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    rgba.delete(); rgba = null;

    var scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    var w = width, h = height;
    if (scale < 1) {
      w = Math.max(1, Math.round(width * scale));
      h = Math.max(1, Math.round(height * scale));
      small = new cv.Mat();
      cv.resize(gray, small, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
      gray.delete();
      gray = small;
      small = null;
    }

    blur = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    var imgArea = w * h;
    var border = Math.max(2, Math.round(Math.min(w, h) * 0.005));
    var best = null;
    var cand;

    // Candidate A: edges.
    edges = new cv.Mat();
    cv.Canny(blur, edges, 50, 150, 3, false);
    kernel3 = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel3, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
    clearBorder(cv, edges, border);
    cand = bestQuadIn(cv, edges, imgArea);
    if (cand && (!best || cand.area > best.area)) best = cand;
    edges.delete(); edges = null;

    // Candidate B: Otsu threshold (light paper on darker background).
    bin = new cv.Mat();
    cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    kernel5 = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kernel5);
    clearBorder(cv, bin, border);
    cand = bestQuadIn(cv, bin, imgArea);
    if (cand && (!best || cand.area > best.area)) best = cand;

    // Candidate B': inverted (darker page on lighter background), only if needed.
    if (!best) {
      cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kernel5);
      clearBorder(cv, bin, border);
      cand = bestQuadIn(cv, bin, imgArea);
      if (cand) best = cand;
    }

    if (!best) return null;
    var q = orderQuad(best.pts);
    var out = [];
    for (var i = 0; i < 4; i++) {
      out.push({
        x: Math.min(1, Math.max(0, q[i].x / w)),
        y: Math.min(1, Math.max(0, q[i].y / h)),
      });
    }
    return { quad: out, confidence: Math.round((best.area / imgArea) * 1000) / 1000 };
  } finally {
    if (rgba) rgba.delete();
    if (gray) gray.delete();
    if (small) small.delete();
    if (blur) blur.delete();
    if (edges) edges.delete();
    if (bin) bin.delete();
    if (kernel3) kernel3.delete();
    if (kernel5) kernel5.delete();
  }
}

try {
  importScripts('opencv.js?v=4.12.0');
} catch (err) {
  onLoadFailed('load-failed');
}
if (!loadFailed) waitForCv();
