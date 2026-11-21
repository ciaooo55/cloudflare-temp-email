import DOMPurify from 'dompurify';

function quoteContent(mail) {
  if (mail.message) {
    const html = DOMPurify.sanitize(mail.message);
    return {
      contentType: 'html',
      content: html ? `<p><br></p><blockquote>${html}</blockquote><p><br></p>` : '',
    };
  }
  return {
    contentType: 'text',
    content: mail.text ? `\n\n${mail.text.split('\n').map(line => `> ${line}`).join('\n')}` : '',
  };
}

export function buildReplyModel(mail, replyLabel) {
  const source = mail.source || mail.originalSource || '';
  const match = /(.+?) <(.+?)>/.exec(source);
  return {
    fromMail: mail.address || '',
    toName: match ? match[1] : '',
    toMail: match ? match[2] : source,
    subject: `${replyLabel}: ${mail.subject}`,
    ...quoteContent(mail),
  };
}

export function buildForwardModel(mail, forwardLabel) {
  return {
    fromMail: mail.address || '',
    toName: '',
    toMail: '',
    subject: `${forwardLabel}: ${mail.subject}`,
    ...quoteContent(mail),
  };
}
