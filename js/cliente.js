/* ==================================================================== */
/* ARQUIVO: cliente.js (VERSÃO FINAL "SÊNIOR" - UX + SEGURANÇA)         */
/* ==================================================================== */

import { API_URL } from "./app-api.js";

// ================= CONFIGURAÇÃO =================
const RESTAURANT_LOCATION = {
  lat: -5.746906,
  lng: -35.240273
};

const MY_CITY_STATE = "Natal, RN";

// Helper para garantir que o Google Maps carregou antes de calcular
function waitForGoogleMaps(callback, tries = 0) {
  if (window.google && google.maps && google.maps.DirectionsService) {
    callback();
  } else if (tries < 50) {
    setTimeout(() => waitForGoogleMaps(callback, tries + 1), 100);
  } else {
    console.error("Google Maps não carregou a tempo");
  }
}

// ================= ESTADO GLOBAL =================
const state = {
  pixModalOpen: false,
  pixManuallyClosed: false,
  categories: [],
  subcategories: [],
  items: [],
  cart: JSON.parse(localStorage.getItem('cart') || '[]'),
  filters: { cat: null, sub: null, q: '' },
  token: localStorage.getItem('token') || '',
  user: null,
  calculatedFee: 0,
  distanceKm: 0,
  currentOrderId: localStorage.getItem('lastOrderId') || null,
  isStoreOpen: true,
  storeConfig: null,
  trackingInterval: null,
  pixTimerInterval: null,
  selectedItem: null,
  selectedQty: 1,
  activeOrderData: null
};

let acompanhamentosSelecionados = []

// Estado para controle de alteração de endereço
let addressDirty = false;



// ================= HELPERS =================
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => { fn.apply(this, args); }, delay);
  };
}

async function tryCalculateByText() {
  // CORREÇÃO: Validação mínima antes de gastar recursos
  if (!inputAddress.value.trim()) return;

  const fullAddress = `${inputAddress.value}, ${inputNeighborhood.value || ''}, ${MY_CITY_STATE}`;
  const query = encodeURIComponent(fullAddress);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

  try {
    const r = await fetch(url);
    const data = await r.json();

    if (data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      addressDirty = false;
      waitForGoogleMaps(() => calcShip(lat, lng));
    }
  } catch (e) {
    console.warn("Erro no geocode:", e);
  }
}

// ================= ELEMENTOS DOM =================
const chipsCat = $('#category-chips');
const grid = $('#menu-grid');
const drawer = $('#carrinho');
const closeCart = $('#close-cart');
const cartList = $('#cart-items');
const cartCount = $('#cart-count');
const viewSubtotal = $('#cart-subtotal');
const viewFee = $('#cart-fee');
const viewGrandTotal = $('#cart-grandtotal');
const orderForm = $('#order-form');
const fb = $('#order-feedback');
const btnFinalize = $('#btn-finalize');
const fulfillDelivery = $('#fulfill-delivery');
const fulfillPickup = $('#fulfill-pickup');
const deliveryFields = $('#delivery-fields');
const inputAddress = $('#cust-address');
const inputNeighborhood = $('#cust-neighborhood');

// ====== CONTROLE SÊNIOR DE ALTERAÇÃO DE ENDEREÇO ======
// Quando digitar rua/número
inputAddress?.addEventListener('input', debounce(() => {
  addressDirty = true;
  state.calculatedFee = null;
  updateCartUI();
}, 400));

// Quando digitar bairro → recalcula automaticamente
inputNeighborhood?.addEventListener('input', debounce(async () => {
  const street = inputAddress.value.trim();
  const neighborhood = inputNeighborhood.value.trim();

  if (!street || neighborhood.length < 3) return; // 🔒 evita chamadas inúteis

  addressDirty = true;
  state.calculatedFee = null;
  updateCartUI();

  await tryCalculateByText(); // 🔁 recalcula com rua + bairro
}, 600));

// Quando SAIR do campo bairro (blur) -> Garante o cálculo se o debounce falhar
inputNeighborhood?.addEventListener('blur', async () => {
  const street = inputAddress.value.trim();
  if (street && state.calculatedFee === null) {
    await tryCalculateByText();
  }
});


const inputReference = $('#cust-reference');
const inputName = $('#cust-name');
const inputPhone = $('#cust-phone');
const inputEmail = $('#cust-email');
const suggestionsList = $('#address-suggestions');
const orderSchedule = $('#order-schedule');
const checkNeedChange = $('#need-change');
const inputChangeAmount = $('#change-amount');
const floatCartBtn = $('#float-cart-btn');
const floatCartCount = $('#float-cart-count');

// ================= LÓGICA DO TROCO =================
const payCash = document.getElementById('pay-cash');
const cashChangeBox = document.getElementById('cash-change-box');

// Mostra / esconde a caixinha quando escolher "Dinheiro"
document.querySelectorAll('input[name="payment"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (payCash.checked) {
      cashChangeBox.style.display = 'block';
    } else {
      cashChangeBox.style.display = 'none';
      checkNeedChange.checked = false;
      inputChangeAmount.style.display = 'none';
      inputChangeAmount.value = '';
    }
  });
});

// Mostra / esconde o campo do valor do troco
checkNeedChange?.addEventListener('change', () => {
  if (checkNeedChange.checked) {
    inputChangeAmount.style.display = 'block';
  } else {
    inputChangeAmount.style.display = 'none';
    inputChangeAmount.value = '';
  }
});

// MAPA & GPS
const mapModal = document.getElementById('map-modal');
const btnOpenMap = document.getElementById('btn-open-map');
const btnCloseMap = document.getElementById('close-map');
const btnConfirmMap = document.getElementById('btn-confirm-map');
const btnGps = document.getElementById('btn-gps');

// AUTH & OUTROS
const authModal = $('#auth-modal');
const authTabs = $('#auth-tabs');
const authTitle = $('#auth-title');
const amClose = $('#am-close');
const formLogin = $('#form-login');
const loginPhone = $('#login-phone');
const loginPass = $('#login-password');
const loginFb = $('#login-feedback');
const btnForgot = $('#btn-forgot-pass');
const formSignup = $('#form-signup');
const suName = $('#signup-name');
const suPhone = $('#signup-phone');
const suEmail = $('#signup-email');
const suPass = $('#signup-password');
const suFb = $('#signup-feedback');
const btnBackAuth = $('#btn-back-auth');
const recFlow = $('#recovery-flow');
const recStep1 = $('#rec-step-1');
const recPhoneInput = $('#rec-phone-input');
const btnSendCode = $('#btn-send-code');
const recFb = $('#rec-feedback');

const btnProfile = $('#edit-profile');
const profileMenu = $('#profile-menu');
const pmLogout = $('#pm-logout');
const pmHistory = $('#pm-history');
const pmSettings = $('#pm-settings');
const settingsModal = $('#settings-modal');
const smClose = $('#sm-close');
const formSettings = $('#form-settings');
const setName = $('#set-name');
const setPhone = $('#set-phone');
const setEmail = $('#set-email');
const setPass = $('#set-pass');
const settingsFb = $('#settings-feedback');
const historyModal = $('#history-modal');
const hmClose = $('#hm-close');
const historyList = $('#history-list');

const trackingModal = $('#tracking-modal');
const tmClose = $('#tm-close');
const trackingBubble = $('#tracking-bubble');
const trackId = $('#track-id');
const trackMsg = $('#track-msg');
const timelineProgress = $('#timeline-progress');
const trackTotalEl = $('#track-total-display');
const btnTrackWa = $('#btn-track-wa');
const btnCancelOrder = $('#btn-cancel-order');
const stepNovo = $('#step-novo');
const stepPreparo = $('#step-em_preparo');
const stepSaiu = $('#step-saiu_entrega');
const stepEntregue = $('#step-entregue');

const pdModal = $('#product-details-modal');
const pdClose = $('#pd-close');
const pdAddBtn = $('#pd-add-btn');
const pdQty = $('#pd-qty');
const pdPrice = $('#pd-price');
const pdTotalBtn = $('#pd-total-btn');
const pdImage = $('#pd-image');
const pdName = $('#pd-name');
const pdDesc = $('#pd-desc');
const pdObs = $('#pd-obs');
const pdPlus = $('#pd-plus');
const pdMinus = $('#pd-minus');

const carouselTrack = $('.carousel-track');
const slides = $$('.slide');
const nextBtn = $('.carousel-btn.next');
const prevBtn = $('.carousel-btn.prev');
const dots = $$('.dot');

// ================= API HELPERS =================
async function apiGet(path) {
  const r = await fetch(`${API_URL}${path}`, { headers: state.token ? { Authorization: `Bearer ${state.token}` } : {} });
  if (!r.ok) throw new Error(`GET ${path} falhou`);
  return r.json();
}

async function apiSend(path, method, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const r = await fetch(`${API_URL}${path}`, { method, headers, body: JSON.stringify(body) });
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch { } throw new Error(j.error || `Erro ${method} ${path}`); }
  return r.json();
}

// ================= LÓGICA DO MAPA (MODAL) =================
let map = null;
let marker = null;
let selectedLatLng = null;

if (btnOpenMap && mapModal) {
  btnOpenMap.addEventListener('click', async () => {
    mapModal.classList.add('active');
    mapModal.setAttribute('aria-hidden', 'false');

    const currentAddr = inputAddress ? inputAddress.value : "";
    let startLat = RESTAURANT_LOCATION.lat;
    let startLng = RESTAURANT_LOCATION.lng;

    if (currentAddr && currentAddr.length > 5 && !currentAddr.includes("Local selecionado")) {
      try {
        const cleanAddr = currentAddr.replace(/[\s,]+\d+$/, '').trim();
        const u = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddr + ', ' + MY_CITY_STATE)}&limit=1`;
        const r = await fetch(u);
        const d = await r.json();
        if (d.length > 0) {
          startLat = parseFloat(d[0].lat);
          startLng = parseFloat(d[0].lon);
        }
      } catch (e) { console.log("Erro geo mapa:", e); }
    }

    setTimeout(() => {
      initMap(startLat, startLng);
    }, 300);
  });
}

if (btnCloseMap && mapModal) {
  btnCloseMap.addEventListener('click', () => {
    mapModal.classList.remove('active');
    mapModal.setAttribute('aria-hidden', 'true');
  });
}

if (btnConfirmMap && mapModal) {
  btnConfirmMap.addEventListener('click', async () => {
    if (!selectedLatLng) { alert("Marque o local no mapa!"); return; }

    mapModal.classList.remove('active');
    mapModal.setAttribute('aria-hidden', 'true');

    if (inputAddress && (!inputAddress.value || inputAddress.value.trim() === "")) {
      inputAddress.value = "Local selecionado no mapa";
    }

    waitForGoogleMaps(() => {
      calcShip(selectedLatLng.lat, selectedLatLng.lng);
    });
  });
}

if (btnGps) {
  btnGps.addEventListener('click', () => {
    if (!navigator.geolocation) { alert("GPS não suportado."); return; }
    const originalText = btnGps.textContent;
    btnGps.textContent = "Buscando...";
    btnGps.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (!map) initMap(latitude, longitude);
        else {
          map.setView([latitude, longitude], 17);
          if (marker) marker.setLatLng([latitude, longitude]);
          else marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
        }
        selectedLatLng = { lat: latitude, lng: longitude };
        btnGps.textContent = "📍 Localização encontrada!";
        setTimeout(() => { btnGps.textContent = originalText; btnGps.disabled = false; }, 2000);

        waitForGoogleMaps(() => {
          calcShip(latitude, longitude);
        });
      },
      (error) => {
        alert("Ative o GPS do celular.");
        btnGps.textContent = originalText;
        btnGps.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function initMap(lat, lng) {
  if (map) { map.remove(); map = null; }
  map = L.map('map').setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  marker = L.marker([lat, lng], { draggable: true }).addTo(map);
  selectedLatLng = { lat, lng };

  marker.on('dragend', function (e) {
    const pos = e.target.getLatLng();
    selectedLatLng = { lat: pos.lat, lng: pos.lng };
  });

  map.on('click', function (e) {
    marker.setLatLng(e.latlng);
    selectedLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
  });

  setTimeout(() => map.invalidateSize(), 200);
}

// ================= AUTOCOMPLETE GOOGLE PLACES =================
function initGoogleAutocomplete() {
  if (!window.google || !google.maps || !google.maps.places || !inputAddress) return;

  const autocomplete = new google.maps.places.Autocomplete(inputAddress, {
    types: ['address'],
    componentRestrictions: { country: 'br' },
    fields: ['address_components', 'geometry']
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.geometry) return;

    let street = '';
    let number = '';
    let neighborhood = '';

    place.address_components.forEach(c => {
      if (c.types.includes('route')) street = c.long_name;
      if (c.types.includes('street_number')) number = c.long_name;
      if (
        c.types.includes('sublocality') ||
        c.types.includes('sublocality_level_1') ||
        c.types.includes('neighborhood')
      ) neighborhood = c.long_name;
    });

    const typedValue = inputAddress.value;
    const typedNumberMatch = typedValue.match(/,\s*(\d+)/);
    const typedNumber = typedNumberMatch ? typedNumberMatch[1] : '';
    const finalNumber = number || typedNumber;

    inputAddress.value = `${street}${finalNumber ? ', ' + finalNumber : ''}`;
    if (inputNeighborhood) inputNeighborhood.value = neighborhood;

    waitForGoogleMaps(() => {
      calcShip(
        place.geometry.location.lat(),
        place.geometry.location.lng()
      );
    });
  });
}

window.addEventListener('load', initGoogleAutocomplete);

// ======= AUTO-GEOCODE SE O USUÁRIO DIGITAR MANUALMENTE =======
inputAddress?.addEventListener('blur', async () => {
  if (!addressDirty || !inputAddress.value.trim()) return;

  try {
    const fullAddress = `${inputAddress.value}, ${inputNeighborhood.value || ''}, ${MY_CITY_STATE}`;
    const query = encodeURIComponent(fullAddress);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

    const r = await fetch(url);
    const data = await r.json();

    if (data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);

      addressDirty = false;
      waitForGoogleMaps(() => calcShip(lat, lng));
    }
  } catch (e) {
    console.warn("Falha no geocode automático:", e);
  }
});


function calcShip(lat, lng) {
  // 🔄 RESET ABSOLUTO
  state.distanceKm = 0;
  state.calculatedFee = null;
  updateCartUI();

  if (!lat || !lng) return;

  if (fulfillPickup && fulfillPickup.checked) {
    state.distanceKm = 0;
    state.calculatedFee = 0;
    updateCartUI();
    return;
  }

  const service = new google.maps.DirectionsService();

  service.route(
    {
      origin: RESTAURANT_LOCATION,
      destination: { lat, lng },
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status !== "OK" || !result.routes?.length) {
        console.error("Erro rota:", status);
        state.calculatedFee = -1; // força "Muito longe"
        updateCartUI();
        return;
      }

      const meters = result.routes[0].legs[0].distance.value;
      const km = meters / 1000;
      state.distanceKm = km;

      // 🚚 REGRA FINAL DE FRETE
      if (km <= 2) {
        state.calculatedFee = 0;
      } else if (km > 8) {
        state.calculatedFee = -1;
      } else {
        state.calculatedFee = Math.ceil(km);
      }
      updateCartUI();
    }
  );
}

if (fulfillPickup && fulfillDelivery) {
  function toggleDeliveryMode() {
    const isPickup = fulfillPickup.checked;
    if (isPickup) {
      if (deliveryFields) deliveryFields.style.display = 'none';
      state.calculatedFee = 0; state.distanceKm = 0;
    } else {
      if (deliveryFields) deliveryFields.style.display = 'block';

      if (inputAddress.value.trim()) {
        addressDirty = true;
        state.calculatedFee = null;
      }
    }

    updateCartUI();
  }
  fulfillPickup.addEventListener('change', toggleDeliveryMode);
  fulfillDelivery.addEventListener('change', toggleDeliveryMode);
}


// ================= RENDERIZAR MENU =================
function renderItems() {
  const originalScroll = window.scrollY;
  const existingSections = document.querySelectorAll('.category-section');
  if (existingSections.length > 0) {
    setupScrollSpy(); // ✅ garante que o spy está ativo mesmo sem re-renderizar
    return;
  }

  grid.innerHTML = '';
  const term = state.filters.q ? state.filters.q.toLowerCase() : '';

  state.categories.forEach(cat => {
    let itemsInCat = state.items.filter(i => i.category_id === cat.id);
    if (term) itemsInCat = itemsInCat.filter(i => i.name.toLowerCase().includes(term));

    if (itemsInCat.length > 0) {
      const section = document.createElement('div');
      section.className = 'category-section';
      section.id = `cat-${cat.id}`;

      const title = document.createElement('h3');
      title.className = 'category-title';
      title.textContent = cat.name;
      section.appendChild(title);

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'items-container-grid';

      itemsInCat.forEach(i => {
        const c = document.createElement('div');
        c.className = 'item-card';

        c.innerHTML = `
          <div class="card-info">
            <h4 class="card-title">${i.name}</h4>
            <p class="card-desc">${i.description || ''}</p>
            <div class="card-footer">
              <div class="card-price">${brl(Number(i.price))}</div>
              <button class="btn-add">Adicionar</button>
            </div>
          </div>
          <img src="${i.image_url || i.imageUrl || ''}"
            onerror="this.src='https://placehold.co/300x200?text=Sem+Foto'"
            class="card-img-right">
        `;

        c.onclick = () => openProductModal(i);
        itemsContainer.appendChild(c);
      });

      section.appendChild(itemsContainer);
      grid.appendChild(section);
    }
  });

  setTimeout(setupScrollSpy, 500);
  window.scrollTo(0, originalScroll); // 🔥 evita “pulo” de tela
}

function setupScrollSpy() {
  const sections = document.querySelectorAll('.category-section');
  const chipsContainer = document.getElementById('category-chips');
  const chips = document.querySelectorAll('#category-chips .chip');

  if (!sections.length || !chipsContainer || !chips.length) return;

  // Removemos qualquer listener anterior para evitar duplicação
  window.removeEventListener('scroll', window._handleScrollSpy);

  // Criamos a função matemática atrelada ao objeto window
  window._handleScrollSpy = function () {
    // requestAnimationFrame garante que o cálculo não vai travar o celular do usuário
    window.requestAnimationFrame(() => {
      let idAtual = '';

      // Criamos uma "linha de corte" invisível, 150px abaixo do topo (para ignorar o cabeçalho)
      const linhaDeCorte = window.scrollY + (window.innerHeight / 3);

      // Verifica matematicamente em qual categoria a linha de corte está encostando
      sections.forEach(section => {
        const topo = section.offsetTop;
        const altura = section.offsetHeight;

        if (linhaDeCorte >= topo && linhaDeCorte < (topo + altura)) {
          idAtual = section.getAttribute('id');
        }
      });

      // Se encontrou a categoria visível, pinta o botão
      if (idAtual) {
        chips.forEach(chip => {
          if (chip.dataset.target === idAtual) {
            // Só faz a animação se o botão já não estiver ativo (economiza bateria/processamento)
            if (!chip.classList.contains('active')) {
              chips.forEach(c => c.classList.remove('active')); // Limpa os outros
              chip.classList.add('active'); // Pinta o atual

              // Centraliza o menu horizontal
              const scrollParaCentro = chip.offsetLeft - (chipsContainer.offsetWidth / 2) + (chip.offsetWidth / 2);
              chipsContainer.scrollTo({ left: scrollParaCentro, behavior: 'smooth' });
            }
          }
        });
      }
    });
  };

  // Escuta a rolagem nativa de forma passiva (não bloqueia a UI)
  window.addEventListener('scroll', window._handleScrollSpy, { passive: true });

  // Chama a função uma vez só para marcar a primeira categoria assim que carregar
  window._handleScrollSpy();
}

function renderFilters() {
  chipsCat.innerHTML = '';
  const activeCats = state.categories.filter(c => state.items.some(i => i.category_id === c.id));

  activeCats.forEach((c, idx) => {
    const btn = document.createElement('button');
    btn.className = idx === 0 ? 'chip active' : 'chip';
    btn.textContent = c.name;
    btn.dataset.target = `cat-${c.id}`;

    btn.onclick = () => {
      const section = document.getElementById(`cat-${c.id}`);
      if (section) {
        const y = section.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    };
    chipsCat.appendChild(btn);
  });
}

async function openProductModal(item) {
  acompanhamentosSelecionados = [];
  state.selectedItem = item;
  state.selectedQty = 1;

  pdImage.src = item.image_url || 'https://placehold.co/300x200?text=Sem+Foto';
  pdName.textContent = item.name;
  pdDesc.textContent = item.description || "";
  pdPrice.textContent = brl(Number(item.price));
  pdQty.textContent = "1";
  pdObs.value = "";

  updateModalTotal();

  // 🔥 BUSCAR ACOMPANHAMENTOS
  try {
    const grupos = await apiGet(`/acompanhamentos/${item.id}`);
    renderAcompanhamentos(grupos);
  } catch (err) {
    console.error("Erro ao buscar acompanhamentos:", err);
  }

  pdModal.setAttribute("aria-hidden", "false");
}

function renderAcompanhamentos(grupos) {
  const container = document.getElementById("pd-acompanhamentos");
  if (!container) return;

  container.innerHTML = "";
  if (!grupos || grupos.length === 0) return;

  grupos.forEach((g, index) => {
    const div = document.createElement("div");
    const obrigatorio = (g.min || 0) > 0;

    div.classList.add("acomp-group");
    div.dataset.tipo = index === 0 ? "principal" : `extra_${index}`;
    div.dataset.min = g.min || 0;
    div.dataset.max = g.max || 999;

    div.innerHTML = `
      <div class="acomp-header">
        <div>
          <div class="acomp-title">${g.nome}</div>
          <div class="acomp-rules">Escolha de ${g.min || 0} a ${g.max || "∞"}</div>
        </div>
        ${obrigatorio ? `<span style="background:#000;color:#fff;font-size:11px;padding:3px 8px;border-radius:6px;">OBRIGATÓRIO</span>` : ""}
      </div>
      ${(g.opcoes || []).map(opt => `
        <div class="acomp-item" data-nome="${opt.nome}" data-preco="${opt.preco || 0}">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:600;">${opt.nome}</div>
              ${opt.preco ? `<div style="color:green;font-size:13px;">+R$ ${opt.preco}</div>` : ""}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="minus">−</button>
              <span class="qtd">0</span>
              <button class="plus">+</button>
            </div>
          </div>
        </div>
      `).join("")}
    `;

    const primeiroItem = div.querySelector(".acomp-item");

    div.querySelectorAll(".acomp-item").forEach(item => {
      const plus = item.querySelector(".plus");
      const minus = item.querySelector(".minus");
      const qtdEl = item.querySelector(".qtd");
      const nome = item.dataset.nome.trim();
      const preco = Number(item.dataset.preco);

      const tipoGrupo = div.dataset.tipo;
      const maxGrupo = Number(div.dataset.max);
      const id = nome + "_" + tipoGrupo;

      // ✅ pré-seleciona o primeiro item do primeiro grupo no estado E visualmente
      if (index === 0 && item === primeiroItem) {
        qtdEl.innerText = 1;
        // ✅ força preço 0 no pré-select — o preço do produto já cobre o tamanho base
        acompanhamentosSelecionados.push({ id, nome, preco: 0, qtd: 1, grupo: tipoGrupo });
      }

      plus.addEventListener("click", (e) => {
        e.stopPropagation();

        const totalGrupo = acompanhamentosSelecionados
          .filter(a => a.grupo === tipoGrupo)
          .reduce((s, a) => s + a.qtd, 0);

        if (maxGrupo && totalGrupo >= maxGrupo) {
          alert(`Máximo de ${maxGrupo} opções`);
          return;
        }

        let existente = acompanhamentosSelecionados.find(a => a.id === id);
        if (existente) {
          existente.qtd++;
          // ✅ só o grupo principal tem lógica especial (1º grátis)
          // extras usam o preco do dataset normalmente
          if (tipoGrupo === "principal") {
            const precoReal = Number(state.selectedItem.price);
            existente.preco = existente.qtd > 1 ? precoReal : 0;
          } else {
            existente.preco = preco; // extra: usa preço do dataset
          }
        } else {
          // novo item: principal começa grátis, extra cobra normal
          const precoInicial = tipoGrupo === "principal" ? 0 : preco;
          existente = { id, nome, preco: precoInicial, qtd: 1, grupo: tipoGrupo };
          acompanhamentosSelecionados.push(existente);
        }
        qtdEl.innerText = existente.qtd;
        updateModalTotal();
      });

      minus.addEventListener("click", (e) => {
        e.stopPropagation();
        let existente = acompanhamentosSelecionados.find(a => a.id === id);
        if (!existente) return;

        existente.qtd--;
        if (existente.qtd <= 0) {
          acompanhamentosSelecionados = acompanhamentosSelecionados.filter(a => a.id !== id);
          qtdEl.innerText = 0;
        } else {
          qtdEl.innerText = existente.qtd;
        }
        updateModalTotal();
      });
    }); // ✅ fecha forEach interno

    container.appendChild(div);
  }); // ✅ fecha grupos.forEach

} // ✅ fecha renderAcompanhamentos

function updateModalTotal() {
  if (!state.selectedItem) return;

  let total = Number(state.selectedItem.price) * state.selectedQty;

  acompanhamentosSelecionados.forEach(a => {
    if (a.grupo === "principal") {
      // ✅ grupo principal: só cobra a partir do 2º (qtd - 1)
      const qtdExtra = Math.max(0, a.qtd - 1);
      total += a.preco * qtdExtra * state.selectedQty;
    } else {
      // extras normais: cobra tudo
      total += a.preco * a.qtd * state.selectedQty;
    }
  });

  pdPrice.textContent = brl(total);
  pdTotalBtn.textContent = brl(total);
}

if (pdClose && pdModal) {
  pdClose.addEventListener('click', () => {
    pdModal.setAttribute("aria-hidden", "true");
  });
}

pdPlus?.addEventListener('click', () => { state.selectedQty++; pdQty.textContent = state.selectedQty; updateModalTotal(); });
pdMinus?.addEventListener('click', () => { if (state.selectedQty > 1) { state.selectedQty--; pdQty.textContent = state.selectedQty; updateModalTotal(); } });
pdAddBtn?.addEventListener('click', () => {

  const selecionados = structuredClone(acompanhamentosSelecionados);

  addToCart(
    state.selectedItem,
    state.selectedQty,
    pdObs.value,
    selecionados
  );

  acompanhamentosSelecionados = []; // 🔥 limpa

  pdModal.setAttribute("aria-hidden", "true");
});

// ================= CARRINHO =================
function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
}

function addToCart(item, qty = 1, obs = "", acompanhamentos = []) {

  // 🔒 BLOQUEIO SE ESTIVER ESGOTADO
  if (Number(item.stock) <= 0) {
    alert("Produto esgotado.");
    return;
  }

  // 🔒 EXIGE LOGIN
  if (!state.token || !state.user) {
    pdModal.setAttribute("aria-hidden", "true");
    openAuthModal('login');
    return;
  }

  const temAcomp = acompanhamentos && acompanhamentos.length > 0;
  const existingItem = !temAcomp
    ? state.cart.find(x => x.id === item.id && x.obs === obs && (!x.acompanhamentos || x.acompanhamentos.length === 0))
    : null;

  if (existingItem) {
    existingItem.qty += qty;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      image: item.image_url || item.imageUrl,
      qty: qty,
      obs: obs,
      acompanhamentos
    });
  }

  saveCart();
  updateCartUI();

  if (fb) {
    fb.textContent = "Item adicionado!";
    setTimeout(() => fb.textContent = "", 2000);
  }

  if (floatCartBtn) {
    floatCartBtn.classList.add('anim-pop');
    setTimeout(() => floatCartBtn.classList.remove('anim-pop'), 300);
  }
}

function removeFromCart(index) { state.cart.splice(index, 1); saveCart(); updateCartUI(); }

function changeQty(index, delta) { const item = state.cart[index]; if (!item) return; item.qty += delta; if (item.qty <= 0) state.cart.splice(index, 1); saveCart(); updateCartUI(); }

function cartSubtotal() {
  return state.cart.reduce((total, item) => {

    const precoAcomp = (item.acompanhamentos || []).reduce((s, a) => {
      if (a.grupo === "principal") {
        // ✅ principal: só cobra o excedente (qtd - 1)
        const qtdExtra = Math.max(0, a.qtd - 1);
        return s + (Number(item.price) * qtdExtra);
      } else {
        // extras: cobra tudo normalmente
        return s + (a.preco * a.qtd);
      }
    }, 0);

    const itemTotal = (Number(item.price) + precoAcomp) * item.qty;

    return total + itemTotal;

  }, 0);
}

function updateCartUI() {
  if (!viewFee || !btnFinalize || !cartList) return;

  try {
    if (state.calculatedFee === null) {
      viewFee.innerHTML = "<span style='color:orange'>Calculando…</span>";
      btnFinalize.disabled = true;
    }

    const totalQty = state.cart.reduce((s, i) => s + i.qty, 0);

    if (floatCartBtn && floatCartCount) {
      if (totalQty > 0) {
        floatCartBtn.hidden = false;
        floatCartCount.textContent = totalQty;
      } else {
        floatCartBtn.hidden = true;
      }
    }

    if (cartCount) cartCount.textContent = totalQty;

    cartList.innerHTML = '';

    if (state.cart.length === 0) {
      cartList.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">Vazio</div>';
    } else {
      state.cart.forEach((i, index) => {
        const r = document.createElement('div');
        r.className = 'cart-item-row';

        // ✅ lista de acompanhamentos para exibir
        const acompList = (i.acompanhamentos && i.acompanhamentos.length > 0)
          ? i.acompanhamentos.map(a =>
            `<div style="font-size:11px; color:#6b7280;">• ${a.qtd}x ${a.nome}${a.preco ? ` (+${brl(a.preco * a.qtd)})` : ''}</div>`
          ).join('')
          : '';

        // ✅ preço unitário já com acompanhamentos incluídos
        const precoAcomp = (i.acompanhamentos || []).reduce((s, a) => {
          if (a.grupo === "principal") {
            const qtdExtra = Math.max(0, a.qtd - 1);
            return s + (Number(i.price) * qtdExtra);
          } else {
            return s + (a.preco * a.qtd);
          }
        }, 0);
        const precoUnitario = Number(i.price) + precoAcomp;


        r.innerHTML = `
          <div class="cart-thumb">
            <img src="${i.image}" onerror="this.src='https://placehold.co/100?text=Foto'">
          </div>

          <div class="cart-info">
            <div class="cart-name">${i.name}</div>
            <div class="cart-price-unit">${brl(precoUnitario)} cada</div>
            ${acompList}
            ${i.obs ? `<div style="font-size:11px; color:#fbbf24;">📝 ${i.obs}</div>` : ''}
          </div>

          <div class="cart-controls">
            <button class="qty-btn" data-action="dec" data-idx="${index}">-</button>
            <span class="qty-val">${i.qty}</span>
            <button class="qty-btn" data-action="inc" data-idx="${index}">+</button>
          </div>

          <button class="cart-remove-btn" data-action="rm" data-idx="${index}">&times;</button>
        `;

        r.querySelector('[data-action="inc"]').onclick = () => changeQty(index, 1);
        r.querySelector('[data-action="dec"]').onclick = () => changeQty(index, -1);
        r.querySelector('[data-action="rm"]').onclick = () => removeFromCart(index);

        cartList.appendChild(r);
      });
    }

    const isPickup = fulfillPickup && fulfillPickup.checked;
    const sub = cartSubtotal();
    const distText = state.distanceKm > 0 ? `(${state.distanceKm.toFixed(1)} km)` : "";

    let feeDisplay = "";
    let finalFee = 0;

    if (isPickup) {
      feeDisplay = "Grátis (Retirada)";
      finalFee = 0;
      btnFinalize.disabled = false;

    } else if (state.calculatedFee === -1) {
      feeDisplay = `<span style="color:red">Muito longe ${distText}</span>`;
      finalFee = 0;
      btnFinalize.disabled = true;

    } else {
      finalFee = state.calculatedFee || 0;
      feeDisplay = finalFee === 0 ? `Grátis ${distText}` : `${brl(finalFee)} ${distText}`;
      btnFinalize.disabled = false;
    }

    if (viewSubtotal) viewSubtotal.textContent = brl(sub);
    if (viewFee) viewFee.innerHTML = feeDisplay;
    if (viewGrandTotal) viewGrandTotal.textContent = brl(sub + finalFee);

  } catch (err) {
    console.error("Erro no updateCartUI:", err);
  }
}

if (floatCartBtn) floatCartBtn.addEventListener('click', () => { drawer.setAttribute('aria-hidden', 'false'); loadSavedUserData(); });
document.addEventListener('click', function (e) {
  if (e.target.id === 'close-cart' || e.target.closest('#close-cart')) { drawer.setAttribute('aria-hidden', 'true'); }
  if (e.target === drawer) { drawer.setAttribute('aria-hidden', 'true'); }
  if (e.target.id === 'open-cart' || e.target.closest('#open-cart')) { drawer.setAttribute('aria-hidden', 'false'); loadSavedUserData(); }
});

// ================= CHECKOUT (COM SEGURANÇA SÊNIOR) =================
orderForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  fb.textContent = '';

  const fulfillment = fulfillPickup && fulfillPickup.checked ? 'pickup' : 'delivery';

  // ====== 🛡️ CAMADA DE SEGURANÇA DO FRETE (SÊNIOR) ======
  if (fulfillment === 'delivery') {
    // 1. Validação básica de input
    if (!inputAddress.value.trim()) {
      fb.textContent = "Preencha o endereço.";
      inputAddress.focus();
      return;
    }

    // 2. Trava de Segurança: Se não calculou (null) ou deu erro (-1), forçamos agora!
    if (state.calculatedFee === null || state.calculatedFee === -1) {
      const btnSubmit = orderForm.querySelector('button[type="submit"]');
      const originalText = btnSubmit ? btnSubmit.innerText : 'Finalizar';

      if (btnSubmit) {
        btnSubmit.innerText = "Calculando frete...";
        btnSubmit.disabled = true;
      }

      try {
        console.log("🛡️ Checkout: Forçando cálculo de frete...");
        // AWAIT IMPORTANTE: Espera o cálculo terminar antes de seguir
        await tryCalculateByText();

        // Verifica se o cálculo funcionou (state deve ter mudado)
        if (state.calculatedFee === null || state.calculatedFee === -1) {
          throw new Error("Não foi possível calcular a rota para este endereço.");
        }
      } catch (err) {
        console.error("Erro fatal no checkout:", err);
        fb.textContent = "Não conseguimos calcular a entrega. Verifique o número e o bairro.";
        if (btnSubmit) {
          btnSubmit.innerText = originalText;
          btnSubmit.disabled = false;
        }
        return; // ⛔ PARA TUDO: Não deixa enviar o pedido
      }

      // Restaura o botão
      if (btnSubmit) {
        btnSubmit.innerText = originalText;
        btnSubmit.disabled = false;
      }
    }
  }
  // ========================================================

  if (!state.user || !state.token) {
    openAuthModal('login');
    return;
  }

  if (state.cart.length === 0) {
    fb.textContent = 'Carrinho vazio.';
    return;
  }

  if (!state.isStoreOpen && (!orderSchedule || !orderSchedule.value)) {
    fb.textContent = "Loja fechada! Agende um horário.";
    return;
  }

  const paymentEl = document.querySelector('input[name="payment"]:checked');
  if (!paymentEl) {
    fb.textContent = "Selecione o pagamento";
    return;
  }

  const selectedPayment = paymentEl.value;
  let changeData = null;

  if (selectedPayment === 'Dinheiro' && checkNeedChange.checked) {
    if (!inputChangeAmount.value) {
      fb.textContent = 'Informe o troco.';
      return;
    }
    changeData = `Troco para R$ ${inputChangeAmount.value}`;
  }

  if (fulfillment === 'delivery') {
    localStorage.setItem('lastAddress', inputAddress.value);
    localStorage.setItem('lastNeighborhood', inputNeighborhood.value);
  }

  const customer = {
    id: state.user.id,
    name: inputName.value || state.user.name,
    phone: inputPhone.value || state.user.phone,
    address: fulfillment === 'pickup' ? 'Retirada na Loja' : inputAddress.value,
    neighborhood: fulfillment === 'pickup' ? '' : inputNeighborhood.value,
    reference: inputReference ? inputReference.value : '',
    email: inputEmail ? inputEmail.value : '',
    paymentMethod: selectedPayment,
    change: changeData,
    scheduledTo: (!state.isStoreOpen) ? orderSchedule.value : null
  };

  const order = {
    items: state.cart.map(i => ({
      itemId: i.id,
      name: i.name,
      qty: i.qty,
      price: +i.price,
      obs: i.obs,
      image: i.image,
      acompanhamentos: i.acompanhamentos || [] // ✅ inclui acompanhamentos no pedido
    })),
    subtotal: cartSubtotal(),
    deliveryFee: fulfillment === 'pickup' ? 0 : state.calculatedFee,
    discount: 0,
    total: cartSubtotal() + (fulfillment === 'pickup' ? 0 : state.calculatedFee),
    neighborhood: customer.neighborhood,
    customer: customer,
    fulfillment: fulfillment,
    paymentMethod: selectedPayment,
    change: changeData,
    user_id: state.user.id,
    distance_km: state.distanceKm || 0
  };

  try {
    const createdOrder = await apiSend('/orders', 'POST', order);
    state.cart = []; saveCart(); orderForm.reset(); drawer.setAttribute('aria-hidden', 'true'); updateCartUI();
    if (createdOrder.pixData) localStorage.setItem('lastPixData', JSON.stringify(createdOrder.pixData));
    startTracking(createdOrder.id);
    if (createdOrder.pixData) showPixModal(createdOrder.pixData);
  } catch (err) { console.error(err); fb.textContent = 'Erro: ' + err.message; }
});

// ================= RASTREAMENTO =================
function startTracking(id) {
  state.currentOrderId = id; localStorage.setItem('lastOrderId', id);
  if (state.trackingInterval) clearInterval(state.trackingInterval);
  checkStatus();
  state.trackingInterval = setInterval(checkStatus, 5000);
}

const checkStatus = async () => {
  if (!state.currentOrderId) return;
  try {
    const o = await apiGet(`/orders/${state.currentOrderId}`);
    state.activeOrderData = o;
    if (o.status === 'aguardando_pagamento') {
      const deadline = new Date(o.created_at).getTime() + (15 * 60 * 1000);
      if (!state.pixTimerInterval) startPixVisualTimer(deadline, o.id);
      if (trackingModal.getAttribute('aria-hidden') === 'false') trackingModal.setAttribute('aria-hidden', 'true');
      return;
    }
    if (state.pixTimerInterval) { clearInterval(state.pixTimerInterval); state.pixTimerInterval = null; }
    updateTrackUI(o);
    if (o.status === 'entregue' || o.status === 'cancelado') {
      stopTracking();
      setTimeout(() => { trackingModal.setAttribute('aria-hidden', 'true'); trackingBubble.style.display = 'none'; }, 10000);
    }
  } catch (e) { if (e.message && e.message.includes('404')) stopTracking(); }
};

function updateTrackUI(order) {
  if (!trackingBubble) return;
  trackingBubble.style.setProperty('display', 'flex', 'important');
  const s = order.status;
  let m = '...', i = '🕒', pw = "0%";
  if (stepNovo) $$('.step').forEach(e => e.classList.remove('active'));

  if (s === 'novo') { if (stepNovo) stepNovo.classList.add('active'); m = 'Recebido'; i = '✅'; pw = "10%"; }
  else if (s === 'em_preparo') { if (stepNovo) stepNovo.classList.add('active'); if (stepPreparo) stepPreparo.classList.add('active'); m = 'Preparando'; i = '🔥'; pw = "40%"; }
  else if (s === 'saiu_entrega') { if (stepNovo) stepNovo.classList.add('active'); if (stepPreparo) stepPreparo.classList.add('active'); if (stepSaiu) stepSaiu.classList.add('active'); m = 'Saiu!'; i = '🛵'; pw = "70%"; }
  else if (s === 'entregue') { if (stepNovo) $$('.step').forEach(e => e.classList.add('active')); m = 'Entregue'; i = '🏠'; pw = "100%"; }
  else if (s === 'cancelado') { m = 'Cancelado'; i = '❌'; pw = "0%"; trackingBubble.style.background = '#EF4444'; }
  else { trackingBubble.style.background = '#10B981'; }

  trackingBubble.innerHTML = `<span style="font-size:20px;">${i}</span>`;
  if (trackId) trackId.textContent = order.id;
  if (trackMsg) trackMsg.textContent = m;
  if (timelineProgress) timelineProgress.style.width = pw;

  // 🔽 RESUMO ITENS
  const itemsList = document.getElementById("track-items-list");
  if (itemsList && order.items) {
    itemsList.innerHTML = order.items.map(i => {
      const obs = i.obs
        ? `<div style="font-size:12px; color:#d62300;">⚠️ ${i.obs}</div>`
        : "";

      const acompList = (i.acompanhamentos && i.acompanhamentos.length > 0)
        ? i.acompanhamentos.map(a =>
          `<div style="font-size:11px; color:#6b7280;">• ${a.qtd}x ${a.nome}${a.preco ? ` (+${brl(a.preco * a.qtd)})` : ''}</div>`
        ).join('')
        : "";

      const precoAcomp = (i.acompanhamentos || []).reduce((s, a) => {
        if (a.grupo === "principal") {
          const qtdExtra = Math.max(0, a.qtd - 1);
          return s + (Number(i.price) * qtdExtra);
        } else {
          return s + (a.preco * a.qtd);
        }
      }, 0);
      const precoTotal = (Number(i.price) + precoAcomp) * i.qty;

      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <strong>${i.qty}x</strong> ${i.name}
            ${acompList}
            ${obs}
          </div>
          <div style="white-space:nowrap;">${brl(precoTotal)}</div>
        </div>
      `;
    }).join("");
  }
  // 🔼 FIM RESUMO

  if (trackTotalEl) {
    const subtotal = order.total - (order.delivery_fee || 0);
    trackTotalEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:13px; color:#6b7280; margin-bottom:4px;">
        <span>Subtotal</span><span>${brl(subtotal)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:13px; color:#6b7280; margin-bottom:4px;">
        <span>Frete</span><span>${order.delivery_fee > 0 ? brl(order.delivery_fee) : 'Grátis'}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:700; color:#d62300; margin-top:8px; border-top:1px solid #eee; padding-top:8px;">
        <span>Total</span><span>${brl(order.total)}</span>
      </div>
    `;
  }
  if (btnTrackWa) btnTrackWa.href = `https://wa.me/5584996065229?text=${encodeURIComponent(`Olá, sobre meu pedido #${order.id}...`)}`;
  if (btnCancelOrder) {
    btnCancelOrder.style.display = (s === 'novo' || s === 'agendado') ? 'block' : 'none';
    btnCancelOrder.onclick = () => cancelMyOrder(order.id);
  }
}

trackingBubble?.addEventListener('click', () => {
  // Se ainda está aguardando pagamento, abre o Pix
  if (
    state.activeOrderData &&
    state.activeOrderData.status === 'aguardando_pagamento'
  ) {
    let pixData = state.activeOrderData.pixData;
    if (!pixData) {
      const backup = localStorage.getItem('lastPixData');
      if (backup) pixData = JSON.parse(backup);
    }
    if (pixData) showPixModal(pixData);
  } else {
    // Caso contrário, abre o rastreio normal
    trackingModal.setAttribute('aria-hidden', 'false');
  }
});

tmClose?.addEventListener('click', () => trackingModal.setAttribute('aria-hidden', 'true'));

function startPixVisualTimer(deadline, orderId) {
  updatePixTick(deadline, orderId);
  state.pixTimerInterval = setInterval(() => { updatePixTick(deadline, orderId); }, 1000);
}

function updatePixTick(deadline, orderId) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) { clearInterval(state.pixTimerInterval); state.pixTimerInterval = null; stopTracking(); alert("Pix expirou."); }
  else {
    if (trackingBubble) {
      trackingBubble.style.setProperty('display', 'flex', 'important');
      trackingBubble.style.background = '#EF4444';
      const min = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000);
      trackingBubble.innerHTML = `<div style="text-align:center;line-height:1.1"><small style="color:white;font-weight:bold;">Pagar Pix</small><br><strong style="color:white;">${min}:${sec < 10 ? '0' : ''}${sec}</strong></div>`;
    }
  }
}

/* ========================================================= */
/* NOVA FUNÇÃO DE MODAL PIX (LAYOUT PROFISSIONAL)            */
/* ========================================================= */
function showPixModal(pixData) {
  // 1. Remove se já existir algum aberto para não duplicar
  const existing = document.getElementById('modal-pix-modern');
  if (existing) existing.remove();

  state.pixModalOpen = true;

  // 2. Cria o elemento container (Fundo escuro)
  const overlay = document.createElement('div');
  overlay.id = 'modal-pix-modern';
  overlay.className = 'pix-overlay'; // Usa a classe do CSS novo

  // 3. Monta o HTML Moderno
  overlay.innerHTML = `
    <div class="pix-card">
      <button id="btn-close-pix" class="pix-close-btn">&times;</button>
      
      <div style="margin-top: 10px;">
        <img src="https://logospng.org/download/pix/logo-pix-icone-512.png" width="40" style="margin-bottom:10px;">
        <h3 class="pix-title">Pagamento via Pix</h3>
        <p class="pix-subtitle">Escaneie o QR Code ou copie o código abaixo</p>
      </div>

      <div class="pix-qr-container">
        <img src="data:image/png;base64,${pixData.qr_base64}" class="pix-qr-img" alt="QR Code Pix">
      </div>

      <div class="pix-copy-area">
        <span class="pix-code-text">${pixData.qr_code}</span>
        <span style="font-size:18px;">📋</span>
      </div>

      <textarea id="pix-hidden-input" style="position:absolute; left:-9999px;">${pixData.qr_code}</textarea>

      <button id="btn-copy-pix" class="pix-btn-copy">
        COPIAR CÓDIGO PIX
      </button>

      <p style="font-size:12px; color:#9ca3af; margin-top:15px;">
        Após pagar, o pedido atualiza automaticamente.
      </p>
    </div>
  `;

  document.body.appendChild(overlay);

  // --- EVENTOS DOS BOTÕES ---

  // A. Fechar Modal
  const closeBtn = overlay.querySelector('#btn-close-pix');
  closeBtn.onclick = () => {
    state.pixModalOpen = false;
    state.pixManuallyClosed = true;
    overlay.style.opacity = '0'; // Efeito visual de sumir
    setTimeout(() => overlay.remove(), 300);
  };

  // B. Copiar Código
  const copyBtn = overlay.querySelector('#btn-copy-pix');
  copyBtn.onclick = () => {
    const hiddenInput = overlay.querySelector('#pix-hidden-input');
    hiddenInput.select();

    // Tenta copiar de forma moderna, se falhar usa o método antigo
    navigator.clipboard.writeText(pixData.qr_code)
      .then(() => feedbackCopy())
      .catch(() => {
        document.execCommand('copy');
        feedbackCopy();
      });

    // Função para mudar a cor do botão avisando que copiou
    function feedbackCopy() {
      const originalText = copyBtn.innerText;
      copyBtn.innerText = "CÓDIGO COPIADO! ✅";
      copyBtn.style.backgroundColor = "#059669"; // Verde mais escuro

      setTimeout(() => {
        copyBtn.innerText = originalText;
        copyBtn.style.backgroundColor = "#10b981"; // Volta ao normal
      }, 2000);
    }
  };
}

async function cancelMyOrder(id) { if (!confirm("Cancelar?")) return; try { await apiSend(`/orders/${id}/cancel`, 'PATCH', {}); alert("Cancelado."); stopTracking(); checkStatus(); } catch (err) { alert(err.message); } }

function stopTracking() {
  if (state.trackingInterval) clearInterval(state.trackingInterval);
  state.trackingInterval = null;

  if (state.pixTimerInterval) {
    clearInterval(state.pixTimerInterval);
    state.pixTimerInterval = null;
  }

  state.currentOrderId = null;
  localStorage.removeItem('lastOrderId');

  // ❗️ SÓ some a bolinha se NÃO estiver em Pix ativo
  if (
    trackingBubble &&
    !(state.activeOrderData?.status === 'aguardando_pagamento')
  ) {
    trackingBubble.style.display = 'none';
  }

  if (trackingModal) trackingModal.setAttribute('aria-hidden', 'true');
}



// ================= RECUPERAÇÃO DE SENHA (LINK MÁGICO) =================

btnSendCode?.addEventListener('click', async () => {
  const phone = recPhoneInput.value.trim();
  if (!phone) { recFb.style.color = 'red'; recFb.textContent = "Informe seu WhatsApp."; return; }

  recFb.style.color = '#666';
  recFb.textContent = "Enviando código...";

  try {
    await apiSend('/auth/send-code', 'POST', { phone });
    recFb.style.color = 'green';
    recFb.textContent = "Código enviado para seu e-mail!";

    const step1 = document.getElementById('rec-step-1');
    const step2 = document.getElementById('rec-step-2');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';

  } catch (err) {
    console.error("ERRO:", err); // ✅ adicione isso
    recFb.style.color = 'red';
    recFb.textContent = err.message || "Erro ao enviar código.";
  }
});



// ================= AUTH =================
function setAuthMode(mode) {
  formLogin.style.display = 'none'; formSignup.style.display = 'none'; recFlow.style.display = 'none'; authTabs.style.display = 'flex'; authTitle.textContent = "Acesse sua conta";
  if (mode === 'login') { formLogin.style.display = 'block'; $('#tab-login').classList.add('primary'); $('#tab-signup').classList.remove('primary'); }
  else if (mode === 'signup') { formSignup.style.display = 'block'; $('#tab-signup').classList.add('primary'); $('#tab-login').classList.remove('primary'); }
  else if (mode === 'recovery') {
    authTabs.style.display = 'none';
    authTitle.textContent = "Recuperar Senha";
    recFlow.style.display = 'block';
    recStep1.style.display = 'block';
    const recStep2 = document.getElementById('rec-step-2');
    if (recStep2) recStep2.style.display = 'none';
    recFb.textContent = '';
  }
}

function openAuthModal(t = 'login') { authModal.setAttribute('aria-hidden', 'false'); setAuthMode(t); }

$('#tab-login')?.addEventListener('click', () => setAuthMode('login'));
$('#tab-signup')?.addEventListener('click', () => setAuthMode('signup'));
btnForgot?.addEventListener('click', () => setAuthMode('recovery'));
btnBackAuth?.addEventListener('click', () => setAuthMode('login'));
amClose?.addEventListener('click', () => authModal.setAttribute('aria-hidden', 'true'));

formLogin?.addEventListener('submit', async (e) => { e.preventDefault(); loginFb.textContent = 'Entrando...'; try { const cleanPhone = loginPhone.value.replace(/\D/g, ''); const r = await apiSend('/auth/login', 'POST', { phone: cleanPhone, password: loginPass.value }); setToken(r.token); setUser(r.user); authModal.setAttribute('aria-hidden', 'true'); loadData(); } catch (err) { loginFb.textContent = err.message; } });
formSignup?.addEventListener('submit', async (e) => { e.preventDefault(); suFb.textContent = 'Cadastrando...'; try { const cleanPhone = suPhone.value.replace(/\D/g, ''); const r = await apiSend('/auth/register', 'POST', { name: suName.value, phone: cleanPhone, email: suEmail.value, password: suPass.value }); setToken(r.token); setUser(r.user); authModal.setAttribute('aria-hidden', 'true'); loadData(); } catch (err) { suFb.textContent = err.message; } });

// ================= LOADER (CORREÇÃO DE UX: CÁLCULO AUTOMÁTICO) =================
async function loadData() {
  await tryLoadMe();
  if (localStorage.getItem('lastOrderId')) startTracking(localStorage.getItem('lastOrderId'));

  try {
    const s = await apiGet("/settings");
    state.storeConfig = s;
    if (s.mode === 'force_closed') {
      state.isStoreOpen = false;
      if (fb) fb.textContent = "Fechado temporariamente.";
    }
  } catch (e) { }

  try {
    // 1. Tenta carregar do cache primeiro (instantâneo)
    const cachedMenu = localStorage.getItem('menuCache');

    if (cachedMenu) {
      const parsed = JSON.parse(cachedMenu);
      state.categories = parsed.categories || [];
      state.subcategories = parsed.subcategories || [];
      state.items = parsed.items || [];
      renderFilters();
      renderItems();
    }

    // 2. Atualiza em background
    const [c, s, i] = await Promise.all([
      apiGet('/categories'),
      apiGet('/subcategories'),
      apiGet('/items')
    ]);

    state.categories = c || [];
    state.subcategories = s || [];
    state.items = i || [];

    // salva no cache
    localStorage.setItem('menuCache', JSON.stringify({
      categories: state.categories,
      subcategories: state.subcategories,
      items: state.items
    }));

    renderFilters();
    renderItems();

  } catch (err) {
    console.error("Erro menu", err);
  }

  updateCartUI();
  loadSavedUserData();
  initCarousel();
}

function loadSavedUserData() { if (state.user) return; const savedAddress = localStorage.getItem('lastAddress'); const savedNeighborhood = localStorage.getItem('lastNeighborhood'); if (savedAddress && inputAddress) inputAddress.value = savedAddress; if (savedNeighborhood && inputNeighborhood) inputNeighborhood.value = savedNeighborhood; }
async function tryLoadMe() { if (!state.token) return; try { const me = await apiGet('/auth/me'); setUser(me); } catch { setToken(''); setUser(null); } }

// 📍 CORREÇÃO UX: SE O USUÁRIO JÁ TEM ENDEREÇO, CALCULA LOGO
function setUser(u) {
  state.user = u || null;
  if (u) {
    if (btnProfile) btnProfile.textContent = `Olá, ${u.name.split(' ')[0]}`;
    if (inputName) inputName.value = u.name || '';
    if (inputPhone) inputPhone.value = u.phone || '';
    if (inputEmail) inputEmail.value = u.email || '';

    // ✅ preenche também os campos do modal "Meus Dados"
    if (setName) setName.value = u.name || '';
    if (setPhone) setPhone.value = u.phone || '';
    if (setEmail) setEmail.value = u.email || '';

    // 👉 AQUI A MÁGICA: Se veio endereço do banco ou cache, calcula AGORA.
    if (inputAddress.value) {
      console.log("📍 Usuário logado: Forçando cálculo inicial de frete...");
      waitForGoogleMaps(() => tryCalculateByText());
    }

  } else {
    if (btnProfile) btnProfile.textContent = '👤 Perfil';
  }
}

function setToken(t) { state.token = t || ''; if (t) localStorage.setItem('token', t); else localStorage.removeItem('token'); }

btnProfile?.addEventListener('click', (e) => { e.stopPropagation(); if (state.user) { const isHidden = profileMenu.getAttribute('aria-hidden') === 'true'; profileMenu.setAttribute('aria-hidden', isHidden ? 'false' : 'true'); } else { openAuthModal('login'); } });

// FECHAR MENU AO CLICAR FORA DELE
document.addEventListener('click', (e) => {
  if (!profileMenu) return;

  const isOpen = profileMenu.getAttribute('aria-hidden') === 'false';

  // Se estiver aberto e o clique NÃO foi no botão nem dentro do menu → fecha
  if (
    isOpen &&
    !profileMenu.contains(e.target) &&
    e.target !== btnProfile &&
    !e.target.closest('#edit-profile')
  ) {
    profileMenu.setAttribute('aria-hidden', 'true');
  }
});

pmLogout?.addEventListener('click', () => { setToken(''); setUser(null); window.location.reload(); });

function initCarousel() {
  if (!carouselTrack || slides.length === 0) return;
  let currentSlide = 0;
  const totalSlides = slides.length;
  const updateSlide = () => { carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`; dots.forEach((dot, index) => { dot.classList.toggle('active', index === currentSlide); }); };
  const nextSlide = () => { currentSlide = (currentSlide + 1) % totalSlides; updateSlide(); };
  const prevSlide = () => { currentSlide = (currentSlide - 1 + totalSlides) % totalSlides; updateSlide(); };
  nextBtn?.addEventListener('click', nextSlide);
  prevBtn?.addEventListener('click', prevSlide);
  setInterval(nextSlide, 5000);
}

// ================= MEUS PEDIDOS (HISTÓRICO) =================
pmHistory?.addEventListener('click', async () => {
  if (!state.user) {
    openAuthModal('login');
    return;
  }

  profileMenu.setAttribute('aria-hidden', 'true');
  historyModal.setAttribute('aria-hidden', 'false');
  historyList.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Carregando pedidos... 🔄</div>';

  try {
    const orders = await apiGet('/orders/me');

    if (!orders || orders.length === 0) {
      historyList.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Você ainda não fez pedidos. 🍔</div>';
      return;
    }

    historyList.innerHTML = '';

    orders.forEach(order => {
      const date = new Date(order.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const statusMap = {
        'novo': '🟡 Recebido',
        'aguardando_pagamento': '⏳ Aguardando Pix',
        'em_preparo': '🔥 Preparando',
        'saiu_entrega': '🛵 Saiu para Entrega',
        'entregue': '✅ Entregue',
        'cancelado': '❌ Cancelado'
      };

      const statusLabel = statusMap[order.status] || order.status;
      const statusColor =
        order.status === 'cancelado'
          ? '#ef4444'
          : order.status === 'entregue'
            ? '#10b981'
            : '#f59e0b';

      const div = document.createElement('div');
      div.className = 'history-card';

      div.innerHTML = `
        <div class="history-header"
          style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:5px;">
          <strong>Pedido #${order.id}</strong>
          <span style="font-size:12px; color:#666;">${date}</span>
        </div>

        <div style="font-size:13px; color:#444; margin-bottom:10px;">
          ${order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="background:${statusColor}; color:white; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold;">
            ${statusLabel}
          </span>
          <strong style="color:var(--primary);">${brl(order.total)}</strong>
        </div>

        ${order.status === 'aguardando_pagamento'
          ? `<button class="btn block"
              style="margin-top:10px; font-size:12px; height:auto; padding:8px;"
              onclick="window.location.reload()">
              Pagar Agora (Ver Rastreio)
            </button>`
          : ''
        }
      `;

      historyList.appendChild(div);
    });

  } catch (err) {
    historyList.innerHTML = `<div style="color:red; text-align:center;">Erro ao carregar: ${err.message}</div>`;
  }
});

hmClose?.addEventListener('click', () => {
  historyModal.setAttribute('aria-hidden', 'true');
});


// ================= CONFIGURAÇÕES (MEUS DADOS) =================
pmSettings?.addEventListener('click', async () => {
  if (!state.user) {
    openAuthModal('login');
    return;
  }

  const btnSave = formSettings.querySelector('button[type="submit"]');
  const originalText = btnSave.textContent;
  btnSave.textContent = "Carregando...";
  btnSave.disabled = true;

  profileMenu.setAttribute('aria-hidden', 'true');
  settingsModal.setAttribute('aria-hidden', 'false');

  try {
    const freshUser = await apiGet('/auth/me');
    setUser(freshUser);
  } catch (err) {
    console.error("Erro ao carregar perfil fresco:", err);
    // Fallback
    if (setName) setName.value = state.user.name || '';
    if (setPhone) setPhone.value = state.user.phone || '';
    if (setEmail) setEmail.value = state.user.email || '';
  } finally {
    if (setPass) setPass.value = '';
    if (settingsFb) settingsFb.textContent = '';
    btnSave.textContent = originalText;
    btnSave.disabled = false;
  }
});

formSettings?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = formSettings.querySelector('button[type="submit"]');
  const originalText = btn.textContent;

  btn.textContent = "Salvando...";
  btn.disabled = true;
  if (settingsFb) settingsFb.textContent = '';

  try {
    const payload = {
      name: setName.value,
      phone: setPhone.value,
      email: setEmail.value,
      password: setPass.value
    };

    const res = await apiSend('/auth/update', 'PATCH', payload);

    if (res.success) {
      alert("✅ Dados atualizados com sucesso!");

      state.user = res.user;

      if (res.token) {
        localStorage.setItem('token', res.token);
        state.token = res.token;
      }

      setUser(res.user);
      settingsModal.setAttribute('aria-hidden', 'true');
    }

  } catch (err) {
    if (settingsFb) {
      settingsFb.style.color = 'red';
      settingsFb.textContent = err.message || "Erro ao atualizar.";
    }
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

smClose?.addEventListener('click', () => settingsModal.setAttribute('aria-hidden', 'true'));

const searchInput = document.getElementById('search');

searchInput?.addEventListener('input', debounce(() => {
  state.filters.q = searchInput.value;
  renderItems();
}, 300));

/* =====================================
   LOGOUT MOBILE CORRIGIDO DEFINITIVO
===================================== */

const pmMobileLogout = document.getElementById('pm-mobile-logout');

pmMobileLogout?.addEventListener('click', () => {

  // limpa token
  localStorage.removeItem('token');
  state.token = '';

  // limpa usuário
  state.user = null;

  // limpa carrinho
  localStorage.removeItem('cart');
  state.cart = [];

  // fecha modal
  const mobileModal = document.getElementById('profile-mobile-modal');
  if (mobileModal) {
    mobileModal.setAttribute('aria-hidden', 'true');
  }

  // atualiza botão perfil
  if (btnProfile) {
    btnProfile.textContent = '👤 Perfil';
  }

  // recarrega página
  window.location.reload();
});



// 🔥 DEIXA GLOBAL PARA O HTML ENXERGAR
window.openAuthModal = openAuthModal;
window.state = state;
window.apiGet = apiGet;

window.addEventListener('DOMContentLoaded', () => {

  // Carrega tudo
  loadData();

  // Fecha modal de produto
  const modal = document.getElementById("product-details-modal");
  if (modal) modal.setAttribute("aria-hidden", "true");

  // Botão confirmar código de recuperação de senha
  document.getElementById('btn-confirm-code')?.addEventListener('click', async () => {
    const phone = recPhoneInput?.value?.trim();
    const codigo = document.getElementById('rec-code-input')?.value?.trim();
    const newPassword = document.getElementById('rec-new-password')?.value?.trim();

    if (!codigo || !newPassword) {
      if (recFb) { recFb.style.color = 'red'; recFb.textContent = "Preencha todos os campos."; }
      return;
    }
    if (newPassword.length < 6) {
      if (recFb) { recFb.style.color = 'red'; recFb.textContent = "Senha deve ter no mínimo 6 caracteres."; }
      return;
    }

    const btn = document.getElementById('btn-confirm-code');
    const originalText = btn.textContent;
    btn.textContent = "Verificando...";
    btn.disabled = true;

    try {
      await apiSend('/auth/verify-code', 'POST', { phone, codigo, newPassword });
      if (recFb) { recFb.style.color = 'green'; recFb.textContent = "✅ Senha alterada! Faça login."; }
      setTimeout(() => setAuthMode('login'), 2000);
    } catch (err) {
      if (recFb) { recFb.style.color = 'red'; recFb.textContent = err.message || "Código incorreto ou expirado."; }
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

});
