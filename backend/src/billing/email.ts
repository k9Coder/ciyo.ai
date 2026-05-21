import nodemailer from 'nodemailer'

interface WelcomeEmailInput {
  to: string
  tenantName: string
  orgToken: string
  adminToken: string
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const transport = createTransport()
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@ciyo.ai',
    to: input.to,
    subject: `Welcome to ciyo — ${input.tenantName}`,
    text: [
      `Welcome to ciyo, ${input.tenantName}!`,
      '',
      'Your deployment tokens are below. Keep these secure.',
      '',
      'ORG TOKEN (deploy to all company machines via MDM/GPO):',
      `  ${input.orgToken}`,
      '',
      'ADMIN TOKEN (admin machine only):',
      `  ${input.adminToken}`,
      '',
      'Deploy via Chrome managed storage keys "orgToken" and "adminToken".',
      'Questions? Reply to this email.',
    ].join('\n'),
  })
}
