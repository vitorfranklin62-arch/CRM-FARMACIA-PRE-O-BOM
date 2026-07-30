/**
 * `pdfjs-dist` (legacy Node build) tem uma constante de nível de módulo
 * (`const SCALE_MATRIX = new DOMMatrix();`) que roda assim que o módulo é
 * importado — mesmo que a gente só use `getTextContent()` (nunca renderiza
 * em canvas). Em produção, sem o pacote nativo opcional `@napi-rs/canvas`
 * instalado, `DOMMatrix` não existe no Node e essa linha derruba o import
 * inteiro com "DOMMatrix is not defined". Esse polyfill mínimo (só a
 * matriz afim 2D que o pdfjs de fato usa) evita o crash.
 */
class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    }
  }

  multiplySelf(other: DOMMatrixPolyfill): this {
    const { a, b, c, d, e, f } = this;
    this.a = a * other.a + c * other.b;
    this.b = b * other.a + d * other.b;
    this.c = a * other.c + c * other.d;
    this.d = b * other.c + d * other.d;
    this.e = a * other.e + c * other.f + e;
    this.f = b * other.e + d * other.f + f;
    return this;
  }

  preMultiplySelf(other: DOMMatrixPolyfill): this {
    const result = new DOMMatrixPolyfill([other.a, other.b, other.c, other.d, other.e, other.f]).multiplySelf(this);
    Object.assign(this, result);
    return this;
  }

  translate(tx: number, ty: number): this {
    return this.multiplySelf(new DOMMatrixPolyfill([1, 0, 0, 1, tx, ty]));
  }

  scale(sx: number, sy: number = sx): this {
    return this.multiplySelf(new DOMMatrixPolyfill([sx, 0, 0, sy, 0, 0]));
  }

  invertSelf(): this {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c;
    if (!det) {
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
      return this;
    }
    this.a = d / det;
    this.b = -b / det;
    this.c = -c / det;
    this.d = a / det;
    this.e = -(e * this.a + f * this.c);
    this.f = -(e * this.b + f * this.d);
    return this;
  }
}

export function garantirPolyfillDOMMatrix(): void {
  if (typeof globalThis.DOMMatrix === "undefined") {
    (globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = DOMMatrixPolyfill;
  }
}
