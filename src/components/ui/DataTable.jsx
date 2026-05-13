import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'

export function DataTable({ data, columns, emptyText = 'No hay registros para mostrar.' }) {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div className="data-table-shell overflow-hidden rounded-lg border border-white/10">
      <div className="premium-scroll overflow-x-auto">
        <table className="responsive-table min-w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase text-white/45">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 font-bold">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-white/10">
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="bg-[#101119]/75 transition hover:bg-white/[0.045]">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    data-label={cell.column.columnDef.mobileLabel || cell.column.columnDef.header || ''}
                    className="px-4 py-3 text-white/78"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )) : (
              <tr className="bg-[#101119]/75">
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-white/45">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
