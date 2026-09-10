(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const svg = $('canvas');

  const VIEW_W = 1200, VIEW_H = 700, PAD = 30;
  const STORAGE_KEY = 'topologyBuilder.state.v1';

  // Same 8-category palette used by the Packet Journey Visualizer, so
  // topologies built here read consistently if opened there.
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
  const legendOrder = Object.keys(nodeTypes);

  // ---------- State ----------
  // nodes: { id -> {x,y,label,sub,type} }
  // edges: [ {from,to,label} ]
  // routes: [ [nodeId, nodeId, ...] ]
  let nodes = {};
  let edges = [];
  let routes = [];

  let mode = 'select';
  let selectedNodeId = null;
  let selectedEdgeIndex = null;
  let dragNodeId = null;
  let dragOffset = { x: 0, y: 0 };
  let pendingEdgeFrom = null;
  let routeInProgress = [];

  function starterTopology() {
    return {
      name: 'Starter Topology',
      nodes: {
        client:  { x: 160, y: 340, label: 'Client',  sub: '',       type: 'client' },
        router:  { x: 460, y: 340, label: 'Router',   sub: '10.0.0.1', type: 'network' },
        server:  { x: 780, y: 340, label: 'Server',   sub: ':443',   type: 'compute' },
      },
      edges: [
        { from: 'client', to: 'router', label: '' },
        { from: 'router', to: 'server', label: '' },
      ],
      routes: [['client', 'router', 'server']],
    };
  }

  // ---------- DOM refs ----------
  const topoNameInput = $('topoName');
  const newBtn = $('newBtn');
  const importBtn = $('importBtn');
  const importFile = $('importFile');
  const exportBtn = $('exportBtn');
  const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
  const nodeTypePicker = $('nodeTypePicker');
  const newNodeTypeSelect = $('newNodeType');
  const hint = $('hint');
  const legend = $('legend');
  const propertiesEmpty = $('propertiesEmpty');
  const nodeProps = $('nodeProps');
  const edgeProps = $('edgeProps');
  const nodeTypeSelect = $('nodeTypeSelect');
  const nodeLabelInput = $('nodeLabelInput');
  const nodeSubInput = $('nodeSubInput');
  const deleteNodeBtn = $('deleteNodeBtn');
  const edgeLabelInput = $('edgeLabelInput');
  const deleteEdgeBtn = $('deleteEdgeBtn');
  const routeBuildingRow = $('routeBuildingRow');
  const finishRouteBtn = $('finishRouteBtn');
  const cancelRouteBtn = $('cancelRouteBtn');
  const routeList = $('routeList');
  const jsonPreview = $('jsonPreview');
  const builderStatus = $('builderStatus');

  function populateTypeSelect(select) {
    legendOrder.forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = nodeTypes[key].label;
      select.appendChild(opt);
    });
  }
  populateTypeSelect(newNodeTypeSelect);
  populateTypeSelect(nodeTypeSelect);

  // ---------- Persistence ----------
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        name: topoNameInput.value,
        nodes, edges, routes,
      }));
    } catch (err) {
      console.warn('Topology Builder: could not save to localStorage.', err);
    }
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Topology Builder: could not read saved state.', err);
      return null;
    }
  }

  function loadState(state) {
    topoNameInput.value = state.name || '';
    nodes = state.nodes || {};
    edges = (state.edges || []).map(e => ({ from: e.from, to: e.to, label: e.label || '' }));
    routes = state.routes || [];
    selectedNodeId = null;
    selectedEdgeIndex = null;
    pendingEdgeFrom = null;
    routeInProgress = [];
  }

  const initial = loadPersisted() || starterTopology();
  loadState(initial);

  // ---------- Utility ----------
  function slugify(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'node';
  }

  function generateId(label) {
    const base = slugify(label);
    let id = base, n = 2;
    while (nodes[id]) { id = `${base}-${n++}`; }
    return id;
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function edgeExists(a, b) {
    return edges.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  }

  function nodesConnected(a, b) { return edgeExists(a, b); }

  function setStatus(msg) { builderStatus.textContent = msg || ''; }

  // ---------- Rendering ----------
  const linkLayer = document.createElementNS(SVG_NS, 'g');
  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  const overlayLayer = document.createElementNS(SVG_NS, 'g');
  svg.append(linkLayer, nodeLayer, overlayLayer);

  function renderAll() {
    renderLinks();
    renderNodes();
    renderRoutePreview();
    renderLegend();
    renderProperties();
    renderRouteList();
    renderJsonPreview();
    renderHint();
  }

  function renderLinks() {
    linkLayer.replaceChildren();
    edges.forEach((e, i) => {
      const from = nodes[e.from], to = nodes[e.to];
      if (!from || !to) return;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'link-group' + (i === selectedEdgeIndex ? ' selected' : ''));
      g.dataset.edgeIndex = String(i);

      const hit = document.createElementNS(SVG_NS, 'line');
      hit.setAttribute('class', 'link-hit');
      hit.setAttribute('x1', from.x); hit.setAttribute('y1', from.y);
      hit.setAttribute('x2', to.x); hit.setAttribute('y2', to.y);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'link-line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);

      g.append(hit, line);

      if (e.label) {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'link-label');
        label.setAttribute('x', (from.x + to.x) / 2);
        label.setAttribute('y', (from.y + to.y) / 2 - 6);
        label.textContent = e.label;
        g.appendChild(label);
      }

      linkLayer.appendChild(g);
    });
  }

  function renderNodes() {
    nodeLayer.replaceChildren();
    Object.entries(nodes).forEach(([id, n]) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'node-group'
        + (id === selectedNodeId ? ' selected' : '')
        + (id === pendingEdgeFrom ? ' pending' : ''));
      g.dataset.nodeId = id;

      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('class', 'node-ring');
      ring.setAttribute('cx', n.x); ring.setAttribute('cy', n.y); ring.setAttribute('r', 26);

      const typeColor = (nodeTypes[n.type] || {}).color || '#5a6b87';
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'node-circle');
      circle.setAttribute('cx', n.x); circle.setAttribute('cy', n.y); circle.setAttribute('r', 22);
      circle.style.stroke = typeColor;

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'node-label');
      label.setAttribute('x', n.x); label.setAttribute('y', n.y + 40);
      label.textContent = n.label;

      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('class', 'node-sub');
      sub.setAttribute('x', n.x); sub.setAttribute('y', n.y + 54);
      sub.textContent = n.sub || '';

      g.append(ring, circle, label, sub);

      const routeIdx = routeInProgress.indexOf(id);
      if (routeIdx !== -1) {
        const badge = document.createElementNS(SVG_NS, 'g');
        badge.setAttribute('class', 'route-badge');
        const bc = document.createElementNS(SVG_NS, 'circle');
        bc.setAttribute('cx', n.x + 18); bc.setAttribute('cy', n.y - 18); bc.setAttribute('r', 10);
        const bt = document.createElementNS(SVG_NS, 'text');
        bt.setAttribute('x', n.x + 18); bt.setAttribute('y', n.y - 14);
        bt.textContent = String(routeIdx + 1);
        badge.append(bc, bt);
        g.appendChild(badge);
      }

      nodeLayer.appendChild(g);
    });
  }

  function renderRoutePreview() {
    overlayLayer.replaceChildren();
    if (routeInProgress.length < 2) return;
    for (let i = 0; i < routeInProgress.length - 1; i++) {
      const a = nodes[routeInProgress[i]], b = nodes[routeInProgress[i + 1]];
      if (!a || !b) continue;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'route-preview-line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      overlayLayer.appendChild(line);
    }
  }

  function renderLegend() {
    const used = new Set(Object.values(nodes).map(n => n.type));
    legend.replaceChildren();
    legendOrder.filter(t => used.has(t)).forEach((t) => {
      const info = nodeTypes[t];
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.title = info.label;
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.color = info.color;
      item.append(dot, document.createTextNode(info.label));
      legend.appendChild(item);
    });
  }

  function renderProperties() {
    if (selectedNodeId && nodes[selectedNodeId]) {
      propertiesEmpty.hidden = true;
      nodeProps.hidden = false;
      edgeProps.hidden = true;
      const n = nodes[selectedNodeId];
      nodeTypeSelect.value = n.type;
      if (document.activeElement !== nodeLabelInput) nodeLabelInput.value = n.label;
      if (document.activeElement !== nodeSubInput) nodeSubInput.value = n.sub || '';
    } else if (selectedEdgeIndex !== null && edges[selectedEdgeIndex]) {
      propertiesEmpty.hidden = true;
      nodeProps.hidden = true;
      edgeProps.hidden = false;
      if (document.activeElement !== edgeLabelInput) edgeLabelInput.value = edges[selectedEdgeIndex].label || '';
    } else {
      propertiesEmpty.hidden = false;
      nodeProps.hidden = true;
      edgeProps.hidden = true;
    }
  }

  function routeIsBroken(route) {
    for (let i = 0; i < route.length - 1; i++) {
      if (!nodes[route[i]] || !nodes[route[i + 1]] || !nodesConnected(route[i], route[i + 1])) return true;
    }
    return false;
  }

  function renderRouteList() {
    routeList.replaceChildren();
    if (routes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = 'No routes yet.';
      routeList.appendChild(empty);
      return;
    }
    routes.forEach((route, i) => {
      const broken = routeIsBroken(route);
      const row = document.createElement('div');
      row.className = 'route-row' + (broken ? ' broken' : '');

      const path = document.createElement('span');
      path.className = 'route-path';
      const names = route.map(id => nodes[id]?.label || `[missing: ${id}]`).join(' → ');
      path.textContent = names;
      if (broken) {
        const tag = document.createElement('span');
        tag.className = 'broken-tag';
        tag.textContent = 'BROKEN LINK';
        path.appendChild(tag);
      }

      const del = document.createElement('button');
      del.className = 'route-delete';
      del.textContent = '✕';
      del.title = 'Delete route';
      del.addEventListener('click', () => {
        routes.splice(i, 1);
        renderAll();
        persist();
      });

      row.append(path, del);
      routeList.appendChild(row);
    });
  }

  function buildExportData() {
    const exportNodes = {};
    Object.entries(nodes).forEach(([id, n]) => {
      exportNodes[id] = {
        x: Math.round(n.x), y: Math.round(n.y),
        label: n.label, sub: n.sub || '', type: n.type,
      };
    });
    return {
      nodes: exportNodes,
      edges: edges.map(e => [e.from, e.to]),
      routes: routes.map(r => [...r]),
    };
  }

  function renderJsonPreview() {
    jsonPreview.value = JSON.stringify(buildExportData(), null, 2);
  }

  function renderHint() {
    let msg = '';
    if (mode === 'select') msg = 'Click a node or link to edit it. Drag nodes to reposition.';
    else if (mode === 'addNode') msg = 'Click anywhere on the canvas to place a new node.';
    else if (mode === 'addEdge') {
      msg = pendingEdgeFrom
        ? `Click the second node to link it to "${nodes[pendingEdgeFrom]?.label}".`
        : 'Click a node to start a link.';
    } else if (mode === 'addRoute') {
      msg = routeInProgress.length
        ? `Route: ${routeInProgress.map(id => nodes[id]?.label).join(' → ')} — click the next connected node, then Finish.`
        : 'Click a node to start defining a route.';
    }
    hint.textContent = msg;
  }

  // ---------- Selection ----------
  function selectNode(id) { selectedNodeId = id; selectedEdgeIndex = null; renderNodes(); renderLinks(); renderProperties(); }
  function selectEdge(idx) { selectedEdgeIndex = idx; selectedNodeId = null; renderNodes(); renderLinks(); renderProperties(); }
  function clearSelection() { selectedNodeId = null; selectedEdgeIndex = null; renderNodes(); renderLinks(); renderProperties(); }

  // ---------- Mode switching ----------
  function setMode(next) {
    mode = next;
    pendingEdgeFrom = null;
    routeInProgress = [];
    clearSelection();
    modeButtons.forEach(b => {
      const active = b.dataset.mode === mode;
      b.setAttribute('aria-pressed', String(active));
    });
    nodeTypePicker.hidden = mode !== 'addNode';
    routeBuildingRow.hidden = mode !== 'addRoute';
    renderNodes();
    renderRoutePreview();
    renderHint();
  }

  modeButtons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // ---------- Canvas interaction ----------
  function addNodeAt(x, y) {
    const type = newNodeTypeSelect.value;
    const label = `New ${nodeTypes[type].label}`;
    const id = generateId(label);
    nodes[id] = { x: clamp(x, PAD, VIEW_W - PAD), y: clamp(y, PAD, VIEW_H - PAD), label, sub: '', type };
    selectNode(id);
    renderAll();
    persist();
    setMode('select');
    nodeLabelInput.focus();
    nodeLabelInput.select();
  }

  function handleAddEdgeClick(nodeId) {
    if (!pendingEdgeFrom) {
      pendingEdgeFrom = nodeId;
      renderNodes();
      renderHint();
      return;
    }
    if (pendingEdgeFrom === nodeId) {
      pendingEdgeFrom = null;
      renderNodes();
      renderHint();
      return;
    }
    if (edgeExists(pendingEdgeFrom, nodeId)) {
      setStatus('A link between these nodes already exists.');
    } else {
      edges.push({ from: pendingEdgeFrom, to: nodeId, label: '' });
      setStatus('');
    }
    pendingEdgeFrom = null;
    renderAll();
    persist();
  }

  function handleAddRouteClick(nodeId) {
    if (routeInProgress.length === 0) {
      routeInProgress.push(nodeId);
      renderAll();
      return;
    }
    const last = routeInProgress[routeInProgress.length - 1];
    if (last === nodeId) return;
    if (routeInProgress.includes(nodeId)) {
      setStatus('That node is already earlier in this route — routes can\'t revisit a node.');
      return;
    }
    if (!nodesConnected(last, nodeId)) {
      setStatus('No link between those nodes — connect them first, or pick an adjacent node.');
      return;
    }
    setStatus('');
    routeInProgress.push(nodeId);
    renderAll();
  }

  svg.addEventListener('mousedown', (evt) => {
    const nodeEl = evt.target.closest('[data-node-id]');
    const edgeEl = evt.target.closest('[data-edge-index]');
    const pt = svgPoint(evt);

    if (mode === 'addNode') {
      if (!nodeEl) addNodeAt(pt.x, pt.y);
      return;
    }
    if (mode === 'addEdge') {
      if (nodeEl) handleAddEdgeClick(nodeEl.dataset.nodeId);
      return;
    }
    if (mode === 'addRoute') {
      if (nodeEl) handleAddRouteClick(nodeEl.dataset.nodeId);
      return;
    }

    // select mode
    if (nodeEl) {
      const id = nodeEl.dataset.nodeId;
      selectNode(id);
      dragNodeId = id;
      dragOffset = { x: pt.x - nodes[id].x, y: pt.y - nodes[id].y };
    } else if (edgeEl) {
      selectEdge(parseInt(edgeEl.dataset.edgeIndex, 10));
    } else {
      clearSelection();
    }
  });

  // Listens on window, not just the svg, so dragging keeps tracking the
  // node even if the cursor briefly slips past the canvas edge.
  window.addEventListener('mousemove', (evt) => {
    if (!dragNodeId) return;
    const pt = svgPoint(evt);
    const n = nodes[dragNodeId];
    if (!n) return;
    n.x = clamp(pt.x - dragOffset.x, PAD, VIEW_W - PAD);
    n.y = clamp(pt.y - dragOffset.y, PAD, VIEW_H - PAD);
    renderLinks();
    renderNodes();
    renderRoutePreview();
  });

  window.addEventListener('mouseup', () => {
    if (dragNodeId) {
      dragNodeId = null;
      renderJsonPreview();
      persist();
    }
  });

  // ---------- Properties panel ----------
  nodeTypeSelect.addEventListener('change', () => {
    if (!selectedNodeId) return;
    nodes[selectedNodeId].type = nodeTypeSelect.value;
    renderNodes(); renderLegend(); renderJsonPreview(); persist();
  });
  nodeLabelInput.addEventListener('input', () => {
    if (!selectedNodeId) return;
    nodes[selectedNodeId].label = nodeLabelInput.value;
    renderNodes(); renderRouteList(); renderJsonPreview(); persist();
  });
  nodeSubInput.addEventListener('input', () => {
    if (!selectedNodeId) return;
    nodes[selectedNodeId].sub = nodeSubInput.value;
    renderNodes(); renderJsonPreview(); persist();
  });
  deleteNodeBtn.addEventListener('click', () => {
    if (!selectedNodeId) return;
    const id = selectedNodeId;
    delete nodes[id];
    edges = edges.filter(e => e.from !== id && e.to !== id);
    routes = routes.filter(r => !r.includes(id));
    clearSelection();
    renderAll();
    persist();
  });

  edgeLabelInput.addEventListener('input', () => {
    if (selectedEdgeIndex === null) return;
    edges[selectedEdgeIndex].label = edgeLabelInput.value;
    renderLinks(); renderJsonPreview(); persist();
  });
  deleteEdgeBtn.addEventListener('click', () => {
    if (selectedEdgeIndex === null) return;
    edges.splice(selectedEdgeIndex, 1);
    clearSelection();
    renderAll();
    persist();
  });

  // ---------- Routes ----------
  finishRouteBtn.addEventListener('click', () => {
    if (routeInProgress.length < 2) { setStatus('A route needs at least two nodes.'); return; }
    routes.push([...routeInProgress]);
    routeInProgress = [];
    setStatus('');
    renderAll();
    persist();
  });
  cancelRouteBtn.addEventListener('click', () => {
    routeInProgress = [];
    renderAll();
  });

  // ---------- Toolbar ----------
  newBtn.addEventListener('click', () => {
    if (!confirm('Start a new topology? This clears the current canvas.')) return;
    nodes = {}; edges = []; routes = [];
    topoNameInput.value = '';
    setMode('select');
    renderAll();
    persist();
    setStatus('Started a new topology.');
  });

  topoNameInput.addEventListener('input', persist);

  exportBtn.addEventListener('click', () => {
    const data = buildExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = slugify(topoNameInput.value.trim() || 'topology');
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${name}.json`);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.nodes || typeof parsed.nodes !== 'object') throw new Error('Missing "nodes" object.');
        const importedNodes = {};
        Object.entries(parsed.nodes).forEach(([id, n]) => {
          importedNodes[id] = {
            x: Number(n.x) || VIEW_W / 2,
            y: Number(n.y) || VIEW_H / 2,
            label: n.label || id,
            sub: n.sub || '',
            type: nodeTypes[n.type] ? n.type : 'compute',
          };
        });
        const importedEdges = (Array.isArray(parsed.edges) ? parsed.edges : [])
          .filter(e => Array.isArray(e) && e.length === 2)
          .map(([a, b]) => ({ from: a, to: b, label: '' }));
        const importedRoutes = Array.isArray(parsed.routes) ? parsed.routes : [];

        nodes = importedNodes;
        edges = importedEdges;
        routes = importedRoutes;
        topoNameInput.value = file.name.replace(/\.json$/i, '');
        clearSelection();
        setMode('select');
        renderAll();
        persist();
        setStatus(`Imported ${file.name}.`);
      } catch (err) {
        setStatus(`Import failed: ${err.message}`);
      } finally {
        importFile.value = '';
      }
    };
    reader.readAsText(file);
  });

  // ---------- Keyboard ----------
  window.addEventListener('keydown', (evt) => {
    const inField = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (evt.key === 'Escape') {
      if (pendingEdgeFrom || routeInProgress.length) {
        pendingEdgeFrom = null;
        routeInProgress = [];
        renderAll();
      } else {
        clearSelection();
      }
      return;
    }
    if (inField) return;
    if ((evt.key === 'Delete' || evt.key === 'Backspace')) {
      if (selectedNodeId) { deleteNodeBtn.click(); evt.preventDefault(); }
      else if (selectedEdgeIndex !== null) { deleteEdgeBtn.click(); evt.preventDefault(); }
    }
    if (evt.key === 'Enter' && mode === 'addRoute' && routeInProgress.length >= 2) {
      finishRouteBtn.click();
    }
  });

  // ---------- Init ----------
  setMode('select');
  renderAll();
})();
