/*
 * Netlify event function: runs automatically after every verified
 * (non-spam) Netlify Forms submission and emails it through Gmail SMTP.
 *
 * Environment variables (Netlify > Site configuration > Environment variables):
 *   GMAIL_USER          Gmail address used to sign in and send the email
 *   GMAIL_APP_PASSWORD  16-character Google app password (spaces are ignored)
 *   CONTACT_TO          Optional. Recipient address; defaults to GMAIL_USER
 *
 * No npm dependencies: a small SMTP client built on node:tls keeps the
 * site free of a build step and a node_modules folder.
 */
'use strict';

const tls = require('node:tls');
const net = require('node:net');
const crypto = require('node:crypto');

const FORM_NAME = 'contact';
const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/* ---------- Message building ---------- */

// Single-line, length-limited header value (prevents header injection).
function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

// RFC 2047 encoding for any header text that is not plain ASCII.
function encodeHeader(text) {
  return /^[\x20-\x7e]*$/.test(text) ? text : '=?UTF-8?B?' + Buffer.from(text, 'utf8').toString('base64') + '?=';
}

function wrap76(base64) {
  return base64.replace(/.{1,76}/g, '$&\r\n');
}

function buildMessage({ from, to, replyTo, subject, text }) {
  const domain = from.split('@')[1] || 'localhost';
  const headers = [
    'From: ' + encodeHeader('Portfolio contact form') + ' <' + from + '>',
    'To: <' + to + '>',
    replyTo ? 'Reply-To: ' + replyTo : null,
    'Subject: ' + encodeHeader(subject),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@' + domain + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ].filter(Boolean);

  // Base64 body: no line can start with ".", so SMTP dot-stuffing is never needed.
  return headers.join('\r\n') + '\r\n\r\n' + wrap76(Buffer.from(text, 'utf8').toString('base64'));
}

/* ---------- Minimal SMTP client ---------- */

function sendMail({ host, port, secure = true, user, pass, from, to, message, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });

    const replies = [];
    const waiters = [];
    let buffer = '';
    let failure = null;

    socket.setEncoding('utf8');
    socket.setTimeout(timeout, () => socket.destroy(new Error('SMTP connection timed out')));

    socket.on('data', (chunk) => {
      buffer += chunk;
      // A complete reply is any number of "250-..." lines ending in a "250 ..." line.
      let match;
      while ((match = buffer.match(/^(?:\d{3}-[^\r\n]*\r\n)*\d{3}(?: [^\r\n]*)?\r\n/))) {
        buffer = buffer.slice(match[0].length);
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(match[0]);
        else replies.push(match[0]);
      }
    });

    socket.on('error', (error) => {
      failure = error;
      waiters.splice(0).forEach((waiter) => waiter.reject(error));
    });

    function nextReply() {
      if (replies.length) return Promise.resolve(replies.shift());
      if (failure) return Promise.reject(failure);
      return new Promise((res, rej) => waiters.push({ resolve: res, reject: rej }));
    }

    async function expect(code, label) {
      const reply = await nextReply();
      if (!reply.startsWith(code)) {
        throw new Error('SMTP ' + label + ' failed: ' + reply.trim().split('\r\n').pop());
      }
      return reply;
    }

    async function command(line, code, label) {
      socket.write(line + '\r\n');
      return expect(code, label || line.split(' ')[0]);
    }

    const run = async () => {
      await expect('220', 'greeting');
      await command('EHLO portfolio.netlify.app', '250', 'EHLO');
      await command('AUTH LOGIN', '334', 'AUTH');
      await command(Buffer.from(user).toString('base64'), '334', 'AUTH user');
      await command(Buffer.from(pass).toString('base64'), '235', 'AUTH password');
      await command('MAIL FROM:<' + from + '>', '250', 'MAIL FROM');
      await command('RCPT TO:<' + to + '>', '250', 'RCPT TO');
      await command('DATA', '354', 'DATA');
      // End of DATA is a line containing a single "."
      await command(message.replace(/\r\n$/, '') + '\r\n.', '250', 'message');
      socket.write('QUIT\r\n');
      socket.end();
    };

    run().then(resolve, (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

/* ---------- Netlify handler ---------- */

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}').payload;
  } catch (error) {
    return { statusCode: 400, body: 'Invalid payload' };
  }

  // Only handle the portfolio contact form.
  if (!payload || payload.form_name !== FORM_NAME) {
    return { statusCode: 200, body: 'Ignored' };
  }

  const user = clean(process.env.GMAIL_USER, 254);
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const to = clean(process.env.CONTACT_TO, 254) || user;

  if (!user || !pass) {
    console.error('Contact email not sent: GMAIL_USER or GMAIL_APP_PASSWORD is not set.');
    return { statusCode: 500, body: 'Email is not configured' };
  }

  const data = payload.data || {};
  const name = clean(data.name, 100) || 'Someone';
  const email = clean(data.email, 254);
  const validEmail = EMAIL_PATTERN.test(email);
  const messageText = String(data.message || '').trim().slice(0, 5000);
  const submittedAt = payload.created_at ? new Date(payload.created_at) : new Date();

  const text = [
    'New message from the portfolio contact form.',
    '',
    'Name:    ' + name,
    'Email:   ' + (email || '(not provided)'),
    'Sent:    ' + submittedAt.toUTCString(),
    '',
    'Message:',
    messageText || '(empty)',
    '',
    '--',
    validEmail ? 'Reply to this email to answer ' + name + ' directly.' : 'No valid reply address was provided.'
  ].join('\n').replace(/\r?\n/g, '\r\n');

  const message = buildMessage({
    from: user,
    to,
    replyTo: validEmail ? encodeHeader(name) + ' <' + email + '>' : null,
    subject: 'Portfolio message from ' + name,
    text
  });

  try {
    await sendMail({ host: 'smtp.gmail.com', port: 465, user, pass, from: user, to, message });
    return { statusCode: 200, body: 'Email sent' };
  } catch (error) {
    console.error('Contact email failed:', error.message);
    return { statusCode: 500, body: 'Email failed' };
  }
};

// Exposed for local testing only.
exports._internals = { buildMessage, sendMail, encodeHeader, clean };
