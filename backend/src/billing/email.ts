import nodemailer from 'nodemailer'
import { env } from '../env.js'

interface WelcomeEmailInput {
  to: string
  tenantName: string
  orgToken: string
  adminToken: string
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: Number(env.SMTP_PORT ?? 587),
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
  })
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const transport = createTransport()
  await transport.sendMail({
    from: env.SMTP_FROM ?? 'noreply@ciyo.ai',
    to: input.to,
    subject: `Welcome to Pretzel — ${input.tenantName}`,
    text: [
      `Welcome to Pretzel Console, ${input.tenantName}!`,
      '',
      'Your deployment tokens are below. Keep these secure — anyone with these tokens can push policy to your team\'s browsers.',
      '',
      'ORG TOKEN (deploy to all company machines via MDM / Chrome Enterprise policy):',
      `  ${input.orgToken}`,
      '',
      'ADMIN TOKEN (your admin machine only — do not distribute):',
      `  ${input.adminToken}`,
      '',
      'Deploy via Chrome managed storage keys "orgToken" and "adminToken".',
      '',
      'Questions? Reply to this email or visit docs.ciyo.ai/getting-started',
      '',
      '— The Pretzel team at ciyo.ai',
    ].join('\n'),
  })
}
