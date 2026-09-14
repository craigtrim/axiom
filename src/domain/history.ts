export interface HistoryEntry {
  label: string;
  undo: () => void;
  redo: () => void;
  bytes?: number;
}
export class History {
  undoStack: HistoryEntry[] = [];
  redoStack: HistoryEntry[] = [];
  constructor(
    public limit = 100,
    public byteLimit = 32 * 1024 * 1024,
  ) {}
  push(entry: HistoryEntry) {
    this.undoStack.push(entry);
    this.redoStack = [];
    while (
      this.undoStack.length > 1 &&
      (this.undoStack.length > this.limit ||
        this.undoStack.reduce((n, e) => n + (e.bytes ?? 0), 0) > this.byteLimit)
    )
      this.undoStack.shift();
  }
  undo() {
    const e = this.undoStack.pop();
    if (!e) return false;
    e.undo();
    this.redoStack.push(e);
    return true;
  }
  redo() {
    const e = this.redoStack.pop();
    if (!e) return false;
    e.redo();
    this.undoStack.push(e);
    return true;
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
