import {
  ensureDefaults,
  findClientByToken,
  findServiceById,
  replaceClient,
  recordDocumentHistory
} from './storage.js';

import {
  createElement,
  documentStatusLabel,
  documentRowClass,
  statusLabel,
  applyAiReview,
  inferClientStatus
} from './utils.js';

ensureDefaults();

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const accessContainer = document.getElementById('client-access');
const dashboard = document.getElementById('client-dashboard');

let currentClient = token ? findClientByToken(token) : null;
let service = currentClient ? findServiceById(currentClient.serviceId) : null;
let validationStep = 'email';

function updateClient(nextClient) {
  currentClient = nextClient;
  service = currentClient ? findServiceById(currentClient.serviceId) : null;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function showError(message) {
  accessContainer.innerHTML = '';
  accessContainer.classList.remove('hidden');
  accessContainer.appendChild(
    createElement('div', {
      classes: 'alert',
      children: [
        createElement('h3', { text: 'Ops, algo deu errado!' }),
        createElement('p', { text: message })
      ]
    })
  );
  dashboard.classList.add('hidden');
}

if (!currentClient) {
  showError('Link inválido ou cliente não encontrado. Solicite um novo link à administração.');
}

function renderEmailStep() {
  accessContainer.innerHTML = '';
  const title = createElement('h2', { text: 'Confirme seu e-mail' });
  const form = createElement('form');

  const field = createElement('div', {
    classes: 'field-group',
    children: [
      createElement('label', { text: 'E-mail' }),
      createElement('input', {
        attrs: { type: 'email', name: 'email', required: 'true', placeholder: 'seuemail@dominio.com' }
      })
    ]
  });

  const submit = createElement('button', {
    classes: 'primary-button',
    text: 'Enviar código',
    attrs: { type: 'submit' }
  });

  form.append(field, submit);

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = (formData.get('email') || '').toString().trim().toLowerCase();
    if (email !== currentClient.email.toLowerCase()) {
      alert('O e-mail informado não confere com o cadastrado.');
      return;
    }
    validationStep = 'code';
    renderCodeStep();
  });

  accessContainer.append(title, createElement('p', { text: 'Informe o e-mail cadastrado para receber o código de acesso.' }), form, createElement('p', { classes: 'upload-status', text: 'Para testes utilize cliente@teste.com.' }));
}

function renderCodeStep() {
  accessContainer.innerHTML = '';
  const title = createElement('h2', { text: 'Digite o código recebido' });
  const info = createElement('p', { text: 'Enviamos um código para o e-mail informado. Informe abaixo para continuar.' });
  const form = createElement('form');

  const field = createElement('div', {
    classes: 'field-group',
    children: [
      createElement('label', { text: 'Código de validação' }),
      createElement('input', {
        attrs: { type: 'text', name: 'code', required: 'true', placeholder: '000000', maxlength: '6', pattern: '\\d{6}' }
      })
    ]
  });

  const submit = createElement('button', {
    classes: 'primary-button',
    text: 'Acessar área do cliente',
    attrs: { type: 'submit' }
  });

  form.append(field, submit);

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const code = (formData.get('code') || '').toString().trim();
    const expected = currentClient.accessCode;
    const allowTest = currentClient.email.toLowerCase() === 'cliente@teste.com' && code === '123456';
    if (code !== expected && !allowTest) {
      alert('Código inválido. Verifique o e-mail e tente novamente.');
      return;
    }
    validationStep = 'dashboard';
    accessContainer.classList.add('hidden');
    dashboard.classList.remove('hidden');
    renderDashboard();
  });

  accessContainer.append(title, info, form, createElement('p', { classes: 'upload-status', text: 'Código padrão de testes: 123456.' }));
}

function handleFileChange(documentId, file) {
  if (!file) return;
  readFile(file)
    .then(result => {
      const updated = { ...currentClient };
      updated.documents = updated.documents.map(doc => {
        if (doc.id !== documentId) return doc;
        const next = { ...doc };
        next.fileName = file.name;
        next.fileData = result;
        next.status = 'uploaded';
        next.uploadedAt = new Date().toISOString();
        next.aiDecision = null;
        next.history = recordDocumentHistory(next, {
          actor: 'Cliente',
          description: 'Documento enviado novamente pelo cliente.',
          result: 'uploaded'
        });
        return next;
      });
      updated.finalDocuments = (updated.finalDocuments || []).filter(item => item.id !== documentId);
      updated.status = inferClientStatus(updated);
      replaceClient(updated);
      updateClient(updated);
      renderDashboard();
    })
    .catch(() => alert('Não foi possível carregar o arquivo selecionado.'));
}

function renderDocumentRow(document) {
  const row = createElement('div', { classes: documentRowClass(document.status) });
  row.appendChild(createElement('strong', { text: document.name }));
  row.appendChild(createElement('span', { classes: 'status', text: documentStatusLabel(document.status) }));

  if (document.aiDecision) {
    row.appendChild(createElement('span', { classes: 'upload-status', text: document.aiDecision }));
  }

  if (document.history?.length) {
    const last = document.history[document.history.length - 1];
    row.appendChild(createElement('span', { classes: 'upload-status', text: `${new Date(last.date).toLocaleString('pt-BR')}: ${last.description}` }));
  }

  if (document.fileName) {
    row.appendChild(
      createElement('a', {
        text: `Ver arquivo (${document.fileName})`,
        attrs: { href: document.fileData, download: document.fileName, target: '_blank' }
      })
    );
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.addEventListener('change', event => handleFileChange(document.id, event.target.files[0]));
  if (document.status === 'approved') {
    input.disabled = true;
  }
  row.appendChild(input);

  if (document.status === 'needs_resubmission') {
    row.appendChild(createElement('span', { classes: 'upload-status', text: 'Envie um novo arquivo para análise.' }));
  }

  return row;
}

function renderDashboard() {
  if (!currentClient) return;
  dashboard.innerHTML = '';

  const header = createElement('div', { classes: 'client-doc-card' });
  header.append(
    createElement('h2', { text: `Olá, ${currentClient.name}` }),
    createElement('p', { text: `Serviço: ${service?.name || '—'}` }),
    createElement('p', { text: `Status do envio: ${statusLabel(currentClient.status)}` })
  );

  if (currentClient.status === 'approved') {
    header.appendChild(createElement('p', { classes: 'success', text: 'Todos os documentos foram aprovados! Obrigado por enviar suas informações.' }));
  }

  const documentsCard = createElement('div', { classes: 'client-doc-card' });
  documentsCard.appendChild(createElement('h3', { text: 'Documentos Necessários' }));

  currentClient.documents.forEach(doc => {
    documentsCard.appendChild(renderDocumentRow(doc));
  });

  const pendingDocs = currentClient.documents.filter(doc => !doc.fileData);
  const needsReview = currentClient.documents.some(doc => doc.status === 'needs_resubmission');

  const submitButton = createElement('button', {
    classes: 'primary-button',
    text: 'Enviar para análise',
    onClick: handleSubmitForReview
  });

  if (pendingDocs.length) {
    submitButton.setAttribute('disabled', 'true');
    documentsCard.appendChild(createElement('p', { classes: 'alert', text: 'Envie todos os documentos antes de solicitar análise.' }));
  }

  if (needsReview) {
    documentsCard.appendChild(createElement('p', { classes: 'alert', text: 'Alguns documentos precisam ser reenviados antes de prosseguir.' }));
  }

  documentsCard.appendChild(createElement('div', { classes: 'client-actions', children: [submitButton] }));

  if (currentClient.finalDocuments?.length) {
    const finalCard = createElement('div', { classes: 'client-doc-card' });
    finalCard.appendChild(createElement('h3', { text: 'Documentos aprovados' }));
    currentClient.finalDocuments.forEach(doc => {
      finalCard.appendChild(
        createElement('p', {
          html: `${doc.name}: <a href="${doc.fileData}" download="${doc.fileName}">${doc.fileName}</a>`
        })
      );
    });
    dashboard.append(header, documentsCard, finalCard);
  } else {
    dashboard.append(header, documentsCard);
  }
}

function handleSubmitForReview() {
  if (!currentClient) return;
  if (currentClient.documents.some(doc => !doc.fileData)) {
    alert('Envie todos os documentos antes de solicitar análise.');
    return;
  }

  const updated = { ...currentClient };
  updated.documents = updated.documents.map(doc => {
    const next = { ...doc };
    next.status = 'submitted';
    next.history = recordDocumentHistory(next, {
      actor: 'Cliente',
      description: 'Documento enviado para análise.',
      result: 'submitted'
    });
    return next;
  });
  updated.status = 'submitted';
  replaceClient(updated);

  const reviewed = applyAiReview(updated);
  replaceClient(reviewed);
  updateClient(reviewed);
  alert('Documentos enviados! Acompanhe abaixo a validação automática e aguarde a análise da equipe.');
  renderDashboard();
}

if (currentClient) {
  if (validationStep === 'email') {
    renderEmailStep();
  }
}
