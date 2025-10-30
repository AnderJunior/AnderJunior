import {
  ensureDefaults,
  getClients,
  getServices,
  createClient,
  createService,
  findServiceById,
  replaceClient,
  updateDocument,
  recordDocumentHistory
} from './storage.js';

import {
  createElement,
  statusClass,
  statusLabel,
  documentStatusLabel,
  formatDate,
  formatDateTime,
  copyToClipboard,
  inferClientStatus
} from './utils.js';

ensureDefaults();

const tabButtons = document.querySelectorAll('.tab-button');
const tabClients = document.getElementById('tab-clients');
const tabServices = document.getElementById('tab-services');
const clientsGrid = document.getElementById('clients-grid');
const servicesGrid = document.getElementById('services-grid');
const modalRoot = document.getElementById('modal-root');
const clientsEmpty = document.getElementById('clients-empty');
const servicesEmpty = document.getElementById('services-empty');

function switchTab(tab) {
  tabButtons.forEach(button => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle('active', isActive);
  });

  const showClients = tab === 'clients';
  tabClients.classList.toggle('hidden', !showClients);
  tabServices.classList.toggle('hidden', showClients);
  tabServices.setAttribute('aria-hidden', showClients ? 'true' : 'false');
}

tabButtons.forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

function closeModal() {
  modalRoot.innerHTML = '';
}

function showModal(content, options = {}) {
  const backdrop = createElement('div', { classes: 'modal-backdrop' });
  const modal = createElement('div', { classes: 'modal' });
  if (options.title) {
    modal.appendChild(createElement('h2', { text: options.title }));
  }
  modal.appendChild(content);
  const closeButton = createElement('button', {
    classes: 'secondary-button',
    text: 'Fechar',
    onClick: closeModal
  });
  const actions = createElement('div', { classes: 'modal-actions', children: [closeButton] });
  if (options.actions) {
    options.actions.forEach(action => actions.insertBefore(action, closeButton));
  }
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) {
      closeModal();
    }
  });
  modalRoot.innerHTML = '';
  modalRoot.appendChild(backdrop);
}

function renderServices() {
  const services = getServices();
  servicesGrid.innerHTML = '';
  servicesEmpty.classList.toggle('hidden', services.length > 0);
  services.forEach(service => {
    const card = createElement('article', { classes: 'card' });
    const docList = createElement('div', {
      classes: 'tag-list',
      children: service.documents.map(doc => createElement('span', { classes: 'tag', text: doc }))
    });
    card.append(
      createElement('h3', { text: service.name }),
      createElement('p', { text: service.description }),
      createElement('p', { classes: 'upload-status', text: `${service.documents.length} documento(s) necessário(s)` }),
      docList
    );
    servicesGrid.appendChild(card);
  });
}

function createDocumentRow(client, document) {
  const fileInfo = document.fileName
    ? createElement('a', {
        text: document.fileName,
        attrs: { href: document.fileData, download: document.fileName }
      })
    : createElement('span', { text: 'Nenhum arquivo enviado ainda.' });

  const status = createElement('span', {
    classes: 'status',
    text: documentStatusLabel(document.status)
  });

  if (document.aiDecision) {
    status.appendChild(
      createElement('span', {
        classes: 'upload-status',
        text: ` · ${document.aiDecision}`
      })
    );
  }

  const historyList = createElement('ul', {
    classes: 'upload-status'
  });
  (document.history || []).forEach(entry => {
    historyList.appendChild(
      createElement('li', {
        text: `${formatDateTime(entry.date)} - ${entry.actor}: ${entry.description} (${documentStatusLabel(entry.result)})`
      })
    );
  });

  const approveButton = createElement('button', {
    classes: 'primary-button',
    text: 'Aceitar',
    onClick: () => handleDocumentDecision(client.id, document.id, 'approve')
  });

  const rejectButton = createElement('button', {
    classes: 'secondary-button',
    text: 'Recusar',
    onClick: () => handleDocumentDecision(client.id, document.id, 'reject')
  });

  const actions = createElement('div', {
    classes: 'document-actions',
    children: [approveButton, rejectButton]
  });

  if (!document.fileData) {
    approveButton.setAttribute('disabled', 'true');
    rejectButton.setAttribute('disabled', 'true');
  }

  const inFinalFolder = (client.finalDocuments || []).some(item => item.id === document.id);
  if (inFinalFolder) {
    approveButton.setAttribute('disabled', 'true');
  }

  if (document.status === 'needs_resubmission') {
    rejectButton.setAttribute('disabled', 'true');
  }

  return createElement('div', {
    classes: 'document-row',
    children: [
      createElement('div', {
        children: [
          createElement('strong', { text: document.name }),
          fileInfo,
          status
        ]
      }),
      actions,
      historyList
    ]
  });
}

function handleDocumentDecision(clientId, documentId, action) {
  const clients = getClients();
  const client = clients.find(item => item.id === clientId);
  if (!client) return;
  const doc = client.documents.find(item => item.id === documentId);
  if (!doc) return;

  const updated = updateDocument(clientId, documentId, document => {
    const resultStatus = action === 'approve' ? 'approved' : 'needs_resubmission';
    document.status = resultStatus;
    document.aiDecision = action === 'approve' ? 'Aprovado manualmente pela administração.' : 'Recusado pela administração.';
    document.history = recordDocumentHistory(document, {
      actor: 'Administração',
      description: action === 'approve' ? 'Documento aceito.' : 'Documento recusado, solicitar reenvio ao cliente.',
      result: resultStatus
    });
    return document;
  });

  if (!updated) return;

  if (action === 'approve') {
    const existing = (updated.finalDocuments || []).filter(item => item.id !== documentId);
    updated.finalDocuments = [
      ...existing,
      {
        id: documentId,
        name: doc.name,
        fileName: doc.fileName,
        fileData: doc.fileData,
        acceptedAt: new Date().toISOString()
      }
    ];
  } else {
    updated.finalDocuments = (updated.finalDocuments || []).filter(item => item.id !== documentId);
  }

  updated.status = inferClientStatus(updated);
  replaceClient(updated);
  renderClients();
  openClientDetailsModal(updated.id);
}

function openClientDetailsModal(clientId) {
  let client = getClients().find(item => item.id === clientId);
  if (!client) return;
  if (client.status === 'submitted') {
    client = { ...client, status: 'review' };
    replaceClient(client);
    renderClients();
  }
  const service = findServiceById(client.serviceId);

  const container = createElement('div', { classes: 'client-doc-card' });
  container.append(
    createElement('h3', { text: client.name }),
    createElement('p', { text: `Serviço: ${service?.name || '—'}` }),
    createElement('p', { text: `Status atual: ${statusLabel(client.status)}` }),
    createElement('p', { text: `Código de validação: ${client.accessCode}` }),
    createElement('p', { html: `Link do cliente: <a href="${client.link}" target="_blank">${client.link}</a>` })
  );

  const documentsSection = createElement('div', { classes: 'service-docs' });
  if (!client.documents.length) {
    documentsSection.appendChild(createElement('p', { text: 'Nenhum documento configurado para este serviço.' }));
  } else {
    client.documents.forEach(doc => {
      documentsSection.appendChild(createDocumentRow(client, doc));
    });
  }

  if (client.finalDocuments?.length) {
    const finalized = createElement('div', { classes: 'notice' });
    finalized.appendChild(createElement('strong', { text: 'Documentos encaminhados para pasta final:' }));
    client.finalDocuments.forEach(item => {
      finalized.appendChild(
        createElement('p', {
          html: `${item.name} - <a href="${item.fileData}" download="${item.fileName}">${item.fileName}</a> (${formatDate(item.acceptedAt)})`
        })
      );
    });
    container.appendChild(finalized);
  }

  container.appendChild(createElement('div', {
    classes: 'divider'
  }));
  container.appendChild(createElement('div', {
    classes: 'service-docs',
    children: [createElement('h4', { text: 'Documentos solicitados' }), documentsSection]
  }));

  const copyLinkButton = createElement('button', {
    classes: 'primary-button',
    text: 'Copiar link do cliente',
    onClick: () => copyToClipboard(client.link, () => alert('Link copiado!'))
  });

  const copyCodeButton = createElement('button', {
    classes: 'secondary-button',
    text: 'Copiar código',
    onClick: () => copyToClipboard(client.accessCode, () => alert('Código copiado!'))
  });

  showModal(container, { title: 'Detalhes do Cliente', actions: [copyLinkButton, copyCodeButton] });
}

function renderClients() {
  const clients = getClients();
  clientsGrid.innerHTML = '';
  clientsEmpty.classList.toggle('hidden', clients.length > 0);
  clients.forEach(client => {
    const service = findServiceById(client.serviceId);
    const card = createElement('article', { classes: 'card' });
    const badge = createElement('span', { classes: statusClass(client.status), text: statusLabel(client.status) });
    card.append(
      createElement('h3', { text: client.name }),
      badge,
      createElement('p', { text: `Serviço solicitado: ${service?.name || '—'}` }),
      createElement('p', { text: `Telefone: ${client.phone}` }),
      createElement('p', { html: `Link único: <a href="${client.link}" target="_blank" rel="noopener">${client.link}</a>` })
    );

    const documentsInfo = createElement('p', {
      classes: 'upload-status',
      text: `${client.documents.filter(doc => doc.fileData).length}/${client.documents.length} documento(s) enviados`
    });

    const createdInfo = createElement('p', {
      classes: 'upload-status',
      text: `Criado em ${formatDate(client.createdAt)}`
    });

    const actions = createElement('div', {
      classes: 'document-actions',
      children: [
        createElement('button', {
          classes: 'secondary-button',
          text: 'Copiar link',
          onClick: () => copyToClipboard(client.link, () => alert('Link copiado!'))
        }),
        createElement('button', {
          classes: 'primary-button',
          text: 'Ver detalhes',
          onClick: () => openClientDetailsModal(client.id)
        })
      ]
    });

    card.append(documentsInfo, createdInfo, actions);
    clientsGrid.appendChild(card);
  });
}

function openNewClientModal() {
  const services = getServices();
  if (!services.length) {
    alert('Cadastre ao menos um serviço antes de adicionar clientes.');
    return;
  }

  const form = createElement('form');
  form.append(
    createElement('div', {
      classes: 'field-group',
      children: [
        createElement('label', { text: 'Nome do Cliente', attrs: { for: 'client-name' } }),
        createElement('input', {
          attrs: { id: 'client-name', name: 'name', required: 'true', placeholder: 'Nome completo' }
        })
      ]
    }),
    createElement('div', {
      classes: 'field-group',
      children: [
        createElement('label', { text: 'Telefone', attrs: { for: 'client-phone' } }),
        createElement('input', {
          attrs: { id: 'client-phone', name: 'phone', required: 'true', placeholder: '(00) 00000-0000' }
        })
      ]
    }),
    createElement('div', {
      classes: 'field-group',
      children: [
        createElement('label', { text: 'E-mail', attrs: { for: 'client-email' } }),
        createElement('input', {
          attrs: { id: 'client-email', name: 'email', type: 'email', required: 'true', placeholder: 'email@dominio.com' }
        })
      ]
    }),
    createElement('div', {
      classes: 'field-group',
      children: [
        createElement('label', { text: 'Serviço Solicitado', attrs: { for: 'client-service' } }),
        (() => {
          const select = createElement('select', {
            attrs: { id: 'client-service', name: 'serviceId', required: 'true' }
          });
          services.forEach(service => {
            select.appendChild(
              createElement('option', {
                text: service.name,
                attrs: { value: service.id }
              })
            );
          });
          return select;
        })()
      ]
    })
  );

  const submitButton = createElement('button', {
    classes: 'primary-button',
    text: 'Criar Cliente',
    attrs: { type: 'submit' }
  });

  form.appendChild(createElement('div', { classes: 'modal-actions', children: [submitButton] }));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const values = Object.fromEntries(data.entries());
    try {
      const client = createClient({
        name: values.name,
        phone: values.phone,
        email: values.email,
        serviceId: values.serviceId
      });
      closeModal();
      alert(`Cliente criado! Código de acesso: ${client.accessCode}`);
      renderClients();
    } catch (error) {
      alert(error.message || 'Não foi possível criar o cliente.');
    }
  });

  showModal(form, { title: 'Novo Cliente' });
}

function buildDocumentInputs(wrapper) {
  const row = createElement('div', { classes: 'doc-item' });
  const input = createElement('input', {
    attrs: { type: 'text', name: 'documents[]', placeholder: 'Nome do Documento', required: 'true' }
  });
  const remove = createElement('button', {
    classes: 'secondary-button',
    text: 'Remover',
    onClick: event => {
      event.preventDefault();
      wrapper.removeChild(row);
    }
  });
  row.append(input, remove);
  return row;
}

function openNewServiceModal() {
  const form = createElement('form');
  const docsWrapper = createElement('div', { classes: 'service-docs' });

  form.append(
    createElement('div', {
      classes: 'field-group',
      children: [
        createElement('label', { text: 'Nome do Serviço', attrs: { for: 'service-name' } }),
        createElement('input', {
          attrs: { id: 'service-name', name: 'name', required: 'true', placeholder: 'Nome do serviço' }
        })
      ]
    }),
    createElement('div', {
      classes: 'field-group',
      children: [
        createElement('label', { text: 'Descrição', attrs: { for: 'service-description' } }),
        createElement('textarea', {
          attrs: { id: 'service-description', name: 'description', required: 'true', placeholder: 'Detalhes sobre o serviço' }
        })
      ]
    }),
    createElement('div', {
      classes: 'field-group',
      children: [
        createElement('label', { text: 'Documentos Necessários' }),
        docsWrapper,
        createElement('button', {
          classes: 'secondary-button',
          text: 'Adicionar documento',
          onClick: event => {
            event.preventDefault();
            docsWrapper.appendChild(buildDocumentInputs(docsWrapper));
          }
        })
      ]
    })
  );

  docsWrapper.appendChild(buildDocumentInputs(docsWrapper));

  const submitButton = createElement('button', {
    classes: 'primary-button',
    text: 'Salvar Serviço',
    attrs: { type: 'submit' }
  });

  form.appendChild(createElement('div', { classes: 'modal-actions', children: [submitButton] }));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const documents = data.getAll('documents[]').filter(Boolean);
    if (!documents.length) {
      alert('Informe pelo menos um documento obrigatório.');
      return;
    }
    try {
      createService({
        name: data.get('name'),
        description: data.get('description'),
        documents
      });
      closeModal();
      renderServices();
    } catch (error) {
      alert(error.message || 'Não foi possível salvar o serviço.');
    }
  });

  showModal(form, { title: 'Novo Serviço' });
}

renderClients();
renderServices();

document.getElementById('new-client').addEventListener('click', openNewClientModal);
document.getElementById('new-service').addEventListener('click', openNewServiceModal);
