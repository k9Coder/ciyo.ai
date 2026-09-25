export function H2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`m-0 text-[clamp(30px,3.6vw,44px)] font-semibold leading-[1.08] tracking-[-0.03em] ${className}`}>
      {children}
    </h2>
  )
}
