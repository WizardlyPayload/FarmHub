/**
 * FS25 FarmDashboard | hardcoded-user-string scanner (read-only).
 *
 * Walks web/**\/*.js + setup.html inline scripts and flags candidate
 * user-visible English literals that should live in i18n instead:
 *
 *   - toast('…', …), showAlert('…', …), alert('…'), confirm('…'), prompt('…')
 *   - innerHTML = '…' / textContent = '…' with sentence-like English
 *   - Object literal user-visible props: title, ariaLabel, label,
 *     message, placeholder, confirmText, cancelText, text, tooltip
 *   - Template literals that read like sentences (>6 chars, has space,
 *     no `${`, contains at least one alphabetic char)
 *
 * Writes a human-readable report to ../../docs/I18N_CANDIDATES.md and prints
 * a one-line summary. Does not mutate any source.
 *
 * Usage: node web/locales/find-hardcoded-strings.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..", "..");
const WEB_ROOT = path.resolve(__dirname, "..");
const SETUP_HTML = path.resolve(APP_ROOT, "setup.html");
const DOCS_OUTPUT = path.resolve(REPO_ROOT, "FarmHub", "docs", "I18N_CANDIDATES.md");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "release",
  "out",
  ".git",
  "locales",
  "items_mod_extract",
  "vendor",
]);
const SKIP_FILES = new Set([
  "i18n.js",
  "setup-i18n.js",
  "theming.js",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".js" || ext === ".mjs") {
        if (!SKIP_FILES.has(entry.name)) out.push(full);
      }
    }
  }
  return out;
}

// Skip literals that are obviously non-user-facing.
function isUserFacing(literal) {
  const s = literal.trim();
  if (!s) return false;
  if (s.length < 3) return false;
  if (!/[A-Za-z]/.test(s)) return false; // pure digits / symbols
  // bail on obvious technical strings
  if (/^https?:\/\//i.test(s)) return false;
  if (/^[\w./-]+\.(js|css|html|json|png|svg|jpg|jpeg|webp|gif|mp4|woff2?)$/i.test(s))
    return false;
  if (/^[\w-]+\/[\w./-]+$/.test(s)) return false; // path-like
  if (/^#[\w-]+$/.test(s)) return false; // CSS id selector
  if (/^\.[\w-]+$/.test(s)) return false; // CSS class selector
  if (/^[a-z][a-zA-Z]+(\.[a-z][\w]*)+$/.test(s)) return false; // dotted key
  if (/^[A-Z_][A-Z0-9_]*$/.test(s)) return false; // CONSTANT_NAMES
  if (/^[a-z][a-zA-Z0-9]*$/.test(s)) return false; // single camelCase word
  if (/^[\w-]+$/.test(s) && !/\s/.test(s)) return false; // single identifier
  // require either a space OR multiple words-ish characters + sentence-ish content
  if (!/\s/.test(s) && s.length < 12) return false;
  return true;
}

// Heuristic: is this a code-like snippet rather than a natural-language string?
// Template literals with `;`, `{`, `}`, `=>`, etc. usually indicate that our
// regex spanned past the intended boundary into adjacent code.
function looksLikeCode(literal) {
  const s = literal.trim();
  // Multi-line with newlines + curly braces → almost always code
  if (/\n/.test(s) && /[{};=]/.test(s)) return true;
  // Arrow / assignment / statement delimiters
  if (/=>|===|!==|\|\|/.test(s)) return true;
  if (/[;{}]\s*$/.test(s)) return true;
  if (/^[.\s]*(const|let|var|function|return|if|else|for|while|switch)\b/.test(s))
    return true;
  // `foo.bar(` → method chain
  if (/[A-Za-z_]\w*\.[A-Za-z_]\w*\s*\(/.test(s)) return true;
  // Starts with a comma/operator (template-literal tail)
  if (/^[,.>\])\s]/.test(s) && /[{};=]/.test(s)) return true;
  // > 60% non-letter characters → likely code/markup
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (letters / s.length < 0.35 && s.length > 20) return true;
  return false;
}

function isPureHtmlTagString(literal) {
  const s = literal.trim();
  if (!s.startsWith("<")) return false;
  const withoutTags = s.replace(/<[^>]*>/g, "").trim();
  // If nothing textual remains, it's a pure-tag fragment (ok to skip)
  return withoutTags.length === 0;
}

function lineNumberFromIndex(src, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (src.charCodeAt(i) === 10) line++;
  }
  return line;
}

const SCAN_RULES = [
  {
    name: "toast/alert/confirm/prompt",
    pattern:
      /\b(?:toast|showAlert|showToast|alert|confirm|prompt)\s*\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/g,
  },
  {
    name: "innerHTML / outerHTML / textContent assign",
    pattern:
      /\.(?:innerHTML|outerHTML|textContent|innerText)\s*=\s*(['"`])((?:\\.|(?!\1).)*?)\1/g,
  },
  {
    name: "object prop (title/label/placeholder/message/…)",
    pattern:
      /\b(?:title|ariaLabel|aria-label|label|message|placeholder|confirmText|cancelText|okText|tooltip|heading|subtitle)\s*:\s*(['"`])((?:\\.|(?!\1).)*?)\1/g,
  },
  {
    name: "setAttribute('title'|'aria-label'|'placeholder', '…')",
    pattern:
      /setAttribute\s*\(\s*(['"`])(?:title|aria-label|placeholder)\1\s*,\s*(['"`])((?:\\.|(?!\2).)*?)\2/g,
    captureGroup: 3,
  },
];

// Template literal pattern — grab sentence-like tagged or untagged templates
// (no ${}, has space, alphabetic). The negated character class also excludes
// `{`, `}`, `;`, `=` to avoid spanning across unrelated code sections when a
// backtick appears somewhere in the file.
const TEMPLATE_PATTERN = /`([^`${};=\n]{6,})`/g;

// True if the match index is inside a console.* call or a /** JSDoc block.
function isInNonUserContext(src, idx) {
  // Walk back up to 200 chars looking for "console." on the same expression.
  const start = Math.max(0, idx - 200);
  const before = src.slice(start, idx);
  // Match something like `console.log(` or `console.error(` without a closing )
  // between the match and idx.
  const parenBalance = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
  if (parenBalance > 0 && /console\.(log|warn|error|info|debug|trace)\s*\($/m.test(before.replace(/\s+/g, "").replace(/(.*)\bconsole\./, "console."))) {
    // Fallback simple regex check (the nested-expression eval above is safe):
    return true;
  }
  if (/console\.(log|warn|error|info|debug|trace)\s*\([^)]*$/m.test(before)) return true;

  // Inside /** … */ JSDoc
  const openDoc = before.lastIndexOf("/**");
  const closeDoc = before.lastIndexOf("*/");
  if (openDoc !== -1 && openDoc > closeDoc) return true;

  // Inline // comment ending at newline
  const lineStart = before.lastIndexOf("\n");
  const lineFrag = before.slice(lineStart);
  if (lineFrag.includes("//")) return true;

  return false;
}

// Skip strings that are already routed through t() — the regex may still catch
// the outer innerHTML assignment, but the actual visible string is built via t().
function isAlreadyTranslated(literal) {
  return /\bt\(\s*['"]/.test(literal);
}

function scanFile(file) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch (_) {
    return [];
  }
  const findings = [];
  for (const rule of SCAN_RULES) {
    rule.pattern.lastIndex = 0;
    let m;
    const capIdx = rule.captureGroup ?? 2;
    while ((m = rule.pattern.exec(src)) !== null) {
      const literal = m[capIdx];
      if (!isUserFacing(literal)) continue;
      if (looksLikeCode(literal)) continue;
      if (isPureHtmlTagString(literal)) continue;
      if (isAlreadyTranslated(literal)) continue;
      if (isInNonUserContext(src, m.index)) continue;
      findings.push({
        file,
        line: lineNumberFromIndex(src, m.index),
        rule: rule.name,
        snippet: literal.length > 140 ? literal.slice(0, 137) + "…" : literal,
      });
    }
  }
  TEMPLATE_PATTERN.lastIndex = 0;
  let tm;
  while ((tm = TEMPLATE_PATTERN.exec(src)) !== null) {
    const literal = tm[1];
    if (literal.includes("${")) continue;
    if (!isUserFacing(literal)) continue;
    if (!/\s/.test(literal)) continue;
    if (looksLikeCode(literal)) continue;
    if (isPureHtmlTagString(literal)) continue;
    if (isAlreadyTranslated(literal)) continue;
    if (isInNonUserContext(src, tm.index)) continue;
    findings.push({
      file,
      line: lineNumberFromIndex(src, tm.index),
      rule: "template literal (no placeholders)",
      snippet: literal.length > 140 ? literal.slice(0, 137) + "…" : literal,
    });
  }
  return findings;
}

function suggestKey(file, snippet) {
  const mod = path.basename(file, path.extname(file));
  const slug = snippet
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .slice(0, 5)
    .join("_");
  return `${mod}.${slug || "TODO"}`;
}

function main() {
  const files = walk(WEB_ROOT);
  if (fs.existsSync(SETUP_HTML)) files.push(SETUP_HTML);

  const allFindings = [];
  for (const f of files) {
    if (path.extname(f).toLowerCase() === ".html") {
      const src = fs.readFileSync(f, "utf8");
      const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const s of scripts) {
        const inline = s[1];
        const tmp = path.basename(f);
        const offset = s.index + s[0].indexOf(">") + 1;
        const findings = scanFile(f).filter(() => false); // placeholder, real scan below
        // Re-run rules directly on inline snippet:
        for (const rule of SCAN_RULES) {
          rule.pattern.lastIndex = 0;
          let m;
          const capIdx = rule.captureGroup ?? 2;
          while ((m = rule.pattern.exec(inline)) !== null) {
            const literal = m[capIdx];
            if (!isUserFacing(literal)) continue;
            if (looksLikeCode(literal)) continue;
            if (isPureHtmlTagString(literal)) continue;
            if (isAlreadyTranslated(literal)) continue;
            if (isInNonUserContext(inline, m.index)) continue;
            findings.push({
              file: f,
              line: lineNumberFromIndex(src, offset + m.index),
              rule: `${rule.name} (inline)`,
              snippet: literal.length > 140 ? literal.slice(0, 137) + "…" : literal,
            });
          }
        }
        TEMPLATE_PATTERN.lastIndex = 0;
        let tm;
        while ((tm = TEMPLATE_PATTERN.exec(inline)) !== null) {
          const literal = tm[1];
          if (literal.includes("${")) continue;
          if (!isUserFacing(literal)) continue;
          if (!/\s/.test(literal)) continue;
          if (looksLikeCode(literal)) continue;
          if (isPureHtmlTagString(literal)) continue;
          if (isAlreadyTranslated(literal)) continue;
          if (isInNonUserContext(inline, tm.index)) continue;
          findings.push({
            file: f,
            line: lineNumberFromIndex(src, offset + tm.index),
            rule: "template literal (inline)",
            snippet: literal.length > 140 ? literal.slice(0, 137) + "…" : literal,
          });
        }
        allFindings.push(...findings);
      }
    } else {
      allFindings.push(...scanFile(f));
    }
  }

  // Dedupe by file+line+snippet
  const seen = new Set();
  const unique = [];
  for (const f of allFindings) {
    const k = `${f.file}|${f.line}|${f.snippet}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(f);
  }
  unique.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  const byFile = new Map();
  for (const f of unique) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  const lines = [];
  lines.push("# i18n candidate strings");
  lines.push("");
  lines.push(
    "Auto-generated by `web/locales/find-hardcoded-strings.mjs`. Each row is a literal that looks user-visible and is not already routed through `t()`. The suggested key is a slug hint — use a proper namespace when converting."
  );
  lines.push("");
  lines.push(`Total candidates: **${unique.length}** across **${byFile.size}** files.`);
  lines.push("");

  for (const [file, items] of byFile) {
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
    lines.push(`## ${rel}`);
    lines.push("");
    lines.push("| Line | Rule | Snippet | Suggested key |");
    lines.push("| ---: | --- | --- | --- |");
    for (const it of items) {
      const snippet = it.snippet
        .replace(/\|/g, "\\|")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ");
      lines.push(
        `| ${it.line} | ${it.rule} | \`${snippet}\` | \`${suggestKey(file, it.snippet)}\` |`
      );
    }
    lines.push("");
  }

  fs.mkdirSync(path.dirname(DOCS_OUTPUT), { recursive: true });
  fs.writeFileSync(DOCS_OUTPUT, lines.join("\n"));
  console.log(
    `Wrote ${DOCS_OUTPUT} | ${unique.length} candidates across ${byFile.size} files`
  );
}

main();
