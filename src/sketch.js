class Sketch {

  // ─── Filter Registry ────────────────────────────────────────────────────────

  static _filters = {
    upper:    (v) => String(v).toUpperCase(),
    lower:    (v) => String(v).toLowerCase(),
    trim:     (v) => String(v).trim(),
    length:   (v) => (v == null ? 0 : v.length ?? Object.keys(v).length),
    json:     (v, indent = 2) => JSON.stringify(v, null, Number(indent)),
    default:  (v, fallback = '') => (v == null || v === '' ? fallback : v),
    round:    (v, decimals = 0) => {
      const n = Number(v);
      if (isNaN(n)) return `[invalid number: ${v}]`;
      return n.toFixed(Number(decimals));
    },

    capitalize: (v) => {
      const s = String(v);
      return s.charAt(0).toUpperCase() + s.slice(1);
    },


    date: (v, fmt = 'YYYY-MM-DD') => {
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d)) return `[invalid date: ${v}]`;
      const pad = (n) => String(n).padStart(2, '0');
      return fmt
        .replace('YYYY', d.getFullYear())
        .replace('YY',   String(d.getFullYear()).slice(-2))
        .replace('MM',   pad(d.getMonth() + 1))
        .replace('DD',   pad(d.getDate()))
        .replace('HH',   pad(d.getHours()))
        .replace('mm',   pad(d.getMinutes()))
        .replace('ss',   pad(d.getSeconds()));
    },

    currency: (v, symbol = '€', decimals = 2, locale = 'de-DE') => {
      const n = Number(v);
      if (isNaN(n)) return `[invalid number: ${v}]`;
      return symbol + n.toLocaleString(locale, {
        minimumFractionDigits: Number(decimals),
        maximumFractionDigits: Number(decimals)
      });
    },

    numunits: (v) => {
         const n = Number(v);
            if (isNaN(n)) return `[invalid number: ${v}]`;  
            if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
            if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
            if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
            return String(n);   
    }


  };

  static registerFilter(name, fn) {
    this._filters[name] = fn;
  }

  // ─── Template Registry ──────────────────────────────────────────────────────

  static _templates = {};
  static _urlCache  = new Map();

  static registerTemplate(name, str) {
    this._templates[name] = str;
  }

  // ─── Template UR Prefix ─────────────────────────────────────────────────────

  static templateURLPrefix = '/templates/';
  static templateURLSuffix = '.tpl.html';

  /**
   * Pre-fetch a URL and store it in the cache so sync render() can use it.
   * @param {string} url
   * @returns {Promise<void>}
   */
  static async prefetch(url) {
    if (this._urlCache.has(url)) return;
    const resolved = await this._resolveIncludeAsync('url', url);
    if (resolved.error) throw new Error(resolved.error);
  }

  /**
   * Pre-fetch multiple URLs in parallel.
   * @param {...string} urls
   * @returns {Promise<void>}
   */
  static prefetchAll(...urls) {
    return Promise.all(urls.map(u => this.prefetch(u))).then(() => {});
  }

  // ─── HTML Escaping ──────────────────────────────────────────────────────────

  static _escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  static escape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => this._escapeMap[c]);
  }

  // ─── Inline Template Preservation ──────────────────────────────────────────

  static _preserved = new Map();
  static _counter = 0;
  static PLACEHOLDER = '__SKETCH_PRESERVE__';
  static PLACEHOLDER_RE = /__SKETCH_PRESERVE__(\d+)__/g;

  static _decodeEntities(str) {
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  static preserve(html, selector) {
    const tags = ['table','thead','tbody','tfoot','tr','th','td'];
    const re = new RegExp(`<(\/?)(${ tags.join('|') })(\\s[^>]*?)?>`, 'gi');

    const safe = html.replace(re, (_, slash, tag, attrs) =>
        `<${slash}sketch-${tag.toLowerCase()}${attrs || ''}>`
    );

    const tmp = document.createElement('div');
    tmp.innerHTML = safe;

    tmp.querySelectorAll('[flow],[flow-link],[flow-form],[flow-template]').forEach(el => {
        const attrVal =
        el.getAttribute('flow') ||
        el.getAttribute('flow-link') ||
        el.getAttribute('flow-form') ||
        el.getAttribute('flow-template') || '';
        if (selector && !selector(attrVal)) return;
        const id = this._counter++;
        this._preserved.set(id, el.innerHTML);
        el.innerHTML = `${this.PLACEHOLDER}${id}__`;
    });

    return tmp.innerHTML
        .replace(/<(\/?)sketch-(table|thead|tbody|tfoot|tr|th|td)(\s[^>]*)?>/gi,
        (_, slash, tag, attrs) => `<${slash}${tag}${attrs || ''}>`)
        .replace(/(\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\}|\{[^}]*\})/g,
        token => this._decodeEntities(token));
    }

  static restore(html) {
    return html.replace(this.PLACEHOLDER_RE, (match, id) => {
      const content = this._preserved.get(Number(id));
      this._preserved.delete(Number(id));
      return content !== undefined ? content : match;
    });
  }

  // ─── Filter Expression Evaluator ───────────────────────────────────────────

  static _applyFilters(value, filterChain) {
    for (const filterExpr of filterChain) {
      const colonIdx = filterExpr.indexOf(':');
      let filterName, filterArg;
      if (colonIdx !== -1) {
        filterName = filterExpr.slice(0, colonIdx).trim();
        filterArg = filterExpr.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      } else {
        filterName = filterExpr.trim();
        filterArg = undefined;
      }
      const fn = this._filters[filterName];
      if (!fn) {
        return `[Sketch error: unknown filter '${filterName}']`;
      }
      value = filterArg !== undefined ? fn(value, filterArg) : fn(value);
    }
    return value;
  }

  // ─── Expression Evaluator ───────────────────────────────────────────────────

  static _evaluate(expr, scope) {
    try {
      const fn = new Function(...Object.keys(scope), `return (${expr});`);
      return fn(...Object.values(scope));
    } catch (e) {
      const msg = `[Sketch error: ${e.message} in expr: ${expr.trim()}]`;
      console.error('Sketch:', msg);
      return msg;
    }
  }

  static _evaluateVoid(code, scope) {
    try {
      const fn = new Function(...Object.keys(scope), code);
      fn(...Object.values(scope));
    } catch (e) {
      const msg = `[Sketch error: ${e.message} in eval block]`;
      console.error('Sketch:', msg, '\n', code);
      return msg;
    }
    return null;
  }

  // ─── Tokenizer ──────────────────────────────────────────────────────────────

  /*
    Token types:
      text       — raw HTML/text
      raw        — {{{ expr }}}
      escaped    — {{ expr }} or {{ expr | filter | filter }}
      if         — {if expr}
      elseif     — {elseif expr}
      else       — {else}
      endif      — {/if}
      foreach    — {foreach expr as varname}
      forelse    — {forelse}   (inside foreach or forin, rendered when collection is empty)
      endforeach — {/foreach}
      forin      — {forin expr as keyname}
      endforin   — {/forin}
      eval       — {eval}
      endeval    — {/eval}
      yield      — {yield}    (inside a layout template, outputs the rendered inner template)
  */

  static _tokenize(template) {
    const tokens = [];
    const re = /(\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\}|\{\/?\w+[^}]*\})/g;
    let last = 0;
    let match;

    while ((match = re.exec(template)) !== null) {
      if (match.index > last) {
        tokens.push({ type: 'text', value: template.slice(last, match.index) });
      }

      const raw = match[0];

      if (raw.startsWith('{{{')) {
        const inner = raw.slice(3, -3).trim();
        const parts = inner.split('|').map(s => s.trim());
        const expr = parts[0];
        const filters = parts.slice(1);
        tokens.push({ type: 'raw', expr, filters });

      } else if (raw.startsWith('{{')) {
        const inner = raw.slice(2, -2).trim();
        const parts = inner.split('|').map(s => s.trim());
        const expr = parts[0];
        const filters = parts.slice(1);
        tokens.push({ type: 'escaped', expr, filters });

      } else {
        const inner = raw.slice(1, -1).trim();
        const spaceIdx = inner.search(/\s/);
        const keyword = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
        const rest = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1).trim();

        switch (keyword) {
          case 'if':
            tokens.push({ type: 'if', expr: rest });
            break;
          case 'elseif':
            tokens.push({ type: 'elseif', expr: rest });
            break;
          case 'else':
            tokens.push({ type: 'else' });
            break;
          case '/if':
            tokens.push({ type: 'endif' });
            break;
          case 'foreach': {
            const m = rest.match(/^(.+?)\s+as\s+(\w+)$/);
            if (!m) {
              tokens.push({ type: 'text', value: `[Sketch error: invalid foreach: ${raw}]` });
            } else {
              tokens.push({ type: 'foreach', collectionExpr: m[1].trim(), varName: m[2] });
            }
            break;
          }
          case 'forelse':
            tokens.push({ type: 'forelse' });
            break;
          case '/foreach':
            tokens.push({ type: 'endforeach' });
            break;
          case 'forin': {
            const m = rest.match(/^(.+?)\s+as\s+(\w+)$/);
            if (!m) {
              tokens.push({ type: 'text', value: `[Sketch error: invalid forin: ${raw}]` });
            } else {
              tokens.push({ type: 'forin', objExpr: m[1].trim(), keyName: m[2] });
            }
            break;
          }
          case '/forin':
            tokens.push({ type: 'endforin' });
            break;
          case 'eval':
            tokens.push({ type: 'eval' });
            break;
          case '/eval':
            tokens.push({ type: 'endeval' });
            break;
          case 'yield':
            tokens.push({ type: 'yield' });
            break;
          case 'include': {
            const colonIdx = rest.indexOf(':');
            if (colonIdx === -1) {
              tokens.push({ type: 'text', value: `[Sketch error: include requires a source prefix (key:, dom:, url:): ${raw}]` });
            } else {
              const source = rest.slice(0, colonIdx).trim();
              const value  = rest.slice(colonIdx + 1).trim();
              if (!['key', 'dom', 'url'].includes(source)) {
                tokens.push({ type: 'text', value: `[Sketch error: unknown include source '${source}', expected key, dom, or url]` });
              } else {
                tokens.push({ type: 'include', source, value });
              }
            }
            break;
          }
          default:
            tokens.push({ type: 'text', value: raw });
        }
      }

      last = match.index + raw.length;
    }

    if (last < template.length) {
      tokens.push({ type: 'text', value: template.slice(last) });
    }

    return tokens;
  }

  // ─── AST Builder ────────────────────────────────────────────────────────────

  /*
    Nodes:
      { type: 'text', value }
      { type: 'raw', expr }
      { type: 'escaped', expr, filters }
      { type: 'if', branches: [{condition, body},...], elseBranch }
      { type: 'foreach', collectionExpr, varName, body, elseBranch }
      { type: 'forin', objExpr, keyName, body, elseBranch }
      { type: 'eval', chunks }
      { type: 'yield' }
  */

  static _buildAST(tokens) {
    const stack = [[]];

    const current = () => stack[stack.length - 1];
    const push = (frame) => stack.push(frame);
    const pop = () => stack.pop();

    const ctxStack = [];

    for (const tok of tokens) {
      switch (tok.type) {

        case 'text':
        case 'raw':
        case 'escaped':
        case 'yield':
        case 'include':
          current().push(tok);
          break;

        case 'if': {
          const node = { type: 'if', branches: [{ condition: tok.expr, body: [] }], elseBranch: null };
          current().push(node);
          push(node.branches[0].body);
          ctxStack.push({ type: 'if', node });
          break;
        }

        case 'elseif': {
          const ctx = ctxStack[ctxStack.length - 1];
          if (!ctx || ctx.type !== 'if') {
            current().push({ type: 'text', value: '[Sketch error: elseif without if]' });
            break;
          }
          pop();
          const branch = { condition: tok.expr, body: [] };
          ctx.node.branches.push(branch);
          push(branch.body);
          break;
        }

        case 'else': {
          const ctx = ctxStack[ctxStack.length - 1];
          if (!ctx || ctx.type !== 'if') {
            current().push({ type: 'text', value: '[Sketch error: else without if]' });
            break;
          }
          pop();
          ctx.node.elseBranch = [];
          push(ctx.node.elseBranch);
          break;
        }

        case 'endif': {
          const ctx = ctxStack[ctxStack.length - 1];
          if (!ctx || ctx.type !== 'if') {
            current().push({ type: 'text', value: '[Sketch error: /if without if]' });
            break;
          }
          pop();
          ctxStack.pop();
          break;
        }

        case 'foreach': {
          const node = { type: 'foreach', collectionExpr: tok.collectionExpr, varName: tok.varName, body: [], elseBranch: null };
          current().push(node);
          push(node.body);
          ctxStack.push({ type: 'foreach', node });
          break;
        }

        case 'forin': {
          const node = { type: 'forin', objExpr: tok.objExpr, keyName: tok.keyName, body: [], elseBranch: null };
          current().push(node);
          push(node.body);
          ctxStack.push({ type: 'forin', node });
          break;
        }

        case 'forelse': {
          const ctx = ctxStack[ctxStack.length - 1];
          if (!ctx || (ctx.type !== 'foreach' && ctx.type !== 'forin')) {
            current().push({ type: 'text', value: '[Sketch error: forelse without foreach/forin]' });
            break;
          }
          pop(); // close the body
          ctx.node.elseBranch = [];
          push(ctx.node.elseBranch);
          break;
        }

        case 'endforeach': {
          const ctx = ctxStack[ctxStack.length - 1];
          if (!ctx || ctx.type !== 'foreach') {
            current().push({ type: 'text', value: '[Sketch error: /foreach without foreach]' });
            break;
          }
          pop();
          ctxStack.pop();
          break;
        }

        case 'endforin': {
          const ctx = ctxStack[ctxStack.length - 1];
          if (!ctx || ctx.type !== 'forin') {
            current().push({ type: 'text', value: '[Sketch error: /forin without forin]' });
            break;
          }
          pop();
          ctxStack.pop();
          break;
        }

        case 'eval': {
          const node = { type: 'eval', chunks: [] };
          current().push(node);
          push(node.chunks);
          ctxStack.push({ type: 'eval' });
          break;
        }

        case 'endeval': {
          const ctx = ctxStack[ctxStack.length - 1];
          if (!ctx || ctx.type !== 'eval') {
            current().push({ type: 'text', value: '[Sketch error: /eval without eval]' });
            break;
          }
          pop();
          ctxStack.pop();
          break;
        }
      }
    }

    if (ctxStack.length > 0) {
      const unclosed = ctxStack.map(c => c.type).join(', ');
      stack[0].push({ type: 'text', value: `[Sketch error: unclosed blocks: ${unclosed}]` });
      console.error(`Sketch: unclosed blocks: ${unclosed}`);
    }

    return stack[0];
  }

  // ─── Renderer ───────────────────────────────────────────────────────────────

  static _renderAST(nodes, scope, _stack = new Set()) {
    let out = '';

    for (const node of nodes) {
      switch (node.type) {

        case 'text':
          out += node.value;
          break;

        case 'raw': {
          let val = this._evaluate(node.expr, scope);
          if (node.filters && node.filters.length) {
            val = this._applyFilters(val, node.filters);
          }
          out += (val == null ? '' : val);
          break;
        }

        case 'escaped': {
          let val = this._evaluate(node.expr, scope);
          if (node.filters && node.filters.length) {
            val = this._applyFilters(val, node.filters);
          }
          out += this.escape(val == null ? '' : val);
          break;
        }

        case 'if': {
          let rendered = false;
          for (const branch of node.branches) {
            const cond = this._evaluate(branch.condition, scope);
            if (cond) {
              out += this._renderAST(branch.body, scope);
              rendered = true;
              break;
            }
          }
          if (!rendered && node.elseBranch) {
            out += this._renderAST(node.elseBranch, scope);
          }
          break;
        }

        case 'foreach': {
          const collection = this._evaluate(node.collectionExpr, scope);
          if (!Array.isArray(collection)) {
            out += `[Sketch error: foreach expects an array, got ${typeof collection} for: ${node.collectionExpr}]`;
            console.error('Sketch: foreach got non-array:', node.collectionExpr, collection);
            break;
          }
          if (collection.length === 0) {
            if (node.elseBranch) out += this._renderAST(node.elseBranch, scope);
            break;
          }
          collection.forEach((item, index) => {
            const childScope = Object.assign({}, scope, {
              [node.varName]: item,
              [`${node.varName}_i`]: index
            });
            out += this._renderAST(node.body, childScope);
          });
          break;
        }

        case 'forin': {
          const obj = this._evaluate(node.objExpr, scope);
          if (typeof obj !== 'object' || obj === null) {
            out += `[Sketch error: forin expects an object, got ${typeof obj} for: ${node.objExpr}]`;
            console.error('Sketch: forin got non-object:', node.objExpr, obj);
            break;
          }
          const keys = Object.keys(obj).filter(k => Object.prototype.hasOwnProperty.call(obj, k));
          if (keys.length === 0) {
            if (node.elseBranch) out += this._renderAST(node.elseBranch, scope);
            break;
          }
          keys.forEach((key, counter) => {
            const childScope = Object.assign({}, scope, {
              [node.keyName]: key,
              [`${node.keyName}_i`]: counter
            });
            out += this._renderAST(node.body, childScope);
          });
          break;
        }

        case 'eval': {
          const code = node.chunks.map(c => c.value || '').join('');
          const mutatedScope = Object.assign({}, scope);
          const err = this._evaluateVoid(code, mutatedScope);
          if (err) out += err;
          Object.assign(scope, mutatedScope);
          break;
        }

        case 'yield': {
          // Output the pre-rendered inner template content (raw, already HTML)
          out += (scope.$yield == null ? '' : scope.$yield);
          break;
        }

        case 'include': {
          const key = `${node.source}:${node.value}`;
          if (_stack && _stack.has(key)) {
            out += `[Sketch error: circular include detected: ${key}]`;
            break;
          }
          const resolved = this._resolveIncludeSync(node.source, node.value);
          if (resolved.error) { out += resolved.error; break; }
          const childStack = new Set(_stack || []).add(key);
          const childAST = this._buildAST(this._tokenize(resolved.str));
          out += this._renderAST(childAST, scope, childStack);
          break;
        }
      }
    }

    return out;
  }

  // ─── Include Resolution ─────────────────────────────────────────────────────

  static _resolveIncludeSync(source, value) {
    if (source === 'key') {
      const str = this._templates[value];
      if (str == null) return { error: `[Sketch error: no template registered for key '${value}']` };
      return { str };
    }
    if (source === 'dom') {
      const el = document.querySelector(value);
      if (!el) return { error: `[Sketch error: no element found for selector '${value}']` };
      return { str: el.innerHTML };
    }
    if (source === 'url') {
      if (this._urlCache.has(value)) return { str: this._urlCache.get(value) };
      return { error: `[Sketch error: url include '${value}' not yet cached — use renderAsync]` };
    }
  }

  static async _resolveIncludeAsync(source, value) {
    if (source === 'url') {
      if (this._urlCache.has(value)) return { str: this._urlCache.get(value) };
      try {
        const res = await fetch(this.templateURLPrefix + value + this.templateURLSuffix);
        if (!res.ok) return { error: `[Sketch error: failed to fetch '${value}': ${res.status} ${res.statusText}]` };
        const raw = await res.text();
        const tmp = document.createElement('textarea');
        tmp.innerHTML = raw;
        const str = tmp.value;
        this._urlCache.set(value, str);        
        return { str };
      } catch (e) {
        return { error: `[Sketch error: fetch error for '${value}': ${e.message}]` };
      }
    }
    return this._resolveIncludeSync(source, value);
  }

  // ─── Async Renderer ─────────────────────────────────────────────────────────

  static async _renderASTAsync(nodes, scope, _stack = new Set()) {
    let out = '';

    for (const node of nodes) {
      switch (node.type) {

        case 'text':
          out += node.value;
          break;

        case 'raw': {
          let val = this._evaluate(node.expr, scope);
          if (node.filters && node.filters.length) val = this._applyFilters(val, node.filters);
          out += (val == null ? '' : val);
          break;
        }

        case 'escaped': {
          let val = this._evaluate(node.expr, scope);
          if (node.filters && node.filters.length) val = this._applyFilters(val, node.filters);
          out += this.escape(val == null ? '' : val);
          break;
        }

        case 'if': {
          let rendered = false;
          for (const branch of node.branches) {
            if (this._evaluate(branch.condition, scope)) {
              out += await this._renderASTAsync(branch.body, scope, _stack);
              rendered = true;
              break;
            }
          }
          if (!rendered && node.elseBranch) {
            out += await this._renderASTAsync(node.elseBranch, scope, _stack);
          }
          break;
        }

        case 'foreach': {
          const collection = this._evaluate(node.collectionExpr, scope);
          if (!Array.isArray(collection)) {
            out += `[Sketch error: foreach expects an array, got ${typeof collection} for: ${node.collectionExpr}]`;
            break;
          }
          if (collection.length === 0) {
            if (node.elseBranch) out += await this._renderASTAsync(node.elseBranch, scope, _stack);
            break;
          }
          for (const [index, item] of collection.entries()) {
            const childScope = Object.assign({}, scope, { [node.varName]: item, [`${node.varName}_i`]: index });
            out += await this._renderASTAsync(node.body, childScope, _stack);
          }
          break;
        }

        case 'forin': {
          const obj = this._evaluate(node.objExpr, scope);
          if (typeof obj !== 'object' || obj === null) {
            out += `[Sketch error: forin expects an object, got ${typeof obj} for: ${node.objExpr}]`;
            break;
          }
          const keys = Object.keys(obj).filter(k => Object.prototype.hasOwnProperty.call(obj, k));
          if (keys.length === 0) {
            if (node.elseBranch) out += await this._renderASTAsync(node.elseBranch, scope, _stack);
            break;
          }
          for (const [counter, key] of keys.entries()) {
            const childScope = Object.assign({}, scope, { [node.keyName]: key, [`${node.keyName}_i`]: counter });
            out += await this._renderASTAsync(node.body, childScope, _stack);
          }
          break;
        }

        case 'eval': {
          const code = node.chunks.map(c => c.value || '').join('');
          const mutatedScope = Object.assign({}, scope);
          const err = this._evaluateVoid(code, mutatedScope);
          if (err) out += err;
          Object.assign(scope, mutatedScope);
          break;
        }

        case 'yield':
          out += (scope.$yield == null ? '' : scope.$yield);
          break;

        case 'include': {
          const key = `${node.source}:${node.value}`;
          if (_stack.has(key)) {
            out += `[Sketch error: circular include detected: ${key}]`;
            break;
          }
          const resolved = await this._resolveIncludeAsync(node.source, node.value);
          if (resolved.error) { out += resolved.error; break; }
          const childStack = new Set(_stack).add(key);
          const childAST = this._buildAST(this._tokenize(resolved.str));
          out += await this._renderASTAsync(childAST, scope, childStack);
          break;
        }
      }
    }

    return out;
  }

  /**
   * Compile a template string into a reusable render function.
   * @param {string} templateStr
   * @returns {function(scope?: object, options?: { layout?: string }): string}
   */
  static compile(templateStr) {
    const tokens = this._tokenize(templateStr);
    const ast = this._buildAST(tokens);
    return (scope = {}, options = {}) => {
      const baseScope = Object.assign({ $: {} }, scope);
      const inner = this._renderAST(ast, baseScope);
      if (options.layout) {
        const layoutTokens = this._tokenize(options.layout);
        const layoutAST = this._buildAST(layoutTokens);
        const layoutScope = Object.assign({}, baseScope, { $yield: inner });
        return this._renderAST(layoutAST, layoutScope);
      }

      return inner;
    };
  }

  /**
   * Compile and immediately render with the given scope.
   * @param {string} templateStr
   * @param {object} scope
   * @param {{ layout?: string }} options
   * @returns {string}
   */
  static render(templateStr, scope = {}, options = {}) {
    return this.compile(templateStr)(scope, options);
  }

  /**
   * Recursively collect and cache all url: includes reachable from an AST.
   * @param {Array} ast
   * @param {Set} visited - already-fetched urls to avoid re-fetching
   */
  static async _collectUrls(ast, visited = new Set()) {
    for (const node of ast) {
      if (node.type === 'include' && node.source === 'url') {
        if (!visited.has(node.value)) {
          visited.add(node.value);
          const resolved = await this._resolveIncludeAsync('url', node.value);
          if (!resolved.error) {
            const childAST = this._buildAST(this._tokenize(resolved.str));
            await this._collectUrls(childAST, visited);
          }
        }
      }
      // Recurse into branch/body nodes
      for (const key of ['body', 'elseBranch', 'chunks']) {
        if (Array.isArray(node[key])) await this._collectUrls(node[key], visited);
      }
      if (Array.isArray(node.branches)) {
        for (const branch of node.branches) {
          if (Array.isArray(branch.body)) await this._collectUrls(branch.body, visited);
        }
      }
    }
  }

  /**
   * Compile a template string into a reusable async render function.
   * Supports all include sources including url:.
   * Fetches and caches all reachable url: includes at compile time, then
   * returns a plain synchronous render function (no await needed to call it).
   * @param {string} templateStr
   * @returns {Promise<function(scope?: object, options?: { layout?: string }): string>}
   */
  static async compileAsync(templateStr) {
    const tokens = this._tokenize(templateStr);
    const ast    = this._buildAST(tokens);
    await this._collectUrls(ast);
    return (scope = {}, options = {}) => {
      const baseScope = Object.assign({ $: {} }, scope);
      const inner = this._renderAST(ast, baseScope);
      if (options.layout) {
        const layoutAST   = this._buildAST(this._tokenize(options.layout));
        const layoutScope = Object.assign({}, baseScope, { $yield: inner });
        return this._renderAST(layoutAST, layoutScope);
      }
      return inner;
    };
  }

  /**
   * Compile and immediately render, pre-fetching all url: includes first.
   * @param {string} templateStr
   * @param {object} scope
   * @param {{ layout?: string }} options
   * @returns {Promise<string>}
   */
  static async renderAsync(templateStr, scope = {}, options = {}) {
    const render = await this.compileAsync(templateStr);
    return render(scope, options);
  }
}
