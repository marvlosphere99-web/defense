(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  const TICK_MS = 1000;
  const WARMUP_TICKS = 20;
  const HISTORY_SIZE = 90;
  const BEACON_CV_THRESHOLD = 0.12;
  const BEACON_MIN_INTERVALS = 3;
  const CONNECTION_EVENT_MEMORY = 9; // keeps up to 8 intervals

  const METRIC_META = {
    pps:             { label: 'Packets/sec',       format: (v) => Math.round(v) + ' pps' },
    bps:             { label: 'Bytes/sec',         format: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + ' KB/s' : Math.round(v) + ' B/s') },
    avgPacketSize:   { label: 'Avg Packet Size',   format: (v) => Math.round(v) + ' B' },
    uniqueDestPorts: { label: 'Unique Dest Ports', format: (v) => v.toFixed(1) },
  };
  const METRIC_KEYS = Object.keys(METRIC_META);

  const SCENARIOS = {
    ddos: {
      label: 'DDoS Burst', duration: 15,
      apply: (n) => ({ ...n, pps: n.pps * 15, bps: n.bps * 12 }),
    },
    portscan: {
      label: 'Port Scan', duration: 15,
      apply: (n) => ({ ...n, pps: n.pps * 2.5, bps: n.bps * 1.3, uniqueDestPorts: n.uniqueDestPorts * 12 }),
    },
    exfiltration: {
      label: 'Data Exfiltration', duration: 15,
      apply: (n) => ({ ...n, pps: n.pps * 1.3, bps: n.bps * 8 }),
    },
    beaconing: {
      label: 'Beaconing', duration: 24,
      apply: (n) => n, // magnitude stays normal by design — only connection timing changes
      beaconPeriod: 4,
    },
  };

  // ---------- Utility ----------
  function gaussianJitter(spread) {
    const r = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    return r * spread;
  }
  function average(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function stddev(arr) {
    const m = average(arr);
    return Math.sqrt(average(arr.map((v) => (v - m) ** 2)));
  }

  // ---------- Synthetic traffic generator ----------
  function normalSample() {
    const pps = Math.max(1, 120 + gaussianJitter(25));
    const bps = Math.max(50, 60000 + gaussianJitter(12000));
    const uniqueDestPorts = Math.max(0.5, 3 + gaussianJitter(1.5));
    return { pps, bps, uniqueDestPorts };
  }

  function generateSample(activeScenario) {
    let n = normalSample();
    if (activeScenario && activeScenario.key !== 'beaconing') {
      n = SCENARIOS[activeScenario.key].apply(n);
    }
    const avgPacketSize = n.bps / n.pps;

    let connectionEvent;
    if (activeScenario && activeScenario.key === 'beaconing') {
      connectionEvent = activeScenario.ticksElapsed % SCENARIOS.beaconing.beaconPeriod === 0;
    } else {
      connectionEvent = Math.random() < 0.15;
    }

    return { pps: n.pps, bps: n.bps, uniqueDestPorts: n.uniqueDestPorts, avgPacketSize, connectionEvent };
  }

  // ---------- Baseline / detector state ----------
  let baseline = {}; // { key: {mean, variance} }
  let warmupSamples = {};
  let warmupDone = false;
  let alpha = parseFloat($('alphaSlider').value);
  let zThreshold = parseFloat($('thresholdSlider').value);

  function resetBaseline() {
    baseline = {};
    warmupSamples = {};
    METRIC_KEYS.forEach((k) => { warmupSamples[k] = []; });
    warmupDone = false;
  }
  resetBaseline();

  function updateBaseline(key, x) {
    const b = baseline[key];
    const diff = x - b.mean;
    const incr = alpha * diff;
    b.mean += incr;
    b.variance = (1 - alpha) * (b.variance + diff * incr);
  }

  function zScore(key, x) {
    const b = baseline[key];
    const sdFloor = Math.max(Math.sqrt(b.variance), Math.abs(b.mean) * 0.02, 1e-6);
    return (x - b.mean) / sdFloor;
  }

  // ---------- Simulation state ----------
  let running = true;
  let tickIndex = 0;
  let history = []; // { t, ...sample, score, isAnomaly, warmup, truth, reason }
  let connectionEventTicks = [];
  let activeScenario = null; // { key, ticksRemaining, ticksElapsed }
  let anomalyCount = 0;
  let TP = 0, FP = 0, FN = 0;

  function evaluateTick(sample) {
    const zScores = {};
    let maxAbsZ = 0, triggerKey = null;
    METRIC_KEYS.forEach((key) => {
      const z = zScore(key, sample[key]);
      zScores[key] = z;
      if (Math.abs(z) > maxAbsZ) { maxAbsZ = Math.abs(z); triggerKey = key; }
    });
    const magnitudeAnomaly = maxAbsZ > zThreshold;

    let intervalCV = null, beaconAnomaly = false;
    if (connectionEventTicks.length >= BEACON_MIN_INTERVALS + 1) {
      const intervals = [];
      for (let i = 1; i < connectionEventTicks.length; i++) {
        intervals.push(connectionEventTicks[i] - connectionEventTicks[i - 1]);
      }
      const m = average(intervals);
      intervalCV = m > 0 ? stddev(intervals) / m : null;
      beaconAnomaly = intervalCV !== null && intervalCV < BEACON_CV_THRESHOLD;
    }

    const isAnomaly = magnitudeAnomaly || beaconAnomaly;
    let reason = null;
    if (magnitudeAnomaly && beaconAnomaly) {
      reason = `${METRIC_META[triggerKey].label} anomalous (z=${maxAbsZ.toFixed(1)}) and connection timing is suspiciously regular (CV=${intervalCV.toFixed(2)})`;
    } else if (magnitudeAnomaly) {
      const b = baseline[triggerKey];
      reason = `${METRIC_META[triggerKey].label} = ${METRIC_META[triggerKey].format(sample[triggerKey])}, baseline ${METRIC_META[triggerKey].format(b.mean)} ± ${METRIC_META[triggerKey].format(Math.sqrt(b.variance))} (z=${maxAbsZ.toFixed(1)})`;
    } else if (beaconAnomaly) {
      reason = `Regular connection timing detected — interval CV=${intervalCV.toFixed(2)} (threshold ${BEACON_CV_THRESHOLD})`;
    }

    return { zScores, maxAbsZ, triggerKey, magnitudeAnomaly, beaconAnomaly, isAnomaly, reason, intervalCV };
  }

  // ---------- Alerts ----------
  const alertLog = $('alertLog');
  let alertCount = 0;
  function logAlert(msg) {
    const empty = alertLog.querySelector('.empty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'entry alert';
    const now = new Date();
    const t = now.toLocaleTimeString('en-GB', { hour12: false });
    div.innerHTML = `<span class="t">${t}</span><span class="p"></span>`;
    div.querySelector('.p').textContent = msg;
    alertLog.appendChild(div);
    alertCount++;
    if (alertCount > 200) { alertLog.removeChild(alertLog.children[1] || alertLog.firstChild); alertCount--; }
    alertLog.scrollTop = alertLog.scrollHeight;
  }
  function clearAlerts() {
    alertLog.replaceChildren();
    alertCount = 0;
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No alerts yet.';
    alertLog.appendChild(empty);
  }
  clearAlerts();

  // ---------- Main tick ----------
  function onTick() {
    tickIndex++;
    const sample = generateSample(activeScenario);

    if (sample.connectionEvent) {
      connectionEventTicks.push(tickIndex);
      if (connectionEventTicks.length > CONNECTION_EVENT_MEMORY) connectionEventTicks.shift();
    }

    let entry;
    if (!warmupDone) {
      METRIC_KEYS.forEach((k) => warmupSamples[k].push(sample[k]));
      entry = { t: tickIndex, ...sample, score: 0, isAnomaly: false, warmup: true, truth: null, reason: null };
      if (warmupSamples[METRIC_KEYS[0]].length >= WARMUP_TICKS) {
        METRIC_KEYS.forEach((k) => {
          const arr = warmupSamples[k];
          const mean = average(arr);
          const variance = average(arr.map((v) => (v - mean) ** 2));
          baseline[k] = { mean, variance };
        });
        warmupDone = true;
      }
    } else {
      const result = evaluateTick(sample);
      // Only fold this sample into the baseline if it *wasn't* flagged.
      // Updating on an anomalous point is the classic self-poisoning bug:
      // a single large outlier disproportionately inflates the EWMA
      // variance (the update's cross-term scales with diff²), which
      // widens "normal" enough that a sustained attack gets smoothed
      // away and stops being flagged after just a tick or two.
      if (!result.isAnomaly) {
        METRIC_KEYS.forEach((k) => updateBaseline(k, sample[k]));
      }

      const truth = activeScenario ? activeScenario.key : null;
      if (result.isAnomaly && truth) TP++;
      else if (result.isAnomaly && !truth) FP++;
      else if (!result.isAnomaly && truth) FN++;

      if (result.isAnomaly) {
        anomalyCount++;
        logAlert(result.reason);
      }

      entry = { t: tickIndex, ...sample, score: result.maxAbsZ, isAnomaly: result.isAnomaly, warmup: false, truth, reason: result.reason, triggerKey: result.triggerKey };
    }

    history.push(entry);
    if (history.length > HISTORY_SIZE) history.shift();

    if (activeScenario) {
      activeScenario.ticksElapsed++;
      activeScenario.ticksRemaining--;
      if (activeScenario.ticksRemaining <= 0) endScenario();
      else scenarioStatus.textContent = `${SCENARIOS[activeScenario.key].label} active — ${activeScenario.ticksRemaining}s remaining`;
    }

    renderAll();
  }

  // ---------- Scenario injection ----------
  const scenarioButtons = Array.from(document.querySelectorAll('.scenario-btn'));
  const scenarioStatus = $('scenarioStatus');

  function startScenario(key) {
    if (!warmupDone) return;
    activeScenario = { key, ticksElapsed: 0, ticksRemaining: SCENARIOS[key].duration };
    // A regime change invalidates the connection-timing window: leftover
    // irregular (or regular) intervals from before the switch would
    // otherwise blend into the CV calculation and mask — or fake — a
    // beaconing signal for many ticks after the transition.
    connectionEventTicks = [];
    scenarioButtons.forEach((b) => b.classList.toggle('active', b.dataset.scenario === key));
    scenarioStatus.textContent = `${SCENARIOS[key].label} active — ${activeScenario.ticksRemaining}s remaining`;
  }
  function endScenario() {
    activeScenario = null;
    connectionEventTicks = [];
    scenarioButtons.forEach((b) => b.classList.remove('active'));
    scenarioStatus.textContent = '';
  }
  scenarioButtons.forEach((b) => {
    b.addEventListener('click', () => {
      const key = b.dataset.scenario;
      if (activeScenario && activeScenario.key === key) endScenario();
      else startScenario(key);
    });
  });

  // ---------- Rendering ----------
  function renderTopStats() {
    $('statTicks').textContent = tickIndex;
    $('statAnomalies').textContent = anomalyCount;

    const last = history[history.length - 1];
    const isAnomalyNow = last && !last.warmup && last.isAnomaly;
    $('statusDot').classList.toggle('anomaly', !!isAnomalyNow);
    const statusEl = $('statStatus');
    if (!warmupDone) { statusEl.textContent = 'Learning…'; statusEl.classList.remove('anomaly'); }
    else if (isAnomalyNow) { statusEl.textContent = 'Anomaly'; statusEl.classList.add('anomaly'); }
    else { statusEl.textContent = 'Normal'; statusEl.classList.remove('anomaly'); }

    const precision = (TP + FP) > 0 ? TP / (TP + FP) : null;
    const recall = (TP + FN) > 0 ? TP / (TP + FN) : null;
    const f1 = (precision !== null && recall !== null && (precision + recall) > 0)
      ? (2 * precision * recall) / (precision + recall) : null;
    $('statF1').textContent = f1 !== null ? f1.toFixed(2) : '—';
    $('statPrecision').textContent = precision !== null ? (precision * 100).toFixed(0) + '%' : '—';
    $('statRecall').textContent = recall !== null ? (recall * 100).toFixed(0) + '%' : '—';
    $('statTP').textContent = TP;
    $('statFP').textContent = FP;
    $('statFN').textContent = FN;
  }

  function renderWarmupStatus() {
    const el = $('warmupStatus');
    if (warmupDone) { el.textContent = ''; return; }
    const n = warmupSamples[METRIC_KEYS[0]] ? warmupSamples[METRIC_KEYS[0]].length : 0;
    el.textContent = `Learning baseline… (${n}/${WARMUP_TICKS})`;
  }

  // ---------- Composite score chart ----------
  const scoreChart = $('scoreChart');
  const SC_W = 1000, SC_H = 220, SC_PAD_L = 36, SC_PAD_R = 10, SC_PAD_T = 12, SC_PAD_B = 10;

  function renderScoreChart() {
    scoreChart.replaceChildren();
    const plotW = SC_W - SC_PAD_L - SC_PAD_R;
    const plotH = SC_H - SC_PAD_T - SC_PAD_B;
    if (history.length === 0) return;

    const dataMax = Math.max(zThreshold * 1.2, ...history.map((h) => h.score));
    const yMax = dataMax * 1.1;
    const n = history.length;
    const xFor = (i) => SC_PAD_L + (plotW * i) / Math.max(1, HISTORY_SIZE - 1);
    const yFor = (score) => SC_PAD_T + plotH - (Math.min(score, yMax) / yMax) * plotH;
    const offset = HISTORY_SIZE - n;

    // Grid.
    for (let i = 0; i <= 4; i++) {
      const y = SC_PAD_T + (plotH * i) / 4;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'chart-grid-line');
      line.setAttribute('x1', SC_PAD_L); line.setAttribute('x2', SC_W - SC_PAD_R);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      scoreChart.appendChild(line);
    }

    // Attack ground-truth shading (contiguous runs where `truth` is set).
    let runStart = null;
    history.forEach((h, i) => {
      if (h.truth && runStart === null) runStart = i;
      const ending = (!h.truth || i === n - 1) && runStart !== null;
      if (ending) {
        const endIdx = h.truth ? i : i - 1;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', 'attack-band');
        rect.setAttribute('x', xFor(runStart + offset));
        rect.setAttribute('y', SC_PAD_T);
        rect.setAttribute('width', Math.max(1, xFor(endIdx + offset) - xFor(runStart + offset)));
        rect.setAttribute('height', plotH);
        scoreChart.appendChild(rect);
        runStart = null;
      }
    });

    // Threshold line.
    const ty = yFor(zThreshold);
    const tLine = document.createElementNS(SVG_NS, 'line');
    tLine.setAttribute('class', 'threshold-line');
    tLine.setAttribute('x1', SC_PAD_L); tLine.setAttribute('x2', SC_W - SC_PAD_R);
    tLine.setAttribute('y1', ty); tLine.setAttribute('y2', ty);
    scoreChart.appendChild(tLine);

    // Score line (dashed while still in warmup).
    let d = '';
    history.forEach((h, i) => {
      const x = xFor(i + offset), y = yFor(h.score);
      d += (i === 0 ? 'M ' : 'L ') + x + ' ' + y + ' ';
    });
    const anyWarmup = history.some((h) => h.warmup);
    const allWarmup = history.every((h) => h.warmup);
    if (!allWarmup) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'score-line');
      path.setAttribute('d', d);
      scoreChart.appendChild(path);
    } else if (anyWarmup) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'score-line warmup');
      path.setAttribute('d', d);
      scoreChart.appendChild(path);
    }

    // Points, red when anomalous.
    history.forEach((h, i) => {
      if (h.warmup) return;
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'score-point' + (h.isAnomaly ? ' anomaly' : ''));
      dot.setAttribute('cx', xFor(i + offset));
      dot.setAttribute('cy', yFor(h.score));
      dot.setAttribute('r', h.isAnomaly ? 3 : 1.6);
      scoreChart.appendChild(dot);
    });
  }

  // ---------- Metric sparkline tiles ----------
  const metricsGrid = $('metricsGrid');
  const metricTileEls = {};
  METRIC_KEYS.forEach((key) => {
    const tile = document.createElement('div');
    tile.className = 'metric-tile';
    tile.innerHTML = `
      <div class="metric-title">${METRIC_META[key].label}</div>
      <div class="metric-value" id="mv-${key}">—</div>
      <div class="metric-baseline" id="mb-${key}">baseline —</div>
      <svg class="metric-sparkline" id="ms-${key}" viewBox="0 0 300 60" preserveAspectRatio="none"></svg>
    `;
    metricsGrid.appendChild(tile);
    metricTileEls[key] = tile;
  });

  function renderMetricTiles() {
    if (history.length === 0) return;
    const last = history[history.length - 1];

    METRIC_KEYS.forEach((key) => {
      $(`mv-${key}`).textContent = METRIC_META[key].format(last[key]);
      const b = baseline[key];
      $(`mb-${key}`).textContent = b
        ? `baseline ${METRIC_META[key].format(b.mean)} ± ${METRIC_META[key].format(Math.sqrt(b.variance))}`
        : 'baseline —';

      const flagged = !last.warmup && last.isAnomaly && last.triggerKey === key;
      metricTileEls[key].classList.toggle('flagged', flagged);

      renderSparkline($(`ms-${key}`), history.map((h) => h[key]), b);
    });
  }

  function renderSparkline(svg, values, b) {
    svg.replaceChildren();
    const W = 300, H = 60, PAD = 4;
    const plotW = W - PAD * 2, plotH = H - PAD * 2;
    if (values.length < 2) return;

    const dataMin = Math.min(...values), dataMax = Math.max(...values);
    let lo = dataMin, hi = dataMax;
    if (b) { lo = Math.min(lo, b.mean - Math.sqrt(b.variance) * 2); hi = Math.max(hi, b.mean + Math.sqrt(b.variance) * 2); }
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }

    const xFor = (i) => PAD + (plotW * i) / Math.max(1, values.length - 1);
    const yFor = (v) => PAD + plotH - ((v - lo) / (hi - lo)) * plotH;

    if (b) {
      const sd = Math.sqrt(b.variance);
      const bandTop = yFor(b.mean + sd * 2);
      const bandBottom = yFor(b.mean - sd * 2);
      const band = document.createElementNS(SVG_NS, 'rect');
      band.setAttribute('class', 'spark-band');
      band.setAttribute('x', PAD);
      band.setAttribute('y', bandTop);
      band.setAttribute('width', plotW);
      band.setAttribute('height', Math.max(0, bandBottom - bandTop));
      svg.appendChild(band);
    }

    let d = '';
    values.forEach((v, i) => { d += (i === 0 ? 'M ' : 'L ') + xFor(i) + ' ' + yFor(v) + ' '; });
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'spark-line');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  function renderAll() {
    renderTopStats();
    renderWarmupStatus();
    renderScoreChart();
    renderMetricTiles();
  }

  // ---------- Controls ----------
  const playPauseBtn = $('playPauseBtn');
  const resetBtn = $('resetBtn');
  const thresholdSlider = $('thresholdSlider');
  const thresholdLabel = $('thresholdLabel');
  const alphaSlider = $('alphaSlider');
  const alphaLabel = $('alphaLabel');

  playPauseBtn.addEventListener('click', () => {
    running = !running;
    playPauseBtn.textContent = running ? 'Pause' : 'Resume';
    if (running) startLoop(); else stopLoop();
  });

  resetBtn.addEventListener('click', () => {
    tickIndex = 0;
    history = [];
    connectionEventTicks = [];
    activeScenario = null;
    anomalyCount = 0;
    TP = 0; FP = 0; FN = 0;
    resetBaseline();
    scenarioButtons.forEach((b) => b.classList.remove('active'));
    scenarioStatus.textContent = '';
    clearAlerts();
    renderAll();
  });

  thresholdSlider.addEventListener('input', () => {
    zThreshold = parseFloat(thresholdSlider.value);
    thresholdLabel.textContent = zThreshold.toFixed(1);
  });
  alphaSlider.addEventListener('input', () => {
    alpha = parseFloat(alphaSlider.value);
    alphaLabel.textContent = alpha.toFixed(2);
  });

  // ---------- Loop ----------
  let intervalId = null;
  function startLoop() {
    if (intervalId) return;
    intervalId = setInterval(() => {
      try { onTick(); }
      catch (err) { console.error('Behaviour Profiler: error during tick, continuing.', err); }
    }, TICK_MS);
  }
  function stopLoop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  // ---------- Init ----------
  thresholdLabel.textContent = zThreshold.toFixed(1);
  alphaLabel.textContent = alpha.toFixed(2);
  renderAll();
  startLoop();
})();
