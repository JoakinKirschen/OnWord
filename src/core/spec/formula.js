/**
 * Arithmetic for measurement lines: numbers, + - * /, parentheses and a leading minus. A comma is
 * accepted as the decimal sign, as it is typed in Belgium and the Netherlands.
 */

/** @param {string} source @returns {(number | string)[] | null} null when a character is not allowed */
function tokens(source) {
  const found = source.replace(/,/g, '.').match(/\d+\.?\d*|\.\d+|[-+*/()]|\S/g) ?? [];
  const out = found.map((token) => (/^[\d.]/.test(token) ? Number(token) : token));
  return out.every((token) => typeof token === 'number' || '+-*/()'.includes(token)) ? out : null;
}

/**
 * The value of an expression such as "2 * (3,5 + 1.2)". Empty text counts as 0; anything that is not
 * valid arithmetic gives NaN.
 * @param {string} source
 */
export function evaluate(source) {
  const list = tokens(source ?? '');
  if (!list) return NaN;
  if (!list.length) return 0;
  let at = 0;
  const peek = () => list[at];

  /** number | "(" sum ")" | "-" factor */
  function factor() {
    const token = list[at++];
    if (typeof token === 'number') return token;
    if (token === '-') return -factor();
    if (token !== '(') return NaN;
    const inner = sum();
    return list[at++] === ')' ? inner : NaN;
  }
  function product() {
    let value = factor();
    while (peek() === '*' || peek() === '/') value = list[at++] === '*' ? value * factor() : value / factor();
    return value;
  }
  function sum() {
    let value = product();
    while (peek() === '+' || peek() === '-') value = list[at++] === '+' ? value + product() : value - product();
    return value;
  }

  const result = sum();
  return at === list.length && Number.isFinite(result) ? result : NaN;
}
