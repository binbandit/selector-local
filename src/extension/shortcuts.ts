const singleKey = /^(?:Escape|F(?:[1-9]|1[0-2])|Space|Enter|Tab|Insert|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right))$/;

function keyName(value: string): string {
  if (value === " ") return "Space";
  const key = value.trim();
  const aliases: Record<string, string> = { Spacebar: "Space", Esc: "Escape", Del: "Delete", Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight" };
  if (aliases[key]) return aliases[key];
  if (/^Key[A-Z]$/i.test(key)) return key.slice(-1).toUpperCase();
  if (/^(Digit|Numpad)[0-9]$/.test(key)) return key.slice(-1);
  if (/^[a-z0-9]$/i.test(key) || /^F(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  if (/^(Space|Enter|Tab|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right))$/.test(key)) return key;
  return key.length === 1 && ".,/;'[]\\-=`".includes(key) ? key : "";
}

export function normalizeBinding(value: string): string {
  let mod = false, alt = false, shift = false, key = "";
  for (const part of value.split("+").map(token => token.trim()).filter(Boolean)) {
    if (/^(Mod|Command|Cmd|Ctrl|Control|MacCtrl)$/i.test(part)) mod = true;
    else if (/^(Alt|Option)$/i.test(part)) alt = true;
    else if (/^Shift$/i.test(part)) shift = true;
    else if (!key) key = keyName(part);
    else return "";
  }
  if (!key || (!mod && !alt && !singleKey.test(key))) return "";
  return `${mod ? "Mod+" : ""}${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${key}`;
}

export function bindingFromEvent(event: KeyboardEvent): string {
  if (event.isComposing || event.repeat) return "";
  const key = keyName(event.code) || keyName(event.key);
  if (!key) return "";
  return normalizeBinding(`${event.metaKey || event.ctrlKey ? "Mod+" : ""}${event.altKey ? "Alt+" : ""}${event.shiftKey ? "Shift+" : ""}${key}`);
}
