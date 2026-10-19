/**
 * EduMate — Envoi d'e-mails (mot de passe oublié, notifications).
 *
 * Objectif : **zéro dépendance obligatoire**. Les cinq fournisseurs les plus
 * courants sont appelés directement en HTTPS avec le `fetch` natif de Node 20 :
 *
 *   | MAIL_PROVIDER | Fournisseur          | Clé (MAIL_API_KEY)        | Gratuit          |
 *   |---------------|----------------------|---------------------------|------------------|
 *   | `resend`      | Resend               | `re_...`                  | 100/jour         |
 *   | `brevo`       | Brevo (ex-Sendinblue)| `xkeysib-...`             | 300/jour         |
 *   | `sendgrid`    | Twilio SendGrid      | `SG....`                  | 100/jour         |
 *   | `mailgun`     | Mailgun              | `key-...` + MAILGUN_DOMAIN| 100/jour (essai) |
 *   | `postmark`    | Postmark             | jeton serveur (UUID)      | 100/mois         |
 *   | `smtp`        | tout serveur SMTP    | SMTP_USER / SMTP_PASS     | selon l'hébergeur|
 *   | `log`         | journal du serveur   | —                         | illimité         |
 *
 * Le mode `smtp` est le seul à charger une dépendance (`nodemailer`) : elle est
 * importée dynamiquement, donc **jamais chargée** si tu n'utilises pas SMTP.
 * C'est la voie la plus simple avec une adresse Gmail / Outlook personnelle
 * (mot de passe d'application requis, voir `.env.example`).
 *
 * Comportement sans configuration : aucun e-mail n'est envoyé, le lien de
 * réinitialisation est écrit dans les journaux du serveur (onglet « Logs » de
 * Render) et l'API renvoie `sent: false`. L'application ne plante jamais et ne
 * bloque jamais l'élève : la route répond 200 dans tous les cas.
 */
import { config } from './config.js';

/** Fournisseurs d'envoi reconnus. */
export type MailProviderId = 'none' | 'log' | 'resend' | 'brevo' | 'sendgrid' | 'mailgun' | 'postmark' | 'smtp';

export interface MailMessage {
  /** Destinataire (une seule adresse : EduMate n'envoie jamais de masse). */
  to: string;
  subject: string;
  /** Version texte brut (clients sans HTML, accessibilité). */
  text: string;
  /** Version HTML (styles en ligne : les feuilles externes sont ignorées). */
  html: string;
  /** Étiquette de suivi fournie au prestataire (statistiques, filtrage). */
  tag?: string;
}

export interface MailResult {
  ok: boolean;
  provider: MailProviderId;
  /** Identifiant renvoyé par le prestataire (diagnostic). */
  messageId?: string;
  /** Message d'échec lisible, sans détail technique sensible. */
  error?: string;
}

/** Analyse `MAIL_FROM` : accepte « Nom <adresse@x.fr> » ou « adresse@x.fr ». */
function parseFrom(raw: string): { name: string; address: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1] || config.mail.fromName, address: match[2].trim() };
  }
  return { name: config.mail.fromName, address: raw.trim() };
}

/**
 * Déduit le fournisseur du FORMAT de la clé quand `MAIL_PROVIDER` est vide.
 * Évite le piège classique : clé collée mais fournisseur oublié → « none ».
 */
function inferProvider(key: string): MailProviderId {
  const explicit = config.mail.provider;
  if (explicit !== 'auto') return explicit;
  if (!key) return config.mail.smtp.host ? 'smtp' : 'log';
  if (key.startsWith('re_')) return 'resend';
  if (key.startsWith('xkeysib-')) return 'brevo';
  if (key.startsWith('SG.')) return 'sendgrid';
  if (key.startsWith('key-') || key.startsWith('api-')) return 'mailgun';
  if (config.mail.smtp.host) return 'smtp';
  console.warn(
    `[EduMate] MAIL_API_KEY présente mais fournisseur non reconnu : renseigne MAIL_PROVIDER ` +
      '(resend, brevo, sendgrid, mailgun, postmark, smtp). Repli sur le journal.',
  );
  return 'log';
}

const provider = (): MailProviderId => inferProvider((config.mail.apiKey || '').trim());

/** Un vrai prestataire est-il configuré (hors `log` / `none`) ? */
export function hasMailer(): boolean {
  const current = provider();
  if (current === 'none' || current === 'log') return false;
  if (current === 'smtp') return Boolean(config.mail.smtp.host && config.mail.smtp.user && config.mail.smtp.pass);
  if (current === 'mailgun') return Boolean(config.mail.apiKey && config.mail.mailgunDomain);
  return Boolean(config.mail.apiKey && parseFrom(config.mail.from).address);
}

/** État affiché par `/api/health` et la ligne de démarrage du serveur. */
export function mailerStatus(): { provider: MailProviderId; configured: boolean; from: string } {
  const current = provider();
  return {
    provider: hasMailer() ? current : current === 'none' ? 'none' : 'log',
    configured: hasMailer(),
    from: parseFrom(config.mail.from).address || '',
  };
}

/** Échappe le HTML injecté dans le gabarit (le prénom vient de la base). */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ */
/*  Envoi HTTP (fetch natif, aucune dépendance)                        */
/* ------------------------------------------------------------------ */

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.mail.timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: response.status, text: await response.text().catch(() => '') };
  } finally {
    clearTimeout(timer);
  }
}

function failure(current: MailProviderId, detail: string): MailResult {
  console.error(`[EduMate] Envoi d'e-mail échoué (${current}) : ${detail.slice(0, 300)}`);
  return { ok: false, provider: current, error: detail.slice(0, 200) };
}

async function sendResend(message: MailMessage): Promise<MailResult> {
  const from = parseFrom(config.mail.from);
  const { status, text } = await postJson(
    'https://api.resend.com/emails',
    { Authorization: `Bearer ${config.mail.apiKey}` },
    {
      from: `${from.name} <${from.address}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(config.mail.replyTo ? { reply_to: config.mail.replyTo } : {}),
      ...(message.tag ? { tags: [{ name: 'category', value: message.tag }] } : {}),
    },
  );
  if (status >= 400) return failure('resend', `HTTP ${status} ${text}`);
  return { ok: true, provider: 'resend', messageId: jsonField(text, 'id') };
}

async function sendBrevo(message: MailMessage): Promise<MailResult> {
  const from = parseFrom(config.mail.from);
  const { status, text } = await postJson(
    'https://api.brevo.com/v3/smtp/email',
    { 'api-key': config.mail.apiKey },
    {
      sender: { name: from.name, email: from.address },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      ...(config.mail.replyTo ? { replyTo: { email: config.mail.replyTo, name: from.name } } : {}),
      ...(message.tag ? { tag: message.tag } : {}),
    },
  );
  if (status >= 400) return failure('brevo', `HTTP ${status} ${text}`);
  return { ok: true, provider: 'brevo', messageId: jsonField(text, 'messageId') };
}

async function sendSendGrid(message: MailMessage): Promise<MailResult> {
  const from = parseFrom(config.mail.from);
  const { status, text } = await postJson(
    'https://api.sendgrid.com/v3/mail/send',
    { Authorization: `Bearer ${config.mail.apiKey}` },
    {
      personalizations: [{ to: [{ email: message.to }], subject: message.subject }],
      from: { email: from.address, name: from.name },
      ...(config.mail.replyTo ? { reply_to: { email: config.mail.replyTo } } : {}),
      content: [
        { type: 'text/plain', value: message.text },
        { type: 'text/html', value: message.html },
      ],
      ...(message.tag ? { categories: [message.tag] } : {}),
    },
  );
  // SendGrid répond 202 sans corps en cas de succès.
  if (status >= 400) return failure('sendgrid', `HTTP ${status} ${text}`);
  return { ok: true, provider: 'sendgrid', messageId: `sendgrid-${status}` };
}

async function sendMailgun(message: MailMessage): Promise<MailResult> {
  const from = parseFrom(config.mail.from);
  const domain = config.mail.mailgunDomain;
  const base = config.mail.mailgunBaseUrl.replace(/\/+$/, '');
  const form = new URLSearchParams({
    from: `${from.name} <${from.address}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(config.mail.replyTo ? { 'h:Reply-To': config.mail.replyTo } : {}),
    ...(message.tag ? { 'o:tag': message.tag } : {}),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.mail.timeoutMs);
  try {
    const response = await fetch(`${base}/${encodeURIComponent(domain)}/messages`, {
      method: 'POST',
      headers: {
        // Mailgun attend une authentification Basic « api:CLÉ ».
        Authorization: `Basic ${Buffer.from(`api:${config.mail.apiKey}`).toString('base64')}`,
        Accept: 'application/json',
      },
      body: form,
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    if (response.status >= 400) return failure('mailgun', `HTTP ${response.status} ${text}`);
    return { ok: true, provider: 'mailgun', messageId: jsonField(text, 'id') };
  } finally {
    clearTimeout(timer);
  }
}

async function sendPostmark(message: MailMessage): Promise<MailResult> {
  const from = parseFrom(config.mail.from);
  const { status, text } = await postJson(
    'https://api.postmarkapp.com/email',
    {
      'X-Postmark-Server-Token': config.mail.apiKey,
      ...(config.mail.replyTo ? { 'X-Postmark-Server-Token-Reply': config.mail.replyTo } : {}),
    },
    {
      From: `${from.name} <${from.address}>`,
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
      HtmlBody: message.html,
      MessageStream: 'outbound',
      ...(config.mail.replyTo ? { ReplyTo: config.mail.replyTo } : {}),
      ...(message.tag ? { Tag: message.tag } : {}),
    },
  );
  if (status >= 400) return failure('postmark', `HTTP ${status} ${text}`);
  return { ok: true, provider: 'postmark', messageId: jsonField(text, 'MessageID') };
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Extrait un champ texte d'une réponse JSON de prestataire (vide si absent). */
function jsonField(text: string, key: string): string | undefined {
  const value = safeJson(text)?.[key];
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Envoi SMTP (nodemailer, chargé uniquement si nécessaire)            */
/* ------------------------------------------------------------------ */

let smtpTransport: { sendMail: (options: Record<string, unknown>) => Promise<{ messageId?: string }> } | null = null;

async function sendSmtp(message: MailMessage): Promise<MailResult> {
  const from = parseFrom(config.mail.from);
  try {
    if (!smtpTransport) {
      const loaded = (await import('nodemailer')) as unknown as {
        default?: { createTransport: (options: Record<string, unknown>) => unknown };
        createTransport?: (options: Record<string, unknown>) => unknown;
      };
      const nodemailer = loaded.default ?? loaded;
      if (typeof nodemailer?.createTransport !== 'function') {
        throw new Error('nodemailer indisponible (dépendance non installée).');
      }
      smtpTransport = nodemailer.createTransport({
        host: config.mail.smtp.host,
        port: config.mail.smtp.port,
        secure: config.mail.smtp.secure,
        auth: { user: config.mail.smtp.user, pass: config.mail.smtp.pass },
        connectionTimeout: config.mail.timeoutMs,
        greetingTimeout: config.mail.timeoutMs,
        socketTimeout: config.mail.timeoutMs,
      }) as typeof smtpTransport;
    }
    const info = await smtpTransport!.sendMail({
      from: `${from.name} <${from.address}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(config.mail.replyTo ? { replyTo: config.mail.replyTo } : {}),
    });
    return { ok: true, provider: 'smtp', messageId: info?.messageId };
  } catch (error) {
    // Le transport est réinitialisé : une connexion cassée ne doit pas rester
    // en cache et faire échouer tous les envois suivants.
    smtpTransport = null;
    return failure('smtp', error instanceof Error ? error.message : String(error));
  }
}

/* ------------------------------------------------------------------ */
/*  Point d'entrée                                                     */
/* ------------------------------------------------------------------ */

/**
 * Envoie un e-mail. **Ne lève jamais d'exception** : un échec de prestataire
 * renvoie `{ ok: false }` et l'appelant décide quoi afficher à l'élève.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const current = provider();
  let result: MailResult;
  try {
    switch (current) {
      case 'none':
        result = { ok: false, provider: 'none', error: "L'envoi d'e-mails est désactivé (MAIL_PROVIDER=none)." };
        break;
      case 'log':
        console.log(
          `[EduMate] 📧 E-mail simulé (MAIL_PROVIDER=log) → ${message.to}\n` +
            `           Objet : ${message.subject}\n${message.text.replace(/^/gm, '           ')}`,
        );
        result = { ok: true, provider: 'log', messageId: 'log' };
        break;
      case 'resend':
        result = await sendResend(message);
        break;
      case 'brevo':
        result = await sendBrevo(message);
        break;
      case 'sendgrid':
        result = await sendSendGrid(message);
        break;
      case 'mailgun':
        result = await sendMailgun(message);
        break;
      case 'postmark':
        result = await sendPostmark(message);
        break;
      case 'smtp':
        result = await sendSmtp(message);
        break;
      default:
        result = { ok: false, provider: 'none', error: 'Fournisseur d’e-mail inconnu.' };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const timeout = /abort|timeout/i.test(detail);
    result = failure(current, timeout ? 'délai dépassé' : detail);
  }
  recordOutcome(result);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Statistiques (diagnostic exposé par /api/health)                   */
/* ------------------------------------------------------------------ */

export interface MailerStats {
  sent: number;
  failed: number;
  lastSentAt: string | null;
  lastError: string | null;
  lastProvider: MailProviderId | null;
}

const stats: MailerStats = { sent: 0, failed: 0, lastSentAt: null, lastError: null, lastProvider: null };

function recordOutcome(result: MailResult): void {
  stats.lastProvider = result.provider;
  if (result.ok) {
    stats.sent += 1;
    stats.lastSentAt = new Date().toISOString();
  } else {
    stats.failed += 1;
    stats.lastError = result.error ?? 'échec inconnu';
  }
}

/**
 * Compteurs d'envoi, pour `/api/health`.
 *
 * Indispensable en production : la réponse de `/api/auth/forgot` est
 * volontairement la même que le compte existe ou non (anti-énumération), donc
 * un échec d'envoi est invisible pour l'élève. Ces compteurs permettent à
 * l'administrateur de voir immédiatement si le prestataire refuse les messages.
 */
export function mailerStats(): MailerStats {
  return { ...stats };
}

/* ------------------------------------------------------------------ */
/*  Gabarit HTML des e-mails EduMate                                   */
/* ------------------------------------------------------------------ */

interface MailTemplateOptions {
  /** Prénom affiché dans l'en-tête. */
  firstName: string;
  title: string;
  /** Paragraphes d'introduction (texte simple, échappé automatiquement). */
  intro: string[];
  /** Bouton principal (libellé + URL). Omis si `action` est absent. */
  action?: { label: string; url: string };
  /** Durée de validité affichée sous le bouton. */
  expiresIn?: string;
  /** Encart d'avertissement (fond jaune pâle). */
  warning?: string;
  footer?: string;
}

/**
 * Gabarit d'e-mail « Liquid Glass » adapté aux clients de messagerie.
 *
 * Contraintes respectées (sinon le rendu casse dans Gmail / Outlook) :
 *   - styles 100 % en ligne, aucune feuille externe ni police web,
 *   - tableaux pour la mise en page, largeur fixe 600 px,
 *   - repli texte visible si les images/CSS sont bloqués.
 */
export function buildMailTemplate(options: MailTemplateOptions): { html: string; text: string } {
  const name = escapeHtml(options.firstName || '');
  const title = escapeHtml(options.title);
  const intro = options.intro.map((line) => escapeHtml(line));
  const warning = options.warning ? escapeHtml(options.warning) : '';
  const footer = escapeHtml(options.footer ?? "Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.");
  const button = options.action
    ? `<tr>
          <td align="center" style="padding:28px 24px 8px;">
            <a href="${escapeHtml(options.action.url)}"
               style="display:inline-block;background:#6c5ce7;color:#ffffff;text-decoration:none;
                      font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;
                      padding:15px 34px;border-radius:999px;letter-spacing:.2px;">
              ${escapeHtml(options.action.label)}
            </a>
          </td>
        </tr>`
    : '';
  const expires = options.expiresIn
    ? `<tr><td align="center" style="padding:0 24px 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;">
         Ce lien expire dans ${escapeHtml(options.expiresIn)} et ne fonctionne qu'une seule fois.
       </td></tr>`
    : '';
  const linkFallback = options.action
    ? `<tr><td align="center" style="padding:6px 24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9ca3af;word-break:break-all;">
         Si le bouton ne fonctionne pas, copie cette adresse dans ton navigateur&nbsp;:<br/>
         <a href="${escapeHtml(options.action.url)}" style="color:#6c5ce7;">${escapeHtml(options.action.url)}</a>
       </td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
  <body style="margin:0;padding:0;background:#0f1120;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1120;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="width:600px;max-width:100%;background:#171a2e;border:1px solid #2b3050;border-radius:22px;overflow:hidden;">
          <tr><td style="background:linear-gradient(140deg,#6c5ce7 0%,#7c5cd6 50%,#22d3ee 140%);padding:26px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#ffffff;">🦉 EduMate</td>
              <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(255,255,255,.85);">Sécurité du compte</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px 8px;">
            <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#f5f6ff;">${title}</h1>
            ${name ? `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#c7cbe4;">Bonjour ${name},</p>` : ''}
            ${intro.map((line) => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#c7cbe4;">${line}</p>`).join('\n            ')}
          </td></tr>
          ${button}
          ${expires}
          ${linkFallback}
          ${warning ? `<tr><td style="padding:0 28px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="background:#2a2413;border:1px solid #5a4a1c;border-radius:14px;">
              <tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#f4d78a;">
                ⚠️ ${warning}
              </td></tr>
            </table>
          </td></tr>` : ''}
          <tr><td style="padding:18px 28px 26px;border-top:1px solid #2b3050;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8b90ad;">${footer}</p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5b6080;">
          EduMate — l'espace scolaire tout-en-un des collégiens et lycéens.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `🦉 EduMate — ${options.title}`,
    '',
    name ? `Bonjour ${name},` : '',
    ...intro,
    '',
    options.action ? `${options.action.label} : ${options.action.url}` : '',
    options.expiresIn ? `(lien valable ${options.expiresIn}, utilisable une seule fois)` : '',
    warning ? `\nAttention : ${warning}` : '',
    '',
    footer,
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { html, text };
}

/** Construit l'e-mail de réinitialisation de mot de passe. */
export function passwordResetMail(options: { firstName: string; resetUrl: string; minutes: number }): MailMessage {
  const { html, text } = buildMailTemplate({
    firstName: options.firstName,
    title: 'Réinitialise ton mot de passe',
    intro: [
      'Une demande de réinitialisation a été faite pour ton compte EduMate.',
      'Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe.',
    ],
    action: { label: 'Choisir un nouveau mot de passe', url: options.resetUrl },
    expiresIn: `${options.minutes} minutes`,
    warning:
      "Si tu n'es pas à l'origine de cette demande, ignore cet e-mail : ton mot de passe reste inchangé " +
      'et personne ne peut se connecter à ta place.',
  });
  return { to: '', subject: '🦉 EduMate — réinitialiser ton mot de passe', html, text, tag: 'password-reset' };
}

/** Construit l'e-mail de confirmation envoyé APRÈS un changement de mot de passe. */
export function passwordChangedMail(options: { firstName: string; appUrl: string }): MailMessage {
  const { html, text } = buildMailTemplate({
    firstName: options.firstName,
    title: 'Ton mot de passe a été modifié',
    intro: [
      'Le mot de passe de ton compte EduMate vient d’être changé avec succès.',
      'Toutes tes autres sessions ont été fermées par sécurité : reconnecte-toi sur chaque appareil.',
    ],
    action: { label: 'Ouvrir EduMate', url: options.appUrl || '/' },
    warning:
      "Si ce n'était pas toi, préviens immédiatement un administrateur : quelqu'un a peut-être eu accès à ta boîte mail.",
    footer: 'Tu reçois cet e-mail parce que le mot de passe de ton compte EduMate a été modifié.',
  });
  return { to: '', subject: '🦉 EduMate — mot de passe modifié', html, text, tag: 'password-changed' };
}
