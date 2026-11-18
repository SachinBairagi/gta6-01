/* Solmar Bay — people, cars, police, bullets and particles. */
var CAR_COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#9b59b6", "#1abc9c", "#e67e22", "#ecf0f1", "#2c3e50", "#ff6b9d", "#16a085"];
var PED_SHIRTS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#e67e22", "#9b59b6", "#ecf0f1", "#ff6b9d"];

function makePlayer(x, y) {
  return { x: x, y: y, angle: -Math.PI / 2, speed: 0, health: 100, onFoot: true, car: null, shootCd: 0, hurtCd: 0, walkPhase: 0, moving: false };
}

function makeCar(x, y, angle, color, kind) {
  return { x: x, y: y, angle: angle, speed: 0, color: color, kind: kind || "traffic", hp: 100, steer: 0, sirenPhase: Math.random() * 6, stuckT: 0, targetRoad: null, dir: 1, vertical: true };
}

function spawnTrafficCar() {
  var vertical = Math.random() < 0.5;
  var road, x, y, angle;
  if (vertical) {
    road = pick(City.roadsV);
    x = road + (Math.random() < 0.5 ? -22 : 22);
    y = rand(80, BEACH_Y - 80);
    angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    road = pick(City.roadsH);
    y = road + (Math.random() < 0.5 ? -22 : 22);
    x = rand(80, WORLD_W - 80);
    angle = Math.random() < 0.5 ? 0 : Math.PI;
  }
  var c = makeCar(x, y, angle, pick(CAR_COLORS), "traffic");
  c.vertical = vertical;
  c.dir = 1;
  c.maxSpeed = rand(150, 240);
  return c;
}

function spawnPoliceCar(x, y) {
  var c = makeCar(x, y, rand(0, Math.PI * 2), "#1c2733", "police");
  c.maxSpeed = 470;
  return c;
}

function makePed(x, y) {
  return { x: x, y: y, angle: rand(0, Math.PI * 2), speed: rand(30, 55), shirt: pick(PED_SHIRTS), walkPhase: rand(0, 6), panic: 0, turnT: rand(1, 4) };
}

function spawnPed() {
  var pt = City.nearestRoadPoint(rand(100, WORLD_W - 100), rand(100, BEACH_Y - 100));
  var x = pt.x + (pt.vertical ? rand(-70, 70) : rand(-70, 70));
  var y = pt.y + (pt.vertical ? rand(-70, 70) : rand(-70, 70));
  var p = City.resolveCircle(x, y, 10);
  return makePed(p.x, p.y);
}

function carForward(car) { return { x: Math.cos(car.angle), y: Math.sin(car.angle) }; }

function updateTrafficCar(car, dt) {
  // Cruise along its road; at intersections sometimes turn; at ends, turn around.
  var f = carForward(car);
  var targetSpeed = car.maxSpeed;
  car.speed = lerp(car.speed, targetSpeed, dt * 0.8);
  car.x += f.x * car.speed * dt;
  car.y += f.y * car.speed * dt;
  var nearCross = false;
  if (car.vertical) {
    for (var i = 0; i < City.roadsH.length; i++) {
      if (Math.abs(car.y - City.roadsH[i]) < 14) { nearCross = true; break; }
    }
    if (nearCross && Math.random() < dt * 0.5) {
      car.vertical = false;
      car.angle = Math.random() < 0.5 ? 0 : Math.PI;
    }
    if (car.y < 60 || car.y > BEACH_Y - 60) { car.angle += Math.PI; car.y = clamp(car.y, 60, BEACH_Y - 60); }
    car.x = lerp(car.x, (car.vertical ? car.x : car.x), 1);
  } else {
    for (var j = 0; j < City.roadsV.length; j++) {
      if (Math.abs(car.x - City.roadsV[j]) < 14) { nearCross = true; break; }
    }
    if (nearCross && Math.random() < dt * 0.5) {
      car.vertical = true;
      car.angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (car.x < 60 || car.x > WORLD_W - 60) { car.angle += Math.PI; car.x = clamp(car.x, 60, WORLD_W - 60); }
  }
  // Stay out of buildings.
  var r = City.resolveCircle(car.x, car.y, 20);
  car.x = r.x; car.y = r.y;
}

function updatePoliceCar(car, player, dt, wanted) {
  var d = dist(car.x, car.y, player.x, player.y);
  var desired = angleTo(car.x, car.y, player.x, player.y);
  var diff = angDiff(car.angle, desired);
  var steer = clamp(diff * 2.2, -1, 1);
  var targetSpeed = d > 260 ? car.maxSpeed : car.maxSpeed * 0.75;
  if (Math.abs(diff) > 1.9) targetSpeed = 60;
  car.speed = lerp(car.speed, targetSpeed, dt * 1.2);
  car.angle += steer * (0.9 + Math.min(1, Math.abs(car.speed) / 300)) * dt * 2.2 * (car.speed >= 0 ? 1 : -1);
  var f = carForward(car);
  car.x += f.x * car.speed * dt;
  car.y += f.y * car.speed * dt;
  car.sirenPhase += dt * 6;
  var r = City.resolveCircle(car.x, car.y, 20);
  car.x = r.x; car.y = r.y;
}

function updatePed(ped, dt, dangerX, dangerY) {
  ped.turnT -= dt;
  var dDanger = dangerX !== undefined ? dist(ped.x, ped.y, dangerX, dangerY) : 1e9;
  if (dDanger < 180) {
    ped.panic = 1.2;
    ped.angle = angleTo(dangerX, dangerY, ped.x, ped.y);
    ped.speed = 150;
  } else if (ped.panic > 0) {
    ped.panic -= dt;
    ped.speed = 120;
  } else {
    ped.speed = 42;
    if (ped.turnT <= 0) { ped.angle += rand(-1.2, 1.2); ped.turnT = rand(1.5, 5); }
  }
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.walkPhase += dt * (ped.speed / 12);
  var r = City.resolveCircle(ped.x, ped.y, 10);
  ped.x = r.x; ped.y = r.y;
  if (ped.y > BEACH_Y - 10 && ped.panic <= 0) ped.angle = -Math.PI / 2;
}

function separateCars(cars) {
  for (var i = 0; i < cars.length; i++) {
    for (var j = i + 1; j < cars.length; j++) {
      var a = cars[i], b = cars[j];
      var dx = b.x - a.x, dy = b.y - a.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < 44 * 44 && d2 > 0.01) {
        var d = Math.sqrt(d2);
        var push = (44 - d) / 2;
        var nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        a.speed *= 0.94; b.speed *= 0.94;
      }
    }
  }
}

/* ---- bullets & particles ---- */
function makeBullet(x, y, angle, fromPlayer) {
  return { x: x, y: y, angle: angle, speed: 720, life: 0.9, fromPlayer: fromPlayer };
}
function updateBullets(bullets, dt, world) {
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    var dead = b.life <= 0 || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H;
    if (!dead) {
      // Hit a building?
      for (var k = 0; k < City.buildings.length; k++) {
        var bd = City.buildings[k];
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { dead = true; break; }
      }
    }
    if (dead) {
      world.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: "#ffd23e", size: 5, kind: "spark" });
      bullets.splice(i, 1);
    }
  }
}
function spawnParticles(list, x, y, n, color, speed) {
  for (var i = 0; i < n; i++) {
    var a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
    list.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), max: 0.6, color: color, size: rand(2, 5), kind: "puff" });
  }
}
function updateParticles(list, dt) {
  for (var i = list.length - 1; i >= 0; i--) {
    var p = list[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}

/* ---- drawing ---- */
function drawCarShape(ctx, x, y, angle, color, isPolice, sirenPhase) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(-22, -11, 46, 26);
  ctx.fillStyle = "#14181f";
  ctx.fillRect(-20, -15, 10, 6); ctx.fillRect(-20, 9, 10, 6);
  ctx.fillRect(10, -15, 10, 6); ctx.fillRect(10, 9, 10, 6);
  ctx.fillStyle = color;
  roundRect(ctx, -21, -12, 42, 24, 7);
  ctx.fill();
  ctx.fillStyle = "rgba(180,220,255,0.85)";
  ctx.fillRect(-4, -10, 10, 20);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(8, -10, 6, 20);
  ctx.fillStyle = "#fff8c9";
  ctx.fillRect(19, -9, 3, 5); ctx.fillRect(19, 4, 3, 5);
  if (isPolice) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 8px Arial"; ctx.textAlign = "center";
    ctx.fillText("PD", 0, 3);
    var on = Math.sin(sirenPhase) > 0;
    ctx.fillStyle = on ? "#ff2a2a" : "#2a6bff";
    ctx.beginPath(); ctx.arc(-10, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? "#2a6bff" : "#ff2a2a";
    ctx.beginPath(); ctx.arc(2, 0, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawPlayerShape(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.angle);
  var bob = Math.sin(p.walkPhase) * 1.5;
  ctx.fillStyle = "#ff2e88";
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffd9a8";
  ctx.beginPath(); ctx.arc(3, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.arc(5, -3, 1.6, 0, Math.PI * 2); ctx.arc(5, 3, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#222"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(16, -6 + bob); ctx.moveTo(8, 6); ctx.lineTo(16, 6 - bob); ctx.stroke();
  ctx.restore();
}
function drawPedShape(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(1, 2, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(ped.angle);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e8b88a";
  ctx.beginPath(); ctx.arc(2, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
