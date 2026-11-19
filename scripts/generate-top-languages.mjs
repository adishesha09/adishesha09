#!/usr/bin/env node
// Builds a bespoke, pixel-art styled "top languages" SVG by aggregating
// byte counts across every public, non-fork repo owned by USERNAME.
// Run on a schedule via .github/workflows/update-top-languages.yml so the
// card keeps reflecting real GitHub data without depending on a
// third-party stats widget.

const USERNAME = "adishesha09";
const OUTPUT_PATH = new URL("../assets/generated/top-languages.svg", import.meta.url);
const MAX_LANGUAGES = 6;
const BAR_SEGMENTS = 20;

const PALETTE = {
  bg: "#11182B",
  border: "#E2A53D",
  title: "#E2A53D",
  text: "#F2DFB0",
  dim: "#5C8AA6",
  track: "#1B2A41",
};

// Canonical linguist colours for the languages this account actually uses,
// falling back to the retro accent colour for anything unlisted.
const LANGUAGE_COLORS = {
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  HTML: "#e34c26",
  CSS: "#563d7c",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  ShaderLab: "#222c37",
  GLSL: "#5686a5",
  Java: "#b07219",
  Twine: "#2176ae",
};

function authHeaders() {
  const token = process.env.GITHUB_TOKEN;
  const headers = { "User-Agent": `${USERNAME}-readme-stats`, Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub API request failed (${res.status}) for ${url}`);
  }
  return res.json();
}

async function fetchAllRepos() {
  const repos = [];
  let page = 1;
  for (;;) {
    const batch = await fetchJson(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner`
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos.filter((repo) => !repo.fork && !repo.archived);
}

async function aggregateLanguages(repos) {
  const totals = {};
  for (const repo of repos) {
    const languages = await fetchJson(
      `https://api.github.com/repos/${USERNAME}/${repo.name}/languages`
    );
    for (const [lang, bytes] of Object.entries(languages)) {
      totals[lang] = (totals[lang] ?? 0) + bytes;
    }
  }
  return totals;
}

function topLanguages(totals) {
  const totalBytes = Object.values(totals).reduce((sum, n) => sum + n, 0) || 1;
  return Object.entries(totals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_LANGUAGES)
    .map(([name, bytes]) => ({
      name,
      percent: (bytes / totalBytes) * 100,
      color: LANGUAGE_COLORS[name] ?? PALETTE.dim,
    }));
}

function pixelBar(x, y, width, percent, color) {
  const segmentGap = 2;
  const segmentWidth = (width - segmentGap * (BAR_SEGMENTS - 1)) / BAR_SEGMENTS;
  const filledSegments = Math.round((percent / 100) * BAR_SEGMENTS);
  let rects = "";
  for (let i = 0; i < BAR_SEGMENTS; i++) {
    const segX = x + i * (segmentWidth + segmentGap);
    const fill = i < filledSegments ? color : PALETTE.track;
    rects += `<rect x="${segX.toFixed(1)}" y="${y}" width="${segmentWidth.toFixed(1)}" height="10" fill="${fill}"/>`;
  }
  return rects;
}

function buildSvg(languages) {
  const rowHeight = 34;
  const paddingTop = 54;
  const paddingBottom = 28;
  const width = 400;
  const height = paddingTop + languages.length * rowHeight + paddingBottom;
  const syncedAt = new Date().toISOString().slice(0, 10);

  let rows = "";
  languages.forEach((lang, index) => {
    const y = paddingTop + index * rowHeight;
    const label = `${lang.name} ${lang.percent.toFixed(1)}%`;
    rows += `
      <text x="16" y="${y}" font-family="Consolas, 'Courier New', monospace" font-size="13" fill="${PALETTE.text}">${label}</text>
      ${pixelBar(16, y + 10, width - 32, lang.percent, lang.color)}
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${PALETTE.bg}"/>
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="${PALETTE.border}" stroke-width="3"/>
  <text x="16" y="28" font-family="Consolas, 'Courier New', monospace" font-size="15" font-weight="bold" fill="${PALETTE.title}">&gt; TOP_LANGS.DAT</text>
  ${rows}
  <text x="${width - 16}" y="${height - 10}" text-anchor="end" font-family="Consolas, 'Courier New', monospace" font-size="10" fill="${PALETTE.dim}">SYNCED ${syncedAt}</text>
</svg>
`;
}

async function main() {
  const repos = await fetchAllRepos();
  const totals = await aggregateLanguages(repos);
  const languages = topLanguages(totals);
  if (languages.length === 0) {
    throw new Error("No language data found across any repo, aborting so we never commit an empty card.");
  }
  const svg = buildSvg(languages);
  await import("node:fs/promises").then((fs) => fs.writeFile(OUTPUT_PATH, svg, "utf8"));
  console.log(`Wrote ${languages.length} languages to ${OUTPUT_PATH.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
