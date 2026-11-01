const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Markup that's already safe, so `html` puts it in as is. */
export class Html {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

/** Trusted markup, such as the page's own styles and script. */
export function raw(markup: string): Html {
  return new Html(markup);
}

function render(value: unknown): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Builds markup, escaping every interpolated value that isn't `Html` itself. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let markup = strings[0];
  values.forEach((value, index) => {
    markup += render(value) + strings[index + 1];
  });
  return new Html(markup);
}
