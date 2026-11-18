/* Solmar Bay — synthesized sound effects with WebAudio. No audio files. */
var AudioSys = (function () {
  var ctx = null;
  var master = null;
  var muted = false;
  var engineOsc = null;
  var engineGain = null;
  var sirenTimer = 0;
  var musicTimer = 0;
  var musicStep = 0;

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    var f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 420;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }

  function setEngine(speed01, on) {
    if (!engineOsc || !engineGain) return;
    var target = on ? 0.03 + speed01 * 0.06 : 0.0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.08);
  }

  function stopEngine() {
    if (engineOsc) { try { engineOsc.stop(); } catch (e) {} engineOsc = null; engineGain = null; }
  }

  var api = {
    unlock: function () { ensure(); },
    setMuted: function (m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) stopEngine();
    },
    isMuted: function () { return muted; },
    shoot: function () { noise(0.09, 0.35, 2600); tone(190, 0.08, "square", 0.16, 60); },
    enemyShoot: function () { noise(0.08, 0.2, 1800); },
    crash: function () { noise(0.25, 0.5, 700); tone(70, 0.2, "sawtooth", 0.25, 35); },
    pickup: function () { tone(660, 0.09, "sine", 0.25); setTimeout(function () { tone(990, 0.14, "sine", 0.25); }, 90); },
    cash: function () { tone(880, 0.08, "triangle", 0.25); setTimeout(function () { tone(1174, 0.1, "triangle", 0.25); }, 80); setTimeout(function () { tone(1568, 0.16, "triangle", 0.22); }, 160); },
    mission: function () { var notes = [523, 659, 784, 1046]; for (var i = 0; i < notes.length; i++) { (function (n, d) { setTimeout(function () { tone(n, 0.16, "triangle", 0.28); }, d); })(notes[i], i * 110); } },
    fail: function () { tone(220, 0.3, "sawtooth", 0.2, 110); setTimeout(function () { tone(165, 0.4, "sawtooth", 0.2, 90); }, 220); },
    horn: function () { tone(370, 0.18, "square", 0.14); tone(466, 0.18, "square", 0.12); },
    door: function () { noise(0.12, 0.25, 900); },
    sirenTick: function () { if (muted) return; tone(740, 0.28, "sine", 0.07, 920); },
    startEngine: startEngine,
    setEngine: setEngine,
    stopEngine: stopEngine,
    update: function (dt, wanted) {
      if (!ctx || muted) return;
      sirenTimer -= dt;
      if (wanted > 0 && sirenTimer <= 0) { api.sirenTick(); sirenTimer = 0.62; }
      // Loose late-night synthwave bassline while driving around.
      musicTimer -= dt;
      if (musicTimer <= 0) {
        musicTimer = 0.21;
        var bass = [55, 0, 65.4, 0, 49, 0, 58.3, 0, 55, 0, 65.4, 0, 73.4, 82.4, 65.4, 0];
        var n = bass[musicStep % bass.length];
        musicStep++;
        if (n) tone(n, 0.19, "triangle", 0.05);
      }
    }
  };
  return api;
})();
