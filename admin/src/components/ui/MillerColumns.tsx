import { useState } from 'react'
import { EmptyState } from './EmptyState'
import { InlineLoader } from './Spinner'

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

function ColumnRow({ item, col }: { item: MillerColumnItem; col: MillerColumnDef }) {
  const [hovered, setHovered] = useState(false)
  const isSelected = col.selectedId === item.id
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', cursor: 'pointer',
        background: isSelected || hovered ? 'var(--bg-surface-raised)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--brand-primary)' : '2px solid transparent',
      }}
    >
      <button
        style={{ flex: 1, textAlign: 'left', minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        onClick={() => col.onSelect(item.id)}
      >
        <div style={{
          fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)',
          fontWeight: isSelected ? 600 : 400,
        }}>
          {item.label}
        </div>
        {item.sublabel && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.sublabel}
          </div>
        )}
      </button>
      {hovered && (col.onEdit || col.onDelete) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, flexShrink: 0 }}>
          {col.onEdit && (
            <button
              onClick={e => { e.stopPropagation(); col.onEdit!(item.id) }}
              style={{ padding: 4, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4, fontSize: 13 }}
              title="Edit"
            >
              ✎
            </button>
          )}
          {col.onDelete && (
            <button
              onClick={e => { e.stopPropagation(); col.onDelete!(item.id) }}
              style={{ padding: 4, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4, fontSize: 11 }}
              title="Delete"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  columns: MillerColumnDef[]
}

export function MillerColumns({ columns }: Props) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {columns.map((col, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', width: 220, minWidth: 0,
          overflowY: 'auto', borderRight: i < columns.length - 1 ? '1px solid var(--border)' : undefined,
          flex: i === columns.length - 1 ? 1 : undefined,
        }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
                           textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {col.title}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {col.loading ? (
              <InlineLoader />
            ) : col.items.length === 0 ? (
              <EmptyState title={`No ${col.title.toLowerCase()}`} />
            ) : (
              col.items.map(item => <ColumnRow key={item.id} item={item} col={col} />)
            )}
          </div>

          {col.onAdd && (
            <div style={{ borderTop: '1px solid var(--border)', padding: 8, flexShrink: 0 }}>
              <button
                onClick={col.onAdd}
                aria-label={`Add ${col.title}`}
                style={{
                  width: '100%', textAlign: 'left', fontSize: 12, color: 'var(--brand-primary)',
                  padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4,
                }}
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
