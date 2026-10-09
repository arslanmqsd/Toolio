// Characters with no special meaning to bash or zsh anywhere in a word. "-", "~" and "=" are left out of the first
// position (option, tilde expansion, zsh equals expansion); braces are left out entirely (brace expansion).
const BARE = /^[A-Za-z0-9_./:@%+,][A-Za-z0-9_./:@%+,=~-]*$/;

/** Quotes `arg` for a POSIX shell (bash, zsh) so it reaches the program as one literal argument. */
export function quote(arg: string): string {
  // zsh expands "~" after "=" or ":" inside a word when MAGIC_EQUAL_SUBST is set.
  if (BARE.test(arg) && !/[=:]~/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
