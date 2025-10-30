import { CLIENT_STATUSES, DOCUMENT_STATUSES, recordDocumentHistory } from './storage.js';

export function statusLabel(status) {
  return CLIENT_STATUSES[status] || status;
}

export function statusClass(status) {
  return `badge ${status}`;
}

export function documentStatusLabel(status) {
  return DOCUMENT_STATUSES[status] || status;
}

export function documentRowClass(status) {
  return ['client-doc-row', status].filter(Boolean).join(' ');
}

export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.classes) {
    el.className = Array.isArray(options.classes) ? options.classes.join(' ') : options.classes;
  }
  if (options.text) {
    el.textContent = options.text;
  }
  if (options.html) {
    el.innerHTML = options.html;
  }
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        el.setAttribute(key, value);
      }
    });
  }
  if (options.children) {
    options.children.forEach(child => {
      if (!child) return;
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    });
  }
  if (options.onClick) {
    el.addEventListener('click', options.onClick);
  }
  return el;
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('pt-BR');
}

export function copyToClipboard(text, callback) {
  if (!navigator.clipboard) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    callback?.();
    return;
  }
  navigator.clipboard.writeText(text).then(() => callback?.());
}

export function inferClientStatus(client) {
  const docs = client.documents || [];
  if (!docs.length) return client.status;
  const statuses = docs.map(doc => doc.status);
  if (statuses.every(status => status === 'approved')) {
    return 'approved';
  }
  if (statuses.some(status => status === 'needs_resubmission')) {
    return 'resubmit';
  }
  if (statuses.every(status => status === 'uploaded' || status === 'pending')) {
    return 'awaiting';
  }
  if (statuses.some(status => status === 'submitted' || status === 'review')) {
    return client.status === 'awaiting' ? 'review' : 'submitted';
  }
  if (statuses.every(status => status === 'pending')) {
    return 'awaiting';
  }
  return client.status;
}

export function applyAiReview(client) {
  const updatedDocuments = client.documents.map(doc => {
    if (!doc.fileData) return doc;
    const fileName = doc.fileName || '';
    const lower = fileName.toLowerCase();
    const approved = lower.includes('ok') || lower.includes('aprov') || lower.includes('valid');
    const status = approved ? 'approved' : 'needs_resubmission';
    const aiDecision = approved ? 'Documento aprovado automaticamente pela IA.' : 'IA identificou necessidade de reenvio.';
    const history = recordDocumentHistory(doc, {
      actor: 'IA',
      description: aiDecision,
      result: status
    });
    return {
      ...doc,
      status,
      aiDecision,
      history
    };
  });
  const status = updatedDocuments.some(doc => doc.status === 'needs_resubmission') ? 'resubmit' : 'submitted';
  return { ...client, documents: updatedDocuments, status };
}

export function humanizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d)(\d{4})(\d{4})/, '($1) $2 $3-$4');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}

export function resetForm(form) {
  if (!form) return;
  form.reset();
  const event = new Event('reset', { bubbles: true });
  form.dispatchEvent(event);
}

export function buildLink(token) {
  const base = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}`;
  return `${base}client.html?token=${token}`;
}
