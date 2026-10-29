type PageResult<T> = { data: T[] | null; error: unknown };
type CountResult = { count: number | null; error: unknown };

/** Count first, then ordered batches of at most six pages; count failures keep the legacy scan. */
export async function readCountedPages<T>(
  countRows: () => PromiseLike<CountResult>,
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  let total: number | null = null;
  try {
    const { count, error } = await countRows();
    if (!error && count != null && Number.isSafeInteger(count) && count >= 0) total = count;
  } catch {
    // Network/count failures must not prevent the existing sequential read.
  }

  const rows: T[] = [];
  const pageSize = 1000;
  if (total == null) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await readPage(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) return rows;
    }
  }

  const pages = Math.ceil(total / pageSize);
  for (let first = 0; first < pages; first += 6) {
    const batch = await Promise.all(Array.from({ length: Math.min(6, pages - first) }, async (_, offset) => {
      const from = (first + offset) * pageSize;
      const { data, error } = await readPage(from, from + pageSize - 1);
      if (error) throw error;
      return data ?? [];
    }));
    for (const page of batch) rows.push(...page);
  }
  return rows;
}