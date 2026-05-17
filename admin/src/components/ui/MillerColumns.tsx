import { EmptyState } from './EmptyState'

export interface MillerColumnItem {
  id: string
  label: string
  sublabel?: string
}

export interface MillerColumnDef {
  title: string
  items: MillerColumnItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd?: () => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  loading?: boolean
}

interface Props {
  columns: MillerColumnDef[]
}

export function MillerColumns({ columns }: Props) {
  return (
    <div className="flex h-full divide-x divide-gray-200">
      {columns.map((col, i) => (
        <div key={i} className="flex flex-col w-64 min-w-0 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {col.title}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {col.loading ? (
              <div className="p-4 text-sm text-gray-400">Loading…</div>
            ) : col.items.length === 0 ? (
              <EmptyState title={`No ${col.title.toLowerCase()}`} />
            ) : (
              col.items.map(item => (
                <div
                  key={item.id}
                  className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 ${
                    col.selectedId === item.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => col.onSelect(item.id)}
                  >
                    <div className={`text-sm truncate ${col.selectedId === item.id ? 'text-blue-700 font-medium' : 'text-gray-800'}`}>
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div className="text-xs text-gray-400 truncate">{item.sublabel}</div>
                    )}
                  </button>
                  {(col.onEdit || col.onDelete) && (
                    <div className="hidden group-hover:flex items-center gap-1 ml-2 shrink-0">
                      {col.onEdit && (
                        <button
                          onClick={e => { e.stopPropagation(); col.onEdit!(item.id) }}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded"
                          title="Edit"
                        >
                          ✎
                        </button>
                      )}
                      {col.onDelete && (
                        <button
                          onClick={e => { e.stopPropagation(); col.onDelete!(item.id) }}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Delete"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {col.onAdd && (
            <div className="border-t border-gray-100 p-2 shrink-0">
              <button
                onClick={col.onAdd}
                className="w-full text-left text-sm text-blue-600 hover:text-blue-800 px-2 py-1.5 rounded hover:bg-blue-50"
              >
                + Add
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
