import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { PageLoader } from '../components/ui/Spinner'

const PROFESSIONS = [
  { slug: 'accountant',  label: 'Accountant / Finance',      description: 'Tax, bookkeeping, financial advisory' },
  { slug: 'developer',   label: 'Developer / Engineer',      description: 'Software development, DevOps, data engineering' },
  { slug: 'legal',       label: 'Legal / Compliance',        description: 'Law, contracts, regulatory work' },
  { slug: 'healthcare',  label: 'Healthcare',                description: 'Medical, clinical, health administration' },
  { slug: 'other',       label: 'Other',                     description: 'None of the above' },
]

const FOLLOW_UP: Record<string, { question: string; options: { slug: string; label: string }[] }> = {
  accountant: {
    question: 'What kind of financial data do you handle?',
    options: [
      { slug: 'client_financial_data', label: 'Client financial data (tax returns, bank statements)' },
      { slug: 'internal_only',         label: 'Internal bookkeeping only' },
    ],
  },
  developer: {
    question: 'What is your primary security concern?',
    options: [
      { slug: 'source_code', label: 'Proprietary source code and algorithms' },
      { slug: 'api_keys',    label: 'API keys and credentials' },
    ],
  },
  legal: {
    question: 'What types of documents do you work with?',
    options: [
      { slug: 'client_pii',    label: 'Client PII and confidential case files' },
      { slug: 'internal_docs', label: 'Internal legal documents only' },
    ],
  },
  healthcare: {
    question: 'Do you work with patient health data?',
    options: [
      { slug: 'patient_data',  label: 'Patient health records (PHI / HIPAA-covered)' },
      { slug: 'internal_only', label: 'Internal administrative data only' },
    ],
  },
}

type Step = 'profession' | 'followup' | 'confirm' | 'done'

export function OnboardingProfilePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep]         = useState<Step>('profession')
  const [profession, setProfession]     = useState('')
  const [followUpAnswer, setFollowUpAnswer] = useState('')
  const [apiError, setApiError]         = useState<string | null>(null)

  const apply = useMutation({
    mutationFn: () => api.onboarding.applyTemplate(profession, followUpAnswer),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant'] })
      navigate('/dashboard', { replace: true })
    },
    onError: (e: Error) => setApiError(e.message),
  })

  const skip = useMutation({
    mutationFn: () => api.onboarding.skip(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant'] })
      navigate('/dashboard', { replace: true })
    },
    onError: (e: Error) => setApiError(e.message),
  })

  const followUpConfig = FOLLOW_UP[profession]
  const isOther = profession === 'other'

  function handleProfessionSelect(slug: string) {
    setProfession(slug)
    setFollowUpAnswer('')
    if (slug === 'other') {
      setStep('confirm')
    } else {
      setStep('followup')
    }
  }

  function handleFollowUpSelect(slug: string) {
    setFollowUpAnswer(slug)
    setStep('confirm')
  }

  function handleAccept() {
    setApiError(null)
    apply.mutate()
  }

  function handleSkip() {
    setApiError(null)
    skip.mutate()
  }

  const busy = apply.isPending || skip.isPending

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 40, height: 40, background: 'var(--brand-primary)',
              borderRadius: 10, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 20,
            }}>
              🥨
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                Set up your DLP policy
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Takes 30 seconds. You can change this later.
              </div>
            </div>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
            {(['profession', 'followup', 'confirm'] as Step[]).map((s, i) => (
              <div key={s} style={{
                height: 3, flex: 1, borderRadius: 2,
                background: i <= ['profession', 'followup', 'confirm'].indexOf(step)
                  ? 'var(--brand-primary)'
                  : 'var(--border)',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24,
        }}>

          {/* Step 1: Profession */}
          {step === 'profession' && (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                What best describes your work?
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                We'll recommend a DLP policy based on your answer.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PROFESSIONS.map(p => (
                  <button
                    key={p.slug}
                    onClick={() => handleProfessionSelect(p.slug)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-base)', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {p.description}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2: Follow-up */}
          {step === 'followup' && followUpConfig && (
            <>
              <button
                onClick={() => setStep('profession')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 12, padding: 0, marginBottom: 16,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                ← Back
              </button>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {followUpConfig.question}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                This helps us pick the right set of DLP rules for you.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {followUpConfig.options.map(opt => (
                  <button
                    key={opt.slug}
                    onClick={() => handleFollowUpSelect(opt.slug)}
                    style={{
                      padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-base)', cursor: 'pointer', textAlign: 'left',
                      fontSize: 13, color: 'var(--text-primary)', fontWeight: 500,
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <>
              <button
                onClick={() => setStep(isOther ? 'profession' : 'followup')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 12, padding: 0, marginBottom: 16,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                ← Back
              </button>

              {isOther ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    We don't have a template for your profession yet
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                    You can configure your DLP policy manually from the{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>Policies</strong> page after setup.
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={handleSkip}
                      disabled={busy}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                        background: 'var(--brand-primary)', color: '#fff',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy ? 'Please wait…' : 'Go to dashboard →'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    We found a recommended policy for you
                  </div>
                  <div style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '14px 16px', marginBottom: 20,
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      Recommended policy
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {PROFESSIONS.find(p => p.slug === profession)?.label} — {
                        FOLLOW_UP[profession]?.options.find(o => o.slug === followUpAnswer)?.label ?? followUpAnswer
                      }
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      A set of DLP rules tailored for your work type will be applied to your account.
                      You can review and edit them anytime in the Policies section.
                    </div>
                  </div>

                  {apiError && (
                    <div style={{
                      background: '#fee2e2', border: '1px solid #fca5a5',
                      borderRadius: 6, padding: '10px 12px', marginBottom: 16,
                      fontSize: 12, color: '#b91c1c',
                    }}>
                      {apiError}{' '}
                      <button
                        onClick={handleAccept}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontWeight: 600, padding: 0 }}
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {busy && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <PageLoader label="Applying policy…" />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={handleSkip}
                      disabled={busy}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Skip for now
                    </button>
                    <button
                      onClick={handleAccept}
                      disabled={busy}
                      style={{
                        flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        background: 'var(--brand-primary)', color: '#fff',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy ? 'Applying…' : 'Use this policy →'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
