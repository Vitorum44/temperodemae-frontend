import { API_URL } from "./app-api.js";

// === ESTADO GLOBAL ===
let token = localStorage.getItem('token');
let lastOrderCount = 0;
let checkInterval = null;

// === CACHE GLOBAL DOS PEDIDOS (para impressão) ===
let ORDERS_CACHE = [];

// === SELETORES ===
const authCard = document.querySelector('#auth-card');
const ordersPanel = document.querySelector('#orders-panel');
const loginForm = document.querySelector('#login-form');
const loginFb = document.querySelector('#login-fb');
const ordersList = document.querySelector('#orders-list');
const countToday = document.querySelector('#count-today');
const totalToday = document.querySelector('#total-today');
const btnLogout = document.querySelector('#btn-logout');
const badgeElement = document.getElementById('order-badge');
const notificationSound = document.getElementById('audio-notification');
const scheduleWrapper = document.getElementById('schedule-wrapper');

// === TOAST NOTIFICATION ===
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const iconSuccess = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>`;
    const iconError = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>`;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-icon">${type === 'success' ? iconSuccess : iconError}</div><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.4s forwards';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// === INICIALIZAÇÃO ===
function init() {
    if (token) {
        showAdminPanel();
    } else {
        showLogin();
    }
}

function showLogin() {
    authCard.hidden = false;
    ordersPanel.hidden = true;
    document.body.style.overflow = 'hidden';
}

function showAdminPanel() {
    authCard.hidden = true;
    ordersPanel.hidden = false;
    document.body.style.overflow = 'auto';
    loadSettings();
    loadOrders();
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(loadOrders, 5000); // Roda a cada 5s
}

// === LOGIN ===
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.querySelector('#adm-email').value;
    const password = document.querySelector('#adm-pass').value;
    loginFb.textContent = "Verificando...";

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            token = data.token;
            localStorage.setItem("token", data.token);
            showAdminPanel();
        } else {
            loginFb.textContent = data.error || "Erro ao entrar";
        }
    } catch (error) {
        loginFb.textContent = "Erro de conexão";
    }
});

btnLogout?.addEventListener('click', () => {
    localStorage.removeItem('token');
    location.reload();
});

// === LOAD ORDERS ===
async function loadOrders() {
    if (!token) return;
    try {
        const res = await fetch(`${API_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('token');
            location.reload();
            return;
        }

        if (!res.ok) throw new Error("Erro API");
        const orders = await res.json();
        if (!Array.isArray(orders)) return;

        ORDERS_CACHE = orders;   // <-- GUARDA OS PEDIDOS PARA IMPRESSÃO

        const updatedOrders = await checkPixExpiry(orders);
        renderOrders(updatedOrders || orders);
        updateStats(orders);

        const activeOrders = orders.filter(o => o.status === 'novo' || o.status === 'aguardando_pagamento').length;
        updateBadge(activeOrders);

        if (activeOrders > lastOrderCount) playSound();
        lastOrderCount = activeOrders;

    } catch (err) {
        console.error("Erro:", err);
    }
}

// === AUTO-CANCEL PIX ===
async function checkPixExpiry(orders) {
    const now = new Date().getTime();
    const fiveMinutes = 5 * 60 * 1000;

    for (const order of orders) {
        const isPix = order.paymentMethod?.toLowerCase() === 'pix';
        if (order.status === 'aguardando_pagamento' && isPix) {
            const createdAt = new Date(order.created_at).getTime();
            if (!isNaN(createdAt) && (now - createdAt > fiveMinutes)) {
                try {
                    await fetch(`${API_URL}/orders/${order.id}/status`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ status: 'cancelado' })
                    });
                    order.status = 'cancelado';
                } catch (e) {
                    console.error("Erro no auto-cancel:", e);
                }
            }
        }
    }
    return orders;
}

// === WHATSAPP LINK (CORRIGIDO COM UNICODE) ===
function getWaLink(order) {
    const phone = order.customer.phone.replace(/\D/g, '');
    const nome = order.customer.name || 'Cliente';

    /* ===============================
       MENSAGENS CURTAS (SEM EMOJI)
       =============================== */
    let shortMsg = '';

    if (order.status === 'saiu_entrega') {
        shortMsg =
            `Seu pedido saiu para entrega.

Pedido #${order.id}
Já está a caminho.`;
    }
    else if (order.status === 'entregue') {
        shortMsg =
            `Seu pedido foi entregue.

Pedido #${order.id}
Obrigado pela preferência.`;
    }

    /* ===============================
       COMANDA LONGA (SEM EMOJI)
       =============================== */
    const produtos = (order.items || [])
        .map(i => `R$ ${i.price.toFixed(2)}  ${i.qty}x ${i.name}`)
        .join('\n');

    const totalProdutos = (order.items || [])
        .reduce((s, i) => s + (i.price * i.qty), 0);

    let pagamento = 'Não informado';
    if (order.customer.paymentMethod) {
        const pm = order.customer.paymentMethod.toLowerCase();
        if (pm === 'dinheiro') {
            // Pega o valor do troco e limpa o "Troco para" duplicado (se existir)
            let trocoValor = order.customer.change || 'Não informado';
            trocoValor = trocoValor.replace(/troco para:?/i, '').trim();
            
            pagamento = `Dinheiro na entrega\nTroco para: ${trocoValor}`;
        } else if (pm === 'pix') {
            pagamento = 'PIX';
        } else if (pm === 'cartao') {
            pagamento = 'Cartão';
        } else {
            pagamento = order.customer.paymentMethod;
        }
    }

    const entrega =
        order.fulfillment === 'pickup'
            ? 'Retirada no local'
            : `Bairro: ${order.customer.neighborhood || '-'}
Rua: ${order.customer.address || '-'}
Ref: ${order.customer.reference || '-'}`;

    const longMsg =
        `Olá Administrador, recebemos seu pedido!

Pedido: #${order.id}
---------------------------------------
Produtos:

${produtos}

---------------------------------------

Total Produtos: R$ ${totalProdutos.toFixed(2)}
Taxa Entrega: Grátis
TOTAL: R$ ${Number(order.total).toFixed(2)}

Forma de pagamento:
${pagamento}

---------------------------------------

Dados de Entrega:
Nome: ${nome}

${entrega}

Obrigado pela preferência!`;

    /* ===============================
       ESCOLHA FINAL
       =============================== */
    const finalMsg = shortMsg || longMsg;

    const params = new URLSearchParams();
    params.set('text', finalMsg);

    return `https://wa.me/55${phone}?${params.toString()}`;
}


// === RENDERIZAÇÃO DOS CARDS ===
function renderOrders(orders) {
    ordersList.innerHTML = '';
    if (orders.length === 0) {
        ordersList.innerHTML = '<div style="text-align:center; padding:40px; color:#9ca3af;">Nenhum pedido hoje...</div>';
        return;
    }

    orders.forEach(order => {
        const card = document.createElement('div');
        card.className = `order-card status-${order.status}`;
        const cust = order.customer || {};

        const address = order.fulfillment === 'pickup'
            ? '<span class="badge-pickup">\u{1F3C3} Retirada</span>'
            : `<span class="badge-delivery">\u{1F6F5} Entrega</span> ${cust.address}, ${cust.neighborhood || ''}`;

        let paymentTag = `<span class="tag-pay">${cust.paymentMethod}</span>`;
        let chargeBtn = '';
        const isPix = order.paymentMethod?.toLowerCase() === 'pix';

        if (isPix) {
            if (order.status === 'aguardando_pagamento') {
                paymentTag = `<span class="tag-pix-pending">\u{231B} PIX PENDENTE</span>`;
                // Supondo que exista getChargeLink, caso contrário usar waLink
                chargeBtn = `<button class="btn btn-charge" onclick="window.open('${getWaLink(order)}')"> \u{1F4B8} COBRAR PIX</button>`;
            } else {
                paymentTag = `<span class="tag-pix-paid">\u{2705} PIX PAGO</span>`;
            }
        }

        const itemsHtml = (order.items || []).map(i => {
            const imgUrl = i.image || 'https://placehold.co/60x60?text=Foto';
            return `
            <div class="order-item-line">
                <img src="${imgUrl}" class="item-thumb" alt="foto">
                <div class="item-details">
                    <div class="item-header">
                        <span class="item-qty">${i.qty}x</span>
                        <span class="item-name">${i.name}</span>
                    </div>
                    ${i.obs ? `<div class="item-obs">\u{26A0} ${i.obs}</div>` : ''}
                </div>
                <strong class="item-price">R$ ${(i.price * i.qty).toFixed(2)}</strong>
            </div>`;
        }).join('');

        const statusMap = {
            'novo': '\u{1F514} NOVO',
            'aguardando_pagamento': '\u{231B} AGUARDANDO PGTO',
            'em_preparo': '\u{1F525} PREPARANDO',
            'saiu_entrega': '\u{1F6F5} SAIU',
            'entregue': '\u{2705} ENTREGUE',
            'cancelado': '\u{274C} CANCELADO',
            'agendado': '\u{1F4C5} AGENDADO'
        };

        const waLink = getWaLink(order);
        let buttons = '';

        const cancelBtn = `<button class="btn btn-reject" onclick="updateStatus(${order.id}, 'cancelado')">
  ${order.status === 'aguardando_pagamento' ? 'CANCELAR' : 'RECUSAR'}
</button>`;

        // 👉 BOTÃO DE EMERGÊNCIA (SEMPRE VISÍVEL ATÉ "SAIU_ENTREGA")
        const adminCancelBtn = `
  <button class="btn btn-cancel-admin" onclick="updateStatus(${order.id}, 'cancelado')">
    ❌ Cancelar Pedido
  </button>
`;

        if (order.status !== 'cancelado' && order.status !== 'entregue') {

            if (order.status === 'aguardando_pagamento') {
                buttons += chargeBtn;
                buttons += cancelBtn;
            }

            else if (order.status === 'novo' || order.status === 'agendado') {
                buttons += `<button class="btn btn-accept" onclick="updateStatus(${order.id}, 'em_preparo')">
      ACEITAR & PREPARAR
    </button>`;
                buttons += cancelBtn;
                buttons += adminCancelBtn; // ✅ aparece aqui
            }

            else if (order.status === 'em_preparo') {
                if (order.fulfillment === 'delivery') {
                    buttons += `<button class="btn btn-delivery" onclick="updateStatus(${order.id}, 'saiu_entrega')">
        SAIU PARA ENTREGA
      </button>`;
                } else {
                    buttons += `<button class="btn btn-ready" onclick="updateStatus(${order.id}, 'entregue')">
        PRONTO P/ RETIRADA
      </button>`;
                }

                buttons += adminCancelBtn; // ✅ AGORA APARECE TAMBÉM EM "PREPARANDO"
            }

            else if (order.status === 'saiu_entrega') {
                buttons += `<button class="btn btn-finish" onclick="updateStatus(${order.id}, 'entregue')">
      FINALIZAR (ENTREGUE)
    </button>`;
            }

        } else if (order.status === 'cancelado') {
  buttons += `<button class="btn btn-reactivate" onclick="updateStatus(${order.id}, 'novo')">
    ⚡ REATIVAR PEDIDO
  </button>`;
}





        card.innerHTML = `
  <div class="card-top">
      <div class="order-id">#${order.id}</div>
      <div class="order-time">${new Date(order.created_at).toLocaleTimeString().slice(0, 5)}</div>
  </div>
  <div class="card-status-bar">
      <span class="status-tag tag-${order.status}">${statusMap[order.status] || order.status}</span>
      ${paymentTag}
  </div>
  <div class="order-items-container">${itemsHtml}</div>
  <div class="order-footer">
      <div class="customer-info">
          <strong>${cust.name}</strong>
          <a href="${waLink}" target="_blank" class="wa-btn-small">WhatsApp</a>
          <div style="margin-top:4px; color:#555;">
  ${address}
  ${cust.reference
                ? `<div style="margin-top:4px; font-size:12px; color:#555;">
         📍 Referência: ${cust.reference}
       </div>`
                : ""
            }
</div>


          ${order.distance_km
                ? `<div style="margin-top:4px; color:#2563eb; font-size:12px;">
                  🚚 Distância: <strong>${Number(order.distance_km).toFixed(1)} km</strong>
               </div>`
                : ""
            }

          ${cust.change
                ? `<div style="color:#d62300; font-size:12px; margin-top:2px;">
                 💰 ${cust.change}
               </div>`
                : ""
            }
      </div>

      <div class="order-total">Total: R$ ${Number(order.total).toFixed(2)}</div>
  </div>
  <div class="order-actions">
      ${buttons}
      <button class="btn btn-print" onclick="printOrder(${order.id})">🖨</button>
  </div>
`;
        ordersList.appendChild(card);

    });
}

function updateStats(orders) {
    const today = new Date().toDateString();
    const todaysOrders = orders.filter(o => new Date(o.created_at).toDateString() === today && o.status !== 'cancelado');
    countToday.textContent = todaysOrders.length;
    const total = todaysOrders.reduce((acc, curr) => acc + Number(curr.total), 0);
    totalToday.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function updateBadge(count) {
    if (count > 0) {
        badgeElement.textContent = count > 99 ? '99+' : count;
        badgeElement.style.display = 'flex';
        document.title = `(${count}) Admin`;
    } else {
        badgeElement.style.display = 'none';
        document.title = "Admin";
    }
}

function playSound() {
    if (notificationSound) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(() => { });
    }
}

// === FUNÇÃO DO NOVO MODAL ===
function showConfirm(title, message, icon = '❓') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm');
        const btnOk = document.getElementById('confirm-ok');
        const btnCancel = document.getElementById('confirm-cancel');

        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-icon').textContent = icon;

        modal.style.display = 'flex';

        const close = (result) => {
            modal.style.display = 'none';
            btnOk.onclick = null;
            btnCancel.onclick = null;
            resolve(result);
        };

        btnOk.onclick = () => close(true);
        btnCancel.onclick = () => close(false);
    });
}

// === UPDATE STATUS ATUALIZADO ===
window.updateStatus = async (id, status, silent = false) => {
    if (!silent) {
        let title = "Confirmar Status";
        let message = "Deseja alterar o status deste pedido?";
        let icon = "🔔";

        if (status === 'cancelado') {
            title = "Recusar Pedido";
            message = "Tem certeza que deseja cancelar este pedido?";
            icon = "❌";
        } else if (status === 'em_preparo') {
            title = "Aceitar Pedido";
            message = "Iniciar o preparo agora?";
            icon = "🔥";
        }

        const confirmed = await showConfirm(title, message, icon);
        if (!confirmed) return;
    }

    try {
        const res = await fetch(`${API_URL}/orders/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });

        if (res.ok) {
            loadOrders();
            showToast("Status atualizado!", "success");
        } else {
            showToast("Erro ao atualizar status", "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Erro de conexão", "error");
    }
};

// === CONFIGURAÇÕES E HORÁRIOS ===
const formSettings = document.querySelector('#settings-form');
const btnsMode = document.querySelectorAll('.btn-mode');

function toggleSchedule(mode) {
    if (scheduleWrapper) scheduleWrapper.style.display = (mode === 'auto') ? 'block' : 'none';
}

btnsMode.forEach(btn => {
    btn.addEventListener('click', () => {
        btnsMode.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        document.querySelector('#store-mode').value = mode;
        toggleSchedule(mode);
    });
});

async function loadSettings() {
    if (!token) return;
    try {
        const res = await fetch(`${API_URL}/settings`);
        const data = await res.json();

        btnsMode.forEach(b => {
            if (b.dataset.mode === data.mode) b.classList.add('active');
            else b.classList.remove('active');
        });
        document.querySelector('#store-mode').value = data.mode;
        toggleSchedule(data.mode);

        const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const container = document.querySelector('#schedule-container');
        container.innerHTML = '';

        const schedule = data.weekly_schedule || days.map((_, i) => ({ day: i, active: false, start: '18:00', end: '23:00' }));

        schedule.forEach(day => {
            const div = document.createElement('div');
            div.className = 'schedule-row';
            div.dataset.day = day.day;
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; width:90px;">
                    <input type="checkbox" class="check-active" id="d-${day.day}" ${day.active ? 'checked' : ''}>
                    <label for="d-${day.day}" style="font-size:12px; font-weight:600; cursor:pointer;">${days[day.day].slice(0, 3)}</label>
                </div>
                <div class="time-inputs" style="${day.active ? '' : 'opacity:0.5; pointer-events:none;'}">
                    <input type="time" class="time-start" value="${day.start}"> - 
                    <input type="time" class="time-end" value="${day.end}">
                </div>`;

            const chk = div.querySelector('.check-active');
            const times = div.querySelector('.time-inputs');
            chk.addEventListener('change', () => {
                times.style.opacity = chk.checked ? '1' : '0.5';
                times.style.pointerEvents = chk.checked ? 'auto' : 'none';
            });
            container.appendChild(div);
        });
    } catch (e) {
        console.error(e);
    }
}

window.printOrder = function (orderId) {
    const order = ORDERS_CACHE.find(o => o.id === orderId);
    if (!order) {
        alert("Pedido não encontrado para impressão.");
        return;
    }

    const cust = order.customer || {};
    const address = cust.address || "Endereço não informado";
    const reference = cust.reference || "—";
    const payment =
        order.paymentMethod ||
        order?.customer?.paymentMethod ||
        "—";

    const change = cust.change || "—";
    const distance = order.distance_km
        ? `${Number(order.distance_km).toFixed(1)} km`
        : "—";

    const itemsHtml = order.items
        .map(
            (i) => `
    <tr>
      <td style="width: 40px;">${i.qty}x</td>
      <td>
        ${i.name === "Carne"
                    ? "Pastel de Carne"
                    : i.name
                }
        ${i.obs
                    ? `<div style="font-size:11px; color:#d62300; margin-top:2px;">
                ⚠️ ${i.obs}
             </div>`
                    : ""
                }
      </td>
      <td style="text-align:right">R$ ${Number(i.price * i.qty).toFixed(2)}</td>
    </tr>
`
        )
        .join("");



    const printWindow = window.open("", "_blank");

    printWindow.document.write(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Comanda #${order.id}</title>
<style>
  body {
    font-family: Arial, sans-serif;
    font-size: 12px;
    margin: 10px;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .divider {
    border-top: 1px dashed #aaa;
    margin: 8px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    padding: 4px 0;
    border-bottom: 1px dashed #ddd;
  }
  .section-title {
    font-weight: bold;
    margin-top: 8px;
  }
  .total {
    font-size: 14px;
    font-weight: bold;
    text-align: right;
    margin-top: 8px;
  }
  .label {
    font-weight: bold;
  }
</style>
</head>
<body>

<div class="header">
  <div>${new Date(order.created_at).toLocaleString()}</div>
  <div class="bold">Comanda #${order.id}</div>
</div>

<div class="center bold" style="margin-top:8px;">
  🍔 COMANDA DO PEDIDO
</div>
<div class="center">
  #${order.id} • ${new Date(order.created_at).toLocaleString()}
</div>

<div class="divider"></div>

<div class="section-title">📦 DADOS DO CLIENTE</div>
<div><span class="label">Cliente:</span> ${cust.name || "—"}</div>

<div class="section-title">🛵 ENTREGA</div>
<div><span class="label">Endereço:</span> ${address}</div>
<div><span class="label">Referência:</span> ${reference}</div>
<div><span class="label">Distância:</span> ${distance}</div>

<div class="section-title">💳 PAGAMENTO</div>
<div><span class="label">Forma:</span> ${payment}</div>
<div><span class="label">Troco:</span> ${change}</div>


<div class="divider"></div>

<table>
  <thead>
    <tr>
      <th style="text-align:left">Qtd</th>
      <th style="text-align:left">Item</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

<div class="divider"></div>
<div class="total">TOTAL: R$ ${Number(order.total).toFixed(2)}</div>

<script>
  window.onload = function() {
    window.print();
    window.onafterprint = () => window.close();
  };
</script>
</body>
</html>
`);

    printWindow.document.close();
};



formSettings?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formSettings.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = "Salvando...";
    btn.disabled = true;

    const mode = document.querySelector('#store-mode').value;
    const newSchedule = [];
    document.querySelectorAll('.schedule-row').forEach(row => {
        newSchedule.push({
            day: Number(row.dataset.day),
            active: row.querySelector('.check-active').checked,
            start: row.querySelector('.time-start').value,
            end: row.querySelector('.time-end').value
        });
    });

    try {
        await fetch(`${API_URL}/settings`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ mode, weekly_schedule: newSchedule })
        });
        showToast('Configurações salvas!', 'success');
    } catch (e) {
        showToast('Erro ao salvar.', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

const searchInput = document.getElementById("search-product");

if (searchInput) {
    searchInput.addEventListener("input", () => {
        const term = searchInput.value.toLowerCase().trim();
        filterProducts(term);
    });
}

function filterProducts(term) {
    const tbody = document.getElementById("inventory-list");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    // Primeiro: separa em "bateu" e "não bateu"
    const matched = [];
    const notMatched = [];

    rows.forEach(row => {
        const nameCell = row.querySelector("td:nth-child(2)"); // coluna Nome
        if (!nameCell) return;

        const name = nameCell.textContent.toLowerCase();

        if (name.includes(term)) {
            row.style.display = "";
            matched.push(row);
        } else {
            row.style.display = "none";
            notMatched.push(row);
        }
    });

    // Segundo: limpa e remonta a tabela com os resultados no topo
    tbody.innerHTML = "";
    matched.forEach(r => tbody.appendChild(r));
    notMatched.forEach(r => tbody.appendChild(r));
}

async function cancelOrderAdmin(orderId) {
    if (!confirm("Tem certeza que deseja cancelar este pedido?")) return;

    try {
        await fetch(`${API_URL}/orders/${orderId}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });

        alert("Pedido cancelado com sucesso.");
        loadOrders(); // Atualiza lista
    } catch (err) {
        alert("Erro ao cancelar: " + err.message);
    }
}



init();










