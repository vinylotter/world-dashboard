import "./style.css";

const DATA_CSV = "/data/world_metrics.csv";
const GEOJSON_FILE = "/data/world.geojson";

const METRICS = {
  life_expectancy: { label: "Life expectancy (years)", format: d3.format(",.1f"), scale: "linear" },
  gdp_per_capita: { label: "GDP per capita (USD)", format: d3.format(",.0f"), scale: "log" },
  internet_users_pct: { label: "Internet users (% of population)", format: d3.format(",.1f"), scale: "linear" },
  population: { label: "Population", format: d3.format(",.0f"), scale: "log" }
};
const metricKeys = Object.keys(METRICS);

document.querySelector("#app").innerHTML = `
  <header style="padding:16px;">
    <h1 style="margin:0;">World Metrics Dashboard</h1>
    <p class="sub">By Vaish Koduri</p>
    <p class="sub">Data source: Our World in Data (OWID)</p>

    <div class="controls">
      <label>Year:
        <select id="yearSelect"></select>
      </label>
      <span class="sub" id="yearNote"></span>
    </div>
  </header>

  <main class="grid">
    <section class="card">
      <h2 style="margin:0 0 8px 0;">Distribution (Metric A)</h2>
      <p class="sub">Brush to select a range. Hover for details.</p>
      <div class="controls">
        <label>Metric A:
          <select id="metricA"></select>
        </label>
        <button id="clearA" class="btn">Clear</button>
      </div>
      <svg id="histA"></svg>
    </section>

    <section class="card">
      <h2 style="margin:0 0 8px 0;">Distribution (Metric B)</h2>
      <p class="sub">Brush to select a range. Hover for details.</p>
      <div class="controls">
        <label>Metric B:
          <select id="metricB"></select>
        </label>
        <button id="clearB" class="btn">Clear</button>
      </div>
      <svg id="histB"></svg>
    </section>

    <section class="card">
      <h2 style="margin:0 0 8px 0;">Correlation (A vs B)</h2>
      <p class="sub">Brush the scatterplot to select countries. Hover for details.</p>
      <div class="controls">
        <button id="clearScatter" class="btn">Clear</button>
      </div>
      <svg id="scatter"></svg>
    </section>

    <section class="card">
      <h2 style="margin:0 0 8px 0;">World map</h2>
      <p class="sub">Hover for details. Updates based on selection.</p>
      <div class="controls">
        <label>Map metric:
          <select id="mapMetric"></select>
        </label>
        <button id="clearAll" class="btn">Clear</button>
      </div>
      <svg id="map"></svg>
      <div class="sub" id="legend"></div>
    </section>
  </main>

  <div class="tooltip" id="tooltip" style="opacity:0;"></div>
`;

const tooltip = d3.select("#tooltip");
function showTooltip(html, event) {
  tooltip
    .style("opacity", 1)
    .html(html)
    .style("left", (event.pageX + 12) + "px")
    .style("top", (event.pageY + 12) + "px");
}
function hideTooltip() {
  tooltip.style("opacity", 0);
}

function toNumber(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim();
  if (s === "") return NaN;
  return Number(s.replace(/,/g, ""));
}

function validForMetric(value, metricKey) {
  if (!Number.isFinite(value)) return false;
  if (METRICS[metricKey].scale === "log") return value > 0;
  return true;
}

function showNoData(svgSelector, message) {
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();
  const w = svg.node().clientWidth;
  const h = svg.node().clientHeight;

  svg.append("text")
    .attr("x", w / 2)
    .attr("y", h / 2)
    .attr("text-anchor", "middle")
    .attr("fill", "#666")
    .text(message);
}

const state = {
  metricA: "life_expectancy",
  metricB: "gdp_per_capita",
  mapMetric: "life_expectancy",
  year: "latest",
  selected: null
};

function latestByMetric(allRows, key) {
  const valid = allRows.filter(d => validForMetric(d[key], key));
  const grouped = d3.group(valid, d => d.iso3);

  return Array.from(grouped, ([, arr]) => {
    let best = arr[0];
    for (const r of arr) if (r.year > best.year) best = r;
    return best;
  });
}

function latestByPair(allRows, xKey, yKey) {
  const valid = allRows.filter(d =>
    validForMetric(d[xKey], xKey) && validForMetric(d[yKey], yKey)
  );
  const grouped = d3.group(valid, d => d.iso3);

  return Array.from(grouped, ([, arr]) => {
    let best = arr[0];
    for (const r of arr) if (r.year > best.year) best = r;
    return best;
  });
}

function drawHistogram(svgSelector, rows, metricKey, selectedSet, onBrushEnd) {
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  const margin = { top: 10, right: 10, bottom: 42, left: 55 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const vals = rows.map(d => d[metricKey]).filter(Number.isFinite);
  const x = d3.scaleLinear().domain(d3.extent(vals)).nice().range([0, innerW]);
  const bins = d3.bin().domain(x.domain()).thresholds(18)(vals);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, b => b.length)])
    .nice()
    .range([innerH, 0]);

  g.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6));
  g.append("g").call(d3.axisLeft(y).ticks(5));

  const fmt = METRICS[metricKey].format;

  g.selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", b => x(b.x0) + 1)
    .attr("y", b => y(b.length))
    .attr("width", b => Math.max(0, x(b.x1) - x(b.x0) - 2))
    .attr("height", b => innerH - y(b.length))
    .attr("fill", "steelblue")
    .attr("opacity", b => {
      if (!selectedSet) return 0.9;
      for (const r of rows) {
        const v = r[metricKey];
        if (selectedSet.has(r.iso3) && v >= b.x0 && v < b.x1) return 0.95;
      }
      return 0.25;
    })
    .on("mousemove", (event, b) => {
      showTooltip(`<b>Range:</b> ${fmt(b.x0)} to ${fmt(b.x1)}<br/><b>Countries:</b> ${b.length}`, event);
    })
    .on("mouseleave", hideTooltip);

  svg.append("text")
    .attr("x", margin.left + innerW / 2)
    .attr("y", height - 8)
    .attr("text-anchor", "middle")
    .attr("fill", "#111")
    .text(METRICS[metricKey].label);

  const brush = d3.brushX()
    .extent([[0, 0], [innerW, innerH]])
    .on("end", (event) => {
      if (!event.selection) return onBrushEnd(null);
      const [x0, x1] = event.selection.map(x.invert);
      onBrushEnd([x0, x1]);
    });

  g.append("g").attr("class", "brush").call(brush);
}

function drawScatter(svgSelector, rows, xKey, yKey, selectedSet, onBrushEnd) {
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  const margin = { top: 10, right: 10, bottom: 45, left: 55 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xVals = rows.map(d => d[xKey]).filter(Number.isFinite);
  const yVals = rows.map(d => d[yKey]).filter(Number.isFinite);

  const x = (METRICS[xKey].scale === "log" ? d3.scaleLog() : d3.scaleLinear())
    .domain(d3.extent(xVals)).range([0, innerW]).nice();

  const y = (METRICS[yKey].scale === "log" ? d3.scaleLog() : d3.scaleLinear())
    .domain(d3.extent(yVals)).range([innerH, 0]).nice();

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(METRICS[xKey].scale === "log" ? d3.axisBottom(x).ticks(6, "~s") : d3.axisBottom(x).ticks(6));

  g.append("g")
    .call(METRICS[yKey].scale === "log" ? d3.axisLeft(y).ticks(6, "~s") : d3.axisLeft(y).ticks(6));

  g.selectAll("circle")
    .data(rows, d => d.iso3)
    .join("circle")
    .attr("cx", d => x(d[xKey]))
    .attr("cy", d => y(d[yKey]))
    .attr("r", 3)
    .attr("fill", "steelblue")
    .attr("opacity", d => {
      if (!selectedSet) return 0.75;
      return selectedSet.has(d.iso3) ? 0.95 : 0.15;
    })
    .on("mousemove", (event, d) => {
      const fx = METRICS[xKey].format(d[xKey]);
      const fy = METRICS[yKey].format(d[yKey]);
      showTooltip(
        `<b>${d.country}</b><br/>${METRICS[xKey].label}: ${fx}<br/>${METRICS[yKey].label}: ${fy}<br/>Year: ${d.year}`,
        event
      );
    })
    .on("mouseleave", hideTooltip);

  const brush = d3.brush()
    .extent([[0, 0], [innerW, innerH]])
    .on("end", (event) => {
      if (!event.selection) return onBrushEnd(null);
      const [[x0, y0], [x1, y1]] = event.selection;

      const selected = new Set();
      for (const d of rows) {
        const cx = x(d[xKey]);
        const cy = y(d[yKey]);
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) selected.add(d.iso3);
      }
      onBrushEnd(selected);
    });

  g.append("g").attr("class", "brush").call(brush);
}

function cleanName(s) {
  if (!s) return "";
  return s.toLowerCase().trim().replaceAll("&", "and");
}
function applyAlias(name) {
  const aliases = {
    "united states of america": "united states",
    "russia": "russian federation",
    "iran": "iran (islamic republic of)",
    "syria": "syrian arab republic",
    "laos": "lao people's democratic republic",
    "vietnam": "viet nam",
    "bolivia": "bolivia (plurinational state of)",
    "tanzania": "tanzania, united republic of",
    "venezuela": "venezuela (bolivarian republic of)",
    "moldova": "moldova, republic of",
    "brunei": "brunei darussalam",
    "czechia": "czech republic",
    "south korea": "korea, republic of",
    "north korea": "korea, democratic people's republic of",
    "palestine": "state of palestine",
    "cape verde": "cabo verde",
    "ivory coast": "côte d'ivoire",
    "congo": "congo, republic of the",
    "democratic republic of congo": "congo, democratic republic of the",
    "myanmar": "burma",
    "eswatini": "swaziland"
  };
  return aliases[name] || name;
}

function drawMap(svgSelector, geojson, rowsForMetric, metricKey, selectedSet) {
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  const byIso = new Map(rowsForMetric.map(d => [d.iso3, d]));
  const byName = new Map(rowsForMetric.map(d => [applyAlias(cleanName(d.country)), d]));

  const vals = rowsForMetric.map(d => d[metricKey]).filter(Number.isFinite);
  const domain = d3.extent(vals);
  const color = d3.scaleSequential().domain(domain).interpolator(d3.interpolateBlues);

  const projection = d3.geoNaturalEarth1().fitSize([width, height], geojson);
  const path = d3.geoPath(projection);

  svg.selectAll("path")
    .data(geojson.features)
    .join("path")
    .attr("d", path)
    .attr("fill", f => {
      const iso = f.properties.ISO_A3;
      const geoName = applyAlias(cleanName(f.properties.NAME));
      const geoId = f.id ? String(f.id) : "";

      let row = byIso.get(iso);
      if (!row && geoId.length === 3) row = byIso.get(geoId);
      if (!row) row = byName.get(geoName);

      if (!row) return "#eee";
      return color(row[metricKey]);
    })
    .attr("stroke", f => (selectedSet && selectedSet.has(f.properties.ISO_A3)) ? "#111" : "#999")
    .attr("stroke-width", f => (selectedSet && selectedSet.has(f.properties.ISO_A3)) ? 1.2 : 0.4)
    .attr("opacity", f => {
      if (!selectedSet) return 1;
      return selectedSet.has(f.properties.ISO_A3) ? 1 : 0.25;
    })
    .on("mousemove", (event, f) => {
      const iso = f.properties.ISO_A3;
      const geoName = applyAlias(cleanName(f.properties.NAME));
      const geoId = f.id ? String(f.id) : "";

      let row = byIso.get(iso);
      if (!row && geoId.length === 3) row = byIso.get(geoId);
      if (!row) row = byName.get(geoName);

      if (!row) return showTooltip(`<b>${f.properties.NAME || "Unknown"}</b><br/>No data`, event);

      const fmt = METRICS[metricKey].format;
      showTooltip(`<b>${row.country}</b><br/>${METRICS[metricKey].label}: ${fmt(row[metricKey])}<br/>Year: ${row.year}`, event);
    })
    .on("mouseleave", hideTooltip);

  d3.select("#legend").text(
    `Color range: ${METRICS[metricKey].format(domain[0])} to ${METRICS[metricKey].format(domain[1])}`
  );
}

async function main() {
  let [raw, geojson] = await Promise.all([d3.csv(DATA_CSV), d3.json(GEOJSON_FILE)]);

  // safe key cleanup
  raw = raw.map(row => {
    const cleaned = {};
    for (const [k, v] of Object.entries(row)) cleaned[k.replace("\ufeff", "").trim()] = v;
    return cleaned;
  });

  const allRows = raw.map(d => ({
    country: d.country,
    iso3: d.iso3,
    year: toNumber(d.year),
    gdp_per_capita: toNumber(d.gdp_per_capita),
    life_expectancy: toNumber(d.life_expectancy),
    internet_users_pct: toNumber(d.internet_users_pct),
    population: toNumber(d.population)
  })).filter(d => d.iso3 && String(d.iso3).length === 3 && Number.isFinite(d.year));

  function fillSelect(id, defaultKey) {
    const sel = d3.select(id);
    sel.selectAll("option")
      .data(metricKeys)
      .join("option")
      .attr("value", d => d)
      .text(d => METRICS[d].label);
    sel.property("value", defaultKey);
    return sel;
  }

  const selA = fillSelect("#metricA", state.metricA);
  const selB = fillSelect("#metricB", state.metricB);
  const selMap = fillSelect("#mapMetric", state.mapMetric);

  // Year dropdown (ALL years)
  const allYears = Array.from(new Set(allRows.map(d => d.year))).sort((a, b) => a - b);
  const yearSel = d3.select("#yearSelect");
  yearSel.selectAll("option")
    .data(["latest", ...allYears])
    .join("option")
    .attr("value", d => d)
    .text(d => d === "latest" ? "Latest available (per country)" : d);

  yearSel.property("value", state.year);
  d3.select("#yearNote").text(`Years available: ${d3.min(allYears)}–${d3.max(allYears)}`);

  function setSelected(newSelected) {
    state.selected = newSelected && newSelected.size ? newSelected : null;
    render();
  }

  function render() {
    let rowsA, rowsB, rowsScatter, rowsMap;

    if (state.year === "latest") {
      rowsA = latestByMetric(allRows, state.metricA);
      rowsB = latestByMetric(allRows, state.metricB);
      rowsScatter = latestByPair(allRows, state.metricA, state.metricB);
      rowsMap = latestByMetric(allRows, state.mapMetric);
    } else {
      const y = +state.year;
      const yearRows = allRows.filter(d => d.year === y);

      rowsA = yearRows.filter(d => validForMetric(d[state.metricA], state.metricA));
      rowsB = yearRows.filter(d => validForMetric(d[state.metricB], state.metricB));
      rowsScatter = yearRows.filter(d =>
        validForMetric(d[state.metricA], state.metricA) &&
        validForMetric(d[state.metricB], state.metricB)
      );
      rowsMap = yearRows.filter(d => validForMetric(d[state.mapMetric], state.mapMetric));
    }

    if (!rowsA.length) {
      showNoData("#histA", "No data for this year/metric.");
    } else {
      drawHistogram("#histA", rowsA, state.metricA, state.selected, (range) => {
        if (!range) return setSelected(null);
        const [a, b] = range;
        const minV = Math.min(a, b), maxV = Math.max(a, b);

        const selected = new Set();
        for (const r of rowsA) {
          const v = r[state.metricA];
          if (v >= minV && v <= maxV) selected.add(r.iso3);
        }
        setSelected(selected);
      });
    }

    if (!rowsB.length) {
      showNoData("#histB", "No data for this year/metric.");
    } else {
      drawHistogram("#histB", rowsB, state.metricB, state.selected, (range) => {
        if (!range) return setSelected(null);
        const [a, b] = range;
        const minV = Math.min(a, b), maxV = Math.max(a, b);

        const selected = new Set();
        for (const r of rowsB) {
          const v = r[state.metricB];
          if (v >= minV && v <= maxV) selected.add(r.iso3);
        }
        setSelected(selected);
      });
    }

    if (!rowsScatter.length) {
      showNoData("#scatter", "No data for this year/metric pair.");
    } else {
      drawScatter("#scatter", rowsScatter, state.metricA, state.metricB, state.selected, setSelected);
    }

    if (!rowsMap.length) {
      showNoData("#map", "No data for this year/metric.");
    } else {
      drawMap("#map", geojson, rowsMap, state.mapMetric, state.selected);
    }
  }

  selA.on("change", () => { state.metricA = selA.property("value"); state.selected = null; render(); });
  selB.on("change", () => { state.metricB = selB.property("value"); state.selected = null; render(); });
  selMap.on("change", () => { state.mapMetric = selMap.property("value"); render(); });
  yearSel.on("change", () => { state.year = yearSel.property("value"); state.selected = null; render(); });

  d3.select("#clearA").on("click", () => setSelected(null));
  d3.select("#clearB").on("click", () => setSelected(null));
  d3.select("#clearScatter").on("click", () => setSelected(null));
  d3.select("#clearAll").on("click", () => setSelected(null));

  render();
}

main();