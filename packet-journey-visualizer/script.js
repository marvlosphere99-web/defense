(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('networkSvg');

  // ---------- Node type / legend definitions ----------
  // Every node carries a `type` used to color it and to populate the legend.
  const nodeTypes = {
    client:   { label: 'Client Device',        color: '#4fd1c5' },
    network:  { label: 'Network Device',       color: '#4f8dfd' },
    security: { label: 'Security (Firewall)',  color: '#ff5d6c' },
    gateway:  { label: 'Gateway / Load Balancer', color: '#f5a623' },
    compute:  { label: 'Server / Service',     color: '#c084fc' },
    storage:  { label: 'Database / Cache / DNS', color: '#4fd17d' },
    queue:    { label: 'Message Queue',        color: '#facc15' },
    cloud:    { label: 'Internet / Edge / ISP', color: '#94a3b8' },
  };

  // ---------- Topology definitions ----------
  // Each topology has: nodes (id -> {x,y,label,sub,type}), edges (pairs), routes (arrays of node ids)
  const topologies = {

    enterprise: {
      name: 'Enterprise LAN',
      nodes: {
        client1:  { x: 90,  y: 150, label: 'Client A',      sub: '192.168.1.10', type: 'client' },
        client2:  { x: 90,  y: 420, label: 'Client B',      sub: '192.168.1.14', type: 'client' },
        router:   { x: 280, y: 285, label: 'Router',        sub: '10.0.0.1',     type: 'network' },
        firewall: { x: 440, y: 285, label: 'Firewall',      sub: 'inspect',      type: 'security' },
        dns:      { x: 440, y: 480, label: 'DNS Server',    sub: '53',           type: 'storage' },
        switch_:  { x: 600, y: 285, label: 'Switch',        sub: 'L2',           type: 'network' },
        lb:       { x: 760, y: 180, label: 'Load Balancer', sub: '443',          type: 'gateway' },
        web1:     { x: 920, y: 90,  label: 'Web Server 1',  sub: '.21',          type: 'compute' },
        web2:     { x: 920, y: 260, label: 'Web Server 2',  sub: '.22',          type: 'compute' },
        db:       { x: 760, y: 420, label: 'Database',      sub: '5432',         type: 'storage' },
      },
      edges: [
        ['client1', 'router'], ['client2', 'router'],
        ['router', 'firewall'], ['firewall', 'dns'], ['firewall', 'switch_'],
        ['switch_', 'lb'], ['switch_', 'db'], ['lb', 'web1'], ['lb', 'web2'],
      ],
      routes: [
        ['client1', 'router', 'firewall', 'switch_', 'lb', 'web1'],
        ['client2', 'router', 'firewall', 'switch_', 'lb', 'web2'],
        ['client1', 'router', 'firewall', 'switch_', 'lb', 'web2'],
        ['client2', 'router', 'firewall', 'switch_', 'lb', 'web1'],
        ['client1', 'router', 'firewall', 'dns'],
        ['client2', 'router', 'firewall', 'dns'],
        ['client1', 'router', 'firewall', 'switch_', 'db'],
        ['client2', 'router', 'firewall', 'switch_', 'db'],
      ],
    },

    home: {
      name: 'Home Network',
      nodes: {
        laptop:   { x: 80,  y: 120, label: 'Laptop',     sub: 'Wi-Fi', type: 'client' },
        phone:    { x: 80,  y: 280, label: 'Phone',      sub: 'Wi-Fi', type: 'client' },
        smarttv:  { x: 80,  y: 440, label: 'Smart TV',   sub: 'Wi-Fi', type: 'client' },
        wifi:     { x: 280, y: 280, label: 'Wi-Fi Router', sub: '192.168.0.1', type: 'network' },
        modem:    { x: 460, y: 280, label: 'Modem',      sub: 'cable',  type: 'network' },
        isp:      { x: 640, y: 280, label: 'ISP',        sub: 'uplink', type: 'cloud' },
        internet: { x: 810, y: 280, label: 'Internet',   sub: 'backbone', type: 'cloud' },
        website:  { x: 960, y: 170, label: 'Website',    sub: 'https',  type: 'compute' },
        stream:   { x: 960, y: 390, label: 'Streaming CDN', sub: 'video', type: 'compute' },
      },
      edges: [
        ['laptop', 'wifi'], ['phone', 'wifi'], ['smarttv', 'wifi'],
        ['wifi', 'modem'], ['modem', 'isp'], ['isp', 'internet'],
        ['internet', 'website'], ['internet', 'stream'],
      ],
      routes: [
        ['laptop', 'wifi', 'modem', 'isp', 'internet', 'website'],
        ['phone', 'wifi', 'modem', 'isp', 'internet', 'website'],
        ['smarttv', 'wifi', 'modem', 'isp', 'internet', 'stream'],
        ['laptop', 'wifi', 'modem', 'isp', 'internet', 'stream'],
        ['phone', 'wifi', 'modem', 'isp', 'internet', 'stream'],
      ],
    },

    cloud: {
      name: 'Cloud / CDN',
      nodes: {
        userA:   { x: 70,  y: 150, label: 'User (US)',    sub: 'browser', type: 'client' },
        userB:   { x: 70,  y: 420, label: 'User (EU)',    sub: 'browser', type: 'client' },
        edgeUS:  { x: 270, y: 150, label: 'CDN Edge US',  sub: 'cache',   type: 'cloud' },
        edgeEU:  { x: 270, y: 420, label: 'CDN Edge EU',  sub: 'cache',   type: 'cloud' },
        originLb:{ x: 490, y: 285, label: 'Origin LB',    sub: 'https',   type: 'gateway' },
        app1:    { x: 690, y: 160, label: 'App Server 1', sub: 'node',    type: 'compute' },
        app2:    { x: 690, y: 410, label: 'App Server 2', sub: 'node',    type: 'compute' },
        cache:   { x: 900, y: 160, label: 'Redis Cache',  sub: '6379',    type: 'storage' },
        db:      { x: 900, y: 410, label: 'Database',     sub: '5432',    type: 'storage' },
      },
      edges: [
        ['userA', 'edgeUS'], ['userB', 'edgeEU'],
        ['edgeUS', 'originLb'], ['edgeEU', 'originLb'],
        ['originLb', 'app1'], ['originLb', 'app2'],
        ['app1', 'cache'], ['app2', 'db'],
      ],
      routes: [
        ['userA', 'edgeUS', 'originLb', 'app1', 'cache'],
        ['userA', 'edgeUS', 'originLb', 'app2', 'db'],
        ['userB', 'edgeEU', 'originLb', 'app1', 'cache'],
        ['userB', 'edgeEU', 'originLb', 'app2', 'db'],
      ],
    },

    microservices: {
      name: 'Microservices',
      nodes: {
        client:  { x: 80,  y: 285, label: 'Client',        sub: 'app',    type: 'client' },
        gateway: { x: 290, y: 285, label: 'API Gateway',   sub: ':443',   type: 'gateway' },
        auth:    { x: 520, y: 110, label: 'Auth Service',  sub: ':8081',  type: 'compute' },
        order:   { x: 520, y: 285, label: 'Order Service', sub: ':8082',  type: 'compute' },
        payment: { x: 520, y: 460, label: 'Payment Service', sub: ':8083', type: 'compute' },
        queue:   { x: 740, y: 370, label: 'Message Queue', sub: 'amqp',   type: 'queue' },
        dbc:     { x: 940, y: 285, label: 'DB Cluster',    sub: 'shards', type: 'storage' },
      },
      edges: [
        ['client', 'gateway'],
        ['gateway', 'auth'], ['gateway', 'order'], ['gateway', 'payment'],
        ['auth', 'dbc'], ['order', 'queue'], ['payment', 'queue'],
        ['queue', 'dbc'],
      ],
      routes: [
        ['client', 'gateway', 'auth', 'dbc'],
        ['client', 'gateway', 'order', 'queue', 'dbc'],
        ['client', 'gateway', 'payment', 'queue', 'dbc'],
      ],
    },

    isp: {
      name: 'ISP Backbone',
      nodes: {
        home:    { x: 70,  y: 285, label: 'Home Client', sub: 'CPE',    type: 'client' },
        pop:     { x: 260, y: 285, label: 'ISP POP',     sub: 'access', type: 'network' },
        core1:   { x: 460, y: 150, label: 'Core Router 1', sub: 'BGP',  type: 'network' },
        core2:   { x: 460, y: 420, label: 'Core Router 2', sub: 'BGP',  type: 'network' },
        ix:      { x: 660, y: 285, label: 'IX',           sub: 'peering', type: 'cloud' },
        remote:  { x: 850, y: 285, label: 'Remote ISP',   sub: 'transit', type: 'cloud' },
        dest:    { x: 970, y: 285, label: 'Dest Server',  sub: 'origin', type: 'compute' },
      },
      edges: [
        ['home', 'pop'], ['pop', 'core1'], ['pop', 'core2'],
        ['core1', 'ix'], ['core2', 'ix'], ['ix', 'remote'], ['remote', 'dest'],
      ],
      routes: [
        ['home', 'pop', 'core1', 'ix', 'remote', 'dest'],
        ['home', 'pop', 'core2', 'ix', 'remote', 'dest'],
      ],
    },
  };

  const protocolColors = { TCP: '#4f8dfd', UDP: '#4fd17d', ICMP: '#f5a623', HTTP: '#c084fc' };
  const baseLatency = { TCP: 220, UDP: 140, ICMP: 90, HTTP: 260 }; // ms per hop baseline
  const MAX_LOG_ENTRIES = 300;
  const STORAGE_KEY = 'packetVisualizer.settings.v1';

  // ---------- Mutable topology state ----------
  let nodes = {};
  let routes = [];
  let nodeRings = {};

  const linkLayer = document.createElementNS(SVG_NS, 'g');
  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  const packetLayer = document.createElementNS(SVG_NS, 'g');
  svg.append(linkLayer, nodeLayer, packetLayer);

  function buildTopology(id) {
    const topo = topologies[id] || topologies.enterprise;
    nodes = topo.nodes;
    routes = topo.routes;
    nodeRings = {};

    linkLayer.replaceChildren();
    nodeLayer.replaceChildren();
    packetLayer.replaceChildren();
    packets = [];

    topo.edges.forEach(([a, b]) => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', nodes[a].x);
      line.setAttribute('y1', nodes[a].y);
      line.setAttribute('x2', nodes[b].x);
      line.setAttribute('y2', nodes[b].y);
      line.setAttribute('class', 'link-line');
      linkLayer.appendChild(line);
    });

    Object.entries(nodes).forEach(([nid, n]) => {
      const g = document.createElementNS(SVG_NS, 'g');

      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', n.x);
      ring.setAttribute('cy', n.y);
      ring.setAttribute('r', 26);
      ring.setAttribute('class', 'node-ring');
      nodeRings[nid] = ring;

      const typeColor = (nodeTypes[n.type] || {}).color || '#5a6b87';
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', n.x);
      circle.setAttribute('cy', n.y);
      circle.setAttribute('r', 22);
      circle.setAttribute('class', 'node-circle');
      circle.style.stroke = typeColor;

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', n.x);
      label.setAttribute('y', n.y + 40);
      label.setAttribute('class', 'node-label');
      label.textContent = n.label;

      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('x', n.x);
      sub.setAttribute('y', n.y + 54);
      sub.setAttribute('class', 'node-sub');
      sub.textContent = n.sub;

      g.append(ring, circle, label, sub);
      nodeLayer.appendChild(g);
    });

    renderLegend(topo);
    resetStats();
    spawnAccumulator = 0;

    log(`Switched topology to <b>${topo.name}</b>.`);
  }

  const legendOrder = ['client', 'network', 'security', 'gateway', 'compute', 'storage', 'queue', 'cloud'];
  const nodeLegend = document.getElementById('nodeLegend');

  function renderLegend(topo) {
    const usedTypes = new Set(Object.values(topo.nodes).map(n => n.type));
    nodeLegend.replaceChildren();
    legendOrder
      .filter(t => usedTypes.has(t))
      .forEach(t => {
        const info = nodeTypes[t];
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.title = info.label;
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        dot.style.color = info.color;
        item.append(dot, document.createTextNode(info.label));
        nodeLegend.appendChild(item);
      });
  }

  function pulseNode(id) {
    const ring = nodeRings[id];
    if (!ring) return;
    ring.classList.remove('active');
    void ring.getBoundingClientRect(); // force reflow to restart animation
    ring.classList.add('active');
  }

  // ---------- Controls ----------
  const topologySelect = document.getElementById('topologySelect');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const sendOneBtn = document.getElementById('sendOneBtn');
  const autoSendBtn = document.getElementById('autoSendBtn');
  const rateField = document.getElementById('rateField');
  const rateSlider = document.getElementById('rateSlider');
  const rateLabel = document.getElementById('rateLabel');
  const speedSlider = document.getElementById('speedSlider');
  const latLabel = document.getElementById('latLabel');
  const lossSlider = document.getElementById('lossSlider');
  const lossLabel = document.getElementById('lossLabel');
  const protoChecks = Array.from(document.querySelectorAll('.proto-check'));
  const resetBtn = document.getElementById('resetBtn');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const eventLog = document.getElementById('eventLog');

  const statSent = document.getElementById('statSent');
  const statDelivered = document.getElementById('statDelivered');
  const statDropped = document.getElementById('statDropped');
  const statLatency = document.getElementById('statLatency');

  // ---------- Settings persistence ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn('Packet Visualizer: could not read saved settings.', err);
      return {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        topology: topologySelect.value,
        rate: rateSlider.value,
        speed: speedSlider.value,
        loss: lossSlider.value,
        autoSend: autoSendEnabled,
        protocols: protoChecks.filter(c => c.checked).map(c => c.value),
      }));
    } catch (err) {
      console.warn('Packet Visualizer: could not save settings.', err);
    }
  }

  const saved = loadSettings();

  let running = true;
  let autoSendEnabled = saved.autoSend !== undefined ? saved.autoSend : true;
  let sendRate = saved.rate !== undefined ? parseFloat(saved.rate) : parseFloat(rateSlider.value);
  let speedMultiplier = saved.speed !== undefined ? parseFloat(saved.speed) : parseFloat(speedSlider.value);
  let lossPct = saved.loss !== undefined ? parseFloat(saved.loss) : parseFloat(lossSlider.value);

  // Apply restored values to the controls themselves.
  rateSlider.value = sendRate;
  speedSlider.value = speedMultiplier;
  lossSlider.value = lossPct;
  rateLabel.textContent = sendRate === 0 ? 'Off' : sendRate.toFixed(1);
  latLabel.textContent = speedMultiplier.toFixed(1) + 'x';
  lossLabel.textContent = lossPct + '%';
  if (Array.isArray(saved.protocols) && saved.protocols.length > 0) {
    protoChecks.forEach(c => { c.checked = saved.protocols.includes(c.value); });
  }
  if (saved.topology && topologies[saved.topology]) {
    topologySelect.value = saved.topology;
  }
  setAutoSendUI(autoSendEnabled);

  rateSlider.addEventListener('input', () => {
    sendRate = parseFloat(rateSlider.value);
    rateLabel.textContent = sendRate === 0 ? 'Off' : sendRate.toFixed(1);
    saveSettings();
  });
  speedSlider.addEventListener('input', () => {
    speedMultiplier = parseFloat(speedSlider.value);
    latLabel.textContent = speedMultiplier.toFixed(1) + 'x';
    saveSettings();
  });
  lossSlider.addEventListener('input', () => {
    lossPct = parseFloat(lossSlider.value);
    lossLabel.textContent = lossPct + '%';
    saveSettings();
  });

  playPauseBtn.addEventListener('click', () => {
    running = !running;
    playPauseBtn.textContent = running ? 'Pause' : 'Resume';
    playPauseBtn.setAttribute('aria-pressed', String(!running));
  });

  function setAutoSendUI(enabled) {
    autoSendBtn.textContent = `Auto-Send: ${enabled ? 'ON' : 'OFF'}`;
    autoSendBtn.setAttribute('aria-pressed', String(enabled));
    rateField.classList.toggle('disabled', !enabled);
  }

  autoSendBtn.addEventListener('click', () => {
    autoSendEnabled = !autoSendEnabled;
    setAutoSendUI(autoSendEnabled);
    log(`Auto-send turned <b>${autoSendEnabled ? 'ON' : 'OFF'}</b>.`);
    saveSettings();
  });

  resetBtn.addEventListener('click', () => {
    packets.forEach(p => p.el && p.el.remove());
    packets = [];
    resetStats();
    spawnAccumulator = 0;
    log('Simulation reset (packets and stats cleared).');
  });

  clearLogBtn.addEventListener('click', () => {
    eventLog.replaceChildren();
    logCount = 0;
  });

  sendOneBtn.addEventListener('click', () => spawnPacket());

  topologySelect.addEventListener('change', () => {
    buildTopology(topologySelect.value);
    saveSettings();
  });

  protoChecks.forEach(c => c.addEventListener('change', saveSettings));

  function activeProtocols() {
    return protoChecks.filter(c => c.checked).map(c => c.value);
  }

  function resetStats() {
    sentCount = 0; deliveredCount = 0; droppedCount = 0; totalDeliveredLatency = 0;
    statSent.textContent = 0;
    statDelivered.textContent = 0;
    statDropped.textContent = 0;
    statLatency.textContent = '0 ms';
  }

  // ---------- Logging ----------
  let logCount = 0;
  function log(msg, cls) {
    const div = document.createElement('div');
    div.className = 'entry' + (cls ? ' ' + cls : '');
    const now = new Date();
    const t = now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    div.innerHTML = `<span class="t">${t}</span><span class="p">${msg}</span>`;
    eventLog.appendChild(div);
    logCount++;
    while (logCount > MAX_LOG_ENTRIES && eventLog.firstChild) {
      eventLog.removeChild(eventLog.firstChild);
      logCount--;
    }
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  // ---------- Packet simulation ----------
  let packets = [];
  let packetIdSeq = 1;
  let sentCount = 0, deliveredCount = 0, droppedCount = 0;
  let totalDeliveredLatency = 0;

  function spawnPacket() {
    const protos = activeProtocols();
    if (protos.length === 0 || routes.length === 0) return;
    const protocol = protos[Math.floor(Math.random() * protos.length)];
    const route = routes[Math.floor(Math.random() * routes.length)];
    const color = protocolColors[protocol];

    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('r', 6);
    el.setAttribute('fill', color);
    el.setAttribute('class', 'packet');
    el.style.color = color;
    const start = nodes[route[0]];
    el.setAttribute('cx', start.x);
    el.setAttribute('cy', start.y);
    packetLayer.appendChild(el);

    const dropAtHop = Math.random() * 100 < lossPct
      ? Math.floor(Math.random() * (route.length - 1))
      : -1;

    const packet = {
      id: packetIdSeq++,
      protocol,
      route,
      color,
      el,
      hop: 0,
      segProgress: 0,
      segDuration: hopDuration(protocol),
      dropAtHop,
      elapsed: 0,
    };

    packets.push(packet);
    sentCount++;
    statSent.textContent = sentCount;
    log(`<span style="color:${color}">${protocol}</span> #${packet.id} generated at ${nodes[route[0]].label}`);
    pulseNode(route[0]);
  }

  function hopDuration(protocol) {
    const base = baseLatency[protocol];
    const jitter = 0.7 + Math.random() * 0.6; // 0.7x - 1.3x
    return (base * jitter) / speedMultiplier;
  }

  function updatePacket(p, dtMs) {
    // Defensive: if the topology changed under this packet's feet, or its
    // referenced nodes vanished, drop it silently instead of throwing.
    const fromId = p.route[p.hop];
    const toId = p.route[p.hop + 1];
    const from = nodes[fromId];
    const to = nodes[toId];
    if (!from || !to) {
      p.el && p.el.remove();
      p.dead = true;
      return;
    }

    p.elapsed += dtMs;
    p.segProgress += dtMs / p.segDuration;

    const t = Math.min(p.segProgress, 1);
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    p.el.setAttribute('cx', x);
    p.el.setAttribute('cy', y);

    if (p.segProgress >= 1) {
      // reached node `toId`
      const arrivedHop = p.hop + 1;

      if (p.dropAtHop === p.hop) {
        // drop occurs on this hop (between fromId and toId)
        p.el.classList.add('drop-flash');
        droppedCount++;
        statDropped.textContent = droppedCount;
        log(`<span style="color:${p.color}">${p.protocol}</span> #${p.id} <b style="color:#ff5d6c">DROPPED</b> between ${from.label} → ${to.label}`, 'drop');
        const deadEl = p.el;
        setTimeout(() => deadEl.remove(), 180);
        p.dead = true;
        return;
      }

      pulseNode(toId);

      if (arrivedHop >= p.route.length - 1) {
        // final destination reached
        deliveredCount++;
        totalDeliveredLatency += p.elapsed;
        statDelivered.textContent = deliveredCount;
        statLatency.textContent = Math.round(totalDeliveredLatency / deliveredCount) + ' ms';
        log(`<span style="color:${p.color}">${p.protocol}</span> #${p.id} delivered to <b>${to.label}</b> (${Math.round(p.elapsed)} ms)`, 'ok');
        p.el.remove();
        p.dead = true;
        return;
      }

      log(`<span style="color:${p.color}">${p.protocol}</span> #${p.id} → ${to.label}`);
      p.hop = arrivedHop;
      p.segProgress = 0;
      p.segDuration = hopDuration(p.protocol);
    }
  }

  // ---------- Main loop ----------
  // The loop is intentionally defensive: a thrown error inside one frame must
  // never stop requestAnimationFrame from being rescheduled, or the entire
  // simulation would silently die (this bit us once with a log-clearing bug).
  let lastTime = performance.now();
  let spawnAccumulator = 0;

  function tick(dt) {
    if (autoSendEnabled) {
      spawnAccumulator += dt / 1000 * sendRate;
      while (spawnAccumulator >= 1) {
        spawnPacket();
        spawnAccumulator -= 1;
      }
    }

    for (const p of packets) {
      try {
        updatePacket(p, dt);
      } catch (err) {
        console.error('Packet Visualizer: error updating packet, dropping it.', err);
        p.el && p.el.remove();
        p.dead = true;
      }
    }
    packets = packets.filter(p => !p.dead);
  }

  function frame(now) {
    try {
      const dt = Math.min(now - lastTime, 100); // clamp to avoid jumps after a throttled/backgrounded tab
      lastTime = now;
      if (running) tick(dt);
    } catch (err) {
      console.error('Packet Visualizer: unexpected error in simulation frame.', err);
    } finally {
      requestAnimationFrame(frame);
    }
  }

  buildTopology(topologySelect.value);
  log('Simulation initialized. Network topology online.');
  requestAnimationFrame(frame);

  // ---------- Integration API for backend.js (Supabase) ----------
  // Exposes just enough surface area for the auth/history/custom-topology
  // module to read current state and register user-saved topologies,
  // without it needing to know about the internals of the simulation loop.
  window.PacketViz = {
    topologies,
    topologySelect,
    buildTopology,
    log,
    getSelectedTopologyName() {
      const topo = topologies[topologySelect.value];
      return topo ? topo.name : topologySelect.value;
    },
    getStats() {
      return {
        sent: sentCount,
        delivered: deliveredCount,
        dropped: droppedCount,
        avgLatencyMs: deliveredCount ? Math.round(totalDeliveredLatency / deliveredCount) : 0,
      };
    },
    getSettings() {
      return {
        rate: sendRate,
        speed: speedMultiplier,
        loss: lossPct,
        protocols: activeProtocols(),
        autoSend: autoSendEnabled,
      };
    },
  };
})();
