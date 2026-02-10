// TODO Level 3: add more indicators with a dropdown
// TODO Level 4: add brushing + linking between charts and map
// TODO: add time-based exploration later
import "./style.css";

// files in public/data
const DATA_CSV = "/data/merged_latest.csv";
const GEOJSON_FILE = "/data/world.geojson";

// number formats
const fmt0 = d3.format(",.0f");
const fmt1 = d3.format(",.1f");

// page layout
document.querySelector("#app").innerHTML = `
  <header>
    <h1>Wealth & Health Around the World</h1>
    <p class="sub">By Vaish Koduri</p>
    <p class="sub">
      Data source: Our World in Data (OWID). Indicators: Life expectancy and GDP per capita (World Bank).
    </p>
    <p class="sub" id="yearNote"></p>
  </header>

  <main class="grid">
    <section class="card">
      <h2>Distribution: Life expectancy</h2>
      <svg id="histLife"></svg>
    </section>

    <section class="card">
      <h2>Distribution: GDP per capita</h2>
      <svg id="histGdp"></svg>
    </section>

    <section class="card">
      <h2>Correlation: GDP per capita vs Life expectancy</h2>
      <svg id="scatter"></svg>
    </section>

    <section class="card">
      <h2>World map</h2>

      <div class="controls">
        <label>
          Map attribute:
          <select id="mapMetric">
            <option value="life_expectancy">Life expectancy</option>
            <option value="gdp_per_capita">GDP per capita</option>
          </select>
        </label>
      </div>

      <svg id="map"></svg>
      <div class="legend" id="legend"></div>
    </section>
  </main>

  <div class="tooltip" id="tooltip" style="opacity:0;"></div>
`;

// tooltip
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

// histogram
function drawHistogram(svgSelector, values, xLabel) {
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  const margin = { top: 10, right: 10, bottom: 40, left: 45 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain(d3.extent(values))
    .nice()
    .range([0, innerW]);

  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(18)(values);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .nice()
    .range([innerH, 0]);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6));

  g.append("g")
    .call(d3.axisLeft(y).ticks(5));

  g.selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", d => x(d.x0) + 1)
    .attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", d => innerH - y(d.length))
    .attr("fill", "steelblue")
    .on("mousemove", (event, d) => {
      showTooltip(
        `<b>Range:</b> ${fmt1(d.x0)} to ${fmt1(d.x1)}<br/><b>Countries:</b> ${d.length}`,
        event
      );
    })
    .on("mouseleave", hideTooltip);

  svg.append("text")
    .attr("x", margin.left + innerW / 2)
    .attr("y", height - 8)
    .attr("text-anchor", "middle")
    .attr("fill", "#111")
    .text(xLabel);
}

// scatterplot
function drawScatter(svgSelector, rows) {
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  const margin = { top: 10, right: 10, bottom: 45, left: 55 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // GDP is skewed so log helps
  const x = d3.scaleLog()
    .domain(d3.extent(rows, d => d.gdp_per_capita))
    .range([0, innerW])
    .nice();

  const y = d3.scaleLinear()
    .domain(d3.extent(rows, d => d.life_expectancy))
    .range([innerH, 0])
    .nice();

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6, "~s"));

  g.append("g")
    .call(d3.axisLeft(y).ticks(6));

  g.selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("cx", d => x(d.gdp_per_capita))
    .attr("cy", d => y(d.life_expectancy))
    .attr("r", 3)
    .attr("fill", "steelblue")
    .attr("opacity", 0.75)
    .on("mousemove", (event, d) => {
      showTooltip(
        `<b>${d.country}</b><br/>Life expectancy: ${fmt1(d.life_expectancy)}<br/>GDP per capita: ${fmt0(d.gdp_per_capita)}<br/>Year: ${d.year}`,
        event
      );
    })
    .on("mouseleave", hideTooltip);

  svg.append("text")
    .attr("x", margin.left + innerW / 2)
    .attr("y", height - 8)
    .attr("text-anchor", "middle")
    .attr("fill", "#111")
    .text("GDP per capita (log scale)");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + innerH / 2))
    .attr("y", 14)
    .attr("text-anchor", "middle")
    .attr("fill", "#111")
    .text("Life expectancy (years)");
}

// cleaning names for matching
function cleanName(s) {
  if (!s) return "";
  return s.toLowerCase().trim().replaceAll("&", "and");
}

// common mismatched names
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

// choropleth map
function drawMap(svgSelector, geojson, rows, metricKey) {
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  // lookups
  const byIso = new Map(rows.map(d => [d.iso3, d]));
  const byName = new Map(rows.map(d => [applyAlias(cleanName(d.country)), d]));

  // color scale
  const vals = rows.map(d => d[metricKey]).filter(v => Number.isFinite(v));
  const domain = d3.extent(vals);

  const color = d3.scaleSequential()
    .domain(domain)
    .interpolator(d3.interpolateBlues);

  // projection and path
  const projection = d3.geoNaturalEarth1().fitSize([width, height], geojson);
  const path = d3.geoPath(projection);

  // drawing countries
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
    .attr("stroke", "#999")
    .attr("stroke-width", 0.4)
    .on("mousemove", (event, f) => {
      const iso = f.properties.ISO_A3;
      const geoName = applyAlias(cleanName(f.properties.NAME));
      const geoId = f.id ? String(f.id) : "";

      let row = byIso.get(iso);
      if (!row && geoId.length === 3) row = byIso.get(geoId);
      if (!row) row = byName.get(geoName);

      if (!row) {
        showTooltip(`<b>${f.properties.NAME || "Unknown"}</b><br/>No data`, event);
        return;
      }

      let valueText = "";
      if (metricKey === "life_expectancy") valueText = `${fmt1(row.life_expectancy)} years`;
      if (metricKey === "gdp_per_capita") valueText = `${fmt0(row.gdp_per_capita)}`;

      showTooltip(
        `<b>${row.country}</b><br/>${metricKey}: ${valueText}<br/>Year: ${row.year}`,
        event
      );
    })
    .on("mouseleave", hideTooltip);

  d3.select("#legend").text(`Color range: ${fmt1(domain[0])} to ${fmt1(domain[1])}`);
}

// main
async function main() {
  const [rowsRaw, geojson] = await Promise.all([
    d3.csv(DATA_CSV),
    d3.json(GEOJSON_FILE)
  ]);

  const rows = rowsRaw.map(d => ({
    country: d.country,
    iso3: d.iso3,
    year: +d.year,
    life_expectancy: +d.life_expectancy,
    gdp_per_capita: +d.gdp_per_capita
  }))
  .filter(d => Number.isFinite(d.life_expectancy) && Number.isFinite(d.gdp_per_capita));

  // shows year range
  const years = Array.from(new Set(rows.map(d => d.year))).sort((a, b) => a - b);
  d3.select("#yearNote").text(
    `This dataset uses the most recent year where BOTH metrics exist for each country. Year range: ${years[0]}–${years[years.length - 1]}.`
  );

  // Level 1 charts
  drawHistogram("#histLife", rows.map(d => d.life_expectancy), "Life expectancy (years)");
  drawHistogram("#histGdp", rows.map(d => d.gdp_per_capita), "GDP per capita");
  drawScatter("#scatter", rows);

  // Level 2 map toggle
  const select = d3.select("#mapMetric");

  function updateMap() {
    const key = select.property("value");
    drawMap("#map", geojson, rows, key);
  }

  select.on("change", updateMap);
  updateMap();
}

main();
