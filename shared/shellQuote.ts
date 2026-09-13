/** POSIX single-quote a value so user-controlled names cannot break the shell. */
export function posixShellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
