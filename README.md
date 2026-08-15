# Sketch.js

A lightweight, zero-dependency JavaScript template engine for the browser. Inspired by [Smarty PHP templates](https://www.smarty.net/) and borrowing heavily from [TrimPath JS Templates](https://code.google.com/archive/p/trimpath/wikis/JavaScriptTemplates.wiki), Sketch brings familiar, expressive templating syntax to the browser with modern additions like async rendering, layout inheritance, composable includes, and a rich filter system.

Sketch can be used standalone or it can be used as the underlying rendering engine for the [Flow.js](https://github.com/oldmoe/flow.js) library.

---

## Quick Start

```html
<script src="sketch.js"></script>
<script>
  const html = Sketch.render(
    `<h1>Hello, {{ name }}!</h1>`,
    { name: 'World' }
  );
  document.body.innerHTML = html;
</script>
```

---

## Core Concepts

Sketch templates are plain strings (or HTML) containing **expressions** and **block tags**. You pass a **scope** object whose properties become variables inside the template. Sketch compiles the template into an AST and renders it synchronously or asynchronously.

---

## Interpolation

### Escaped output — `{{ expr }}`

HTML-escapes the value before output. Use this for user-supplied data.

```html
<!-- scope: { name: '<script>alert(1)</script>' } -->
<p>{{ name }}</p>
<!-- output: <p>&lt;script&gt;alert(1)&lt;/script&gt;</p> -->
```

Any JavaScript expression is valid inside `{{ }}`:

```html
{{ user.email }}
{{ items.length }}
{{ count > 0 ? 'items' : 'no items' }}
{{ new Date().getFullYear() }}
```

### Raw (unescaped) output — `{{{ expr }}}`

Outputs the value without escaping. Use for trusted HTML you want inserted verbatim.

```html
<!-- scope: { body: '<strong>Important</strong>' } -->
{{{ body }}}
<!-- output: <strong>Important</strong> -->
```

> ⚠️ Never use `{{{ }}}` with user-supplied input — it bypasses XSS protection.

---

## Filters

Filters transform a value using a `|` pipe syntax. They can be chained. Arguments follow a `:` after the filter name.

```html
{{ expr | filterName }}
{{ expr | filterName:arg }}
{{ expr | filter1 | filter2:arg }}
```

Filters work in both `{{ }}` and `{{{ }}}` contexts.

### Built-in Filters

| Filter | Description | Example |
|---|---|---|
| `upper` | Uppercase | `{{ name \| upper }}` → `ALICE` |
| `lower` | Lowercase | `{{ name \| lower }}` → `alice` |
| `trim` | Strip whitespace | `{{ input \| trim }}` |
| `capitalize` | First letter uppercase | `{{ name \| capitalize }}` → `Alice` |
| `length` | Array/string/object length | `{{ items \| length }}` |
| `json` | JSON stringify | `{{ obj \| json }}`, `{{ obj \| json:4 }}` (indent) |
| `default` | Fallback if null/empty | `{{ bio \| default:'No bio' }}` |
| `round` | Round a number | `{{ price \| round:2 }}` |
| `date` | Format a date | `{{ createdAt \| date:'DD/MM/YYYY' }}` |
| `unixdate` | Format a Unix-seconds timestamp | `{{ createdAt \| unixdate:'DD/MM/YYYY' }}` |
| `currency` | Format currency | `{{ price \| currency:'$':'2':'en-US' }}` |
| `numunits` | Humanize large numbers | `{{ views \| numunits }}` → `1.23M` |

#### `date` format tokens

`YYYY` `YY` `MM` `DD` `HH` `mm` `ss`

```html
{{ createdAt | date:'DD/MM/YYYY HH:mm' }}
```

#### `currency` arguments

`currency:symbol:decimals:locale` (all optional, defaults: `€`, `2`, `de-DE`)

```html
{{ price | currency:'$':'2':'en-US' }}
```

#### Chaining filters

```html
{{ description | trim | capitalize | default:'No description provided' }}
{{ amount | round:2 | default:'0.00' }}
```

### Registering Custom Filters

```javascript
Sketch.registerFilter('slugify', (v) =>
  String(v).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
);

// Usage in template:
// {{ title | slugify }}
```

---

## Control Flow

### `{if}` / `{elseif}` / `{else}` / `{/if}`

Any JavaScript expression is valid as the condition.

```html
{if user.role === 'admin'}
  <a href="/admin">Admin Panel</a>
{elseif user.role === 'editor'}
  <a href="/editor">Editor Dashboard</a>
{else}
  <span>Welcome, {{ user.name }}!</span>
{/if}
```

```html
{if items.length > 0 && user.active}
  <p>You have {{ items.length }} active items.</p>
{/if}
```

---

## Iteration

### `{foreach arr as item}` / `{forelse}` / `{/foreach}`

Iterates over an **array**. Each iteration receives the item and `item_i` (zero-based index).

```html
{foreach products as product}
  <div class="product">
    <h2>{{ product.name }}</h2>
    <p>{{ product.price | currency:'$':'2':'en-US' }}</p>
    {if product_i === 0}<span class="badge">Featured</span>{/if}
  </div>
{forelse}
  <p>No products found.</p>
{/foreach}
```

The loop variable index is always `varName_i`:

```html
{foreach rows as row}
  <tr class="{if row_i % 2 === 0}even{else}odd{/if}">
    <td>{{ row_i + 1 }}</td>
    <td>{{ row.name }}</td>
  </tr>
{/foreach}
```

`{forelse}` is rendered when the array is empty or absent.

---

### `{forin obj as key}` / `{forelse}` / `{/forin}`

Iterates over **object own keys**. Each iteration receives the key name and `key_i` (zero-based counter). Access the value via `obj[key]`.

```html
{forin config as setting}
  <tr>
    <td>{{ setting }}</td>
    <td>{{ config[setting] }}</td>
  </tr>
{forelse}
  <tr><td colspan="2">No settings.</td></tr>
{/forin}
```

---

## Inline JavaScript — `{eval}` / `{/eval}`

Execute arbitrary JavaScript inside a template. A whole compiled template
(parent plus any inlined includes) is one flat JS function body, so
variables declared with `const` or `let` inside an `{eval}` block are
**not** scoped to that block — they stay visible in the rest of the
template, including inside included templates, exactly like any other
local variable declared earlier in the same function:

```html
{eval}
  const discount   = price > 100 ? 0.15 : 0.05;
  const finalPrice = price * (1 - discount);
  const label      = discount > 0.1 ? 'Big Saver' : 'Saver';
{/eval}

<p>{{ label }}: {{ finalPrice | round:2 | currency }}</p>
```

If you don't need the value anywhere else — a one-off side effect or a
loop — just don't bother declaring anything:

```html
{eval}
  console.log('rendering for user:', user.id);
{/eval}
```

> Use `{eval}` for derived values and light computation. Avoid DOM manipulation or anything with side effects beyond the template.

---

## Includes

Sketch can compose templates from multiple sources. The syntax is:

```
{include source:identifier}
```

There are three include sources:

### `{include key:name}` — pre-registered template strings

Register templates by name and include them by key:

```javascript
Sketch.registerTemplate('user-card', `
  <div class="user-card">
    <strong>{{ user.name }}</strong>
    <span>{{ user.email }}</span>
  </div>
`);
```

```html
{foreach users as user}
  {include key:user-card}
{/foreach}
```

### `{include dom:#selector}` — from a DOM element

The template content is read from the `innerHTML` of the matched element:

```html
<script type="text/sketch" id="alert-tpl">
  <div class="alert alert-{{ level }}">{{ message }}</div>
</script>
```

```html
{include dom:#alert-tpl}
```

### `{include url:name}` — fetched from the server

Fetches from `Sketch.templateURLPrefix + name + Sketch.templateURLSuffix` (defaults: `/templates/` and `.tpl.html`):

```html
{include url:partials/footer}
<!-- fetches: /templates/partials/footer.tpl.html -->
```

URL includes require `renderAsync` or `compileAsync` (see [Async Rendering](#async-rendering)).

---

### Recursive Includes

Includes are recursive — an included template can itself include others. Sketch detects and prevents circular includes, outputting an error message rather than looping infinitely.

---

## Layout Inheritance

Sketch supports a simple layout system. Define a layout template with `{yield}` as a placeholder, then render a page template *inside* it.

**Layout template (string or variable):**

```html
<!DOCTYPE html>
<html>
<head><title>{{ title }}</title></head>
<body>
  <nav><!-- ... --></nav>
  <main>
    {yield}
  </main>
</body>
</html>
```

**Page template:**

```html
<h1>{{ title }}</h1>
<p>{{ body }}</p>
```

**Rendering with a layout:**

```javascript
const layout = document.getElementById('layout-tpl').innerText;
const page   = document.getElementById('page-tpl').innerText;

const html = Sketch.render(page, { title: 'Home', body: 'Welcome!' }, { layout });
```

The page template is rendered first, then injected into the layout wherever `{yield}` appears.

---

## API Reference

### `Sketch.render(templateStr, scope, options)`

Compiles and immediately renders. Returns a string. Synchronous.

```javascript
const html = Sketch.render('<p>{{ msg }}</p>', { msg: 'Hello' });
```

Options:
- `layout` — a layout template string; `{yield}` will be replaced with the rendered inner template.

---

### `Sketch.compile(templateStr)`

Compiles a template string into a **reusable render function**. Useful when rendering the same template many times with different scopes.

```javascript
const render = Sketch.compile('<li>{{ item.name }}</li>');

for (const item of items) {
  list.innerHTML += render({ item });
}
```

The returned function signature: `(scope?, options?) => string`

---

### `Sketch.renderAsync(templateStr, scope, options)`

Like `render`, but async. Fetches all `url:` includes before rendering. Returns a `Promise<string>`.

```javascript
const html = await Sketch.renderAsync(template, data);
```

---

### `Sketch.compileAsync(templateStr)`

Like `compile`, but async. Fetches and caches all reachable `url:` includes at compile time, then returns a **synchronous** render function. Best for templates that include remote partials and will be called repeatedly.

```javascript
const render = await Sketch.compileAsync(template);
// render() is now synchronous and can be called multiple times:
const html = render(data);
```

---

### `Sketch.prefetch(url)` / `Sketch.prefetchAll(...urls)`

Pre-warm the URL cache. Useful to load known remote partials before rendering begins.

```javascript
await Sketch.prefetchAll('partials/nav', 'partials/footer');
const html = Sketch.render(template, data); // url: includes now resolve synchronously
```

---

### `Sketch.registerTemplate(name, str)`

Registers a template string under a key for use with `{include key:name}`.

```javascript
Sketch.registerTemplate('avatar', '<img src="{{ user.avatar }}" alt="{{ user.name }}">');
```

---

### `Sketch.registerFilter(name, fn)`

Adds a custom filter. `fn(value, arg?)` receives the piped value and an optional argument.

```javascript
Sketch.registerFilter('truncate', (v, len = 100) =>
  String(v).length > len ? String(v).slice(0, len) + '…' : v
);
// {{ post.body | truncate:80 }}
```

---

### `Sketch.escape(str)`

Escapes `&`, `<`, `>`, `"`, `'` in a string. Used internally by `{{ }}`.

---

### `Sketch.preserve(html, selector?)` / `Sketch.restore(html)`

Used by [Flow.js](./FLOW.md) to protect nested inline Flow templates from being processed by an outer Sketch render pass. You generally don't need these directly.

---

### Configuration

| Property | Default | Description |
|---|---|---|
| `Sketch.templateURLPrefix` | `'/templates/'` | Prefix for `url:` include fetches |
| `Sketch.templateURLSuffix` | `'.tpl.html'` | Suffix for `url:` include fetches |

---

## Scope

The scope object is the template's variable namespace. All own properties of the object become top-level variables:

```javascript
Sketch.render('{{ a }} + {{ b }} = {{ a + b }}', { a: 1, b: 2 });
// → "1 + 2 = 3"
```

Values computed inside an `{eval}` block with `const`/`let` are visible everywhere else in the template too — see [Inline JavaScript](#inline-javascript--eval--eval) above:

```html
{eval}
  const total = items.reduce((s, i) => s + i.price, 0);
  const tax   = total * 0.2;
{/eval}

Subtotal: {{ total | currency }}
Tax:      {{ tax   | currency }}
```

Two extra variables are always present in scope, alongside whatever you pass in:

- `$ctx` — the full, unflattened scope object exactly as passed to `render`/`compile`, distinct from the individual top-level fields merged in for direct `{{field}}` access. Useful when a template needs "the whole payload" at once, e.g. dumping it as JSON: `{{ $ctx | json }}`.
- `$` — an empty object, present for any future/ad-hoc use. Nothing in Sketch itself reads or writes it.

---

## Error Handling

Sketch never throws — errors are rendered inline as `[Sketch error: ...]` strings and also logged to `console.error`. This makes debugging easy in development without crashing your page.

Common errors:
- `[Sketch error: unknown filter 'xyz']`
- `[Sketch error: foreach expects an array]`
- `[Sketch error: circular include detected: url:partials/nav]`
- `[Sketch error: unclosed blocks: if, foreach]`

---

## Complete Example

```javascript
const template = `
  <h1>{{ store.name | upper }}</h1>
  <p>{{ store.tagline | default:'Your online store' }}</p>

  {if user}
    <p>Welcome back, {{ user.name | capitalize }}!</p>
  {else}
    <a href="/login">Sign in</a>
  {/if}

  {eval}
    const inStock    = products.filter(p => p.stock > 0);
    const outOfStock = products.filter(p => p.stock === 0);
  {/eval}

  <h2>In Stock ({{ inStock.length }})</h2>
  {foreach inStock as p}
    <div class="card">
      <strong>{{ p.name }}</strong>
      <span>{{ p.price | currency:'$':'2':'en-US' }}</span>
      {if p_i === 0}<span class="new">New!</span>{/if}
    </div>
  {forelse}
    <p>All products sold out.</p>
  {/foreach}

  {if outOfStock.length > 0}
    <p>{{ outOfStock.length }} items currently unavailable.</p>
  {/if}
`;

const html = Sketch.render(template, {
  store: { name: 'my shop', tagline: 'Great prices.' },
  user: { name: 'alice' },
  products: [
    { name: 'Widget', price: 9.99,  stock: 10 },
    { name: 'Gadget', price: 49.99, stock: 0  },
    { name: 'Doohickey', price: 4.49, stock: 3 },
  ]
});
```
