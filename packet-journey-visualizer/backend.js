// Custom topologies + run history, backed by Supabase.
// This module only ever talks to the DB through the anon/publishable key;
// access control is enforced server-side by the RLS policies in
// supabase-schema.sql. Every visitor gets a silent anonymous auth session
// (no login form) so saved data stays private to that browser without any
// sign-up friction. It reads simulation state through the small
// window.PacketViz API that script.js exposes, and can register user-saved
// topologies back into window.PacketViz.topologies so they show up as
// regular options in the existing topology dropdown.
import { supabase } from './supabaseClient.js';

const $ = (id) => document.getElementById(id);

let currentUser = null;
let customTopologies = [];

// ---------- Anonymous session ----------

function renderAuthUI() {
  const statusLine = $('sessionStatusLine');
  statusLine.textContent = currentUser
    ? `Session active — your saved topologies & history are private to this browser.`
    : 'No session yet.';
  document.querySelectorAll('.requires-auth').forEach((el) => {
    el.classList.toggle('disabled', !currentUser);
  });
}

function setAuthStatus(msg) { $('authStatus').textContent = msg || ''; }
function setTopoStatus(msg) { $('topologyStatus').textContent = msg || ''; }
function setHistoryStatus(msg) { $('historyStatus').textContent = msg || ''; }

$('newSessionBtn').addEventListener('click', async () => {
  setAuthStatus('Starting a new session…');
  await supabase.auth.signOut();
  await ensureSession();
});

async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    setAuthStatus(
      `Could not start a session: ${error.message}. ` +
      'Anonymous sign-ins may need to be enabled in Supabase (Authentication → Sign In / Providers → Anonymous).'
    );
    return null;
  }
  setAuthStatus('');
  return data.session;
}

async function handleAuthChange(session) {
  currentUser = session?.user ?? null;
  renderAuthUI();
  await Promise.all([loadCustomTopologies(), loadRunHistory()]);
}

supabase.auth.onAuthStateChange((_event, session) => { handleAuthChange(session); });

// ---------- Custom topologies ----------

async function loadCustomTopologies() {
  if (!currentUser) {
    customTopologies = [];
    renderCustomTopologyList();
    syncTopologyDropdown();
    return;
  }
  const { data, error } = await supabase
    .from('topologies')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { setTopoStatus(error.message); return; }
  customTopologies = data || [];
  renderCustomTopologyList();
  syncTopologyDropdown();
}

function renderCustomTopologyList() {
  const list = $('customTopologyList');
  list.replaceChildren();
  if (customTopologies.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = currentUser ? 'No saved topologies yet.' : 'Waiting for session…';
    list.appendChild(empty);
    return;
  }
  customTopologies.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'list-row';

    const name = document.createElement('span');
    name.textContent = t.name;

    const actions = document.createElement('div');
    actions.className = 'row';
    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn-sm';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => loadCustomTopology(t));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-sm';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteCustomTopology(t.id));
    actions.append(loadBtn, delBtn);

    row.append(name, actions);
    list.appendChild(row);
  });
}

function syncTopologyDropdown() {
  const select = window.PacketViz.topologySelect;
  const oldGroup = select.querySelector('optgroup[label="My Topologies"]');
  if (oldGroup) oldGroup.remove();
  if (customTopologies.length === 0) return;

  const group = document.createElement('optgroup');
  group.label = 'My Topologies';
  customTopologies.forEach((t) => {
    const optId = `custom-${t.id}`;
    window.PacketViz.topologies[optId] = { name: t.name, ...t.data };
    const opt = document.createElement('option');
    opt.value = optId;
    opt.textContent = t.name;
    group.appendChild(opt);
  });
  select.appendChild(group);
}

function loadCustomTopology(t) {
  const optId = `custom-${t.id}`;
  window.PacketViz.topologies[optId] = { name: t.name, ...t.data };
  window.PacketViz.topologySelect.value = optId;
  window.PacketViz.buildTopology(optId);
}

async function deleteCustomTopology(id) {
  const { error } = await supabase.from('topologies').delete().eq('id', id);
  if (error) { setTopoStatus(error.message); return; }
  await loadCustomTopologies();
}

function validateTopologyData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'Topology must be a JSON object with "nodes", "edges" and "routes".';
  }
  if (!data.nodes || typeof data.nodes !== 'object' || Array.isArray(data.nodes)) {
    return '"nodes" must be an object keyed by node id, e.g. {"a": {"x":100,"y":200,"label":"A"}}.';
  }
  const nodeIds = Object.keys(data.nodes);
  if (nodeIds.length === 0) return 'At least one node is required.';
  for (const id of nodeIds) {
    const n = data.nodes[id];
    if (!n || typeof n.x !== 'number' || typeof n.y !== 'number' || typeof n.label !== 'string') {
      return `Node "${id}" needs a numeric x, a numeric y, and a string label.`;
    }
  }
  if (!Array.isArray(data.edges)) return '"edges" must be an array of [fromId, toId] pairs.';
  for (const e of data.edges) {
    if (!Array.isArray(e) || e.length !== 2 || !nodeIds.includes(e[0]) || !nodeIds.includes(e[1])) {
      return `Edge ${JSON.stringify(e)} references an unknown node id.`;
    }
  }
  if (!Array.isArray(data.routes) || data.routes.length === 0) {
    return '"routes" must be a non-empty array of node-id paths, e.g. [["a","b"]].';
  }
  for (const r of data.routes) {
    if (!Array.isArray(r) || r.length < 2 || r.some((id) => !nodeIds.includes(id))) {
      return `Route ${JSON.stringify(r)} is invalid or references an unknown node id.`;
    }
  }
  return null;
}

$('topologyTemplateBtn').addEventListener('click', () => {
  const topo = window.PacketViz.topologies[window.PacketViz.topologySelect.value];
  if (!topo) return;
  const { name, ...rest } = topo;
  $('topologyJsonInput').value = JSON.stringify(rest, null, 2);
});

$('saveTopologyBtn').addEventListener('click', async () => {
  if (!currentUser) { setTopoStatus('No session yet — try again in a moment.'); return; }
  const name = $('topologyNameInput').value.trim();
  if (!name) { setTopoStatus('Name is required.'); return; }

  let data;
  try {
    data = JSON.parse($('topologyJsonInput').value);
  } catch (err) {
    setTopoStatus('Invalid JSON: ' + err.message);
    return;
  }
  const validationError = validateTopologyData(data);
  if (validationError) { setTopoStatus(validationError); return; }

  setTopoStatus('Saving…');
  const { error } = await supabase
    .from('topologies')
    .insert({ user_id: currentUser.id, name, data });
  if (error) { setTopoStatus(error.message); return; }

  setTopoStatus('Saved.');
  $('topologyNameInput').value = '';
  await loadCustomTopologies();
});

// ---------- Run history ----------

async function loadRunHistory() {
  if (!currentUser) { renderRunHistory([]); return; }
  const { data, error } = await supabase
    .from('simulation_runs')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(25);
  if (error) { setHistoryStatus(error.message); return; }
  renderRunHistory(data || []);
}

function renderRunHistory(rows) {
  const list = $('runHistoryList');
  list.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = currentUser ? 'No saved runs yet.' : 'Waiting for session…';
    list.appendChild(empty);
    return;
  }
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'list-row history-row';

    const info = document.createElement('div');
    info.className = 'history-info';
    const when = new Date(r.recorded_at).toLocaleString();
    const title = document.createElement('b');
    title.textContent = r.topology_name;
    const whenSpan = document.createElement('span');
    whenSpan.textContent = when;
    const statsSpan = document.createElement('span');
    statsSpan.textContent = `Sent ${r.packets_sent} · Delivered ${r.packets_delivered} · Dropped ${r.packets_dropped} · ${r.avg_latency_ms ?? 0} ms avg`;
    info.append(title, whenSpan, statsSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-sm';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      await supabase.from('simulation_runs').delete().eq('id', r.id);
      loadRunHistory();
    });

    row.append(info, delBtn);
    list.appendChild(row);
  });
}

$('saveRunBtn').addEventListener('click', async () => {
  if (!currentUser) { setHistoryStatus('No session yet — try again in a moment.'); return; }
  const stats = window.PacketViz.getStats();
  const settings = window.PacketViz.getSettings();
  const topologyName = window.PacketViz.getSelectedTopologyName();

  setHistoryStatus('Saving…');
  const { error } = await supabase.from('simulation_runs').insert({
    user_id: currentUser.id,
    topology_name: topologyName,
    packets_sent: stats.sent,
    packets_delivered: stats.delivered,
    packets_dropped: stats.dropped,
    avg_latency_ms: stats.avgLatencyMs,
    settings,
  });
  if (error) { setHistoryStatus(error.message); return; }

  setHistoryStatus('Run saved.');
  window.PacketViz.log(`Run saved to history: <b>${topologyName}</b> (${stats.sent} sent, ${stats.delivered} delivered).`);
  loadRunHistory();
});

// ---------- Init ----------

async function init() {
  const session = await ensureSession();
  await handleAuthChange(session);
}
init();
