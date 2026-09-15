import type { QueryResult } from "../domain/query";
export class QueryResultCache {
  private items = new Map<
    number,
    { key: string; text: string; result: QueryResult }
  >();
  constructor(
    private maxRows = 250000,
    private maxResults = 8,
  ) {}
  add(id: number, key: string, text: string, result: QueryResult) {
    this.items.set(id, { key, text, result });
    let rows = [...this.items.values()].reduce(
      (n, r) => n + r.result.rows.length,
      0,
    );
    while (
      this.items.size > 1 &&
      (rows > this.maxRows || this.items.size > this.maxResults)
    ) {
      const oldest = this.items.keys().next().value!;
      rows -= this.items.get(oldest)!.result.rows.length;
      this.items.delete(oldest);
    }
  }
  get(id: number, key?: string) {
    const item = this.items.get(id);
    if (!item || (key !== undefined && key !== item.key)) return undefined;
    this.items.delete(id);
    this.items.set(id, item);
    return item;
  }
  peek(id: number, key: string) {
    const item = this.items.get(id);
    return item?.key === key ? item : undefined;
  }
  clear() {
    this.items.clear();
  }
}
