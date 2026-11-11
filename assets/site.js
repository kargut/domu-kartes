(() => {
"use strict";

const STRINGS = {
  now: "Tagad:",
  pick: "Pieskaries zaram, lai pārietu uz tā kartīti",
  whole: "Visa tēma vienā skatā",
};

const topicNode = document.getElementById("topic-data");
if (!topicNode) return;

const topic = JSON.parse(topicNode.textContent);
JSON.parse(document.getElementById("site-data").textContent);

const $ = (id) => document.getElementById(id);
const safeReplace = (url) => {
  try { history.replaceState(null, "", url); } catch (e) { /* a frame may refuse */ }
};
const safePush = (url) => {
  try { history.pushState({ map: true }, "", url); } catch (e) { /* a frame may refuse */ }
};

const parentOf = {};
for (const id in topic.nodes) {
  const children = topic.nodes[id].children;
  for (let i = 0; i < children.length; i++) parentOf[children[i]] = id;
}

const slideCount = topic.slideCount;
let index = 0;
let mapOpen = false;
let mini = null;
let summary = null;
let miniHover = false;
const fullFolded = new Set();
let showContent = true;
let full = null;
const view = { s: 1, x: 0, y: 0 };
let scrollRaf = 0;
let ignoreScrollUntil = 0;

function tint(color) {
  return color + "17";
}

function countDesc(id) {
  let total = 0;
  const pending = topic.nodes[id].children.slice();
  while (pending.length) {
    const child = pending.pop();
    total += 1;
    pending.push(...topic.nodes[child].children);
  }
  return total;
}

function drawMap(host, opts) {
  host.querySelectorAll(".world").forEach((node) => node.remove());
  const world = document.createElement("div");
  world.className = "world";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "edges");
  svg.setAttribute("width", "1");
  svg.setAttribute("height", "1");
  world.append(svg);
  host.prepend(world);

  const state = { world: world, svg: svg, bbox: null, nodes: {}, paths: {}, rects: {} };
  const folded = opts.folded || new Set();
  const tree = { root: topic.root, nodes: {} };
  for (const id in topic.nodes) tree.nodes[id] = { children: topic.nodes[id].children };

  const visible = [];
  const pending = [topic.root];
  while (pending.length) {
    const id = pending.pop();
    visible.push(id);
    if (folded.has(id)) continue;
    const children = topic.nodes[id].children;
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
  }

  const sizes = {};
  for (let i = 0; i < visible.length; i++) {
    const id = visible[i];
    const data = topic.nodes[id];
    const div = document.createElement("div");
    div.className = "node" + (id === topic.root ? " root" : "");
    div.dataset.id = id;
    div.style.setProperty("--c", data.color);
    div.style.setProperty("--tint", tint(data.color));
    const title = document.createElement("div");
    title.className = "t";
    title.innerHTML = data.title;
    div.append(title);
    if (opts.content && data.html) {
      const body = document.createElement("div");
      body.className = "c";
      body.innerHTML = data.html;
      div.append(body);
    }
    div.style.visibility = "hidden";
    world.append(div);
    state.nodes[id] = div;
  }
  for (let i = 0; i < visible.length; i++) {
    const id = visible[i];
    const div = state.nodes[id];
    sizes[id] = { w: div.offsetWidth, h: div.offsetHeight };
  }

  const laid = window.LiepaLayout.layout(tree, sizes, folded);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < laid.order.length; i++) {
    const id = laid.order[i];
    const div = state.nodes[id];
    const at = laid.pos[id];
    const size = sizes[id];
    state.rects[id] = { x: at.x, y: at.y, w: size.w, h: size.h };
    div.style.transform = "translate(" + at.x + "px, " + at.y + "px)";
    div.style.visibility = "";
    minX = Math.min(minX, at.x);
    minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x + size.w);
    maxY = Math.max(maxY, at.y + size.h);
    if (folded.has(id) && topic.nodes[id].children.length) {
      const marker = document.createElement("span");
      marker.className = "fold " + (at.side === "left" && id !== topic.root ? "l" : "r");
      marker.textContent = "+" + countDesc(id);
      div.append(marker);
    }
    const parentId = parentOf[id];
    if (parentId != null) {
      const parentAt = laid.pos[parentId];
      const parentSize = sizes[parentId];
      const right = at.x + size.w / 2 >= parentAt.x + parentSize.w / 2;
      const sx = right ? parentAt.x + parentSize.w : parentAt.x;
      const sy = parentAt.y + parentSize.h / 2;
      const ex = right ? at.x : at.x + size.w;
      const ey = at.y + size.h / 2;
      const mx = (sx + ex) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M" + sx + "," + sy + " C" + mx + "," + sy + " " + mx + "," + ey + " " + ex + "," + ey);
      path.style.setProperty("--c", topic.nodes[id].color);
      svg.append(path);
      state.paths[id] = path;
    }
  }
  state.bbox = visible.length
    ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    : null;
  return state;
}

function fitInto(host, state, pad, box, maxScale) {
  const bounds = box || state.bbox;
  const limit = maxScale == null ? 1 : maxScale;
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height || !bounds || !bounds.w || !bounds.h) return;
  const scale = Math.min((width - 2 * pad) / bounds.w, (height - 2 * pad) / bounds.h, limit);
  const x = (width - bounds.w * scale) / 2 - bounds.x * scale;
  const y = (height - bounds.h * scale) / 2 - bounds.y * scale;
  state.world.style.transform = "translate(" + x + "px, " + y + "px) scale(" + scale + ")";
}

function currentSlide() {
  return $("track").children[index] || null;
}

function currentBranch() {
  const slide = currentSlide();
  const card = slide && slide.querySelector(".card");
  if (!card || !card.classList.contains("branch")) return null;
  for (const id in topic.nodes) {
    if (parentOf[id] === topic.root && topic.nodes[id].slide === index) return topic.nodes[id];
  }
  return null;
}

function fitMini() {
  if (!mini) return;
  const host = $("mini");
  const branch = currentBranch();
  if (!branch || miniHover) {
    fitInto(host, mini, 10);
    return;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id in mini.rects) {
    if (topic.nodes[id].branch !== branch.branch) continue;
    const rect = mini.rects[id];
    x0 = Math.min(x0, rect.x);
    y0 = Math.min(y0, rect.y);
    x1 = Math.max(x1, rect.x + rect.w);
    y1 = Math.max(y1, rect.y + rect.h);
  }
  if (x0 === Infinity) {
    fitInto(host, mini, 10);
    return;
  }
  fitInto(host, mini, 14, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 0.85);
}

function highlightMini() {
  if (!mini) return;
  const branch = currentBranch();
  for (const id in mini.nodes) {
    const on = !branch || topic.nodes[id].branch === branch.branch || id === topic.root;
    mini.nodes[id].classList.toggle("dim", !on);
    mini.nodes[id].classList.toggle("hot", branch != null && on);
  }
  for (const id in mini.paths) {
    const on = !branch || topic.nodes[id].branch === branch.branch;
    mini.paths[id].classList.toggle("dim", !on);
  }
  fitMini();
  const line = $("miniNow");
  line.replaceChildren();
  if (!branch) {
    const slide = currentSlide();
    const card = slide && slide.querySelector(".card");
    line.textContent = card && card.classList.contains("map") ? STRINGS.whole : STRINGS.pick;
    return;
  }
  line.append(STRINGS.now + " ");
  const name = document.createElement("b");
  name.style.color = branch.color;
  name.textContent = branch.text;
  line.append(name);
}

function renderMini() {
  const host = $("mini");
  mini = drawMap(host, { content: false });
  const bounds = mini.bbox;
  const width = host.clientWidth;
  if (width && bounds && bounds.w) {
    const fitted = bounds.h * (width - 20) / bounds.w + 20;
    host.style.height = Math.round(Math.max(170, Math.min(320, fitted))) + "px";
  }
  fitInto(host, mini, 10);
  for (const id in mini.nodes) {
    const div = mini.nodes[id];
    div.title = topic.nodes[id].text;
    div.addEventListener("click", (event) => {
      event.stopPropagation();
      go(topic.nodes[id].slide, true);
    });
  }
  const summaryHost = $("track").querySelector("[data-map]");
  if (summaryHost) {
    summary = drawMap(summaryHost, { content: false });
    fitInto(summaryHost, summary, 4);
    for (const id in summary.nodes) {
      summary.nodes[id].addEventListener("click", () => go(topic.nodes[id].slide, true));
    }
  }
}

function updateChrome() {
  $("count").textContent = (index + 1) + " / " + slideCount;
  $("prev").disabled = index === 0;
  $("next").disabled = index === slideCount - 1;
  const dots = $("dots").querySelectorAll("a");
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === index);
  const sections = document.querySelectorAll(".topic.active .section-btn");
  for (let i = 0; i < sections.length; i++) {
    const href = sections[i].getAttribute("href") || "";
    const number = parseInt(href.slice(1), 10);
    sections[i].classList.toggle("current", number === index + 1);
  }
  highlightMini();
}

function scrollToIndex(next, smooth) {
  const track = $("track");
  track.style.scrollBehavior = smooth ? "" : "auto";
  track.scrollLeft = next * track.clientWidth;
  if (!smooth) requestAnimationFrame(() => { track.style.scrollBehavior = ""; });
}

function go(next, smooth) {
  const clamped = Math.max(0, Math.min(slideCount - 1, next));
  if (mapOpen) closeMap(true);
  index = clamped;
  scrollToIndex(index, smooth);
  updateChrome();
  safeReplace("#" + (index + 1));
}

function parseHash() {
  let raw = "";
  try { raw = decodeURIComponent(location.hash.replace(/^#/, "")); } catch (e) { raw = ""; }
  if (raw === "karte") return { map: true, index: 0 };
  if (raw === "") return { map: false, index: 0 };
  if (!/^-?[0-9]+$/.test(raw)) return { map: false, index: 0 };
  const number = parseInt(raw, 10);
  const clamped = Math.max(1, Math.min(number, slideCount));
  return { map: false, index: clamped - 1 };
}

function applyView() {
  if (!full) return;
  full.world.style.transform = "translate(" + view.x + "px, " + view.y + "px) scale(" + view.s + ")";
}

function fitFull() {
  if (!full || !full.bbox || !full.bbox.w || !full.bbox.h) return;
  const vp = $("viewport");
  const bounds = full.bbox;
  const pad = 30;
  const scale = Math.min(
    (vp.clientWidth - 2 * pad) / bounds.w,
    (vp.clientHeight - 2 * pad) / bounds.h,
    1.2,
  );
  view.s = scale;
  view.x = (vp.clientWidth - bounds.w * scale) / 2 - bounds.x * scale;
  view.y = (vp.clientHeight - bounds.h * scale) / 2 - bounds.y * scale;
  applyView();
}

function zoomAt(factor, cx, cy) {
  const scale = Math.min(3, Math.max(0.15, view.s * factor));
  const applied = scale / view.s;
  view.x = cx - (cx - view.x) * applied;
  view.y = cy - (cy - view.y) * applied;
  view.s = scale;
  applyView();
}

function zoomBy(factor) {
  const vp = $("viewport");
  zoomAt(factor, vp.clientWidth / 2, vp.clientHeight / 2);
}

function drawFull() {
  full = drawMap($("viewport"), { content: showContent, folded: fullFolded });
}

function openMap(fromHash) {
  if (mapOpen) return;
  mapOpen = true;
  $("overlay").classList.add("open");
  $("ovHint").style.opacity = "";
  document.body.style.overflow = "hidden";
  drawFull();
  fitFull();
  if (!fromHash) safePush("#karte");
  window.setTimeout(() => { $("ovHint").style.opacity = "0"; }, 3500);
}

function closeMap(fromHistory) {
  if (!mapOpen) return;
  mapOpen = false;
  $("overlay").classList.remove("open");
  document.body.style.overflow = "";
  $("ovHint").style.opacity = "";
  if (fromHistory) return;
  let state = null;
  try { state = history.state; } catch (e) { state = null; }
  if (state && state.map) {
    try { history.back(); } catch (e) { /* a frame may refuse */ }
  } else {
    safeReplace("#" + (index + 1));
  }
}

function closeDrawer() {
  $("sidebar").classList.remove("open");
  $("scrim").classList.remove("open");
}

function slideNumber(href) {
  if (!href || href.charAt(0) !== "#") return null;
  const raw = href.slice(1);
  if (!/^[0-9]+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

$("track").addEventListener("scroll", () => {
  if (performance.now() < ignoreScrollUntil) return;
  cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    const track = $("track");
    const width = track.clientWidth;
    if (!width) return;
    const next = Math.round(track.scrollLeft / width);
    if (next !== index && next >= 0 && next < slideCount) {
      index = next;
      updateChrome();
      safeReplace("#" + (index + 1));
    }
  });
});

$("prev").addEventListener("click", () => go(index - 1, true));
$("next").addEventListener("click", () => go(index + 1, true));

document.addEventListener("click", (event) => {
  const link = event.target.closest ? event.target.closest("a") : null;
  if (!link) return;
  const href = link.getAttribute("href");
  if (href === "#karte") {
    event.preventDefault();
    openMap(false);
    closeDrawer();
    return;
  }
  const number = slideNumber(href);
  if (number == null) {
    if (link.closest("#sidebar")) closeDrawer();
    return;
  }
  event.preventDefault();
  go(number - 1, true);
  closeDrawer();
});

document.addEventListener("keydown", (event) => {
  if (mapOpen) {
    if (event.key === "Escape") closeMap(false);
    else if (event.key === "+" || event.key === "=") zoomBy(1.25);
    else if (event.key === "-") zoomBy(0.8);
    else if (event.key === "0") fitFull();
    return;
  }
  if (event.target.closest && event.target.closest("input, textarea")) return;
  if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1, true); }
  if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1, true); }
});

$("menuBtn").addEventListener("click", () => {
  $("sidebar").classList.add("open");
  $("scrim").classList.add("open");
});
$("scrim").addEventListener("click", closeDrawer);

$("mini").addEventListener("pointerenter", (event) => {
  if (event.pointerType === "mouse") { miniHover = true; fitMini(); }
});
$("mini").addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") { miniHover = false; fitMini(); }
});

$("tClose").addEventListener("click", () => closeMap(false));
$("tFit").addEventListener("click", fitFull);
$("tIn").addEventListener("click", () => zoomBy(1.25));
$("tOut").addEventListener("click", () => zoomBy(0.8));
$("tContent").addEventListener("click", () => {
  showContent = !showContent;
  $("tContent").classList.toggle("on", showContent);
  drawFull();
  fitFull();
});

(() => {
  const vp = $("viewport");
  const pts = new Map();
  let downNode = null;
  let moved = 0;
  let last = null;
  const center = () => {
    const points = [...pts.values()];
    const second = points[1] || points[0];
    return { x: (points[0].x + second.x) / 2, y: (points[0].y + second.y) / 2 };
  };
  const distance = () => {
    const points = [...pts.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  const local = (point) => {
    const rect = vp.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  };
  vp.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    vp.setPointerCapture(event.pointerId);
    pts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pts.size === 1) {
      downNode = event.target.closest ? event.target.closest(".node") : null;
      moved = 0;
    } else {
      downNode = null;
    }
    last = { c: center(), d: distance() };
    vp.classList.add("dragging");
  });
  vp.addEventListener("pointermove", (event) => {
    if (!pts.has(event.pointerId)) return;
    pts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = center();
    const span = distance();
    view.x += next.x - last.c.x;
    view.y += next.y - last.c.y;
    moved += Math.abs(next.x - last.c.x) + Math.abs(next.y - last.c.y);
    if (span && last.d) {
      const at = local(next);
      zoomAt(span / last.d, at.x, at.y);
    } else {
      applyView();
    }
    last = { c: next, d: span };
  });
  const end = (event) => {
    if (!pts.has(event.pointerId)) return;
    pts.delete(event.pointerId);
    if (pts.size) {
      last = { c: center(), d: distance() };
      return;
    }
    vp.classList.remove("dragging");
    if (downNode && moved < 6) {
      const id = downNode.dataset.id;
      if (topic.nodes[id].children.length && full && full.nodes[id]) {
        const before = full.nodes[id].getBoundingClientRect();
        if (fullFolded.has(id)) fullFolded.delete(id);
        else fullFolded.add(id);
        drawFull();
        applyView();
        const after = full.nodes[id].getBoundingClientRect();
        view.x += before.left - after.left;
        view.y += before.top - after.top;
        applyView();
      }
    }
    downNode = null;
  };
  vp.addEventListener("pointerup", end);
  vp.addEventListener("pointercancel", end);
  vp.addEventListener("wheel", (event) => {
    event.preventDefault();
    const at = local({ x: event.clientX, y: event.clientY });
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
    zoomAt(factor, at.x, at.y);
  }, { passive: false });
})();

window.addEventListener("popstate", () => {
  if (mapOpen && location.hash !== "#karte") closeMap(true);
});
window.addEventListener("hashchange", () => {
  const parsed = parseHash();
  if (parsed.map) {
    openMap(true);
    return;
  }
  if (mapOpen) closeMap(true);
  if (parsed.index !== index) {
    index = parsed.index;
    scrollToIndex(index, true);
    updateChrome();
  }
});

new ResizeObserver(() => {
  ignoreScrollUntil = performance.now() + 250;
  scrollToIndex(index, false);
  if (mini) fitMini();
  const host = $("track").querySelector("[data-map]");
  if (summary && host) fitInto(host, summary, 4);
}).observe($("track"));

const start = parseHash();
index = start.index;
renderMini();
requestAnimationFrame(() => {
  scrollToIndex(index, false);
  const host = $("track").querySelector("[data-map]");
  if (summary && host) fitInto(host, summary, 4);
  updateChrome();
  if (!start.map && location.hash !== "#" + (index + 1)) safeReplace("#" + (index + 1));
  if (start.map) openMap(true);
});
})();
