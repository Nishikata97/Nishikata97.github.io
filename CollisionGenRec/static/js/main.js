// Project page behavior: math rendering, the CCE and ZCR demos, and small page helpers.
(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Each feature starts on its own, so that one failure (e.g. a script that did not load) leaves the others working.
  document.addEventListener("DOMContentLoaded", () => {
    const features = [
      renderMath, initCceDemo, initZcrDemo, initMetricTabs, initNavSpy, initAbstractToggle,
      initLinkedDetails, initCopyButtons, initEmailLinks, initPrint, initScrollCues,
    ];
    for (const init of features) {
      try {
        init();
      } catch (err) {
        console.error(err);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const tex = (s) => (window.katex ? katex.renderToString(s, { throwOnError: false }) : s);

  // "a", "a and b", "a, b, and c".
  const listText = (xs) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);

  function setAttrs(node, attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function svgEl(tag, attrs = {}, parent = null) {
    const node = setAttrs(document.createElementNS(SVG_NS, tag), attrs);
    if (parent) parent.append(node);
    return node;
  }

  // Announce a demo's result once the reader pauses, instead of on every slider step or drag move.
  function announcer(id) {
    const region = document.getElementById(id);
    let timer = 0;
    return (text) => {
      clearTimeout(timer);
      timer = setTimeout(() => { region.textContent = text; }, 700);
    };
  }

  // ---------------------------------------------------------------------------
  // Math
  // ---------------------------------------------------------------------------

  // Inline formulas in running text. style.css keeps the same selector on one line (white-space: nowrap).
  const INLINE_MATH = "main p .katex, main li .katex";

  // Render Algorithm 1 first: auto-render would otherwise consume the $...$ inside it. Without pseudocode.js or
  // KaTeX, show its LaTeX source instead.
  function renderMath() {
    const algo = document.getElementById("zcr-algorithm");
    if (algo && window.pseudocode && window.katex) pseudocode.renderElement(algo, { lineNumber: true });
    else if (algo) algo.hidden = false;
    if (!window.renderMathInElement) return;
    renderMathInElement(document.body, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
      ],
      ignoredClasses: ["ps-root"],
      throwOnError: false,
    });
    glueMath(document.querySelectorAll(INLINE_MATH));
  }

  // Keep inline math on one line with the text touching it: punctuation right after it (no line starting
  // with ",") and the word right before it ("ItemHit@" + "K", "(" + "V = 256").
  function glueMath(formulas) {
    formulas.forEach((k) => {
      // auto-render may wrap each formula in a bare <span>; treat that wrapper as the unit.
      const outer = k.parentElement;
      const unit = outer.tagName === "SPAN" && !outer.className && outer.childNodes.length === 1 ? outer : k;
      const next = unit.nextSibling;
      const prev = unit.previousSibling;
      const after = next && next.nodeType === Node.TEXT_NODE && next.data.match(/^[,.;:)?!]+/);
      const before = prev && prev.nodeType === Node.TEXT_NODE && prev.data.match(/\S+$/);
      if (!after && !before) return;
      const wrap = document.createElement("span");
      wrap.className = "math-glue";
      unit.replaceWith(wrap);
      wrap.append(unit);
      if (before) {
        wrap.prepend(before[0]);
        prev.data = prev.data.slice(0, -before[0].length);
      }
      if (after) {
        wrap.append(after[0]);
        next.data = next.data.slice(after[0].length);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // CCE demo: SID-level vs. item-level credit for one test case (Eqs. 4-7 of the paper)
  // ---------------------------------------------------------------------------

  const CCE_KEYS = ["K", "r", "g", "a"];
  const CCE_PRESETS = {
    paper: { K: 5, r: 4, g: 3, a: 0 },
    nocoll: { K: 5, r: 4, g: 1, a: 0 },
    samehit: { K: 5, r: 2, g: 3, a: 0 },
    pushed: { K: 5, r: 3, g: 3, a: 3 },
  };

  // Scores for one test case, as in model/cce.py (compute_cce_metrics, hit_k, ndcg_k): target SID at beam
  // rank r, a target group of g items, and `a` extra items contributed by the collision groups of the r-1 SIDs
  // ranked above it.
  function cceScores(K, r, g, a) {
    const p = r + a; // start of the target group in the expanded ranking
    const inBeam = r <= K;
    const m = inBeam ? Math.min(g, Math.max(0, K - p + 1)) : 0;
    const hit = inBeam ? 1 : 0;
    const ndcg = inBeam ? 1 / Math.log2(r + 1) : 0;
    let indcg = 0;
    for (let e = 1; e <= m; e++) indcg += 1 / Math.log2(p + e);
    indcg /= g;
    return { p, inBeam, m, hit, ndcg, indcg };
  }

  const fraction = (m, g) => (m === 0 ? "0" : m === g ? "1" : `${m}/${g}`);
  const ordinal = (n) => n + (["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th");

  // The sentence under the CCE demo: why the SID-level and item-level scores agree or differ.
  function cceExplain({ K, r, g, a, p, inBeam, m, hit }) {
    const top = K === 1 ? "the top position" : `the top ${K}`;
    const span = g === 1 ? `position ${p}` : `positions ${p}\u2060\u2013\u2060${p + g - 1}`;
    if (!inBeam) return `The target SID is ranked ${ordinal(r)}, outside ${top}, so all four metrics are 0.`;
    if (m === g && g === 1 && a === 0) {
      return r === 1
        ? "The target SID is ranked first and identifies a single item, so SID-level and item-level metrics agree."
        : "The target SID and every SID ranked above it identify a single item each, so SID-level and item-level " +
          "metrics agree.";
    }
    if (m === g && g === 1) {
      return `The target SID identifies a single item, so ItemHit@${K} = Hit@${K}. However, collision groups ranked ` +
        `above push it from position ${r} to position ${p} in the item ranking, so ItemNDCG@${K} is lower than NDCG@${K}.`;
    }
    if (m === g) {
      const all = g === 2 ? "Both items" : `All ${g} items`;
      const any = g === 2 ? "either of the 2 items" : `any of the ${g} items`;
      return `${all} of the target group (${span}) are in ${top}, so ItemHit@${K} = Hit@${K} = 1. ` +
        `ItemNDCG@${K} is still lower: the target could be ${any}, and CCE averages over their positions.`;
    }
    if (m === 0) {
      const group = g === 1 ? "the target item" : "the whole target group";
      return `Collision groups ranked above push ${group} (${span}) past position ${K}. ` +
        `Hit@${K} still gives full credit, but ItemHit@${K} gives none.`;
    }
    const inflation = Math.round((hit / (m / g) - 1) * 100);
    return `The target group occupies ${span}, but only ${m} of its ${g} items ${m === 1 ? "is" : "are"} in ${top}. ` +
      `Hit@${K} gives full credit; ItemHit@${K} gives ${m}/${g}, so Hit@${K} overstates item-level credit ` +
      `by ${inflation}%.`;
  }

  // One labeled pill per position, in the paper's notation, with its rank above it. cellFor(q) gives the
  // pill's kind ("sid", "item", or "") and its TeX label; a dashed line follows position K.
  function drawCells(container, n, K, cellFor) {
    container.replaceChildren();
    for (let q = 1; q <= n; q++) {
      const { kind, label } = cellFor(q);
      const slot = document.createElement("span");
      slot.className = "cce-slot";
      const rank = document.createElement("span");
      rank.className = "cce-rank";
      rank.textContent = q;
      const cell = document.createElement("span");
      cell.className = "cce-cell";
      if (kind) cell.classList.add(kind);
      cell.classList.toggle("out", q > K);
      cell.innerHTML = tex(label);
      slot.append(rank, cell);
      container.append(slot);
      if (q === K) {
        const cut = document.createElement("span");
        cut.className = "cce-cutoff";
        container.append(cut);
      }
    }
  }

  function initCceDemo() {
    const root = document.getElementById("cce-demo");
    if (!root) return;
    const byId = (id) => document.getElementById(id);
    const inputs = { K: byId("cce-k"), r: byId("cce-r"), g: byId("cce-g"), a: byId("cce-a") };
    const outputs = { K: byId("cce-k-out"), r: byId("cce-r-out"), g: byId("cce-g-out"), a: byId("cce-a-out") };
    const scoreEls = {
      hit: byId("cce-hit"), itemHit: byId("cce-item-hit"), ndcg: byId("cce-ndcg"), itemNdcg: byId("cce-item-ndcg"),
    };
    const hint = byId("cce-a-hint");
    const explainEl = byId("cce-explain");
    const sidCells = byId("cce-cells-sid");
    const itemCells = byId("cce-cells-item");
    const rowsEl = root.querySelector(".cce-rows");
    const track = rowsEl.querySelector(".cce-track");
    const links = rowsEl.querySelector(".cce-links");
    const presetButtons = root.querySelectorAll("[data-preset]");
    const announce = announcer("cce-status");

    // s_{t+1} expands to its collision group: one thin line from s_{t+1} to each item of the group,
    // ending above the item's rank (the one-to-many mapping of the hero figure, read the other way).
    function drawLinks() {
      const base = track.getBoundingClientRect();
      links.setAttribute("viewBox", `0 0 ${base.width} ${base.height}`);
      links.replaceChildren();
      const sid = sidCells.querySelector(".cce-cell.sid");
      if (!sid) return;
      const s = sid.getBoundingClientRect();
      const x1 = (s.left + s.right) / 2 - base.left;
      const y1 = s.bottom - base.top;
      for (const cell of itemCells.querySelectorAll(".cce-cell.item")) {
        const rank = cell.parentElement.querySelector(".cce-rank").getBoundingClientRect();
        const x2 = (rank.left + rank.right) / 2 - base.left;
        const y2 = rank.top - base.top - 2;
        svgEl("line", { x1, y1, x2, y2, class: "cce-link" }, links);
      }
    }

    // Shrink the cells (down to 70%) until the rows fit the width. If they still do not fit, put the row labels
    // above the cells and shrink again; beyond that the rows scroll sideways (they never wrap, so the links from
    // s_{t+1} never cross another row).
    function fitRows() {
      const fits = () => track.scrollWidth <= rowsEl.clientWidth;
      const shrink = () => {
        let s = 1;
        rowsEl.style.setProperty("--s", s);
        while (!fits() && s > 0.7) {
          s = Math.max(0.7, s - 0.03);
          rowsEl.style.setProperty("--s", s.toFixed(2));
        }
        return fits();
      };
      rowsEl.classList.remove("stacked");
      if (!shrink()) {
        rowsEl.classList.add("stacked");
        shrink();
      }
    }

    // When the rows scroll, bring the target SID into view.
    function showTarget() {
      const sid = sidCells.querySelector(".cce-cell.sid");
      if (!sid || track.scrollWidth <= rowsEl.clientWidth) {
        rowsEl.scrollLeft = 0;
        return;
      }
      const x = sid.getBoundingClientRect().left - track.getBoundingClientRect().left;
      rowsEl.scrollLeft = Math.max(0, x - rowsEl.clientWidth / 3);
    }

    // SIDs: the beam list s^{(1)}, ..., s^{(K)} of Eq. 4, with the target shown as s_{t+1}.
    // Items: the target group "item a, b, c, ..." (unordered), others i_q at expanded position q.
    function drawRows(K, r, g, p) {
      drawCells(sidCells, Math.max(K, r), K, (q) => (q === r
        ? { kind: "sid", label: "\\mathbf{s}_{t+1}" }
        : { kind: "", label: `\\mathbf{s}^{(${q})}` }));
      drawCells(itemCells, Math.max(K, p + g - 1), K, (q) => (q >= p && q < p + g
        ? { kind: "item", label: `\\text{item ${"abcdef"[q - p]}}` }
        : { kind: "", label: `i_{${q}}` }));
      fitRows();
      drawLinks();
      showTarget();
    }

    // speak: announce the result (only for the reader's own changes, not when the page loads).
    function update(speak) {
      const K = +inputs.K.value;
      const r = +inputs.r.value;
      const g = +inputs.g.value;
      // No SID is ranked above rank 1, so there can be no extra items above it; say why while it is disabled.
      const first = r === 1;
      inputs.a.disabled = first;
      hint.hidden = !first;
      if (first) {
        inputs.a.setAttribute("aria-describedby", "cce-a-hint");
        inputs.a.value = 0;
      } else {
        inputs.a.removeAttribute("aria-describedby");
      }
      const a = +inputs.a.value;
      for (const k of CCE_KEYS) outputs[k].textContent = inputs[k].value;

      const scores = cceScores(K, r, g, a);
      const { p, m, hit, ndcg, indcg } = scores;
      drawRows(K, r, g, p);
      scoreEls.hit.textContent = hit;
      scoreEls.itemHit.textContent = fraction(m, g);
      scoreEls.itemHit.title = (m / g).toFixed(3);
      scoreEls.ndcg.textContent = ndcg.toFixed(3);
      scoreEls.itemNdcg.textContent = indcg.toFixed(3);

      const text = cceExplain({ K, r, g, a, ...scores });
      explainEl.textContent = text;
      if (speak) {
        announce(`Hit@${K} = ${hit}, ItemHit@${K} = ${fraction(m, g)}, NDCG@${K} = ${ndcg.toFixed(3)}, ` +
          `ItemNDCG@${K} = ${indcg.toFixed(3)}. ${text}`);
      }

      const values = { K, r, g, a };
      presetButtons.forEach((btn) => {
        const preset = CCE_PRESETS[btn.dataset.preset];
        btn.setAttribute("aria-pressed", String(CCE_KEYS.every((k) => preset[k] === values[k])));
      });
    }

    // fitRows changes the observed height, so run it in the next frame, outside the observer callback.
    let lastWidth = 0;
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = rowsEl.clientWidth;
        if (w !== lastWidth) {
          lastWidth = w;
          fitRows();
        }
        drawLinks();
      });
    }).observe(rowsEl);
    if (document.fonts) document.fonts.ready.then(() => { fitRows(); drawLinks(); });

    for (const k of CCE_KEYS) inputs[k].addEventListener("input", () => update(true));
    presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        for (const k of CCE_KEYS) inputs[k].value = CCE_PRESETS[btn.dataset.preset][k];
        update(true);
      });
    });
    update(false);
  }

  // ---------------------------------------------------------------------------
  // ZCR demo: one prefix group, greedy reassignment (MQL4GRec) vs. ZCR
  // ---------------------------------------------------------------------------

  // Drawing coordinates, matching the viewBox of the .zcr-svg panels.
  const ZCR_PANEL = { w: 320, h: 240 };
  const ITEM_R = 9; // radius of an item's dot
  const CODE_R = 11; // half-diagonal of a code's diamond
  const SUB_DY = 3.5; // baseline shift of a subscript
  const EPS = 1e-9; // costs closer than this are equal
  // Items stay this far inside the panel, so that their dots and labels remain visible.
  const INSET = { x: 12, top: 14, bottom: 18 };

  // The paper preset follows the paper's case study (RK-Means on Beauty). Positions were chosen so that the
  // squared distances in the drawing reproduce its costs (greedy 20.65, ZCR 13.76) while keeping the figure's layout.
  const ZCR_PRESETS = {
    paper: {
      codes: [{ id: "206", x: 52.517, y: 200 }, { id: "111", x: 267.483, y: 200 }],
      items: [{ id: "1943", x: 42.3953, y: 35, color: "#a86500" }, { id: "14", x: 81.6349, y: 39.8199, color: "#0173b2" }],
    },
    three: {
      codes: [{ id: "A", x: 160, y: 118 }, { id: "B", x: 282, y: 150 }, { id: "C", x: 52, y: 196 }, { id: "D", x: 66, y: 34 }],
      items: [{ id: "1", x: 220, y: 95 }, { id: "2", x: 158, y: 181 }, { id: "3", x: 120, y: 82 }],
    },
    same: {
      codes: [{ id: "A", x: 130, y: 130 }, { id: "B", x: 270, y: 130 }, { id: "C", x: 60, y: 40 }],
      items: [{ id: "1", x: 100, y: 155 }, { id: "2", x: 175, y: 110 }],
    },
  };

  // Cost per squared drawing unit. In the paper preset both codes lie on one baseline, so moving i14 from code 206
  // to code 111 costs ZCR_COST * (x111 - x206) * (x111 + x206 - 2 x_i14); that move is ZCR's, at the paper's 13.76.
  const ZCR_COST = (() => {
    const { codes, items } = ZCR_PRESETS.paper;
    const c206 = codes.find((c) => c.id === "206");
    const c111 = codes.find((c) => c.id === "111");
    const i14 = items.find((it) => it.id === "14");
    return 13.76 / ((c111.x - c206.x) * (c111.x + c206.x - 2 * i14.x));
  })();

  // D[i, c]: the squared distance between item i and code c, scaled to the paper's units.
  function costOf(item, code) {
    return ZCR_COST * ((item.x - code.x) ** 2 + (item.y - code.y) ** 2);
  }

  const fmtCost = (v) => v.toFixed(2);
  const emptyPlan = () => ({ moves: new Map(), cost: 0, kept: [] });

  // Returns each item's native code, rho (the number of items to reassign), whether a collision-free
  // assignment exists, and the greedy and ZCR plans: moves {item index -> code index}, total cost increase,
  // and the items that keep their shared code.
  function zcrSolve(items, codes) {
    const native = items.map((it) => {
      let best = 0;
      codes.forEach((c, j) => { if (costOf(it, c) < costOf(it, codes[best])) best = j; });
      return best;
    });
    const groups = new Map();
    native.forEach((c, i) => groups.set(c, [...(groups.get(c) || []), i]));
    const free = codes.map((_, j) => j).filter((j) => !groups.has(j));
    const rho = items.length - groups.size;
    // The capacity condition: every item to reassign needs a free code.
    if (free.length < rho) return { native, rho, feasible: false, greedy: emptyPlan(), zcr: emptyPlan() };
    const shared = [...groups.entries()].filter(([, members]) => members.length > 1);
    const delta = (i, j) => costOf(items[i], codes[j]) - costOf(items[i], codes[native[i]]);

    // Greedy, as in tokenizer/zcr.py (mode='greedy'): on each shared code the closest item keeps it;
    // all other items ("losers") are then reassigned, smallest native distance first, to their nearest unused code.
    const greedy = emptyPlan();
    const losers = [];
    for (const [c, members] of shared) {
      const ranked = [...members].sort((i, k) => costOf(items[i], codes[c]) - costOf(items[k], codes[c]));
      greedy.kept.push(ranked[0]);
      losers.push(...ranked.slice(1));
    }
    losers.sort((i, k) => costOf(items[i], codes[native[i]]) - costOf(items[k], codes[native[k]]));
    const taken = new Set();
    for (const i of losers) {
      // Never empty: there are at least rho free codes (checked above) and rho losers.
      const j = free.filter((c) => !taken.has(c))
        .reduce((best, c) => (costOf(items[i], codes[c]) < costOf(items[i], codes[best]) ? c : best));
      taken.add(j);
      greedy.moves.set(i, j);
      greedy.cost += delta(i, j);
    }

    // ZCR, as in tokenizer/zcr.py (mode='optimal', Eq. 10): the fewest changes (exactly rho), then the lowest total
    // increase in D. Enumerating which item stays on each shared code and where the movers go gives the same
    // optimum as the repository's Hungarian matching on these few codes.
    let zcr = emptyPlan();
    let found = false;
    const pickKeepers = (k, keepers) => {
      if (k === shared.length) {
        const movers = shared.flatMap(([, members], s) => members.filter((i) => i !== keepers[s]));
        const assign = (m, used, moves, cost) => {
          if (found && cost >= zcr.cost - EPS) return;
          if (m === movers.length) {
            zcr = { moves: new Map(moves), cost, kept: [...keepers] };
            found = true;
            return;
          }
          for (const j of free) {
            if (used.has(j)) continue;
            used.add(j);
            moves.set(movers[m], j);
            assign(m + 1, used, moves, cost + delta(movers[m], j));
            used.delete(j);
            moves.delete(movers[m]);
          }
        };
        assign(0, new Set(), new Map(), 0);
        return;
      }
      for (const i of shared[k][1]) pickKeepers(k + 1, [...keepers, i]);
    };
    pickKeepers(0, []);
    return { native, rho, feasible: true, greedy, zcr };
  }

  const itemTex = (item) => tex(`i_{${item.id}}`);
  const codeTex = (code) => tex(`\\text{code}_{\\text{${code.id}}}`);
  const totalTex = (v) => `<span class="nowrap">${tex(`\\textstyle\\sum \\Delta D = ${fmtCost(v)}`)}</span>`;

  // One panel's shapes, created when a preset loads: per code a diamond and its label; per item its dot, its
  // label, a dashed line to its code, and (greedy and ZCR panels) a reassignment arrow with its cost.
  function buildZcrView(svg, state) {
    const method = svg.dataset.method;
    // The native panel shows no reassignment, so it has no arrows or cost labels.
    const reassigns = method !== "native";
    svg.replaceChildren();
    if (reassigns) {
      const marker = svgEl("marker", {
        id: `zcr-arrow-${method}`, viewBox: "0 0 10 10", refX: 8, refY: 5,
        markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse",
      }, svgEl("defs", {}, svg));
      svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: `zcr-arrowhead ${method}` }, marker);
    }
    const lines = svgEl("g", {}, svg);
    const codeLayer = svgEl("g", {}, svg);
    const itemLayer = svgEl("g", {}, svg);
    const codes = state.codes.map((c) => {
      const group = svgEl("g", { class: "zcr-code" }, codeLayer);
      const shape = svgEl("polygon", {}, group);
      const label = svgEl("text", { class: "zcr-math", "text-anchor": "middle" }, group);
      label.append("code");
      svgEl("tspan", { class: "zcr-subscript", dy: SUB_DY }, label).textContent = c.id;
      return { group, shape, label };
    });
    const items = state.items.map((it) => {
      const home = svgEl("line", { class: "zcr-home" }, lines);
      let move = null;
      let cost = null;
      let costVal = null;
      if (reassigns) {
        move = svgEl("line", { class: `zcr-move ${method}`, "marker-end": `url(#zcr-arrow-${method})` }, lines);
        cost = svgEl("text", { class: `zcr-cost zcr-math ${method}`, "text-anchor": "middle" }, lines);
        cost.append("\u0394");
        svgEl("tspan", { class: "zcr-it" }, cost).textContent = "D";
        costVal = svgEl("tspan", {}, cost);
      }
      // All three panels can be dragged, but only the native one holds the focusable items; the greedy
      // and ZCR panels are images of the result, and pressing an item there focuses its native twin.
      const dot = svgEl("circle", { r: ITEM_R, class: "zcr-item" }, itemLayer);
      if (method === "native") {
        setAttrs(dot, { tabindex: 0, role: "button", "aria-roledescription": "movable item", "aria-label": `i${it.id}` });
      }
      const label = svgEl("text", { class: "zcr-item-label zcr-math", "text-anchor": "middle" }, itemLayer);
      svgEl("tspan", { class: "zcr-it" }, label).textContent = "i";
      svgEl("tspan", { class: "zcr-subscript", dy: SUB_DY }, label).textContent = it.id;
      // Greedy's keeper of a shared code is tagged "(winner)", as in the paper's figure.
      const winner = method === "greedy" ? svgEl("tspan", { class: "zcr-winner" }, label) : null;
      if (it.color) {
        dot.style.fill = it.color;
        label.style.fill = it.color;
      }
      return { home, move, cost, costVal, dot, label, winner };
    });
    return { svg, method, codes, items };
  }

  // One panel, in the paper's conventions: a dashed line joins an item to its code, an arrow marks a
  // reassignment (the vacated code gets no line), and a dashed diamond is a code that no item holds.
  function drawZcrView(state, view, sol) {
    const plan = view.method === "greedy" ? sol.greedy : view.method === "zcr" ? sol.zcr : null;
    const target = (i) => (plan && plan.moves.has(i) ? plan.moves.get(i) : null);
    const held = new Set(state.items.map((_, i) => target(i) ?? sol.native[i]));
    state.codes.forEach((c, j) => {
      const v = view.codes[j];
      const s = CODE_R;
      v.shape.setAttribute("points", `${c.x},${c.y - s} ${c.x + s},${c.y} ${c.x},${c.y + s} ${c.x - s},${c.y}`);
      v.group.classList.toggle("free", !held.has(j));
    });
    state.items.forEach((it, i) => {
      const v = view.items[i];
      setAttrs(v.dot, { cx: it.x, cy: it.y });
      if (!v.winner) return;
      const win = sol.rho > 0 && sol.greedy.kept.includes(i);
      v.winner.textContent = win ? "(winner)" : "";
      if (win) setAttrs(v.winner, { dx: 4, dy: -SUB_DY });
      else ["dx", "dy"].forEach((k) => v.winner.removeAttribute(k));
    });

    // Lines first; then the item labels and the cost labels, which keep clear of them.
    const segs = [];
    const arrows = state.items.map((it, i) => {
      const v = view.items[i];
      const home = state.codes[sol.native[i]];
      const to = target(i) === null ? null : state.codes[target(i)];
      setAttrs(v.home, { x1: it.x, y1: it.y, x2: home.x, y2: home.y });
      v.home.style.display = to ? "none" : "";
      if (v.move) {
        v.move.style.display = to ? "" : "none";
        v.cost.style.display = to ? "" : "none";
      }
      if (!to) {
        segs.push({ i, a: it, b: home });
        return null;
      }
      // Stop the arrow just short of the code's diamond.
      const dx = to.x - it.x;
      const dy = to.y - it.y;
      const len = Math.hypot(dx, dy) || 1;
      const cut = Math.max(0, len - CODE_R - 4);
      const end = { x: it.x + (dx * cut) / len, y: it.y + (dy * cut) / len };
      setAttrs(v.move, { x1: it.x, y1: it.y, x2: end.x, y2: end.y });
      segs.push({ i, a: it, b: end, move: true });
      return { it, home, target: to, end, nx: -dy / len, ny: dx / len };
    });
    placeZcrLabels(state, view, segs, arrows);
  }

  // Code and item labels go to the first nearby spot that is clear of shapes, lines, and the labels placed so
  // far (or the roomiest one); cost labels go beside their arrow.
  function placeZcrLabels(state, view, segs, arrows) {
    const box = (cx, cy, w, h) => ({ l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 });
    const gap = (a, o) => Math.max(o.l - a.r, a.l - o.r, o.t - a.b, a.t - o.b);
    const edge = (b) => Math.min(b.l, ZCR_PANEL.w - b.r, b.t, ZCR_PANEL.h - b.b);
    // Lines sampled every 4 units; skip = the arrow a cost label belongs to (cleared by its offset).
    const linePoints = (skip) => segs.filter((s) => !(s.move && s.i === skip)).flatMap((s) => {
      const n = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / 4));
      return Array.from({ length: n + 1 }, (_, k) => {
        const x = s.a.x + ((s.b.x - s.a.x) * k) / n;
        const y = s.a.y + ((s.b.y - s.a.y) * k) / n;
        return { l: x, r: x, t: y, b: y };
      });
    });
    const obstacles = [
      ...state.items.map((o) => box(o.x, o.y, 2 * ITEM_R, 2 * ITEM_R)),
      ...state.codes.map((c) => box(c.x, c.y, 2 * CODE_R, 2 * CODE_R)),
    ];
    const allLines = linePoints(-1);

    const place = (label, at, spots) => {
      setAttrs(label, { x: 0, y: 0 });
      const lb = label.getBBox();
      let best = null;
      for (const [ox, oy] of spots(lb.width / 2)) {
        const x = at.x + ox;
        const y = at.y + oy;
        const b = { l: x + lb.x, r: x + lb.x + lb.width, t: y + lb.y, b: y + lb.y + lb.height };
        const room = Math.min(edge(b), ...obstacles.map((o) => gap(b, o)), ...allLines.map((o) => gap(b, o)));
        if (!best || room > best.room) best = { x, y, room, b };
        if (room >= 3) {
          best = { x, y, room, b };
          break;
        }
      }
      // Never outside the panel, even when no spot is clear.
      const sx = Math.max(0, -best.b.l) - Math.max(0, best.b.r - ZCR_PANEL.w);
      const sy = Math.max(0, -best.b.t) - Math.max(0, best.b.b - ZCR_PANEL.h);
      setAttrs(label, { x: best.x + sx, y: best.y + sy });
      obstacles.push({ l: best.b.l + sx, r: best.b.r + sx, t: best.b.t + sy, b: best.b.b + sy });
    };
    // Codes prefer below (above near the top edge), items prefer above.
    state.codes.forEach((c, j) => place(view.codes[j].label, c, (hw) => {
      const below = [0, 27];
      const above = [0, -17];
      return [...(c.y < 70 ? [above, below] : [below, above]), [hw + 16, 5], [-(hw + 16), 5]];
    }));
    state.items.forEach((it, i) => place(view.items[i].label, it, (hw) => [
      [0, -20], [-(hw + 13), -13], [hw + 13, -13], [0, 27], [hw + 14, 5], [-(hw + 14), 5],
      [hw + 13, 24], [-(hw + 13), 24], [0, -34],
    ]));

    arrows.forEach((ar, i) => {
      if (!ar) return;
      const v = view.items[i];
      v.costVal.textContent = `\u00a0=\u00a0${fmtCost(costOf(ar.it, ar.target) - costOf(ar.it, ar.home))}`;
      const w = v.cost.getComputedTextLength() + 2;
      const h = 14;
      // Far enough along the normal that the label's box clears the arrow.
      const off = (w / 2) * Math.abs(ar.nx) + (h / 2) * Math.abs(ar.ny) + 4;
      const avoid = [...obstacles, ...linePoints(i)];
      // Nearest spots first; farther ones only when they have clearly more room (short arrows).
      let best = null;
      for (const d of [off, off + 10, off + 22]) {
        for (const f of [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8]) {
          for (const side of [1, -1]) {
            const x = ar.it.x + (ar.end.x - ar.it.x) * f + side * ar.nx * d;
            const y = ar.it.y + (ar.end.y - ar.it.y) * f + side * ar.ny * d;
            const b = box(x, y, w, h);
            const room = Math.min(edge(b), ...avoid.map((o) => gap(b, o)));
            if (!best || room > best.room + (d > off ? 3 : 0.5)) best = { x, y, room };
          }
        }
      }
      setAttrs(v.cost, { x: best.x, y: best.y + 4 });
      obstacles.push(box(best.x, best.y, w, h));
    });
  }

  // Title of panel (b): which item greedy lets keep the shared code.
  function greedyTitle(state, collided) {
    if (collided.length === 0) return "(b) Greedy: nothing to reassign";
    if (collided.length === 1) return `(b) Greedy: winner keeps ${codeTex(state.codes[collided[0]])}`;
    return "(b) Greedy: winners keep their codes";
  }

  // The sentence under the ZCR demo (HTML with inline math): which items greedy and ZCR reassign, and at what cost.
  function zcrExplain(state, sol, saving) {
    const { greedy, zcr } = sol;
    if (!sol.feasible) {
      return "There are fewer free codes than items that must be reassigned, so no collision-free last-level " +
        "assignment exists (the capacity condition fails).";
    }
    if (sol.rho === 0) {
      return "No collision: every item has its own code. Move an item next to another item\u2019s code to create one.";
    }
    // Items in id order: "i1", "i1 and i2", "i1, i2, and i3".
    const inIdOrder = (idx) => [...idx].sort((i, k) => Number(state.items[i].id) - Number(state.items[k].id));
    const names = (idx) => listText(inIdOrder(idx).map((i) => itemTex(state.items[i])));
    const paren = (v) => `<span class="nowrap">(${totalTex(v)})</span>`;
    const gMoved = [...greedy.moves.keys()];
    const zMoved = [...zcr.moves.keys()];
    const nearest = greedy.kept.length > 1 ? "the items nearest to their shared codes" : "the item nearest to the shared code";
    const sameItems = gMoved.length === zMoved.length && gMoved.every((i) => zcr.moves.has(i));
    const sameCodes = sameItems && gMoved.every((i) => zcr.moves.get(i) === greedy.moves.get(i));
    if (sameCodes) {
      return `Greedy retains ${names(greedy.kept)}, ${nearest}, and ZCR makes the same choice: ` +
        `both reassign ${names(gMoved)} ${paren(greedy.cost)}.`;
    }
    const lower = greedy.cost - zcr.cost > EPS ? `at ${saving}% lower cost` : "at the same cost";
    const greedyText = `Greedy retains ${names(greedy.kept)}, ${nearest}, and reassigns ${names(gMoved)} ` +
      `${paren(greedy.cost)}.`;
    if (sameItems) {
      // The same items move, but not to the same codes.
      const moveText = (i) => `${itemTex(state.items[i])} to ${codeTex(state.codes[zcr.moves.get(i)])}`;
      const moves = listText(inIdOrder(zMoved).map(moveText));
      return `${greedyText} ZCR reassigns the same ${zMoved.length === 1 ? "item" : "items"} but moves ${moves}, ` +
        `${lower} ${paren(zcr.cost)}.`;
    }
    return `${greedyText} ZCR retains ${names(zcr.kept)} and reassigns ${names(zMoved)} instead, ${lower} ` +
      `${paren(zcr.cost)}.`;
  }

  function initZcrDemo() {
    const root = document.getElementById("zcr-demo");
    if (!root) return;
    const byId = (id) => document.getElementById(id);
    const el = {
      headNative: byId("zcr-head-native"),
      titleGreedy: byId("zcr-title-greedy"),
      headGreedy: byId("zcr-head-greedy"),
      headZcr: byId("zcr-head-zcr"),
      rho: byId("zcr-rho"),
      costGreedy: byId("zcr-cost-greedy"),
      costZcr: byId("zcr-cost-zcr"),
      saving: byId("zcr-saving"),
      explain: byId("zcr-explain"),
    };
    const svgs = [...root.querySelectorAll(".zcr-svg")];
    const presetButtons = root.querySelectorAll("[data-preset]");
    const announce = announcer("zcr-status");
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const svgPoint = (svg, e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    let state = null;
    let views = [];
    let selected = null; // the item that a click on the drawing moves (the last one pressed or focused)

    const nativeDot = (i) => views.find((v) => v.method === "native").items[i].dot;

    function moveItem(i, x, y) {
      state.items[i].x = clamp(x, INSET.x, ZCR_PANEL.w - INSET.x);
      state.items[i].y = clamp(y, INSET.top, ZCR_PANEL.h - INSET.bottom);
      setPreset(null);
      render(true);
    }

    function attachDrag(svg, dot, i) {
      // A touch that starts on an item drags it instead of scrolling the page (touch-action on an SVG shape is
      // ignored); touches elsewhere on the drawing still scroll.
      dot.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
      dot.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        // preventDefault also blocks the click from focusing the item; focus it (its native twin in the
        // greedy and ZCR panels) so the arrow keys and a click on the drawing move it next.
        selected = i;
        nativeDot(i).focus({ preventScroll: true });
        dot.setPointerCapture(e.pointerId);
        dot.classList.add("dragging");
      });
      dot.addEventListener("pointermove", (e) => {
        if (!dot.hasPointerCapture(e.pointerId)) return;
        const pt = svgPoint(svg, e);
        moveItem(i, pt.x, pt.y);
      });
      const end = (e) => {
        if (dot.hasPointerCapture(e.pointerId)) dot.releasePointerCapture(e.pointerId);
        dot.classList.remove("dragging");
      };
      dot.addEventListener("pointerup", end);
      dot.addEventListener("pointercancel", end);
    }

    // The native panel's items are the focusable ones: the selection follows their focus, and arrow keys move them.
    // (Chrome makes any SVG element with a focus listener a Tab stop, so the other panels get none.)
    function attachKeys(dot, i) {
      dot.addEventListener("focus", () => { selected = i; });
      dot.addEventListener("blur", () => { if (selected === i) selected = null; });
      dot.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 20 : 5;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d) return;
        e.preventDefault();
        moveItem(i, state.items[i].x + d[0], state.items[i].y + d[1]);
      });
    }

    // Without dragging: select an item, then click (or tap) where it should go.
    svgs.forEach((svg) => {
      svg.addEventListener("mousedown", (e) => {
        // Keep the selected item focused (and its focus ring visible) when clicking the drawing.
        if (selected !== null && !e.target.classList.contains("zcr-item")) e.preventDefault();
      });
      svg.addEventListener("click", (e) => {
        if (selected === null || e.target.classList.contains("zcr-item")) return;
        const pt = svgPoint(svg, e);
        moveItem(selected, pt.x, pt.y);
      });
    });

    // speak: announce the result (only for the reader's own changes, not when the page loads).
    function describe(sol, speak) {
      const collided = [...new Set(sol.native.filter((c, i) => sol.native.indexOf(c) !== i))];
      const saving = sol.greedy.cost > EPS ? Math.round((1 - sol.zcr.cost / sol.greedy.cost) * 100) : 0;
      el.headNative.innerHTML = collided.length
        ? `collision at ${listText(collided.map((j) => codeTex(state.codes[j])))}` : "no collision";
      el.titleGreedy.innerHTML = greedyTitle(state, collided);
      el.headGreedy.innerHTML = totalTex(sol.greedy.cost);
      el.headZcr.innerHTML = totalTex(sol.zcr.cost);
      el.rho.textContent = sol.rho;
      el.costGreedy.textContent = fmtCost(sol.greedy.cost);
      el.costZcr.textContent = fmtCost(sol.zcr.cost);
      el.saving.textContent = `${saving}%`;
      el.explain.innerHTML = zcrExplain(state, sol, saving);
      glueMath(el.explain.querySelectorAll(".katex"));
      if (!speak) return;
      // Plain text for the screen-reader announcement: each formula as it reads on screen.
      const plain = el.explain.cloneNode(true);
      plain.querySelectorAll(".katex").forEach((k) => {
        k.replaceWith(k.querySelector(".katex-html").textContent.replace(/\u200b/g, ""));
      });
      announce(`Greedy ${fmtCost(sol.greedy.cost)}, ZCR ${fmtCost(sol.zcr.cost)}, ZCR saves ${saving}%. ` +
        plain.textContent);
    }

    function render(speak) {
      const sol = zcrSolve(state.items, state.codes);
      views.forEach((view) => drawZcrView(state, view, sol));
      describe(sol, speak);
    }

    function setPreset(name) {
      presetButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === name)));
    }

    function load(name, speak) {
      state = JSON.parse(JSON.stringify(ZCR_PRESETS[name]));
      selected = null;
      views = svgs.map((svg) => buildZcrView(svg, state));
      for (const view of views) {
        view.items.forEach((v, i) => {
          attachDrag(view.svg, v.dot, i);
          if (view.method === "native") attachKeys(v.dot, i);
        });
      }
      setPreset(name);
      render(speak);
    }

    presetButtons.forEach((b) => b.addEventListener("click", () => load(b.dataset.preset, true)));
    load("paper", false);
    if (document.fonts) document.fonts.ready.then(() => render(false));
  }

  // ---------------------------------------------------------------------------
  // Page helpers
  // ---------------------------------------------------------------------------

  // Switch the performance table between the four item-level metrics. The tabs are hidden until this runs.
  function initMetricTabs() {
    const tabs = document.querySelector(".metric-tabs");
    if (!tabs) return;
    const buttons = tabs.querySelectorAll("[data-metric]");
    const bodies = document.querySelectorAll("#performance tbody[data-metric]");
    const name = document.getElementById("metric-name");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const metric = btn.dataset.metric;
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        bodies.forEach((body) => { body.hidden = body.dataset.metric !== metric; });
        name.textContent = metric;
      });
    });
    tabs.hidden = false;
  }

  // Highlight the nav link of the section currently in view, and keep it visible in the scrollable bar.
  function initNavSpy() {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;
    const links = [...nav.querySelectorAll("a")];
    const targets = links.map((a) => document.querySelector(a.getAttribute("href")));
    let current = null;
    function update() {
      // A little below where anchored sections land (the scroll-padding-top that clears the sticky bar). Read on
      // every update: Safari can run this script before the stylesheet applies.
      const line = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 64) + 16;
      let active = links[0];
      targets.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) active = links[i];
      });
      // At the very bottom, the last section is the one being read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) active = links[links.length - 1];
      if (active === current) return;
      links.forEach((a) => a.removeAttribute("aria-current"));
      active.setAttribute("aria-current", "location");
      // Scroll only the bar itself (phones); scrolling the page here would cut short smooth anchor jumps.
      if (nav.scrollWidth > nav.clientWidth) {
        nav.scrollTo({ left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2 });
      }
      current = active;
    }
    window.addEventListener("scroll", update, { passive: true });
    for (const ev of ["scrollend", "hashchange", "resize"]) window.addEventListener(ev, update);
    update();
  }

  // Show the first lines of the abstract; the full text is one click away.
  function initAbstractToggle() {
    const text = document.getElementById("abstract-text");
    const btn = document.querySelector(".read-more");
    if (!text || !btn) return;
    text.classList.add("collapsed");
    btn.hidden = false;
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => {
      const open = !text.classList.toggle("collapsed");
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Show less" : "Read the full abstract";
    });
  }

  // A link straight to a collapsed block (e.g., #setup) opens it.
  function initLinkedDetails() {
    const open = () => {
      const target = location.hash && document.getElementById(location.hash.slice(1));
      if (target && target.tagName === "DETAILS") target.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
  }

  // Copy buttons: copy the target's text, or select it when the clipboard is not available.
  function initCopyButtons() {
    const status = document.getElementById("copy-status");
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      const label = btn.innerHTML;
      let timer = 0;
      btn.addEventListener("click", async () => {
        const pre = document.getElementById(btn.dataset.copy);
        let msg;
        let spoken; // the announcement, where the button's text would not read well
        try {
          await navigator.clipboard.writeText(pre.textContent);
          msg = "Copied";
        } catch {
          getSelection().selectAllChildren(pre);
          const platform = navigator.userAgentData?.platform || navigator.platform || "";
          if (matchMedia("(pointer: coarse)").matches) {
            msg = "Text selected: copy it";
          } else if (/Mac|iPhone|iPad/i.test(platform)) {
            msg = "Press \u2318C";
            spoken = "Press Command+C";
          } else {
            msg = "Press Ctrl+C";
          }
        }
        btn.textContent = msg;
        // Clear first so that the same message is announced again on a second click.
        status.textContent = "";
        setTimeout(() => { status.textContent = spoken || msg; }, 50);
        clearTimeout(timer);
        timer = setTimeout(() => {
          btn.innerHTML = label;
          status.textContent = "";
        }, msg === "Copied" ? 1500 : 4000);
      });
    });
  }

  // Email links are assembled here so the address is not in the page source.
  function initEmailLinks() {
    document.querySelectorAll(".email-link").forEach((a) => {
      const address = `${a.dataset.user}@${a.dataset.domain}`;
      a.href = `mailto:${address}`;
      a.textContent = address;
    });
  }

  // Print every collapsed block, with its images.
  function initPrint() {
    window.addEventListener("beforeprint", () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = "eager"; });
      document.querySelectorAll("details:not([open])").forEach((d) => {
        d.open = true;
        d.dataset.printOpened = "";
      });
    });
    window.addEventListener("afterprint", () => {
      document.querySelectorAll("details[data-print-opened]").forEach((d) => {
        d.open = false;
        delete d.dataset.printOpened;
      });
    });
  }

  // Sideways scrollers (wide figures and tables on phones, long equations, Algorithm 1, the phone nav, the CCE rows):
  // fade the edge that has more content, say so under a figure, and make a scrolling region focusable
  // so it can be scrolled from the keyboard.
  function initScrollCues() {
    const SCROLLERS = ".fig-scroll, .table-wrap, .eq, .algorithm-wrap, .cce-rows, .site-nav";
    // Named by data-name (figures, equations, the algorithm) or by the table's caption.
    const labelFor = (el) => `${el.dataset.name ?? el.querySelector("caption")?.textContent ?? "Table"}, scrolls sideways`;
    const update = (el) => {
      const scrolls = el.scrollWidth > el.clientWidth + 1;
      el.classList.toggle("scrolls", scrolls);
      el.classList.toggle("fade-l", scrolls && el.scrollLeft > 1);
      el.classList.toggle("fade-r", scrolls && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
      const fig = el.classList.contains("fig-scroll") && el.closest("figure");
      if (fig) fig.classList.toggle("scrolls", scrolls);
      // The nav's links and the (aria-hidden) CCE rows are not regions of their own.
      if (el.matches(".site-nav, .cce-rows")) return;
      if (scrolls) {
        setAttrs(el, { tabindex: 0, role: "region", "aria-label": labelFor(el) });
      } else {
        ["tabindex", "role", "aria-label"].forEach((k) => el.removeAttribute(k));
      }
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) update(e.target.matches(SCROLLERS) ? e.target : e.target.parentElement);
    });
    const scrollers = document.querySelectorAll(SCROLLERS);
    scrollers.forEach((el) => {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
      el.addEventListener("scroll", () => update(el), { passive: true });
      update(el);
    });
    // Web fonts (KaTeX's in particular) can widen the content without resizing any observed box.
    if (document.fonts) document.fonts.ready.then(() => scrollers.forEach(update));
  }
})();
