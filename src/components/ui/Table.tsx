export interface Column<T> {
  header: string;
  accessor: (row: T) => React.ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyField,
  emptyMessage = "Nenhum registro encontrado.",
}: {
  columns: Column<T>[];
  data: T[];
  keyField: (row: T) => string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="rolagem-fina overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-brand-100 bg-gradient-to-r from-brand-50/70 to-transparent text-xs uppercase tracking-wide text-brand-700/80 dark:border-white/10 dark:from-brand-500/10 dark:text-brand-200/80">
            {columns.map((col) => (
              <th key={col.header} className={`whitespace-nowrap py-2.5 pr-4 font-medium ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyField(row)}
              className="border-b border-brand-50 transition-colors last:border-0 hover:bg-brand-50/60 dark:border-white/5 dark:hover:bg-white/[0.04]"
            >
              {columns.map((col) => (
                <td key={col.header} className={`py-3 pr-4 align-middle ${col.className ?? ""}`}>
                  {col.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
