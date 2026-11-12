/** Returns `toast(message, ms)` which shows a transient message in `el`. */
export function createToast(el) {
  let timer;
  return (message, ms = 2600) => {
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => (el.hidden = true), ms);
  };
}
