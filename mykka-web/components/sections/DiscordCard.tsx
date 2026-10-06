import { DISCORD_URL } from '@/lib/config'

export function DiscordCard() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-6">
      <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer"
        className="grid items-center gap-6 rounded-[calc(var(--r)+6px)] border border-line bg-surface px-7 py-8 text-ink transition-colors hover:border-ink md:grid-cols-[auto_minmax(0,1fr)_auto] md:px-9">
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-token bg-[#5865F2]" aria-hidden="true">
          <svg width="28" height="22" viewBox="0 0 28 22" fill="#fff">
            <path d="M23.7 1.8A23 23 0 0 0 18 0l-.7 1.5a21 21 0 0 0-6.6 0L10 0a23 23 0 0 0-5.7 1.8C.7 7.3-.3 12.6.2 17.9A23 23 0 0 0 7.2 21.5l1.5-2.4c-.8-.3-1.6-.7-2.3-1.2l.6-.4a16.4 16.4 0 0 0 14 0l.6.4c-.7.5-1.5.9-2.3 1.2l1.5 2.4a23 23 0 0 0 7-3.6c.6-6.1-1-11.4-4.1-16.1zM9.4 14.7c-1.4 0-2.5-1.3-2.5-2.8s1.1-2.8 2.5-2.8 2.5 1.3 2.5 2.8-1.1 2.8-2.5 2.8zm9.2 0c-1.4 0-2.5-1.3-2.5-2.8s1.1-2.8 2.5-2.8 2.5 1.3 2.5 2.8-1.1 2.8-2.5 2.8z" />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[clamp(20px,2.2vw,26px)] font-semibold leading-[1.2] tracking-[-0.02em]">
            Join the pilot community on Discord
          </span>
          <span className="text-[16px] leading-[1.5] text-muted">
            Talk to the team building Pretzel, share the rules that work for you, and vote on what we build next.
          </span>
        </span>
        <span className="whitespace-nowrap rounded-btn bg-btn px-5 py-3 text-[16px] font-medium text-btn-fg">Join Discord ↗</span>
      </a>
    </section>
  )
}
