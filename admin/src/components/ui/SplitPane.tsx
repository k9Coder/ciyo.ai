interface Props {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: number
}

export function SplitPane({ left, right, leftWidth = 260 }: Props) {
  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: leftWidth, minWidth: leftWidth }}
        className="flex flex-col border-r border-gray-200 overflow-y-auto"
      >
        {left}
      </div>
      <div className="flex-1 overflow-y-auto">{right}</div>
    </div>
  )
}
