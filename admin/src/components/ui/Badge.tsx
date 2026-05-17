type BadgeVariant = 'keyword' | 'pattern' | 'entropy' | 'score' | 'warn' | 'block' | 'global' | 'division' | 'team'

const STYLES: Record<BadgeVariant, string> = {
  keyword:  'bg-amber-100 text-amber-800',
  pattern:  'bg-red-100 text-red-800',
  entropy:  'bg-violet-100 text-violet-800',
  score:    'bg-blue-100 text-blue-800',
  warn:     'bg-yellow-100 text-yellow-800',
  block:    'bg-red-200 text-red-900',
  global:   'bg-gray-100 text-gray-700',
  division: 'bg-indigo-100 text-indigo-800',
  team:     'bg-teal-100 text-teal-800',
}

interface Props {
  variant: BadgeVariant
  children: React.ReactNode
}

export function Badge({ variant, children }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STYLES[variant]}`}>
      {children}
    </span>
  )
}
