/* Solmar Bay — the city: streets, buildings, beach, pier, landmarks. */
var WORLD_W = 3200;
var WORLD_H = 2400;
var BEACH_Y = 2060;
var OCEAN_Y = 2260;

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var City = (function () {
  var rng = mulberry32(1337);
  var roadsV = [320, 760, 1200, 1640, 2080, 2520, 2920];
  var roadsH = [320, 700, 1080, 1460, 1840];
  var ROAD_W = 96;
  var buildings = [];
  var palms = [];
  var props = [];
  var landmarks = {};
  var staticCanvas = null;

  var ROOF_COLORS = ["#c96f4a", "#b85c5c", "#7d8aa0", "#a08a6d", "#5f7d6b", "#8a6fa0", "#c9a24a", "#6b8ca0"];
  var WALL_COLORS = ["#e8d9b0", "#d9b8a3", "#c9c2b4", "#e0cfa8", "#b8c4c9", "#d9a8a8"];

  function blockRects() {
    var rects = [];
    var xs = [0].concat(roadsV.map(function (x) { return x + ROAD_W / 2; }));
    var xe = roadsV.map(function (x) { return x - ROAD_W / 2; }).concat([WORLD_W]);
    var ys = [0].concat(roadsH.map(function (y) { return y + ROAD_W / 2; }));
    var ye = roadsH.map(function (y) { return y - ROAD_W / 2; }).concat([BEACH_Y]);
    for (var i = 0; i < xs.length; i++) {
      for (var j = 0; j < ys.length; j++) {
        rects.push({ x: xs[i], y: ys[j], w: xe[i] - xs[i], h: ye[j] - ys[j] });
      }
    }
    return rects;
  }

  function placeLandmark(id, name, bx, by, bw, bh, color) {
    landmarks[id] = { id: id, name: name, x: bx, y: by, w: bw, h: bh, color: color };
    buildings.push({ x: bx, y: by, w: bw, h: bh, roof: color, wall: "#e8d9b0", h: 26, landmark: id });
  }

  function build() {
    var blocks = blockRects();
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b];
      if (blk.w < 130 || blk.h < 130) continue;
      var n = 1 + Math.floor(rng() * 2);
      for (var k = 0; k < n; k++) {
        var bw = rand(110, Math.min(220, blk.w - 60));
        var bh = rand(90, Math.min(180, blk.h - 60));
        var bx = blk.x + 30 + rng() * Math.max(1, blk.w - bw - 60);
        var by = blk.y + 30 + rng() * Math.max(1, blk.h - bh - 60);
        var hit = false;
        for (var q = 0; q < buildings.length; q++) {
          if (rectsOverlap(bx - 14, by - 14, bw + 28, bh + 28, buildings[q].x, buildings[q].y, buildings[q].w, buildings[q].h)) { hit = true; break; }
        }
        if (hit) continue;
        buildings.push({ x: bx, y: by, w: bw, h: bh, roof: pick(ROOF_COLORS), wall: pick(WALL_COLORS), h: rand(10, 30), landmark: null });
      }
      // Palm trees and props scattered on the block.
      var pCount = Math.floor(rng() * 4);
      for (var p = 0; p < pCount; p++) {
        var px = blk.x + 24 + rng() * (blk.w - 48);
        var py = blk.y + 24 + rng() * (blk.h - 48);
        var blocked = false;
        for (var q2 = 0; q2 < buildings.length; q2++) {
          if (px > buildings[q2].x - 8 && px < buildings[q2].x + buildings[q2].w + 8 && py > buildings[q2].y - 8 && py < buildings[q2].y + buildings[q2].h + 8) { blocked = true; break; }
        }
        if (!blocked) palms.push({ x: px, y: py, s: rand(0.8, 1.3) });
      }
    }
    // Beach palms.
    for (var i = 0; i < 46; i++) {
      palms.push({ x: rand(40, WORLD_W - 40), y: rand(BEACH_Y + 24, OCEAN_Y - 30), s: rand(0.9, 1.4) });
    }
    // Landmarks (also buildings, drawn with labels).
    placeLandmark("safehouse", "SAFEHOUSE", 470, 430, 190, 130, "#3f7d5c");
    placeLandmark("bank", "SOLMAR NATIONAL BANK", 1290, 790, 230, 150, "#8a6fa0");
    placeLandmark("garage", "SUNSET GARAGE", 2290, 1120, 210, 140, "#c96f4a");
    placeLandmark("motel", "BAYVIEW MOTEL", 2560, 1870, 220, 130, "#5f7d9b");
    placeLandmark("hospital", "BAY GENERAL", 700, 1500, 200, 140, "#a0a8b8");
    placeLandmark("police", "BAY PD HQ", 1680, 320, 210, 130, "#3f5a8a");
    renderStatic();
  }

  function isRoadAt(x, y) {
    for (var i = 0; i < roadsV.length; i++) if (Math.abs(x - roadsV[i]) < ROAD_W / 2 + 6) return true;
    for (var j = 0; j < roadsH.length; j++) if (Math.abs(y - roadsH[j]) < ROAD_W / 2 + 6) return true;
    return false;
  }

  function isWater(x, y) { return y > OCEAN_Y + 6; }

  function resolveCircle(x, y, r) {
    // Keep inside the world and out of buildings and water (except the pier).
    var nx = clamp(x, 20, WORLD_W - 20);
    var ny = clamp(y, 20, WORLD_H - 20);
    if (ny > OCEAN_Y - 4 && !(nx > 1560 && nx < 1680)) ny = OCEAN_Y - 4;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (circleRect(nx, ny, r, b.x, b.y, b.w, b.h)) {
        var cx = clamp(nx, b.x, b.x + b.w), cy = clamp(ny, b.y, b.y + b.h);
        var dx = nx - cx, dy = ny - cy;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var push = r - d + 1;
        if (d < 0.01) { nx += r + 1; }
        else { nx += (dx / d) * push; ny += (dy / d) * push; }
      }
    }
    return { x: nx, y: ny };
  }

  function nearestRoadPoint(x, y) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < roadsV.length; i++) {
      var d = Math.abs(x - roadsV[i]);
      if (d < bestD) { bestD = d; best = { x: roadsV[i], y: y, vertical: true }; }
    }
    for (var j = 0; j < roadsH.length; j++) {
      var d2 = Math.abs(y - roadsH[j]);
      if (d2 < bestD) { bestD = d2; best = { x: x, y: roadsH[j], vertical: false }; }
    }
    return best;
  }

  function drawPalm(ctx, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = "#7a5230"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(3, -10, 5, -16); ctx.stroke();
    ctx.strokeStyle = "#2e8b57"; ctx.lineWidth = 3;
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2 + Math.sin(t * 0.7 + x) * 0.08;
      ctx.beginPath(); ctx.moveTo(5, -16);
      ctx.quadraticCurveTo(5 + Math.cos(a) * 12, -16 + Math.sin(a) * 12 - 4, 5 + Math.cos(a) * 18, -16 + Math.sin(a) * 18 + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderStatic() {
    staticCanvas = document.createElement("canvas");
    staticCanvas.width = WORLD_W; staticCanvas.height = WORLD_H;
    var c = staticCanvas.getContext("2d");
    // Ground.
    c.fillStyle = "#5e8f5a"; c.fillRect(0, 0, WORLD_W, BEACH_Y);
    c.fillStyle = "#e8d29a"; c.fillRect(0, BEACH_Y, WORLD_W, OCEAN_Y - BEACH_Y);
    var grad = c.createLinearGradient(0, OCEAN_Y, 0, WORLD_H);
    grad.addColorStop(0, "#2e7fa8"); grad.addColorStop(1, "#165a80");
    c.fillStyle = grad; c.fillRect(0, OCEAN_Y, WORLD_W, WORLD_H - OCEAN_Y);
    // Sidewalk tint around blocks.
    c.fillStyle = "#b8b2a4";
    var blocks = blockRects();
    for (var i = 0; i < blocks.length; i++) c.fillRect(blocks[i].x - 8, blocks[i].y - 8, blocks[i].w + 16, blocks[i].h + 16);
    // Roads.
    c.fillStyle = "#3a3f4a";
    for (var v = 0; v < roadsV.length; v++) c.fillRect(roadsV[v] - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
    for (var h = 0; h < roadsH.length; h++) c.fillRect(0, roadsH[h] - ROAD_W / 2, WORLD_W, ROAD_W);
    // Lane dashes.
    c.fillStyle = "#e8d44d";
    for (var v2 = 0; v2 < roadsV.length; v2++) {
      for (var y = 20; y < BEACH_Y; y += 56) c.fillRect(roadsV[v2] - 2, y, 4, 28);
    }
    for (var h2 = 0; h2 < roadsH.length; h2++) {
      for (var x = 20; x < WORLD_W; x += 56) c.fillRect(x, roadsH[h2] - 2, 28, 4);
    }
    // Pier.
    c.fillStyle = "#8a6a42"; c.fillRect(1560, OCEAN_Y - 60, 120, 300);
    c.fillStyle = "#6e5232";
    for (var py = OCEAN_Y - 50; py < WORLD_H; py += 24) c.fillRect(1560, py, 120, 3);
    c.fillStyle = "#d9c9a8";
    c.beginPath(); c.arc(1620, WORLD_H - 40, 26, 0, Math.PI * 2); c.fill();
    // Buildings: shadow, walls, roof, windows.
    for (var b = 0; b < buildings.length; b++) {
      var bd = buildings[b];
      c.fillStyle = "rgba(0,0,0,0.28)";
      c.fillRect(bd.x + 8, bd.y + bd.h * 0.3, bd.w, bd.h);
      c.fillStyle = bd.wall;
      c.fillRect(bd.x, bd.y, bd.w, bd.h);
      c.fillStyle = bd.roof;
      c.fillRect(bd.x + 6, bd.y + 6, bd.w - 12, bd.h - 12);
      c.fillStyle = "rgba(255,255,255,0.5)";
      var cols = Math.max(2, Math.floor(bd.w / 42));
      var rows = Math.max(2, Math.floor(bd.h / 42));
      for (var cx = 0; cx < cols; cx++) {
        for (var cy = 0; cy < rows; cy++) {
          if ((cx + cy) % 2 === 0) c.fillRect(bd.x + 12 + cx * 40, bd.y + 12 + cy * 40, 16, 12);
        }
      }
      if (bd.landmark) {
        c.fillStyle = "#101828";
        c.font = "bold 15px Arial";
        c.textAlign = "center";
        c.fillText(landmarks[bd.landmark].name, bd.x + bd.w / 2, bd.y + bd.h / 2 + 5);
      }
    }
    // Beach umbrellas.
    for (var u = 0; u < 12; u++) {
      var ux = 120 + u * 260 + ((u * 37) % 90);
      var uy = BEACH_Y + 40 + ((u * 53) % 110);
      c.fillStyle = ["#ff5a7a", "#ffd23e", "#4dd0e1"][u % 3];
      c.beginPath(); c.arc(ux, uy, 16, Math.PI, 0); c.fill();
      c.strokeStyle = "#5a3a22"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(ux, uy); c.lineTo(ux, uy - 18); c.stroke();
    }
    // Static palms.
    for (var p = 0; p < palms.length; p++) drawPalm(c, palms[p].x, palms[p].y, palms[p].s, 0);
  }

  function drawOceanAnim(ctx, camX, camY, t) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (var i = 0; i < 5; i++) {
      var y = OCEAN_Y + 30 + i * 26 + Math.sin(t * 0.8 + i * 1.7) * 4;
      ctx.beginPath();
      for (var x = Math.max(0, camX - 40); x < camX + 1320; x += 40) {
        var yy = y + Math.sin(x * 0.02 + t * 1.3 + i) * 5;
        if (x === Math.max(0, camX - 40)) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  return {
    build: build,
    drawStaticInto: function (ctx, camX, camY, vw, vh) {
      ctx.drawImage(staticCanvas, camX, camY, vw, vh, 0, 0, vw, vh);
    },
    drawOceanAnim: drawOceanAnim,
    isRoadAt: isRoadAt,
    isWater: isWater,
    resolveCircle: resolveCircle,
    nearestRoadPoint: nearestRoadPoint,
    landmarks: landmarks,
    buildings: buildings,
    roadsV: roadsV,
    roadsH: roadsH
  };
})();
