import { getServices, createClient, ensureDefaults } from './storage.js';
import { createElement, resetForm } from './utils.js';

ensureDefaults();

const servicesList = document.getElementById('services-list');
const modalRoot = document.getElementById('modal-root');
const feedback = document.getElementById('landing-feedback');

function closeModal() {
  modalRoot.innerHTML = '';
}

function showModal(content) {
  const backdrop = createElement('div', { classes: 'modal-backdrop' });
  const modal = createElement('div', { classes: 'modal' });
  const closeButton = createElement('button', {
    classes: 'secondary-button',
    text: 'Fechar',
    onClick: closeModal
  });
  const actions = createElement('div', { classes: 'modal-actions', children: [closeButton] });
  modal.appendChild(content);
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

function renderFeedback(client) {
  feedback.innerHTML = '';
  const notice = createElement('div', {
    classes: ['notice', 'success'],
    children: [
      createElement('p', {
        text: 'Enviamos um link para seu e-mail para continuar o processo.'
      }),
      createElement('p', {
        text: 'Por segurança, valide o código enviado ao abrir o link para enviar seus documentos.'
      }),
      createElement('p', {
        classes: 'upload-status',
        text: 'Para testes nesta demonstração utilize o e-mail cliente@teste.com e o código 123456.'
      }),
      createElement('p', {
        classes: 'upload-status',
        html: `Link gerado: <a href="${client.link}">${client.link}</a>`
      })
    ]
  });
  feedback.appendChild(notice);
}

function openRequestModal(prefilledService) {
  const services = getServices();
  const form = createElement('form');

  const title = createElement('h2', { text: 'Solicitar Serviço' });

  const nameField = createElement('div', {
    classes: 'field-group',
    children: [
      createElement('label', { text: 'Nome completo', attrs: { for: 'landing-name' } }),
      createElement('input', {
        attrs: {
          id: 'landing-name',
          name: 'name',
          placeholder: 'Nome do Cliente',
          required: 'true'
        }
      })
    ]
  });

  const phoneField = createElement('div', {
    classes: 'field-group',
    children: [
      createElement('label', { text: 'Telefone', attrs: { for: 'landing-phone' } }),
      createElement('input', {
        attrs: {
          id: 'landing-phone',
          name: 'phone',
          placeholder: '(00) 00000-0000',
          required: 'true'
        }
      })
    ]
  });

  const emailField = createElement('div', {
    classes: 'field-group',
    children: [
      createElement('label', { text: 'E-mail', attrs: { for: 'landing-email' } }),
      createElement('input', {
        attrs: {
          type: 'email',
          id: 'landing-email',
          name: 'email',
          placeholder: 'email@dominio.com',
          required: 'true'
        }
      })
    ]
  });

  const serviceSelect = createElement('div', {
    classes: 'field-group',
    children: [
      createElement('label', { text: 'Selecione o serviço', attrs: { for: 'landing-service' } }),
      (() => {
        const select = createElement('select', {
          attrs: {
            id: 'landing-service',
            name: 'serviceId',
            required: 'true'
          }
        });
        services.forEach(service => {
          const option = createElement('option', {
            text: service.name,
            attrs: { value: service.id }
          });
          if (prefilledService && prefilledService.id === service.id) {
            option.setAttribute('selected', 'selected');
          }
          select.appendChild(option);
        });
        return select;
      })()
    ]
  });

  const submitButton = createElement('button', {
    classes: 'primary-button',
    text: 'Gerar Link Seguro',
    attrs: { type: 'submit' }
  });

  form.append(title, nameField, phoneField, emailField, serviceSelect, createElement('div', { classes: 'modal-actions', children: [submitButton] }));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    try {
      const client = createClient({
        name: values.name,
        phone: values.phone,
        email: values.email,
        serviceId: values.serviceId
      });
      resetForm(form);
      closeModal();
      renderFeedback(client);
    } catch (error) {
      alert(error.message || 'Não foi possível criar o cliente.');
    }
  });

  const modalContent = createElement('div');
  modalContent.appendChild(form);
  showModal(modalContent);
}

function renderServiceCard(service) {
  const card = createElement('article', { classes: ['landing-card', 'card'] });
  const button = createElement('button', {
    classes: 'primary-button',
    text: 'Solicitar Serviço',
    onClick: () => openRequestModal(service)
  });
  const docs = createElement('div', {
    classes: 'tag-list',
    children: service.documents.map(doc => createElement('span', { classes: 'tag', text: doc }))
  });
  card.append(
    createElement('h3', { text: service.name }),
    createElement('p', { text: service.description }),
    docs,
    button
  );
  return card;
}

function renderServices() {
  servicesList.innerHTML = '';
  const services = getServices();
  if (!services.length) {
    servicesList.appendChild(createElement('p', { text: 'Cadastre novos serviços na área administrativa.' }));
    return;
  }
  services.forEach(service => {
    servicesList.appendChild(renderServiceCard(service));
  });
}

renderServices();
