/**
 * L1 和弦：把 KeyboardEvent 收成可比较的 { key, ctrl, shift, alt }。
 */

export interface KeyChord {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export function eventKey(event: KeyboardEvent): string {
  if (event.key === " " || event.code === "Space") return "space";
  return event.key.toLowerCase();
}

export function isModKey(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

export function matchesChord(event: KeyboardEvent, chord: KeyChord): boolean {
  if (eventKey(event) !== chord.key) return false;
  if (Boolean(chord.ctrl) !== isModKey(event)) return false;
  if (Boolean(chord.shift) !== event.shiftKey) return false;
  if (Boolean(chord.alt) !== event.altKey) return false;
  return true;
}
