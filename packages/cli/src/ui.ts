/* Tiny terminal styling — no dependencies, honours NO_COLOR / non-TTY. */

const enabled = !process.env.NO_COLOR && process.stdout.isTTY;
const wrap = (open: number, close: number) => (text: string) =>
  enabled ? `\u001B[${open}m${text}\u001B[${close}m` : text;

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const red = wrap(31, 39);
export const cyan = wrap(36, 39);

export const BRAND = `${green("●")} ${bold("tahcode")}`;

export function ok(text: string) {
  console.log(`  ${green("✓")} ${text}`);
}
export function warn(text: string) {
  console.log(`  ${yellow("!")} ${text}`);
}
export function fail(text: string) {
  console.log(`  ${red("✗")} ${text}`);
}
export function info(text: string) {
  console.log(`  ${dim("·")} ${text}`);
}
export function heading(text: string) {
  console.log(`\n${bold(text)}`);
}
export function code(text: string) {
  return cyan(text);
}
