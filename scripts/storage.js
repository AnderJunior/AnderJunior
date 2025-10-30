const STORAGE_KEYS = {
  services: 'portal-services',
  clients: 'portal-clients'
};

export const CLIENT_STATUSES = {
  awaiting: 'Aguardando Envio',
  submitted: 'Enviado',
  review: 'Em Análise',
  approved: 'Aprovado',
  resubmit: 'Reenvio Necessário'
};

export const DOCUMENT_STATUSES = {
  pending: 'Pendente',
  uploaded: 'Carregado',
  submitted: 'Enviado',
  review: 'Em análise',
  approved: 'Aprovado',
  needs_resubmission: 'Reenvio necessário'
};

function randomId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2, 9);
}

function randomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error('Erro ao ler storage', key, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Erro ao gravar storage', key, error);
  }
}

export function getServices() {
  return readStorage(STORAGE_KEYS.services, []);
}

export function saveServices(services) {
  writeStorage(STORAGE_KEYS.services, services);
}

export function getClients() {
  return readStorage(STORAGE_KEYS.clients, []);
}

export function saveClients(clients) {
  writeStorage(STORAGE_KEYS.clients, clients);
}

export function findServiceById(serviceId) {
  return getServices().find(service => service.id === serviceId);
}

export function findClientByToken(token) {
  return getClients().find(client => client.token === token);
}

export function findClientByEmail(email) {
  const normalized = email.trim().toLowerCase();
  return getClients().find(client => client.email.toLowerCase() === normalized);
}

export function createService({ name, description, documents }) {
  const services = getServices();
  const newService = {
    id: randomId(),
    name,
    description,
    documents: documents.filter(Boolean)
  };
  services.push(newService);
  saveServices(services);
  return newService;
}

export function updateService(serviceId, updates) {
  const services = getServices();
  const idx = services.findIndex(service => service.id === serviceId);
  if (idx === -1) return null;
  services[idx] = { ...services[idx], ...updates };
  saveServices(services);
  return services[idx];
}

function buildDocumentsForService(service) {
  return (service?.documents || []).map(docName => ({
    id: randomId(),
    name: docName,
    status: 'pending',
    fileName: '',
    fileData: '',
    uploadedAt: null,
    notes: '',
    aiDecision: null,
    history: []
  }));
}

export function createClient({
  name,
  phone,
  email,
  serviceId,
  accessCode
}) {
  const services = getServices();
  const service = services.find(item => item.id === serviceId);
  if (!service) {
    throw new Error('Serviço não encontrado para o cliente.');
  }

  const clients = getClients();
  const token = randomId();
  const code = accessCode || randomCode();

  const newClient = {
    id: randomId(),
    createdAt: new Date().toISOString(),
    name,
    phone,
    email,
    serviceId,
    status: 'awaiting',
    token,
    link: `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}client.html?token=${token}`,
    accessCode: code,
    documents: buildDocumentsForService(service),
    finalDocuments: []
  };

  clients.push(newClient);
  saveClients(clients);
  return newClient;
}

export function updateClient(clientId, updateFn) {
  const clients = getClients();
  const idx = clients.findIndex(client => client.id === clientId);
  if (idx === -1) return null;
  const updated = updateFn ? updateFn(clients[idx]) : clients[idx];
  clients[idx] = { ...clients[idx], ...updated };
  saveClients(clients);
  return clients[idx];
}

export function replaceClient(updatedClient) {
  const clients = getClients();
  const idx = clients.findIndex(client => client.id === updatedClient.id);
  if (idx === -1) return null;
  clients[idx] = updatedClient;
  saveClients(clients);
  return updatedClient;
}

export function ensureDefaults() {
  if (!localStorage.getItem(STORAGE_KEYS.services)) {
    const initialServices = [
      {
        id: randomId(),
        name: 'Abertura de Empresa',
        description: 'Cadastro completo da empresa com envio de documentos societários.',
        documents: ['Contrato Social', 'Documentos do Sócio', 'Comprovante de Endereço']
      },
      {
        id: randomId(),
        name: 'Regularização Fiscal',
        description: 'Análise e regularização de pendências tributárias.',
        documents: ['Certidão Negativa', 'Extrato Fiscal', 'Relatório Contábil']
      }
    ];
    saveServices(initialServices);
  }

  if (!localStorage.getItem(STORAGE_KEYS.clients)) {
    const services = getServices();
    const fallbackService = services[0];
    if (fallbackService) {
      const demoClient = {
        id: randomId(),
        createdAt: new Date().toISOString(),
        name: 'Cliente de Teste',
        phone: '(11) 99999-9999',
        email: 'cliente@teste.com',
        serviceId: fallbackService.id,
        status: 'awaiting',
        token: 'teste-demo-token',
        link: `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}client.html?token=teste-demo-token`,
        accessCode: '123456',
        documents: buildDocumentsForService(fallbackService),
        finalDocuments: []
      };
      saveClients([demoClient]);
    }
  } else {
    // Ensure documents stay in sync if new documents were added to service later.
    const services = getServices();
    const clients = getClients().map(client => {
      const service = services.find(item => item.id === client.serviceId);
      const docs = buildDocumentsForService(service);

      const mergedDocs = docs.map(doc => {
        const existing = (client.documents || []).find(item => item.name === doc.name);
        return existing ? { ...doc, ...existing } : doc;
      });

      return { ...client, documents: mergedDocs };
    });
    saveClients(clients);
  }
}

export function refreshClientLink(client) {
  const link = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}client.html?token=${client.token}`;
  return { ...client, link };
}

export function recordDocumentHistory(doc, entry) {
  const history = doc.history || [];
  history.push({ ...entry, date: new Date().toISOString() });
  return history;
}

export function updateDocument(clientId, documentId, updater) {
  const clients = getClients();
  const idx = clients.findIndex(client => client.id === clientId);
  if (idx === -1) return null;
  const client = { ...clients[idx] };
  client.documents = client.documents.map(doc => {
    if (doc.id !== documentId) return doc;
    const updated = { ...doc };
    const result = updater(updated) || updated;
    return result;
  });
  clients[idx] = client;
  saveClients(clients);
  return client;
}

export function syncClient(client) {
  const refreshed = refreshClientLink(client);
  replaceClient(refreshed);
  return refreshed;
}

ensureDefaults();
