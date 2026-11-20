import DOMPurify from 'dompurify';

export const sanitizeHtml = (html) => {
    return DOMPurify.sanitize(typeof html === 'string' ? html : '');
};

export const htmlToPlainText = (html) => {
    const fragment = DOMPurify.sanitize(typeof html === 'string' ? html : '', {
        RETURN_DOM_FRAGMENT: true,
        FORBID_TAGS: ['style', 'script', 'title', 'img', 'video', 'audio', 'iframe'],
    });
    for (const node of fragment.querySelectorAll('br')) node.replaceWith('\n');
    for (const node of fragment.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, blockquote')) {
        node.append('\n');
    }
    return fragment.textContent.replace(/\n{3,}/g, '\n\n').trim();
};
