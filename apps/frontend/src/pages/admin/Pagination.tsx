interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  loading?: boolean;
}

export function Pagination({ page, total, pageSize, onPage, loading = false }: PaginationProps) {
  if (total <= pageSize) return null;

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  const lastPage = Math.max(Math.ceil(total / pageSize) - 1, 0);

  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        type="button"
        onClick={() => onPage(Math.max(page - 1, 0))}
        disabled={page === 0 || loading}
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <span className="text-xs text-zinc-500">
        {from}–{to} of {total} · page {page + 1} of {lastPage + 1}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= lastPage || loading}
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
