# Sketch

A lightweight, zero-dependency JavaScript template engine for the browser. Sketch compiles HTML template strings into rendered output using a clean, readable syntax for interpolation, conditionals, loops, and layouts.

---

## Quick start

```js
Sketch.render(`<p>Hello, {{ name }}!</p>`, { name: 'Alice' })
// → <p>Hello, Alice!</p>
```

Compile once, render many times:

```js
const tmpl = Sketch.compile(`<li>{{ item | upper }}</li>`);
tmpl({ item: 'apple' }); // → <li>APPLE</li>
tmpl({ item: 'pear'  }); // → <li>PEAR</li>
```

---

## Most common patterns

These cover the vast majority of everyday use.

### Interpolation — `{{ expr }}`

Evaluates a JavaScript expression and outputs it HTML-escaped.

```html
<p>{{ user.name }}</p>
<p>{{ count + 1 }}</p>
<p>{{ active ? 'Yes' : 'No' }}</p>
```

### Filters — `{{ expr | filter }}`

Pipe a value through one or more named filters.

```html
{{ name | upper }}
{{ price | currency }}
{{ createdAt | date:'DD/MM/YYYY' }}
{{ bio | default:No bio provided }}
```

Filters chain left-to-right:

```html
{{ name | trim | upper }}
```

### Conditionals — `{if}` / `{else}` / `{/if}`

```html
{if user.admin}
  <strong>Admin</strong>
{else}
  <span>User</span>
{/if}
```

### Loops — `{foreach items as item}` / `{/foreach}`

```html
<ul>
{foreach products as p}
  <li>{{ p.name }} — {{ p.price | currency }}</li>
{/foreach}
</ul>
```

Empty state with `{forelse}`:

```html
{foreach products as p}
  <li>{{ p.name }}</li>
{forelse}
  <li>No products found.</li>
{/foreach}
```

### Layouts — `render(tmpl, scope, { layout })`

A layout wraps the rendered output of the inner template wherever `{yield}` appears.

```js
const layout = `<html><body><main>{yield}</main></body></html>`;
const page   = `<h1>{{ title }}</h1>`;

Sketch.render(page, { title: 'Home' }, { layout });
// → <html><body><main><h1>Home</h1></main></body></html>
```

---

## Full reference

### `Sketch.render(template, scope, options?)`

Compile and render in one call.

| Argument   | Type     | Description                                      |
|------------|----------|--------------------------------------------------|
| `template` | `string` | The template string to render                    |
| `scope`    | `object` | Variables available inside the template          |
| `options`  | `object` | Optional. Currently supports `{ layout: string }`|

```js
Sketch.render(`{{ x }}`, { x: 42 });
// → 42

Sketch.render(`{{ x }}`, { x: 42 }, { layout: `[{yield}]` });
// → [42]
```

### `Sketch.compile(template)`

Returns a reusable render function `(scope?, options?) => string`. Use this when rendering the same template multiple times — it parses once and avoids repeated tokenization/AST building.

```js
const tmpl = Sketch.compile(`<p>{{ msg }}</p>`);
tmpl({ msg: 'Hello' });   // → <p>Hello</p>
tmpl({ msg: 'Goodbye' }); // → <p>Goodbye</p>
```

The compiled function also accepts layout options:

```js
tmpl({ msg: 'Hi' }, { layout: `<body>{yield}</body>` });
// → <body><p>Hi</p></body>
```

---

## Interpolation

### Escaped output — `{{ expr }}`

Evaluates `expr` as a JavaScript expression in the current scope, then HTML-escapes the result. Special characters (`&`, `<`, `>`, `"`, `'`) are converted to their HTML entities. This is the default and safe choice for user-facing content.

```html
{{ name }}
{{ user.profile.bio }}
{{ items.length > 0 ? 'Has items' : 'Empty' }}
{{ a + b }}
```

If the value is `null` or `undefined`, an empty string is output.

### Raw output — `{{{ expr }}}`

Same as `{{ }}` but skips HTML escaping. Use for values you trust to already contain safe or intentional HTML. Also supports filters (see below).

```html
{{{ htmlContent }}}
{{{ data | json }}}
```

> **Warning:** never use `{{{ }}}` with user-supplied content — it will render any HTML or script tags as-is.

---

## Filters

Filters transform a value before it is output. They are appended with `|` after the expression. Any number of filters can be chained; they are applied left-to-right.

```html
{{ expr | filterName }}
{{ expr | filterName:argument }}
{{ expr | filter1 | filter2:arg | filter3 }}
```

Filters work with both `{{ }}` (output is escaped after filtering) and `{{{ }}}` (output is not escaped).

### Built-in filters

#### `upper`
Converts a string to uppercase.
```html
{{ 'hello' | upper }}  →  HELLO
```

#### `lower`
Converts a string to lowercase.
```html
{{ 'WORLD' | lower }}  →  world
```

#### `trim`
Removes leading and trailing whitespace.
```html
{{ '  hi  ' | trim }}  →  hi
```

#### `length`
Returns the length of a string or array, or the number of keys in an object.
```html
{{ 'hello' | length }}        →  5
{{ [1,2,3] | length }}        →  3
{{ {a:1, b:2} | length }}     →  2
```

#### `default:fallback`
Returns `fallback` when the value is `null`, `undefined`, or an empty string. Otherwise returns the value unchanged.
```html
{{ user.bio | default:No bio yet }}
{{ count | default:0 }}
```

#### `json`
Serializes a value to a JSON string, indented by 2 spaces by default. Accepts an optional indentation argument.
```html
{{{ config | json }}}
{{{ config | json:4 }}}
```
Use `{{{ }}}` (raw) rather than `{{ }}` to avoid `"` being escaped to `&quot;`.

#### `date:format`
Formats a date value (a `Date` object, ISO string, or timestamp) using a format string. Returns `[invalid date: ...]` if the value cannot be parsed.

| Token | Meaning             |
|-------|---------------------|
| `YYYY`| 4-digit year        |
| `YY`  | 2-digit year        |
| `MM`  | 2-digit month       |
| `DD`  | 2-digit day         |
| `HH`  | 2-digit hours (24h) |
| `mm`  | 2-digit minutes     |
| `ss`  | 2-digit seconds     |

```html
{{ createdAt | date:'DD/MM/YYYY' }}
{{ updatedAt | date:'YYYY-MM-DD HH:mm' }}
```

#### `currency:symbol:decimals:locale`
Formats a number as a currency string. All arguments are optional.

| Argument  | Default  | Description                  |
|-----------|----------|------------------------------|
| `symbol`  | `€`      | Prefix symbol                |
| `decimals`| `2`      | Decimal places               |
| `locale`  | `de-DE`  | BCP 47 locale for formatting |

```html
{{ price | currency }}
{{ amount | currency:$:2:en-US }}
```

Returns `[invalid number: ...]` if the value is not numeric.

### Custom filters

Register your own filters with `Sketch.registerFilter(name, fn)`. The function receives the current value as its first argument, and the filter argument (if any) as the second.

```js
Sketch.registerFilter('truncate', (v, len = 100) => {
  const s = String(v);
  return s.length > len ? s.slice(0, len) + '…' : s;
});

Sketch.registerFilter('pluralize', (v, word) => {
  return `${v} ${word}${v === 1 ? '' : 's'}`;
});
```

```html
{{ post.body | truncate:200 }}
{{ count | pluralize:item }}
```

---

## Conditionals

### `{if expr}` / `{/if}`

Renders the body only when `expr` is truthy.

```html
{if isLoggedIn}
  <a href="/logout">Log out</a>
{/if}
```

### `{if}` / `{else}` / `{/if}`

```html
{if stock > 0}
  <button>Add to cart</button>
{else}
  <span>Out of stock</span>
{/if}
```

### `{if}` / `{elseif}` / `{else}` / `{/if}`

Any number of `{elseif}` branches can be chained. The first truthy branch renders; the rest are skipped.

```html
{if score >= 90}
  <span>A</span>
{elseif score >= 80}
  <span>B</span>
{elseif score >= 70}
  <span>C</span>
{else}
  <span>F</span>
{/if}
```

### Nesting

Conditionals and loops can be freely nested.

```html
{if user}
  {if user.admin}
    <span>Admin: {{ user.name }}</span>
  {else}
    <span>User: {{ user.name }}</span>
  {/if}
{else}
  <span>Guest</span>
{/if}
```

---

## Loops

### `{foreach collection as varName}` / `{/foreach}`

Iterates over an array. Inside the body, `varName` holds the current item and `varName_i` holds the zero-based index.

```html
{foreach users as user}
  <tr>
    <td>{{ user_i + 1 }}</td>
    <td>{{ user.name }}</td>
    <td>{{ user.email }}</td>
  </tr>
{/foreach}
```

The collection expression is evaluated as JavaScript, so you can pass any expression that yields an array:

```html
{foreach items.filter(i => i.active) as item}
  <li>{{ item.name }}</li>
{/foreach}
```

If the value is not an array, Sketch outputs an error message and logs to the console.

### `{forelse}` inside `{foreach}`

When the collection is empty, the `{forelse}` block renders instead of the loop body.

```html
{foreach notifications as n}
  <div class="notification">{{ n.message }}</div>
{forelse}
  <div class="empty">You have no notifications.</div>
{/foreach}
```

Without `{forelse}`, an empty array simply renders nothing.

### `{forin obj as keyName}` / `{/forin}`

Iterates over the own enumerable keys of an object. Inside the body, `keyName` holds the current key, `obj[keyName]` yields its value, and `keyName_i` holds the zero-based counter.

```html
{forin meta as key}
  <tr>
    <td>{{ key }}</td>
    <td>{{ meta[key] }}</td>
  </tr>
{/forin}
```

If the value is not a non-null object, Sketch outputs an error message and logs to the console.

### `{forelse}` inside `{forin}`

Same as with `{foreach}` — renders when the object has no own enumerable keys.

```html
{forin settings as key}
  <li>{{ key }}: {{ settings[key] }}</li>
{forelse}
  <li>No settings configured.</li>
{/forin}
```

---

## Eval blocks

### `{eval}` / `{/eval}`

Executes arbitrary JavaScript inside the template. Variables assigned here are merged back into the scope and are available to all subsequent expressions in the same template. Use this sparingly for computed values that are cumbersome to pre-compute outside the template.

```html
{eval}
  subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  tax      = subtotal * 0.2;
  total    = subtotal + tax;
{/eval}

<p>Subtotal: {{ subtotal | currency }}</p>
<p>Tax (20%): {{ tax | currency }}</p>
<p>Total: {{ total | currency }}</p>
```

The code inside `{eval}` / `{/eval}` is plain JavaScript. It receives all current scope variables as local variables. Assignments become new scope entries visible to everything after the block.

> **Note:** `{eval}` blocks cannot `return` a value — use assignments instead.

---

## Layouts and `{yield}`

A layout is a second template that wraps the output of the primary (inner) template. Pass it via the `options` argument.

```js
const layout = `
<!DOCTYPE html>
<html>
  <head><title>{{ title }}</title></head>
  <body>
    <nav>{{ siteName }}</nav>
    <main>{yield}</main>
    <footer>© {{ year }}</footer>
  </body>
</html>`;

const page = `<h1>{{ title }}</h1><p>{{ body }}</p>`;

Sketch.render(page, {
  title:    'About Us',
  body:     'We build things.',
  siteName: 'Acme',
  year:     2025
}, { layout });
```

### How it works

1. The inner template is rendered first using the provided scope.
2. The rendered HTML string is stored internally as `$yield`.
3. The layout is then rendered with the same scope, plus `$yield`.
4. Wherever `{yield}` appears in the layout, the inner output is inserted **raw** (unescaped), since it is already-rendered HTML.

### Key points

- The layout and inner template share the same scope — all variables are available in both.
- `{yield}` can appear anywhere in the layout, any number of times.
- Layout templates support all the same features as regular templates: `{{ }}`, `{if}`, `{foreach}`, filters, etc.
- Layouts compose well with `Sketch.compile()`:

```js
const renderPage = Sketch.compile(`<article>{{{ content | default:Nothing here }}}</article>`);

renderPage({ content: '<p>Hello</p>' }, { layout });
```

---

## Raw HTML preservation

For use inside frameworks like Flow that manage nested template elements, Sketch exposes two utility methods to protect inner templates from being processed during an outer compilation pass.

### `Sketch.preserve(html, selector?)`

Finds elements with `flow`, `flow-link`, or `flow-form` attributes and replaces their `innerHTML` with a placeholder token. Returns the modified HTML string.

```js
const safe = Sketch.preserve(outerHtml, attrVal => attrVal.startsWith('my-'));
```

### `Sketch.restore(html)`

Replaces all placeholder tokens with their original content. Call this after the outer template has been compiled/rendered.

```js
const final = Sketch.restore(renderedHtml);
```

These methods are primarily intended for framework integrators rather than end-user template authors.

---

## Error handling

Sketch is designed to be resilient — errors are surfaced inline as descriptive strings rather than thrown exceptions, so a single broken expression does not break the entire render.

| Situation                              | Output                                                          |
|----------------------------------------|-----------------------------------------------------------------|
| JavaScript expression throws           | `[Sketch error: <message> in expr: <expr>]`                    |
| Unknown filter name                    | `[Sketch error: unknown filter '<name>']`                      |
| `{foreach}` given a non-array          | `[Sketch error: foreach expects an array, got <type> for: <expr>]` |
| `{forin}` given a non-object           | `[Sketch error: forin expects an object, got <type> for: <expr>]` |
| `{elseif}` / `{else}` without `{if}`  | `[Sketch error: elseif without if]`                            |
| `{forelse}` outside a loop             | `[Sketch error: forelse without foreach/forin]`                |
| Unclosed block tags                    | `[Sketch error: unclosed blocks: <type>]`                      |
| Invalid `{foreach}` syntax             | `[Sketch error: invalid foreach: <raw>]`                       |

All errors are also logged to `console.error`.

Unknown directives (e.g. `{bogustag}`) are passed through to the output as-is rather than treated as errors.

---

## Scope

The scope is a plain JavaScript object passed as the second argument to `render` or the compiled template function. Every key in the scope is available as a local variable inside template expressions.

```js
Sketch.render(`{{ x + y }}`, { x: 3, y: 4 }); // → 7
```

Sketch automatically adds a `$` key with an empty object `{}` to the scope if one is not provided. This gives templates a safe namespace for ad-hoc data without polluting the top-level scope.

```html
{eval}$.count = items.length;{/eval}
{{ $.count }}
```

Within `{foreach}` and `{forin}` bodies, the child scope inherits all parent variables plus the loop variable and index. Mutations to parent-scope keys inside a loop do **not** propagate back to the parent scope — only `{eval}` blocks can mutate scope.

---

## Template syntax summary

| Syntax                              | Purpose                                          |
|-------------------------------------|--------------------------------------------------|
| `{{ expr }}`                        | Escaped output                                   |
| `{{ expr \| filter }}`              | Escaped output with filter(s)                    |
| `{{{ expr }}}`                      | Raw (unescaped) output                           |
| `{{{ expr \| filter }}}`            | Raw output with filter(s)                        |
| `{if expr}` … `{/if}`              | Conditional                                      |
| `{if}` … `{elseif expr}` … `{/if}` | Multi-branch conditional                         |
| `{if}` … `{else}` … `{/if}`        | If/else                                          |
| `{foreach arr as v}` … `{/foreach}`| Array iteration                                  |
| `{forin obj as k}` … `{/forin}`    | Object key iteration                             |
| `{forelse}`                         | Empty branch inside `{foreach}` or `{forin}`     |
| `{eval}` … `{/eval}`               | Execute JavaScript, mutate scope                 |
| `{yield}`                           | Insert inner template output inside a layout     |
