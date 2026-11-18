/* Solmar Bay — main loop: input, driving, wanted system, police, HUD, save. */
var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var minimap = document.getElementById("minimap");
var mctx = minimap.getContext("2d");
var VIEW_W = 1280, VIEW_H = 720;

var G = {
  state: "title", // title | playing | paused | dead | busted | end
  player: null,
  cars: [],       // traffic + player car (kind field tells)
  policeCars: [],
  cops: [],
  guards: [],
  peds: [],
  bullets: [],
  particles: [],
  money: 500,
  wanted: 0,          // stars 0..5
  wantedPts: 0,       // float, level = floor
  heat: 0,            // 0..1, decays when unseen
  bustedT: 0,
  clockMin: 9 * 60 + 41,
  day: 1,
  cam: { x: 0, y: 0 },
  keys: {},
  mouse: { x: 640, y: 360, down: false },
  time: 0,
  endShown: false,
  stats: { carsStolen: 0, missionsDone: 0, copsDodged: 0 }
};

function worldMouse() {
  return { x: G.mouse.x + G.cam.x, y: G.mouse.y + G.cam.y };
}

function setWantedStars(n) {
  G.wanted = clamp(Math.round(n), 0, 5);
  G.wantedPts = G.wanted;
}
function addWanted(pts) {
  G.wantedPts = clamp(G.wantedPts + pts, 0, 5);
  var lvl = Math.floor(G.wantedPts);
  if (lvl > G.wanted) {
    G.wanted = lvl;
    if (lvl >= 3) showBanner("WANTED LEVEL " + lvl, "The Bay PD is on you");
  } else if (lvl < G.wanted) { G.wanted = lvl; }
}
function setWanted(n) { setWantedStars(Math.max(G.wanted, n)); }

function showBanner(text, sub) {
  var b = document.getElementById("banner");
  b.innerHTML = text + (sub ? "<small>" + sub + "</small>" : "");
  b.classList.remove("hidden");
  setTimeout(function () { b.classList.add("hidden"); }, 2600);
}
function toast(text) {
  var t = document.getElementById("toast");
  t.textContent = text;
  t.classList.remove("hidden");
  setTimeout(function () { t.classList.add("hidden"); }, 2400);
}
function setHint(text) { document.getElementById("hint").textContent = text || ""; }

/* ---------- setup ---------- */
function resetWorld(fresh) {
  City.build();
  G.player = makePlayer(560, 560);
  G.cars = []; G.policeCars = []; G.cops = []; G.guards = [];
  G.bullets = []; G.particles = [];
  G.peds = [];
  for (var i = 0; i < 14; i++) G.cars.push(spawnTrafficCar());
  for (var j = 0; j < 26; j++) G.peds.push(spawnPed());
  G.money = 500;
  G.wanted = 0; G.wantedPts = 0; G.heat = 0; G.bustedT = 0;
  G.clockMin = 9 * 60 + 41; G.day = 1;
  G.endShown = false;
  G.stats = { carsStolen: 0, missionsDone: 0, copsDodged: 0 };
  MissionRunner.reset();
  if (!fresh) loadSave();
  G.cam.x = clamp(G.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  G.cam.y = clamp(G.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
}

function saveGame() {
  try {
    localStorage.setItem("solmarbay-save-v1", JSON.stringify({
      money: G.money,
      health: G.player.health,
      x: G.player.x, y: G.player.y,
      day: G.day, clockMin: G.clockMin,
      mission: MissionRunner.saveData(),
      stats: G.stats
    }));
  } catch (e) {}
}
function loadSave() {
  try {
    var raw = localStorage.getItem("solmarbay-save-v1");
    if (!raw) return false;
    var d = JSON.parse(raw);
    G.money = d.money || 500;
    G.player.health = d.health || 100;
    if (d.x) { var r = City.resolveCircle(d.x, d.y, 12); G.player.x = r.x; G.player.y = r.y; }
    G.day = d.day || 1; G.clockMin = d.clockMin || 581;
    MissionRunner.loadData(d.mission);
    G.stats = d.stats || G.stats;
    return true;
  } catch (e) { return false; }
}
function hasSave() {
  try { return !!localStorage.getItem("solmarbay-save-v1"); } catch (e) { return false; }
}

/* ---------- flow ---------- */
function showScreen(id) {
  var screens = ["title-screen", "howto-screen", "pause-screen", "dead-screen", "busted-screen", "end-screen"];
  for (var i = 0; i < screens.length; i++) document.getElementById(screens[i]).classList.add("hidden");
  if (id) document.getElementById(id).classList.remove("hidden");
  document.getElementById("hud").classList.toggle("hidden", id !== null);
}
function startGame(fresh) {
  AudioSys.unlock();
  resetWorld(fresh);
  applyDebugParams();
  G.state = "playing";
  showScreen(null);
  AudioSys.startEngine();
  if (!fresh) toast("Welcome back to Solmar Bay");
  else showBanner("SOLMAR BAY", "Press F near the Safehouse to meet Rico");
}
function applyDebugParams() {
  var q = new URLSearchParams(location.search);
  if (q.get("wanted")) setWantedStars(parseInt(q.get("wanted"), 10));
  if (q.get("money")) G.money = parseInt(q.get("money"), 10);
  if (q.get("mission")) {
    var idx = parseInt(q.get("mission"), 10);
    MissionRunner.reset();
    for (var i = 0; i < idx; i++) MissionRunner.startNext();
    MissionRunner.startNext();
  }
}
function pauseGame() {
  if (G.state !== "playing") return;
  G.state = "paused";
  document.getElementById("pause-stats").textContent =
    "Cash $" + fmtMoney(G.money) + "  ·  Missions done: " + G.stats.missionsDone + "  ·  Cars stolen: " + G.stats.carsStolen;
  showScreen("pause-screen");
}
function resumeGame() {
  if (G.state !== "paused") return;
  G.state = "playing";
  showScreen(null);
}
function quitToTitle() {
  saveGame();
  G.state = "title";
  AudioSys.stopEngine();
  document.getElementById("btn-continue").disabled = !hasSave();
  showScreen("title-screen");
}
function playerWasted() {
  G.state = "dead";
  AudioSys.fail();
  AudioSys.stopEngine();
  showScreen("dead-screen");
}
function playerBusted() {
  G.state = "busted";
  AudioSys.fail();
  AudioSys.stopEngine();
  G.money = Math.max(0, G.money - 300);
  showScreen("busted-screen");
}
function respawn() {
  G.player.health = 100;
  G.player.x = 560; G.player.y = 560;
  G.player.onFoot = true; G.player.car = null;
  G.wanted = 0; G.wantedPts = 0; G.heat = 0; G.bustedT = 0;
  G.policeCars = []; G.cops = []; G.guards = [];
  MissionRunner.reset();
  G.state = "playing";
  showScreen(null);
  AudioSys.startEngine();
  saveGame();
}

/* ---------- input ---------- */
document.addEventListener("keydown", function (e) {
  G.keys[e.key.toLowerCase()] = true;
  if (e.key === " ") e.preventDefault();
  if (e.key.toLowerCase() === "m") { AudioSys.setMuted(!AudioSys.isMuted()); toast(AudioSys.isMuted() ? "Sound off" : "Sound on"); }
  if (e.key.toLowerCase() === "p" && (G.state === "playing" || G.state === "paused")) {
    if (G.state === "playing") pauseGame(); else resumeGame();
  }
  if (e.key.toLowerCase() === "e" && G.state === "playing") tryEnterExitCar();
  if (e.key.toLowerCase() === "f" && G.state === "playing") tryTalk();
});
document.addEventListener("keyup", function (e) { G.keys[e.key.toLowerCase()] = false; });
canvas.addEventListener("mousemove", function (e) {
  var r = canvas.getBoundingClientRect();
  G.mouse.x = (e.clientX - r.left) * (VIEW_W / r.width);
  G.mouse.y = (e.clientY - r.top) * (VIEW_H / r.height);
});
canvas.addEventListener("mousedown", function (e) {
  AudioSys.unlock();
  G.mouse.down = true;
  if (G.state === "playing" && G.player.onFoot) shoot();
});
canvas.addEventListener("mouseup", function () { G.mouse.down = false; });
canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

document.getElementById("btn-start").addEventListener("click", function () { startGame(true); });
document.getElementById("btn-continue").addEventListener("click", function () { startGame(false); });
document.getElementById("btn-howto").addEventListener("click", function () { showScreen("howto-screen"); });
document.getElementById("btn-howto-back").addEventListener("click", function () { showScreen("title-screen"); });
document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-quit").addEventListener("click", quitToTitle);
document.getElementById("btn-retry").addEventListener("click", function () { G.money = Math.max(0, G.money - 200); respawn(); });
document.getElementById("btn-dead-title").addEventListener("click", quitToTitle);
document.getElementById("btn-busted-retry").addEventListener("click", respawn);
document.getElementById("btn-busted-title").addEventListener("click", quitToTitle);
document.getElementById("btn-end-free").addEventListener("click", function () { G.state = "playing"; showScreen(null); });
document.getElementById("btn-end-title").addEventListener("click", quitToTitle);

function tryTalk() {
  var sh = City.landmarks.safehouse;
  if (!sh) return;
  var cx = sh.x + sh.w / 2, cy = sh.y + sh.h / 2;
  if (dist(G.player.x, G.player.y, cx, cy) < 150) {
    if (MissionRunner.state.done) { toast("Rico: You did it all. The Bay is yours."); return; }
    if (MissionRunner.state.active) { toast("Rico: Finish the job first."); return; }
    var m = MissionRunner.startNext();
    if (m) {
      showBanner(m.title, m.giver + ": " + m.intro);
      AudioSys.mission();
      saveGame();
    }
  }
}

function tryEnterExitCar() {
  var p = G.player;
  if (p.onFoot) {
    var best = null, bestD = 75;
    for (var i = 0; i < G.cars.length; i++) {
      var d = dist(p.x, p.y, G.cars[i].x, G.cars[i].y);
      if (d < bestD) { bestD = d; best = G.cars[i]; }
    }
    for (var j = 0; j < G.policeCars.length; j++) {
      var d2 = dist(p.x, p.y, G.policeCars[j].x, G.policeCars[j].y);
      if (d2 < bestD) { bestD = d2; best = G.policeCars[j]; }
    }
    if (best) {
      p.onFoot = false;
      p.car = best;
      best.kind = "player";
      if (best.isPoliceCar) { /* stolen police car */ }
      var idx = G.cars.indexOf(best);
      if (idx >= 0) G.cars.splice(idx, 1);
      var pidx = G.policeCars.indexOf(best);
      if (pidx >= 0) G.policeCars.splice(pidx, 1);
      best.hp = best.hp || 100;
      G.stats.carsStolen++;
      AudioSys.door();
      if (best.kind === "player" && G.wanted < 1) addWanted(0.6);
      if (best.stolenPolice) addWanted(1);
      setHint("W/S drive · A/D steer · Space handbrake · E get out");
    }
  } else if (p.car) {
    var car = p.car;
    p.onFoot = true;
    var side = { x: p.x + Math.cos(car.angle + Math.PI / 2) * 34, y: p.y + Math.sin(car.angle + Math.PI / 2) * 34 };
    var r = City.resolveCircle(side.x, side.y, 12);
    p.x = r.x; p.y = r.y;
    car.speed = 0;
    car.kind = "traffic";
    car.maxSpeed = rand(150, 240);
    G.cars.push(car);
    p.car = null;
    AudioSys.door();
    setHint("");
  }
}

function shoot() {
  var p = G.player;
  if (p.shootCd > 0 || !p.onFoot) return;
  p.shootCd = 0.22;
  var m = worldMouse();
  var a = angleTo(p.x, p.y, m.x, m.y);
  p.angle = a;
  G.bullets.push(makeBullet(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, true));
  spawnParticles(G.particles, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 3, "#ffd23e", 120);
  AudioSys.shoot();
  addWanted(0.15);
}

/* ---------- update ---------- */
function updatePlayer(dt) {
  var p = G.player;
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  if (p.onFoot) {
    var mx = (G.keys["d"] || G.keys["arrowright"] ? 1 : 0) - (G.keys["a"] || G.keys["arrowleft"] ? 1 : 0);
    var my = (G.keys["s"] || G.keys["arrowdown"] ? 1 : 0) - (G.keys["w"] || G.keys["arrowup"] ? 1 : 0);
    var sprint = G.keys["shift"] ? 1.5 : 1;
    var len = Math.sqrt(mx * mx + my * my) || 1;
    p.moving = (mx !== 0 || my !== 0);
    var sp = 175 * sprint;
    p.x += (mx / len) * sp * dt * (p.moving ? 1 : 0);
    p.y += (my / len) * sp * dt * (p.moving ? 1 : 0);
    var m = worldMouse();
    p.angle = angleTo(p.x, p.y, m.x, m.y);
    if (p.moving) p.walkPhase += dt * 10;
    var r = City.resolveCircle(p.x, p.y, 12);
    p.x = r.x; p.y = r.y;
    if (G.mouse.down && p.shootCd <= 0) shoot();
  } else if (p.car) {
    var car = p.car;
    var fwd = (G.keys["w"] || G.keys["arrowup"] ? 1 : 0) - (G.keys["s"] || G.keys["arrowdown"] ? 1 : 0);
    var steer = (G.keys["a"] || G.keys["arrowleft"] ? 1 : 0) - (G.keys["d"] || G.keys["arrowright"] ? 1 : 0);
    var handbrake = !!G.keys[" "];
    var maxSpd = 430;
    if (fwd > 0) car.speed += 300 * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0 ? 420 : 180) * dt;
    else car.speed = lerp(car.speed, 0, dt * 0.9);
    if (handbrake) { car.speed = lerp(car.speed, 0, dt * 2.4); }
    car.speed = clamp(car.speed, -160, maxSpd);
    var turnRate = 2.1 * (handbrake ? 1.5 : 1) * clamp(Math.abs(car.speed) / 160, 0.25, 1);
    car.angle += steer * turnRate * dt * (car.speed >= 0 ? 1 : -1);
    var f = carForward(car);
    var nx = car.x + f.x * car.speed * dt;
    var ny = car.y + f.y * car.speed * dt;
    var before = { x: car.x, y: car.y };
    var rr = City.resolveCircle(nx, ny, 20);
    car.x = rr.x; car.y = rr.y;
    var hitWall = (Math.abs(rr.x - nx) > 2 || Math.abs(rr.y - ny) > 2);
    if (hitWall && Math.abs(car.speed) > 200) {
      car.hp -= 12;
      spawnParticles(G.particles, car.x, car.y, 8, "#ffb347", 160);
      AudioSys.crash();
      car.speed *= -0.25;
    } else if (hitWall) { car.speed *= 0.4; }
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    // Run over pedestrians.
    for (var i = G.peds.length - 1; i >= 0; i--) {
      var ped = G.peds[i];
      if (dist(car.x, car.y, ped.x, ped.y) < 26 && Math.abs(car.speed) > 60) {
        spawnParticles(G.particles, ped.x, ped.y, 10, "#ff5a5a", 140);
        G.peds.splice(i, 1);
        addWanted(1);
        setTimeout(function () { G.peds.push(spawnPed()); }, 4000);
      }
    }
    if (car.hp <= 0) {
      spawnParticles(G.particles, car.x, car.y, 26, "#ff7a2a", 260);
      spawnParticles(G.particles, car.x, car.y, 14, "#555", 120);
      AudioSys.crash();
      p.car = null; p.onFoot = true;
      p.health -= 30;
      p.x = car.x + 40; p.y = car.y;
      addWanted(1);
      if (p.health <= 0) playerWasted();
    }
    AudioSys.setEngine(Math.abs(car.speed) / maxSpd, true);
  } else {
    AudioSys.setEngine(0, false);
  }
}

function policeTargetVisible() {
  // Police can see the player if close, or wanted is high.
  var p = G.player;
  for (var i = 0; i < G.policeCars.length; i++) {
    if (dist(p.x, p.y, G.policeCars[i].x, G.policeCars[i].y) < 520) return true;
  }
  for (var j = 0; j < G.cops.length; j++) {
    if (dist(p.x, p.y, G.cops[j].x, G.cops[j].y) < 420) return true;
  }
  return G.wanted >= 4;
}

function updatePolice(dt) {
  var wantCars = G.wanted >= 1 ? Math.min(G.wanted, 4) : 0;
  // Spawn.
  while (G.policeCars.length < wantCars) {
    var a = rand(0, Math.PI * 2);
    var sx = clamp(G.player.x + Math.cos(a) * rand(650, 850), 60, WORLD_W - 60);
    var sy = clamp(G.player.y + Math.sin(a) * rand(650, 850), 60, BEACH_Y - 60);
    var rp = City.nearestRoadPoint(sx, sy);
    G.policeCars.push(spawnPoliceCar(rp.x, rp.y));
  }
  // Despawn far ones when wanted drops.
  for (var i = G.policeCars.length - 1; i >= 0; i--) {
    if (G.wanted === 0 || dist(G.policeCars[i].x, G.policeCars[i].y, G.player.x, G.player.y) > 1400) {
      G.policeCars.splice(i, 1);
    }
  }
  for (var k = 0; k < G.policeCars.length; k++) {
    updatePoliceCar(G.policeCars[k], G.player, dt, G.wanted);
    var pc = G.policeCars[k];
    // Ram the player.
    if (dist(pc.x, pc.y, G.player.x, G.player.y) < 44) {
      if (G.player.onFoot) {
        if (G.player.hurtCd <= 0) { G.player.health -= 12; G.player.hurtCd = 0.6; spawnParticles(G.particles, G.player.x, G.player.y, 6, "#ff5a5a", 120); }
        G.bustedT += dt;
      } else if (G.player.car) {
        G.player.car.hp -= 14 * dt;
        pc.speed *= 0.7;
        spawnParticles(G.particles, pc.x, pc.y, 3, "#ffd23e", 100);
        if (Math.random() < dt * 2) AudioSys.crash();
      }
    }
  }
  // Foot cops at wanted 2+.
  var wantCops = G.wanted >= 2 && G.player.onFoot ? Math.min(G.wanted - 1, 3) : 0;
  while (G.cops.length < wantCops) {
    var a2 = rand(0, Math.PI * 2);
    G.cops.push({ x: clamp(G.player.x + Math.cos(a2) * 420, 40, WORLD_W - 40), y: clamp(G.player.y + Math.sin(a2) * 420, 40, BEACH_Y - 40), angle: 0, shootCd: rand(0.6, 1.4), speed: 150, walkPhase: 0 });
  }
  for (var c = G.cops.length - 1; c >= 0; c--) {
    var cop = G.cops[c];
    if (G.wanted < 2 || !G.player.onFoot) { G.cops.splice(c, 1); continue; }
    var d = dist(cop.x, cop.y, G.player.x, G.player.y);
    cop.angle = angleTo(cop.x, cop.y, G.player.x, G.player.y);
    if (d > 34) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      var rc = City.resolveCircle(cop.x, cop.y, 11);
      cop.x = rc.x; cop.y = rc.y;
    } else {
      G.bustedT += dt * 1.4;
    }
    cop.shootCd -= dt;
    if (d < 380 && cop.shootCd <= 0) {
      cop.shootCd = 1.3;
      var ba = cop.angle + rand(-0.14, 0.14);
      G.bullets.push(makeBullet(cop.x, cop.y, ba, false));
      AudioSys.enemyShoot();
    }
    cop.walkPhase += dt * 8;
  }
  // Wanted decay: hidden + still = heat fades.
  if (G.wanted > 0) {
    if (policeTargetVisible()) { G.heat = Math.min(1, G.heat + dt * 0.12); }
    else {
      G.heat = Math.max(0, G.heat - dt * 0.08);
      G.wantedPts = Math.max(0, G.wantedPts - dt * 0.14);
      var lvl = Math.floor(G.wantedPts);
      if (lvl < G.wanted) {
        G.wanted = lvl;
        if (lvl === 0) { toast("You lost them. The heat is off."); G.stats.copsDodged++; }
      }
    }
  }
  // Busted check.
  if (G.player.onFoot && G.bustedT > 1.1) { G.bustedT = 0; playerBusted(); return; }
  G.bustedT = Math.max(0, G.bustedT - dt * 0.5);
  if (G.player.health <= 0) playerWasted();
}

function updateGuards(dt) {
  for (var i = G.guards.length - 1; i >= 0; i--) {
    var gd = G.guards[i];
    var d = dist(gd.x, gd.y, G.player.x, G.player.y);
    gd.angle = angleTo(gd.x, gd.y, G.player.x, G.player.y);
    if (d > 120) {
      gd.x += Math.cos(gd.angle) * gd.speed * dt;
      gd.y += Math.sin(gd.angle) * gd.speed * dt;
      var r = City.resolveCircle(gd.x, gd.y, 11);
      gd.x = r.x; gd.y = r.y;
    }
    gd.shootCd -= dt;
    if (d < 420 && gd.shootCd <= 0) {
      gd.shootCd = 1.1;
      G.bullets.push(makeBullet(gd.x, gd.y, gd.angle + rand(-0.12, 0.12), false));
      AudioSys.enemyShoot();
    }
    gd.walkPhase += dt * 8;
  }
}

function updateBulletsHits(dt) {
  updateBullets(G.bullets, dt, G);
  for (var i = G.bullets.length - 1; i >= 0; i--) {
    var b = G.bullets[i];
    var hit = false;
    if (b.fromPlayer) {
      for (var g = G.guards.length - 1; g >= 0; g--) {
        if (dist(b.x, b.y, G.guards[g].x, G.guards[g].y) < 16) {
          G.guards[g].health--;
          spawnParticles(G.particles, b.x, b.y, 5, "#ff5a5a", 120);
          if (G.guards[g].health <= 0) {
            spawnParticles(G.particles, G.guards[g].x, G.guards[g].y, 12, "#ff5a5a", 160);
            G.guards.splice(g, 1);
            MissionRunner.onGuardKilled();
            addWanted(0.5);
          }
          hit = true; break;
        }
      }
      if (!hit) {
        for (var p2 = G.peds.length - 1; p2 >= 0; p2--) {
          if (dist(b.x, b.y, G.peds[p2].x, G.peds[p2].y) < 13) {
            spawnParticles(G.particles, b.x, b.y, 8, "#ff5a5a", 130);
            G.peds.splice(p2, 1);
            addWanted(1.5);
            setTimeout(function () { G.peds.push(spawnPed()); }, 5000);
            hit = true; break;
          }
        }
      }
      if (!hit) {
        for (var pc = 0; pc < G.policeCars.length; pc++) {
          if (dist(b.x, b.y, G.policeCars[pc].x, G.policeCars[pc].y) < 22) {
            G.policeCars[pc].hp = (G.policeCars[pc].hp || 100) - 25;
            spawnParticles(G.particles, b.x, b.y, 5, "#ffd23e", 120);
            if (G.policeCars[pc].hp <= 0) {
              spawnParticles(G.particles, G.policeCars[pc].x, G.policeCars[pc].y, 24, "#ff7a2a", 240);
              AudioSys.crash();
              G.policeCars.splice(pc, 1);
              addWanted(1);
            }
            hit = true; break;
          }
        }
      }
    } else {
      if (G.player.onFoot && dist(b.x, b.y, G.player.x, G.player.y) < 13) {
        if (G.player.hurtCd <= 0) {
          G.player.health -= 9;
          G.player.hurtCd = 0.4;
          spawnParticles(G.particles, G.player.x, G.player.y, 5, "#ff5a5a", 120);
        }
        hit = true;
      }
    }
    if (hit) G.bullets.splice(i, 1);
  }
}

function update(dt) {
  G.time += dt;
  G.clockMin += dt * 0.9;
  if (G.clockMin >= 1440) { G.clockMin -= 1440; G.day++; }
  updatePlayer(dt);
  for (var i = 0; i < G.cars.length; i++) updateTrafficCar(G.cars[i], dt);
  separateCars(G.cars.concat(G.player.car ? [G.player.car] : []).concat(G.policeCars));
  for (var j = 0; j < G.peds.length; j++) updatePed(G.peds[j], dt, G.player.x, G.player.y);
  updatePolice(dt);
  if (G.state !== "playing") return;
  updateGuards(dt);
  updateBulletsHits(dt);
  updateParticles(G.particles, dt);
  // Mission progress.
  var res = MissionRunner.checkStep(G);
  if (res && res.completed) {
    G.stats.missionsDone++;
    showBanner("JOB DONE — " + res.completed.title, "+$" + fmtMoney(res.payout) + (res.next ? "  ·  Next: " + res.next.title : "  ·  All jobs complete!"));
    AudioSys.mission();
    saveGame();
    if (!res.next && !G.endShown) {
      G.endShown = true;
      setTimeout(function () {
        if (G.state === "playing") {
          document.getElementById("end-text").textContent = "Three jobs, $" + fmtMoney(G.money) + " in the bank, and the whole Bay knows your name. Free roam is yours.";
          G.state = "end";
          showScreen("end-screen");
        }
      }, 3200);
    }
  } else if (res && res.advanced) {
    AudioSys.pickup();
  }
  // Safehouse hint.
  var sh = City.landmarks.safehouse;
  if (sh && !MissionRunner.state.active && !MissionRunner.state.done) {
    var cx = sh.x + sh.w / 2, cy = sh.y + sh.h / 2;
    if (dist(G.player.x, G.player.y, cx, cy) < 150) setHint("Press F — Talk to Rico");
    else if (!G.player.car) setHint("E — steal a car · F near Safehouse — jobs");
    else setHint("");
  } else if (MissionRunner.state.active) {
    setHint("");
  }
  // Camera follows player.
  var tx = clamp(G.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  var ty = clamp(G.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  G.cam.x = lerp(G.cam.x, tx, dt * 5);
  G.cam.y = lerp(G.cam.y, ty, dt * 5);
  AudioSys.update(dt, G.wanted);
}

/* ---------- render ---------- */
function drawMissionMarker() {
  var step = MissionRunner.currentStep();
  if (!MissionRunner.state.active || !step) return;
  var t = null;
  if (step.type === "goto") t = missionTargetPos(step.target);
  else if (step.type === "steal") return;
  else if (step.type === "combat") t = missionTargetPos("bank");
  if (!t) return;
  var pulse = 1 + Math.sin(G.time * 4) * 0.15;
  ctx.save();
  ctx.translate(t.x - G.cam.x, t.y - G.cam.y);
  ctx.fillStyle = "rgba(255,210,62,0.25)";
  ctx.beginPath(); ctx.arc(0, 0, 46 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#ffd23e"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#ffd23e";
  ctx.beginPath();
  ctx.moveTo(0, -52 * pulse); ctx.lineTo(10, -34); ctx.lineTo(-10, -34); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Off-screen edge arrow.
  var sx = t.x - G.cam.x, sy = t.y - G.cam.y;
  if (sx < 30 || sx > VIEW_W - 30 || sy < 30 || sy > VIEW_H - 30) {
    var cx = clamp(sx, 40, VIEW_W - 40), cy = clamp(sy, 60, VIEW_H - 40);
    var a = angleTo(cx, cy, sx, sy);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = "#ffd23e";
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  var camX = Math.floor(G.cam.x), camY = Math.floor(G.cam.y);
  City.drawStaticInto(ctx, camX, camY, VIEW_W, VIEW_H);
  if (camY + VIEW_H > OCEAN_Y) City.drawOceanAnim(ctx, camX, camY, G.time);
  ctx.save();
  ctx.translate(-camX, -camY);
  drawMissionMarker();
  // Safehouse glow when no mission active.
  if (!MissionRunner.state.active && !MissionRunner.state.done) {
    var sh = City.landmarks.safehouse;
    if (sh) {
      ctx.fillStyle = "rgba(125,255,154," + (0.25 + Math.sin(G.time * 3) * 0.1) + ")";
      ctx.fillRect(sh.x - 6, sh.y - 6, sh.w + 12, sh.h + 12);
    }
  }
  for (var i = 0; i < G.cars.length; i++) drawCarShape(ctx, G.cars[i].x, G.cars[i].y, G.cars[i].angle, G.cars[i].color, false, 0);
  for (var p = 0; p < G.policeCars.length; p++) drawCarShape(ctx, G.policeCars[p].x, G.policeCars[p].y, G.policeCars[p].angle, "#1c2733", true, G.policeCars[p].sirenPhase);
  for (var j = 0; j < G.peds.length; j++) drawPedShape(ctx, G.peds[j]);
  for (var c = 0; c < G.cops.length; c++) {
    drawPedShape(ctx, { x: G.cops[c].x, y: G.cops[c].y, angle: G.cops[c].angle, shirt: "#1c2733", walkPhase: G.cops[c].walkPhase });
    ctx.fillStyle = "#1c2733";
    ctx.beginPath(); ctx.arc(G.cops[c].x, G.cops[c].y - 12, 4, 0, Math.PI * 2); ctx.fill();
  }
  for (var g = 0; g < G.guards.length; g++) {
    drawPedShape(ctx, { x: G.guards[g].x, y: G.guards[g].y, angle: G.guards[g].angle, shirt: "#222", walkPhase: G.guards[g].walkPhase });
    ctx.strokeStyle = "#c00"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(G.guards[g].x, G.guards[g].y - 16); ctx.lineTo(G.guards[g].x + 12, G.guards[g].y - 16); ctx.stroke();
  }
  if (G.player.car) drawCarShape(ctx, G.player.car.x, G.player.car.y, G.player.car.angle, G.player.car.color, G.player.car.kind === "police", G.player.car.sirenPhase || 0);
  else drawPlayerShape(ctx, G.player);
  for (var b = 0; b < G.bullets.length; b++) {
    ctx.fillStyle = "#ffe9a8";
    ctx.beginPath(); ctx.arc(G.bullets[b].x, G.bullets[b].y, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (var pt = 0; pt < G.particles.length; pt++) {
    var pa = G.particles[pt];
    ctx.globalAlpha = clamp(pa.life / pa.max, 0, 1);
    ctx.fillStyle = pa.color;
    ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // Vignette.
  var vg = ctx.createRadialGradient(640, 360, 320, 640, 360, 720);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawMinimap() {
  var s = 220 / WORLD_W;
  mctx.clearRect(0, 0, 220, 160);
  mctx.fillStyle = "#14301e";
  mctx.fillRect(0, 0, 220, 160);
  mctx.fillStyle = "#3a3f4a";
  for (var i = 0; i < City.roadsV.length; i++) mctx.fillRect(City.roadsV[i] * s - 2, 0, 5, 160);
  for (var j = 0; j < City.roadsH.length; j++) mctx.fillRect(0, City.roadsH[j] * s - 2, 220, 5);
  mctx.fillStyle = "#e8d29a";
  mctx.fillRect(0, BEACH_Y * s, 220, (OCEAN_Y - BEACH_Y) * s);
  mctx.fillStyle = "#2e7fa8";
  mctx.fillRect(0, OCEAN_Y * s, 220, 160 - OCEAN_Y * s);
  var step = MissionRunner.currentStep();
  if (MissionRunner.state.active && step && step.type === "goto") {
    var t = missionTargetPos(step.target);
    mctx.fillStyle = "#ffd23e";
    mctx.beginPath(); mctx.arc(t.x * s, t.y * s, 5, 0, Math.PI * 2); mctx.fill();
  }
  for (var p = 0; p < G.policeCars.length; p++) {
    mctx.fillStyle = "#4d7dff";
    mctx.beginPath(); mctx.arc(G.policeCars[p].x * s, G.policeCars[p].y * s, 3, 0, Math.PI * 2); mctx.fill();
  }
  mctx.fillStyle = "#ff2e88";
  mctx.beginPath(); mctx.arc(G.player.x * s, G.player.y * s, 4, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = "rgba(255,255,255,0.8)";
  mctx.strokeRect(0, 0, 220, 160);
}

function updateHUD() {
  document.getElementById("money-val").textContent = fmtMoney(G.money);
  var hp = Math.max(0, Math.round(G.player.health));
  document.getElementById("health-fill").style.width = hp + "%";
  document.getElementById("health-num").textContent = hp;
  document.getElementById("weapon-name").textContent = G.player.onFoot ? "PISTOL" : "CAR HP";
  document.getElementById("ammo-val").textContent = G.player.onFoot ? "∞" : Math.max(0, Math.round(G.player.car ? G.player.car.hp : 0));
  var stars = "";
  for (var i = 0; i < 5; i++) stars += i < G.wanted ? "★" : '<span class="off">★</span>';
  document.getElementById("stars").innerHTML = stars;
  var hh = Math.floor(G.clockMin / 60), mm = Math.floor(G.clockMin % 60);
  document.getElementById("clock").textContent = "DAY " + G.day + " · " + (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  document.getElementById("objective-text").textContent = MissionRunner.objectiveText();
  drawMinimap();
}

/* ---------- main loop ---------- */
var lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (G.state === "playing") {
    update(dt);
    render();
    updateHUD();
  } else if (G.state === "title") {
    // Slow ambient pan over the city behind the title.
    G.time += dt;
    G.cam.x = (Math.sin(G.time * 0.05) * 0.5 + 0.5) * (WORLD_W - VIEW_W);
    G.cam.y = (Math.cos(G.time * 0.04) * 0.5 + 0.5) * (WORLD_H - VIEW_H - 400);
    render();
  }
}

resetWorld(true);
document.getElementById("btn-continue").disabled = !hasSave();
showScreen("title-screen");
requestAnimationFrame(loop);
