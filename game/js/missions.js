/* Solmar Bay — missions: story jobs with objectives, markers and payouts. */
var MISSIONS = [
  {
    id: "wheels",
    title: "FIRST WHEELS",
    giver: "Rico",
    intro: "Rico needs a ride. Jack any car on the street and bring it to Sunset Garage.",
    steps: [
      { type: "steal", text: "Steal a car (walk up to one and press E)" },
      { type: "goto", text: "Deliver the car to Sunset Garage", target: "garage", radius: 90 }
    ],
    payout: 400
  },
  {
    id: "beachrun",
    title: "BEACH RUN",
    giver: "Rico",
    intro: "A package is waiting at the end of Solmar Pier. Grab it, then drop it at Bayview Motel. The cops will notice — drive like it.",
    steps: [
      { type: "goto", text: "Pick up the package at Solmar Pier", target: "pier", radius: 70 },
      { type: "goto", text: "Deliver the package to Bayview Motel", target: "motel", radius: 90, wanted: 2 }
    ],
    payout: 900
  },
  {
    id: "bigscore",
    title: "THE BIG SCORE",
    giver: "Lucia",
    intro: "Solmar National Bank. Three guards, one vault, and a getaway. Take the cash and get back to the Safehouse alive.",
    steps: [
      { type: "goto", text: "Reach Solmar National Bank", target: "bank", radius: 100 },
      { type: "combat", text: "Take down the bank guards", count: 3 },
      { type: "goto", text: "Grab the cash and escape to the Safehouse", target: "safehouse", radius: 90, wanted: 3 }
    ],
    payout: 2500
  }
];

function missionTargetPos(id) {
  if (id === "pier") return { x: 1620, y: WORLD_H - 90 };
  var lm = City.landmarks[id];
  if (!lm) return { x: 1200, y: 700 };
  return { x: lm.x + lm.w / 2, y: lm.y + lm.h / 2 };
}

var MissionRunner = (function () {
  var state = {
    index: -1,        // -1 = no mission active, 0..2 = mission running
    step: 0,
    kills: 0,
    active: false,
    done: false,
    markerPulse: 0
  };

  function current() {
    if (state.index < 0 || state.index >= MISSIONS.length) return null;
    return MISSIONS[state.index];
  }

  function currentStep() {
    var m = current();
    if (!m) return null;
    return m.steps[state.step] || null;
  }

  function objectiveText() {
    if (state.done) return "All jobs done — free roam. Keep the city yours.";
    var m = current();
    if (!m) return "Visit Rico at the Safehouse to start work";
    var s = currentStep();
    if (!s) return m.title;
    if (s.type === "combat") return s.text + " (" + state.kills + "/" + s.count + ")";
    return s.text;
  }

  function startNext() {
    state.index++;
    state.step = 0;
    state.kills = 0;
    state.active = state.index < MISSIONS.length;
    state.done = state.index >= MISSIONS.length;
    var m = current();
    if (m) {
      var step = currentStep();
      if (step && step.wanted) { /* wanted set when step begins */ }
      return m;
    }
    return null;
  }

  function advance(world) {
    var m = current();
    if (!m) return null;
    state.step++;
    if (state.step >= m.steps.length) {
      var payout = m.payout;
      world.money += payout;
      AudioSys.cash();
      var finished = m;
      var next = startNext();
      return { completed: finished, payout: payout, next: next };
    }
    var step = currentStep();
    if (step && step.wanted) setWanted(step.wanted);
    if (step && step.type === "combat") spawnGuards(world);
    return { advanced: true, step: step };
  }

  function spawnGuards(world) {
    var bank = missionTargetPos("bank");
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI * 2;
      world.guards.push({
        x: bank.x + Math.cos(a) * 120, y: bank.y + Math.sin(a) * 90,
        angle: 0, health: 3, shootCd: rand(0.5, 1.5), speed: 95, walkPhase: 0
      });
    }
  }

  function checkStep(world) {
    var m = current();
    if (!m || !state.active) return null;
    var step = currentStep();
    if (!step) return null;
    if (step.type === "steal") {
      if (!world.player.onFoot) return advance(world);
      return null;
    }
    if (step.type === "goto") {
      var t = missionTargetPos(step.target);
      var px = world.player.x, py = world.player.y;
      if (dist(px, py, t.x, t.y) < step.radius) return advance(world);
      return null;
    }
    if (step.type === "combat") {
      if (state.kills >= step.count && world.guards.length === 0) return advance(world);
      return null;
    }
    return null;
  }

  function onGuardKilled() { state.kills++; }

  function reset() {
    state.index = -1; state.step = 0; state.kills = 0; state.active = false; state.done = false;
  }

  function saveData() { return { index: state.index, step: state.step, kills: state.kills, active: state.active, done: state.done }; }
  function loadData(d) {
    if (!d) return;
    state.index = d.index; state.step = d.step; state.kills = d.kills; state.active = d.active; state.done = d.done;
  }

  return {
    state: state,
    current: current,
    currentStep: currentStep,
    objectiveText: objectiveText,
    startNext: startNext,
    checkStep: checkStep,
    onGuardKilled: onGuardKilled,
    reset: reset,
    saveData: saveData,
    loadData: loadData
  };
})();
