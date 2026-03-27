/* ═══════════════════════════════════════════════════════════════
   SQL → FetchXML translator for Colvio
   Converts SQL SELECT statements to Dynamics 365 FetchXML.
   ═══════════════════════════════════════════════════════════════ */

// ── Tokenizer ────────────────────────────────────────────────
function tokenize(sql) {
  const tokens = [];
  let i = 0;
  const s = sql.trim();
  while (i < s.length) {
    // skip whitespace
    if (/\s/.test(s[i])) { i++; continue; }
    // single-quoted string
    if (s[i] === "'") {
      let j = i + 1;
      let val = "";
      while (j < s.length) {
        if (s[j] === "'" && s[j + 1] === "'") { val += "'"; j += 2; }
        else if (s[j] === "'") { j++; break; }
        else { val += s[j]; j++; }
      }
      tokens.push({ type: "STRING", value: val });
      i = j;
      continue;
    }
    // number
    if (/\d/.test(s[i]) || (s[i] === "-" && i + 1 < s.length && /\d/.test(s[i + 1]))) {
      let j = i;
      if (s[j] === "-") j++;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      tokens.push({ type: "NUMBER", value: s.substring(i, j) });
      i = j;
      continue;
    }
    // parens, comma, dot, operators
    if (s[i] === "(") { tokens.push({ type: "LPAREN", value: "(" }); i++; continue; }
    if (s[i] === ")") { tokens.push({ type: "RPAREN", value: ")" }); i++; continue; }
    if (s[i] === ",") { tokens.push({ type: "COMMA", value: "," }); i++; continue; }
    if (s[i] === ".") { tokens.push({ type: "DOT", value: "." }); i++; continue; }
    if (s[i] === "*") { tokens.push({ type: "STAR", value: "*" }); i++; continue; }
    if (s[i] === "=" && s[i + 1] !== ">") { tokens.push({ type: "OP", value: "=" }); i++; continue; }
    if (s[i] === "!" && s[i + 1] === "=") { tokens.push({ type: "OP", value: "!=" }); i += 2; continue; }
    if (s[i] === "<" && s[i + 1] === ">") { tokens.push({ type: "OP", value: "<>" }); i += 2; continue; }
    if (s[i] === "<" && s[i + 1] === "=") { tokens.push({ type: "OP", value: "<=" }); i += 2; continue; }
    if (s[i] === ">" && s[i + 1] === "=") { tokens.push({ type: "OP", value: ">=" }); i += 2; continue; }
    if (s[i] === "<") { tokens.push({ type: "OP", value: "<" }); i++; continue; }
    if (s[i] === ">") { tokens.push({ type: "OP", value: ">" }); i++; continue; }
    // identifier or keyword
    if (/[a-zA-Z_]/.test(s[i])) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      const word = s.substring(i, j);
      const upper = word.toUpperCase();
      const keywords = new Set(["SELECT","FROM","WHERE","AND","OR","ON","AS","JOIN","LEFT","INNER","RIGHT","OUTER","ORDER","BY","ASC","DESC","TOP","DISTINCT","IS","NULL","NOT","LIKE","IN","COUNT","SUM","AVG","MIN","MAX","GROUP","HAVING","CROSS","FULL"]);
      tokens.push({ type: keywords.has(upper) ? "KW" : "IDENT", value: keywords.has(upper) ? upper : word });
      i = j;
      continue;
    }
    // skip unknown chars
    i++;
  }
  return tokens;
}

// ── AST parser ───────────────────────────────────────────────
export function parseSqlToAst(sql) {
  const tokens = tokenize(sql);
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const next = () => tokens[pos++] || null;
  const expect = (type, value) => {
    const t = next();
    if (!t) throw new Error(`Expected ${value || type} but reached end of query`);
    if (type && t.type !== type) throw new Error(`Expected ${value || type} near "${t.value}"`);
    if (value && t.value !== value) throw new Error(`Expected "${value}" but got "${t.value}"`);
    return t;
  };
  const kw = (val) => peek()?.type === "KW" && peek().value === val;
  const kwNext = (val) => { if (kw(val)) { next(); return true; } return false; };
  const ident = () => {
    const t = peek();
    if (t && (t.type === "IDENT" || t.type === "KW")) { next(); return t.value; }
    throw new Error(`Expected identifier near "${t?.value || "end"}"`);
  };
  // read dotted name: alias.column
  const dottedName = () => {
    let name = ident();
    if (peek()?.type === "DOT") { next(); name = name + "." + ident(); }
    return name;
  };

  const ast = { select: [], from: null, fromAlias: null, joins: [], where: null, orderBy: [], top: null, distinct: false, aggregate: false, groupBy: [] };

  // SELECT
  expect("KW", "SELECT");

  // DISTINCT
  if (kw("DISTINCT")) { ast.distinct = true; next(); }

  // TOP N
  if (kw("TOP")) { next(); ast.top = parseInt(next().value, 10); }

  // columns
  if (peek()?.type === "STAR") {
    next();
    ast.select.push({ expr: "*" });
  } else {
    do {
      // check for aggregate: COUNT(*), SUM(col), etc.
      const aggs = ["COUNT", "SUM", "AVG", "MIN", "MAX"];
      if (peek()?.type === "KW" && aggs.includes(peek().value)) {
        const fn = next().value;
        expect("LPAREN");
        let col = "*";
        if (peek()?.type !== "STAR" && peek()?.type !== "RPAREN") { col = dottedName(); }
        else if (peek()?.type === "STAR") { next(); }
        expect("RPAREN");
        let alias = null;
        if (kw("AS")) { next(); alias = ident(); }
        ast.select.push({ expr: "aggregate", fn, col, alias: alias || fn.toLowerCase() });
        ast.aggregate = true;
      } else {
        const col = dottedName();
        let alias = null;
        if (kw("AS")) { next(); alias = ident(); }
        ast.select.push({ expr: "column", name: col, alias });
      }
    } while (peek()?.type === "COMMA" && next());
  }

  // FROM
  expect("KW", "FROM");
  ast.from = ident();
  if (kw("AS")) { next(); ast.fromAlias = ident(); }
  else if (peek()?.type === "IDENT" && !["WHERE","ORDER","JOIN","LEFT","INNER","RIGHT","GROUP"].includes(peek()?.value?.toUpperCase?.())) {
    ast.fromAlias = ident();
  }

  // JOINs
  while (true) {
    let linkType = "inner";
    if (kw("LEFT")) { linkType = "outer"; next(); kwNext("OUTER"); }
    else if (kw("INNER")) { next(); }
    else if (kw("RIGHT")) { linkType = "inner"; next(); }
    if (!kw("JOIN")) break;
    next(); // consume JOIN
    const entity = ident();
    let alias = null;
    if (kw("AS")) { next(); alias = ident(); }
    else if (peek()?.type === "IDENT" && peek()?.value?.toUpperCase?.() !== "ON") { alias = ident(); }
    expect("KW", "ON");
    const left = dottedName();
    expect("OP", "=");
    const right = dottedName();
    ast.joins.push({ entity, alias, linkType, left, right });
  }

  // WHERE
  if (kw("WHERE")) {
    next();
    ast.where = parseWhereExpr();
  }

  // GROUP BY
  if (kw("GROUP")) {
    next(); expect("KW", "BY");
    do { ast.groupBy.push(dottedName()); } while (peek()?.type === "COMMA" && next());
  }

  // ORDER BY
  if (kw("ORDER")) {
    next(); expect("KW", "BY");
    do {
      const col = dottedName();
      let dir = "ASC";
      if (kw("ASC")) { next(); } else if (kw("DESC")) { dir = "DESC"; next(); }
      ast.orderBy.push({ col, dir });
    } while (peek()?.type === "COMMA" && next());
  }

  return ast;

  // ── WHERE expression parser (recursive descent) ──
  function parseWhereExpr() { return parseOr(); }

  function parseOr() {
    let left = parseAnd();
    while (kw("OR")) {
      next();
      const right = parseAnd();
      left = { type: "logic", op: "or", children: [left, right] };
    }
    return left;
  }

  function parseAnd() {
    let left = parsePrimary();
    while (kw("AND")) {
      next();
      const right = parsePrimary();
      left = { type: "logic", op: "and", children: [left, right] };
    }
    return left;
  }

  function parsePrimary() {
    // parenthesized group
    if (peek()?.type === "LPAREN") {
      next();
      const expr = parseOr();
      expect("RPAREN");
      return expr;
    }
    // NOT
    if (kw("NOT")) {
      next();
      const inner = parsePrimary();
      // wrap: negate the operator
      if (inner.type === "condition") {
        const negMap = { eq: "ne", ne: "eq", gt: "le", ge: "lt", lt: "ge", le: "gt", like: "not-like", "null": "not-null", "not-null": "null", in: "not-in" };
        inner.operator = negMap[inner.operator] || inner.operator;
      }
      return inner;
    }
    // condition: col OP value | col IS [NOT] NULL | col LIKE val | col IN (...)
    const col = dottedName();

    // IS [NOT] NULL
    if (kw("IS")) {
      next();
      const negate = kwNext("NOT");
      expect("KW", "NULL");
      return { type: "condition", attribute: col, operator: negate ? "not-null" : "null" };
    }
    // LIKE
    if (kw("LIKE")) {
      next();
      const val = next();
      return { type: "condition", attribute: col, operator: "like", value: val.value };
    }
    // NOT LIKE / NOT IN
    if (kw("NOT")) {
      next();
      if (kw("LIKE")) {
        next();
        const val = next();
        return { type: "condition", attribute: col, operator: "not-like", value: val.value };
      }
      if (kw("IN")) {
        next();
        expect("LPAREN");
        const vals = [];
        do {
          const v = next();
          vals.push(v.value);
        } while (peek()?.type === "COMMA" && next());
        expect("RPAREN");
        return { type: "condition", attribute: col, operator: "not-in", values: vals };
      }
    }
    // IN (...)
    if (kw("IN")) {
      next();
      expect("LPAREN");
      const vals = [];
      do {
        const v = next();
        vals.push(v.value);
      } while (peek()?.type === "COMMA" && next());
      expect("RPAREN");
      return { type: "condition", attribute: col, operator: "in", values: vals };
    }
    // comparison operators
    const op = next();
    if (!op || op.type !== "OP") throw new Error(`Expected operator after "${col}"`);
    const opMap = { "=": "eq", "!=": "ne", "<>": "ne", ">": "gt", ">=": "ge", "<": "lt", "<=": "le" };
    const fxOp = opMap[op.value];
    if (!fxOp) throw new Error(`Unsupported operator "${op.value}"`);
    const val = next();
    if (!val) throw new Error(`Expected value after "${col} ${op.value}"`);
    const isNum = val.type === "NUMBER";
    return { type: "condition", attribute: col, operator: fxOp, value: val.value, numeric: isNum };
  }
}

// ── FetchXML generator ───────────────────────────────────────
function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// resolve alias.column → { entity alias, column name }
function resolveCol(col, ast) {
  if (!col.includes(".")) return { entity: null, col };
  const [prefix, field] = col.split(".", 2);
  // check if prefix matches fromAlias
  if (ast.fromAlias && prefix === ast.fromAlias) return { entity: null, col: field };
  // check joins
  const j = ast.joins.find(j => j.alias === prefix || j.entity === prefix);
  if (j) return { entity: j.alias || j.entity, col: field };
  return { entity: null, col };
}

export function astToFetchXml(ast) {
  const ind = (n) => "  ".repeat(n);
  const lines = [];
  const fetchAttrs = [];

  if (ast.top) fetchAttrs.push(`count="${ast.top}"`);
  if (ast.distinct) fetchAttrs.push(`distinct="true"`);
  if (ast.aggregate) fetchAttrs.push(`aggregate="true"`);

  lines.push(`<fetch${fetchAttrs.length ? " " + fetchAttrs.join(" ") : ""}>`);
  lines.push(`${ind(1)}<entity name="${escapeXml(ast.from)}">`);

  // Attributes on main entity
  const mainAttrs = [];
  const joinAttrs = {}; // alias -> [{name, alias, aggregate info}]

  for (const s of ast.select) {
    if (s.expr === "*") break; // no attribute nodes = fetch all
    if (s.expr === "aggregate") {
      const resolved = resolveCol(s.col, ast);
      const target = resolved.entity;
      const col = resolved.col === "*" ? ast.from + "id" : resolved.col;
      const entry = { name: col, aggregate: s.fn.toLowerCase(), alias: s.alias || s.fn.toLowerCase() };
      if (target) { (joinAttrs[target] = joinAttrs[target] || []).push(entry); }
      else { mainAttrs.push(entry); }
    } else if (s.expr === "column") {
      const resolved = resolveCol(s.name, ast);
      const entry = { name: resolved.col, alias: s.alias || null };
      // check if this column is in groupBy
      if (ast.groupBy.length > 0) {
        const rawCol = s.name;
        const inGroup = ast.groupBy.some(g => g === rawCol || g === resolved.col);
        if (inGroup) entry.groupby = true;
      }
      if (resolved.entity) { (joinAttrs[resolved.entity] = joinAttrs[resolved.entity] || []).push(entry); }
      else { mainAttrs.push(entry); }
    }
  }

  // emit main attributes
  for (const a of mainAttrs) {
    let attrStr = `${ind(2)}<attribute name="${escapeXml(a.name)}"`;
    if (a.aggregate) attrStr += ` aggregate="${a.aggregate}" alias="${escapeXml(a.alias)}"`;
    else {
      if (a.alias) attrStr += ` alias="${escapeXml(a.alias)}"`;
      if (a.groupby) attrStr += ` groupby="true" alias="${escapeXml(a.alias || a.name)}"`;
    }
    attrStr += "/>";
    lines.push(attrStr);
  }

  // WHERE → filter on main entity (may also have join-level filters)
  if (ast.where) {
    const { main, joinFilters } = splitFilters(ast.where, ast);
    if (main) emitFilter(main, 2, lines, ast);
    // joinFilters stored for later
    ast._joinFilters = joinFilters;
  }

  // ORDER BY (main entity only)
  for (const o of ast.orderBy) {
    const resolved = resolveCol(o.col, ast);
    if (!resolved.entity) {
      lines.push(`${ind(2)}<order attribute="${escapeXml(resolved.col)}" descending="${o.dir === "DESC" ? "true" : "false"}"/>`);
    }
  }

  // JOINs → link-entity
  for (const j of ast.joins) {
    const { from, to } = resolveJoinFields(j, ast);
    let leStr = `${ind(2)}<link-entity name="${escapeXml(j.entity)}"`;
    if (j.alias) leStr += ` alias="${escapeXml(j.alias)}"`;
    leStr += ` from="${escapeXml(from)}" to="${escapeXml(to)}" link-type="${j.linkType}">`;
    lines.push(leStr);

    // attributes for this join
    const key = j.alias || j.entity;
    const attrs = joinAttrs[key] || [];
    for (const a of attrs) {
      let attrStr = `${ind(3)}<attribute name="${escapeXml(a.name)}"`;
      if (a.aggregate) attrStr += ` aggregate="${a.aggregate}" alias="${escapeXml(a.alias)}"`;
      else {
        if (a.alias) attrStr += ` alias="${escapeXml(a.alias)}"`;
        if (a.groupby) attrStr += ` groupby="true" alias="${escapeXml(a.alias || a.name)}"`;
      }
      attrStr += "/>";
      lines.push(attrStr);
    }

    // join-level filters
    const jf = ast._joinFilters?.[key];
    if (jf) emitFilter(jf, 3, lines, ast);

    // order by on join entity
    for (const o of ast.orderBy) {
      const resolved = resolveCol(o.col, ast);
      if (resolved.entity === key) {
        lines.push(`${ind(3)}<order attribute="${escapeXml(resolved.col)}" descending="${o.dir === "DESC" ? "true" : "false"}"/>`);
      }
    }

    lines.push(`${ind(2)}</link-entity>`);
  }

  lines.push(`${ind(1)}</entity>`);
  lines.push(`</fetch>`);
  return lines.join("\n");
}

function resolveJoinFields(join, ast) {
  // ON left = right, figure out which is "from" (join entity) and "to" (main entity)
  const leftParts = join.left.split(".");
  const rightParts = join.right.split(".");

  const joinKey = join.alias || join.entity;
  const mainKey = ast.fromAlias || ast.from;

  // left belongs to join entity
  if (leftParts.length === 2 && (leftParts[0] === joinKey)) {
    return { from: leftParts[1], to: rightParts.length === 2 ? rightParts[1] : rightParts[0] };
  }
  // right belongs to join entity
  if (rightParts.length === 2 && (rightParts[0] === joinKey)) {
    return { from: rightParts[1], to: leftParts.length === 2 ? leftParts[1] : leftParts[0] };
  }
  // left belongs to main entity
  if (leftParts.length === 2 && leftParts[0] === mainKey) {
    return { from: rightParts.length === 2 ? rightParts[1] : rightParts[0], to: leftParts[1] };
  }
  // right belongs to main entity
  if (rightParts.length === 2 && rightParts[0] === mainKey) {
    return { from: leftParts.length === 2 ? leftParts[1] : leftParts[0], to: rightParts[1] };
  }
  // fallback: assume left=from (join), right=to (main)
  const l = leftParts.length === 2 ? leftParts[1] : leftParts[0];
  const r = rightParts.length === 2 ? rightParts[1] : rightParts[0];
  return { from: r, to: l };
}

// Split filter conditions: main entity vs join entities
function splitFilters(node, ast) {
  if (!node) return { main: null, joinFilters: {} };
  const joinFilters = {};

  function classify(n) {
    if (n.type === "condition") {
      const resolved = resolveCol(n.attribute, ast);
      if (resolved.entity) {
        n.attribute = resolved.col; // strip alias prefix
        const key = resolved.entity;
        if (!joinFilters[key]) joinFilters[key] = [];
        joinFilters[key].push(n);
        return null; // remove from main
      }
      return n;
    }
    if (n.type === "logic") {
      const children = n.children.map(c => classify(c)).filter(Boolean);
      if (children.length === 0) return null;
      if (children.length === 1) return children[0];
      return { ...n, children };
    }
    return n;
  }

  const main = classify(node);
  // convert joinFilter arrays into filter nodes
  const jfNodes = {};
  for (const [key, conditions] of Object.entries(joinFilters)) {
    if (conditions.length === 1) jfNodes[key] = conditions[0];
    else jfNodes[key] = { type: "logic", op: "and", children: conditions };
  }
  return { main, joinFilters: jfNodes };
}

function emitFilter(node, depth, lines, ast) {
  const ind = (n) => "  ".repeat(n);
  if (node.type === "condition") {
    lines.push(`${ind(depth)}<filter>`);
    emitCondition(node, depth + 1, lines, ast);
    lines.push(`${ind(depth)}</filter>`);
  } else if (node.type === "logic") {
    lines.push(`${ind(depth)}<filter type="${node.op}">`);
    for (const child of node.children) {
      if (child.type === "condition") {
        emitCondition(child, depth + 1, lines, ast);
      } else if (child.type === "logic") {
        emitFilter(child, depth + 1, lines, ast);
      }
    }
    lines.push(`${ind(depth)}</filter>`);
  }
}

function emitCondition(cond, depth, lines, ast) {
  const ind = (n) => "  ".repeat(n);
  const attr = resolveCol(cond.attribute, ast).col;

  if (cond.operator === "null" || cond.operator === "not-null") {
    lines.push(`${ind(depth)}<condition attribute="${escapeXml(attr)}" operator="${cond.operator}"/>`);
    return;
  }
  if (cond.operator === "in" || cond.operator === "not-in") {
    lines.push(`${ind(depth)}<condition attribute="${escapeXml(attr)}" operator="${cond.operator}">`);
    for (const v of cond.values) {
      lines.push(`${ind(depth + 1)}<value>${escapeXml(v)}</value>`);
    }
    lines.push(`${ind(depth)}</condition>`);
    return;
  }
  const valAttr = cond.value != null ? ` value="${escapeXml(cond.value)}"` : "";
  lines.push(`${ind(depth)}<condition attribute="${escapeXml(attr)}" operator="${cond.operator}"${valAttr}/>`);
}

// ── Main entry point ─────────────────────────────────────────
export function sqlToFetchXml(sql) {
  try {
    if (!sql || !sql.trim()) return { fetchXml: "", error: "Query is empty" };
    const trimmed = sql.trim().replace(/;+\s*$/, "");
    if (!/^SELECT\b/i.test(trimmed)) return { fetchXml: "", error: "Only SELECT statements are supported" };
    const ast = parseSqlToAst(trimmed);
    const fetchXml = astToFetchXml(ast);
    return { fetchXml, error: null };
  } catch (e) {
    return { fetchXml: "", error: e.message || "SQL syntax error" };
  }
}
