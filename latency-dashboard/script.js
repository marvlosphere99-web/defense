(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  const HISTORY_SIZE = 150; // samples kept for the line chart / histogram window

  const presets = {
    fiber:     { baseLatency: 1,   hops: 3,  jitter: 1,   loss: 0,   bandwidth: 1000, rate: 8 },
    wifi:      { baseLatency: 5,   hops: 4,  jitter: 3,   loss: 0.5, bandwidth: 100,  rate: 6 },
    '4g':      { baseLatency: 40,  hops: 6,  jitter: 15,  loss: 1,   bandwidth: 50,   rate: 5 },
    satellite: { baseLatency: 550, hops: 3,  jitter: 40,  loss: 2,   bandwidth: 25,   rate: 3 },
    dialup:    { baseLatency: 150, hops: 5,  jitter: 30,  loss: 3,   bandwidth: 0.056, rate: 1 },
    congested: { baseLatency: 80,  hops: 10, jitter: 60,  loss: 8,   bandwidth: 5,    rate: 4 },
  };

  // Bandwidth slider is log-scaled (0-100) across 0.05 - 1000 Mbps, since a
  // linear slider can't usefully cover both dial-up and gigabit ranges.
  const BW_MIN = 0.05, BW_MAX = 1000;
  const bwLogMin = Math.log10(BW_MIN), bwLogMax = Math.log10(BW_MAX);
  function sliderToBandwidth(pos) {
    return Math.pow(10, bwLogMin + (pos / 100) * (bwLogMax - bwLogMin));
  }
  function bandwidthToSlider(mbps) {
    const clamped = Math.min(BW_MAX, Math.max(BW_MIN, mbps));
    return ((Math.log10(clamped) - bwLogMin) / (bwLogMax - bwLogMin)) * 100;
  }

  function formatMs(v) {
    if (v >= 100) return Math.round(v) + ' ms';
    if (v >= 10) return v.toFixed(1) + ' ms';
    return v.toFixed(2) + ' ms';
  }
  function formatMbps(v) {
    if (v >= 10) return Math.round(v) + '';
    if (v >= 1) return v.toFixed(1);
    return v.toFixed(3);
  }

  // ---------- DOM refs ----------
  const presetSelect = $('presetSelect');
  const baseLatencySlider = $('baseLatencySlider');
  const baseLatencyLabel = $('baseLatencyLabel');
  const hopsSlider = $('hopsSlider');
  const hopsLabel = $('hopsLabel');
  const jitterSlider = $('jitterSlider');
  const jitterLabel = $('jitterLabel');
  const lossSlider = $('lossSlider');
  const lossLabel = $('lossLabel');
  const bandwidthSlider = $('bandwidthSlider');
  const bandwidthLabel = $('bandwidthLabel');
  const rateSlider = $('rateSlider');
  const rateLabel = $('rateLabel');
  const playPauseBtn = $('playPauseBtn');
  const resetBtn = $('resetBtn');

  const statSent = $('statSent');
  const statDelivered = $('statDelivered');
  const statDropped = $('statDropped');
  const statAvg = $('statAvg');
  const statMin = $('statMin');
  const statMax = $('statMax');
  const statJitter = $('statJitter');
  const statLoss = $('statLoss');
  const histWindowLabel = $('histWindowLabel');

  const lineChart = $('lineChart');
  const histogram = $('histogram');

  histWindowLabel.textContent = HISTORY_SIZE;
  bandwidthLabel.textContent = formatMbps(sliderToBandwidth(parseFloat(bandwidthSlider.value)));

  // ---------- Parameters ----------
  function params() {
    return {
      baseLatency: parseFloat(baseLatencySlider.value),
      hops: parseInt(hopsSlider.value, 10),
      jitter: parseFloat(jitterSlider.value),
      lossPct: parseFloat(lossSlider.value),
      bandwidth: sliderToBandwidth(parseFloat(bandwidthSlider.value)),
      rate: parseFloat(rateSlider.value),
    };
  }

  function applyPreset(key) {
    const p = presets[key];
    if (!p) return;
    baseLatencySlider.value = p.baseLatency;
    hopsSlider.value = p.hops;
    jitterSlider.value = p.jitter;
    lossSlider.value = p.loss;
    bandwidthSlider.value = bandwidthToSlider(p.bandwidth);
    rateSlider.value = p.rate;
    syncLabels();
  }

  function syncLabels() {
    baseLatencyLabel.textContent = baseLatencySlider.value;
    hopsLabel.textContent = hopsSlider.value;
    jitterLabel.textContent = jitterSlider.value;
    lossLabel.textContent = lossSlider.value;
    bandwidthLabel.textContent = formatMbps(sliderToBandwidth(parseFloat(bandwidthSlider.value)));
    rateLabel.textContent = parseFloat(rateSlider.value).toFixed(1);
  }

  [baseLatencySlider, hopsSlider, jitterSlider, lossSlider, bandwidthSlider, rateSlider].forEach((el) => {
    el.addEventListener('input', () => {
      presetSelect.value = 'custom';
      syncLabels();
    });
  });

  presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));

  // ---------- Simulation state ----------
  let running = true;
  let history = []; // { latency: number|null, dropped: bool }
  let sentCount = 0, deliveredCount = 0, droppedCount = 0;
  let sum = 0, sumSq = 0, min = Infinity, max = -Infinity;
  let spawnAccumulator = 0;

  function resetSimulation() {
    history = [];
    sentCount = 0; deliveredCount = 0; droppedCount = 0;
    sum = 0; sumSq = 0; min = Infinity; max = -Infinity;
    spawnAccumulator = 0;
    renderStats();
    renderLineChart();
    renderHistogram();
  }

  function gaussianJitter(spread) {
    // Sum of 3 uniforms approximates a bell curve (Irwin-Hall), centered
    // at 0 with an effective range of roughly ±spread.
    const r = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    return r * spread;
  }

  function simulateOnePacket() {
    const { baseLatency, hops, jitter, lossPct, bandwidth } = params();
    sentCount++;

    const dropped = Math.random() * 100 < lossPct;
    if (dropped) {
      droppedCount++;
      history.push({ latency: null, dropped: true });
    } else {
      const propagation = baseLatency * hops;
      // ~1500-byte (12000-bit) packet's serialization delay at this bandwidth.
      const serialization = 12 / Math.max(bandwidth, 0.001);
      const latency = Math.max(0.1, propagation + serialization + gaussianJitter(jitter));

      deliveredCount++;
      sum += latency;
      sumSq += latency * latency;
      if (latency < min) min = latency;
      if (latency > max) max = latency;

      history.push({ latency, dropped: false });
    }

    if (history.length > HISTORY_SIZE) history.shift();
  }

  // ---------- Stats rendering ----------
  function renderStats() {
    statSent.textContent = sentCount;
    statDelivered.textContent = deliveredCount;
    statDropped.textContent = droppedCount;
    statAvg.textContent = deliveredCount ? formatMs(sum / deliveredCount) : '0 ms';
    statMin.textContent = deliveredCount ? formatMs(min) : '—';
    statMax.textContent = deliveredCount ? formatMs(max) : '—';
    if (deliveredCount > 1) {
      const mean = sum / deliveredCount;
      const variance = Math.max(0, sumSq / deliveredCount - mean * mean);
      statJitter.textContent = formatMs(Math.sqrt(variance));
    } else {
      statJitter.textContent = '—';
    }
    statLoss.textContent = sentCount ? ((droppedCount / sentCount) * 100).toFixed(1) + '%' : '0%';
  }

  // ---------- Line chart ----------
  const LC_W = 1000, LC_H = 280, LC_PAD_L = 46, LC_PAD_R = 10, LC_PAD_T = 14, LC_PAD_B = 26;

  function renderLineChart() {
    lineChart.replaceChildren();
    const plotW = LC_W - LC_PAD_L - LC_PAD_R;
    const plotH = LC_H - LC_PAD_T - LC_PAD_B;

    const delivered = history.filter(h => !h.dropped).map(h => h.latency);
    const dataMax = delivered.length ? Math.max(...delivered) : 10;
    const yMax = Math.max(10, dataMax * 1.15);

    // Grid lines + y-axis labels (4 bands).
    const bands = 4;
    for (let i = 0; i <= bands; i++) {
      const y = LC_PAD_T + (plotH * i) / bands;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'chart-grid-line');
      line.setAttribute('x1', LC_PAD_L); line.setAttribute('x2', LC_W - LC_PAD_R);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      lineChart.appendChild(line);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'chart-axis-label');
      label.setAttribute('x', LC_PAD_L - 8);
      label.setAttribute('y', y + 4);
      label.setAttribute('text-anchor', 'end');
      const value = yMax * (1 - i / bands);
      label.textContent = Math.round(value);
      lineChart.appendChild(label);
    }

    if (history.length < 2) return;

    const n = history.length;
    const xFor = (i) => LC_PAD_L + (plotW * i) / Math.max(1, HISTORY_SIZE - 1);
    const yFor = (latency) => LC_PAD_T + plotH - (Math.min(latency, yMax) / yMax) * plotH;
    const baseline = LC_PAD_T + plotH;

    // Split into contiguous runs of delivered points (a drop breaks the
    // run — a gap is visually honest about a lost sample). Each run gets
    // its own explicitly-closed area polygon; leaving a subpath unclosed
    // makes SVG fill auto-close it with a straight line back to that
    // subpath's own start point, which — since start (baseline) and end
    // (last data point) aren't at the same x — draws a stray diagonal.
    const runs = [];
    let current = null;
    history.forEach((h, i) => {
      if (h.dropped || h.latency == null) { current = null; return; }
      const point = { x: xFor(i + (HISTORY_SIZE - n)), y: yFor(h.latency) };
      if (!current) { current = []; runs.push(current); }
      current.push(point);
    });

    let lineD = '';
    let areaD = '';
    runs.forEach((run) => {
      if (run.length === 0) return;
      lineD += `M ${run[0].x} ${run[0].y} ` + run.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' ';

      if (run.length === 1) {
        // A lone delivered point between drops: draw a thin sliver so it's
        // still visible in the area fill instead of collapsing to nothing.
        areaD += `M ${run[0].x} ${baseline} L ${run[0].x} ${run[0].y} Z `;
      } else {
        areaD += `M ${run[0].x} ${baseline} ` + run.map(p => `L ${p.x} ${p.y}`).join(' ')
          + ` L ${run[run.length - 1].x} ${baseline} Z `;
      }
    });

    if (lineD) {
      const area = document.createElementNS(SVG_NS, 'path');
      area.setAttribute('class', 'latency-area');
      area.setAttribute('d', areaD);
      lineChart.appendChild(area);

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'latency-line');
      path.setAttribute('d', lineD);
      lineChart.appendChild(path);
    }

    // Dropped-packet ticks along the bottom axis.
    history.forEach((h, i) => {
      if (!h.dropped) return;
      const x = xFor(i + (HISTORY_SIZE - n));
      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('class', 'drop-tick');
      tick.setAttribute('x1', x); tick.setAttribute('x2', x);
      tick.setAttribute('y1', LC_PAD_T + plotH - 10);
      tick.setAttribute('y2', LC_PAD_T + plotH);
      lineChart.appendChild(tick);
    });
  }

  // ---------- Histogram ----------
  const HG_W = 1000, HG_H = 220, HG_PAD_L = 46, HG_PAD_R = 10, HG_PAD_T = 10, HG_PAD_B = 26;
  const BUCKET_COUNT = 16;

  function renderHistogram() {
    histogram.replaceChildren();
    const plotW = HG_W - HG_PAD_L - HG_PAD_R;
    const plotH = HG_H - HG_PAD_T - HG_PAD_B;

    const delivered = history.filter(h => !h.dropped).map(h => h.latency);
    if (delivered.length === 0) {
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'hist-empty-label');
      label.setAttribute('x', HG_W / 2);
      label.setAttribute('y', HG_H / 2);
      label.textContent = 'No data yet — start the simulation.';
      histogram.appendChild(label);
      return;
    }

    const dataMax = Math.max(...delivered);
    const dataMin = Math.min(...delivered);
    const span = Math.max(1, dataMax - dataMin);
    const bucketWidth = span / BUCKET_COUNT;
    const buckets = new Array(BUCKET_COUNT).fill(0);
    delivered.forEach((v) => {
      let idx = Math.floor((v - dataMin) / bucketWidth);
      if (idx >= BUCKET_COUNT) idx = BUCKET_COUNT - 1;
      if (idx < 0) idx = 0;
      buckets[idx]++;
    });
    const maxCount = Math.max(...buckets);

    const barGap = 2;
    const barW = plotW / BUCKET_COUNT - barGap;

    buckets.forEach((count, i) => {
      const barH = (count / maxCount) * plotH;
      const x = HG_PAD_L + i * (plotW / BUCKET_COUNT);
      const y = HG_PAD_T + plotH - barH;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'hist-bar');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', Math.max(1, barW));
      rect.setAttribute('height', barH);
      const bucketStart = dataMin + i * bucketWidth;
      const bucketEnd = bucketStart + bucketWidth;
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${formatMs(bucketStart)} – ${formatMs(bucketEnd)}: ${count} packet${count === 1 ? '' : 's'}`;
      rect.appendChild(title);
      histogram.appendChild(rect);
    });

    [dataMin, (dataMin + dataMax) / 2, dataMax].forEach((v, i) => {
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'chart-axis-label');
      label.setAttribute('x', HG_PAD_L + (plotW * i) / 2);
      label.setAttribute('y', HG_H - 6);
      label.setAttribute('text-anchor', i === 0 ? 'start' : i === 2 ? 'end' : 'middle');
      label.textContent = formatMs(v);
      histogram.appendChild(label);
    });
  }

  // ---------- Controls ----------
  playPauseBtn.addEventListener('click', () => {
    running = !running;
    playPauseBtn.textContent = running ? 'Pause' : 'Resume';
  });

  resetBtn.addEventListener('click', () => {
    resetSimulation();
  });

  // ---------- Main loop ----------
  let lastTime = performance.now();

  function tick(dt) {
    const { rate } = params();
    spawnAccumulator += (dt / 1000) * rate;
    while (spawnAccumulator >= 1) {
      simulateOnePacket();
      spawnAccumulator -= 1;
    }
  }

  function frame(now) {
    try {
      const dt = Math.min(now - lastTime, 100);
      lastTime = now;
      if (running) {
        tick(dt);
        renderStats();
        renderLineChart();
        renderHistogram();
      }
    } catch (err) {
      console.error('Latency Dashboard: unexpected error in simulation frame.', err);
    } finally {
      requestAnimationFrame(frame);
    }
  }

  // ---------- Init ----------
  syncLabels();
  renderStats();
  renderLineChart();
  renderHistogram();
  requestAnimationFrame(frame);
})();
