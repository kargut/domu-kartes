// tree: {root, nodes: {id: {children: [...]}}}, sizes: {id: {w, h}}, folded: Set of ids
// returns {order: [visible ids, depth first], pos: {id: {x, y, side}}}
function layout(tree, sizes, folded) {
  const H_GAP = 48;
  const V_GAP = 8;
  const POSITION_LIMIT = 10000000;
  const nodes = tree.nodes;
  const rootId = tree.root;
  const hidden = folded || new Set();

  function clamp(value) {
    if (value > POSITION_LIMIT) return POSITION_LIMIT;
    if (value < -POSITION_LIMIT) return -POSITION_LIMIT;
    return value;
  }

  const parentOf = {};
  for (const id in nodes) {
    const children = nodes[id].children;
    for (let i = 0; i < children.length; i++) parentOf[children[i]] = id;
  }

  const order = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    order.push(id);
    if (hidden.has(id)) continue;
    const children = nodes[id].children;
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }

  const sideOf = {};
  sideOf[rootId] = "right";
  let firstLevel = 0;
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (id === rootId) continue;
    const parentId = parentOf[id];
    if (parentId === rootId) {
      sideOf[id] = firstLevel % 2 === 0 ? "right" : "left";
      firstLevel += 1;
    } else {
      sideOf[id] = sideOf[parentId];
    }
  }

  function stackHeight(childIds) {
    const count = childIds.length;
    if (count === 0) return 0;
    let total = 0;
    for (let i = 0; i < count; i++) total += blockHeight[childIds[i]];
    if (count > 1) total += V_GAP * (count - 1);
    return total;
  }

  const blockHeight = {};
  const onLeft = {};
  const onRight = {};
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const leftIds = [];
    const rightIds = [];
    if (!hidden.has(id)) {
      const children = nodes[id].children;
      for (let c = 0; c < children.length; c++) {
        const childId = children[c];
        if (sideOf[childId] === "left") leftIds.push(childId);
        else rightIds.push(childId);
      }
    }
    onLeft[id] = leftIds;
    onRight[id] = rightIds;
    blockHeight[id] = Math.max(
      sizes[id].h,
      stackHeight(leftIds),
      stackHeight(rightIds),
    );
  }

  const at = {};
  at[rootId] = {
    x: clamp(-sizes[rootId].w / 2),
    y: clamp(-sizes[rootId].h / 2),
  };

  function place(childIds, parentX, parentWidth, parentCenterY, side) {
    if (!childIds.length) return;
    let top = parentCenterY - stackHeight(childIds) / 2;
    for (let i = 0; i < childIds.length; i++) {
      const childId = childIds[i];
      const block = blockHeight[childId];
      const width = sizes[childId].w;
      const height = sizes[childId].h;
      const x = side === "right" ? parentX + parentWidth + H_GAP : parentX - H_GAP - width;
      const y = top + (block - height) / 2;
      at[childId] = { x: x, y: y };
      top += block + V_GAP;
    }
  }

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (hidden.has(id)) continue;
    const parent = at[id];
    const width = sizes[id].w;
    const centerY = parent.y + sizes[id].h / 2;
    place(onRight[id], parent.x, width, centerY, "right");
    place(onLeft[id], parent.x, width, centerY, "left");
  }

  const pos = {};
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    pos[id] = { x: at[id].x, y: at[id].y, side: sideOf[id] };
  }
  return { order: order, pos: pos };
}

if (typeof module === "object" && module && module.exports) {
  module.exports = { layout: layout };
} else {
  window.LiepaLayout = { layout: layout };
}
