/** Something a tool wants the reader to know about its result. */
export interface Notice {
  /** Warnings may mean lost or misread data; info only says what was done. */
  kind: "warning" | "info";
  message: string;
}

/** Lists a few examples and how many more there are: "a, b, c and 4 more". */
export function some(items: string[], shown = 3): string {
  const listed = items.slice(0, shown);
  const rest = items.length - listed.length;
  if (rest > 0) return `${listed.join(", ")} and ${rest} more`;
  return listed.length > 1 ? `${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]}` : listed[0];
}

/** "1 row", "2,048 rows". */
export const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
