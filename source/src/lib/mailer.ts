import nodemailer from 'nodemailer'

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER)
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

export async function sendAlert(to: string, subject: string, html: string) {
  if (!isMailConfigured()) return { skipped: true }
  return transporter.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to, subject, html })
}
