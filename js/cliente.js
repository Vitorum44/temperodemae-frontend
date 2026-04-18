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
  cart: [],
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


// ================= CACHE DE ENDEREÇOS =================
const ADDRESS_CACHE_KEY = 'addressCache';

function getAddressCache() {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_CACHE_KEY) || '{}');
  } catch { return {}; }
}

function saveAddressCache(address, distanceKm, fee) {
  const cache = getAddressCache();
  const key = address.toLowerCase().trim();
  cache[key] = { distanceKm, fee, savedAt: Date.now() };
  // Mantém só os últimos 10 endereços
  const keys = Object.keys(cache);
  if (keys.length > 10) delete cache[keys[0]];
  localStorage.setItem(ADDRESS_CACHE_KEY, JSON.stringify(cache));
}

function checkAddressCache(address) {
  const cache = getAddressCache();
  const key = address.toLowerCase().trim();
  const entry = cache[key];
  // Cache válido por 30 dias
  if (entry && (Date.now() - entry.savedAt) < 30 * 24 * 60 * 60 * 1000) {
    return entry;
  }
  return null;
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

/// ================= AUTOCOMPLETE GOOGLE PLACES (RUA) =================
function initGoogleAutocomplete() {
  if (!window.google || !google.maps || !google.maps.places || !inputAddress) return;

  const autocomplete = new google.maps.places.Autocomplete(inputAddress, {
    componentRestrictions: { country: 'br' },
    fields: ['address_components', 'geometry', 'formatted_address'],
    types: ['address']
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.geometry) return;

    let street = '';
    let number = '';
    let neighborhood = '';
    let postalCode = '';
    let city = '';
    let stateShort = '';

    place.address_components.forEach(c => {
      if (c.types.includes('route')) street = c.long_name;
      if (c.types.includes('street_number')) number = c.long_name;
      if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')) neighborhood = c.long_name;
      if (c.types.includes('postal_code')) postalCode = c.long_name;
      if (c.types.includes('administrative_area_level_2')) city = c.long_name;
      if (c.types.includes('administrative_area_level_1')) stateShort = c.short_name;
    });

    const typedValue = inputAddress.value;
    const typedNumberMatch = typedValue.match(/,\s*(\d+)/);
    const typedNumber = typedNumberMatch ? typedNumberMatch[1] : '';
    const finalNumber = number || typedNumber;

    // Preenche rua + número
    inputAddress.value = `${street}${finalNumber ? ', ' + finalNumber : ''}`;

    // Preenche bairro automaticamente
    if (inputNeighborhood && neighborhood) {
      inputNeighborhood.value = neighborhood;
    }

    // Feedback com endereço completo + CEP
    const feedbackEl = document.getElementById('neighborhood-feedback');
    if (feedbackEl && (neighborhood || postalCode)) {
      feedbackEl.innerHTML = `
        <span style="color:#10b981; font-size:12px;">
          ✅ ${neighborhood ? neighborhood + ', ' : ''}${city}${stateShort ? ' - ' + stateShort : ''}
          ${postalCode ? `<span style="color:#6b7280;"> · CEP: ${postalCode}</span>` : ''}
        </span>`;
    }

    // Avisa se não veio número
    if (!finalNumber) {
      if (fb) {
        fb.style.color = '#d62300';
        fb.textContent = "⚠️ Endereço sem número. Adicione o número da casa.";
      }
      inputAddress.style.borderColor = '#d62300';
    } else {
      inputAddress.style.borderColor = '';
      if (fb && fb.textContent.includes('número')) fb.textContent = '';
    }

    waitForGoogleMaps(() => {
      calcShip(
        place.geometry.location.lat(),
        place.geometry.location.lng()
      );
    });
  });
}

// ================= AUTOCOMPLETE NO CAMPO BAIRRO =================
function initNeighborhoodAutocomplete() {
  if (!window.google || !google.maps || !google.maps.places || !inputNeighborhood) return;

  const autocompleteNeighborhood = new google.maps.places.Autocomplete(inputNeighborhood, {
  componentRestrictions: { country: 'br' },
  fields: ['address_components', 'geometry', 'formatted_address'],
  types: ['geocode']  // ← geocode mostra bairros, cidades, regiões
});

  // 🔥 Quando o cliente começa a digitar no bairro,
  // injeta a rua+número já digitada para refinar a busca
  inputNeighborhood.addEventListener('input', () => {
    const rua = inputAddress?.value?.trim();
    if (rua && rua.length > 3) {
      // Atualiza o bounds para priorizar resultados perto do restaurante
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(RESTAURANT_LOCATION.lat - 0.1, RESTAURANT_LOCATION.lng - 0.1),
        new google.maps.LatLng(RESTAURANT_LOCATION.lat + 0.1, RESTAURANT_LOCATION.lng + 0.1)
      );
      autocompleteNeighborhood.setBounds(bounds);
    }
  });

  autocompleteNeighborhood.addListener('place_changed', () => {
    const place = autocompleteNeighborhood.getPlace();
    if (!place || !place.address_components) return;

    let street = '';
    let number = '';
    let neighborhood = '';
    let postalCode = '';
    let city = '';
    let stateShort = '';

    place.address_components.forEach(c => {
      if (c.types.includes('route')) street = c.long_name;
      if (c.types.includes('street_number')) number = c.long_name;
      if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')) neighborhood = c.long_name;
      if (c.types.includes('postal_code')) postalCode = c.long_name;
      if (c.types.includes('administrative_area_level_2')) city = c.long_name;
      if (c.types.includes('administrative_area_level_1')) stateShort = c.short_name;
    });

    // ✅ Corrige/confirma a rua e número no campo de cima
    if (street) {
      const enderecoCompleto = `${street}${number ? ', ' + number : ''}`;
      if (inputAddress) inputAddress.value = enderecoCompleto;
      inputAddress.style.borderColor = '#10b981'; // verde = confirmado
    }

    // ✅ Preenche o bairro limpo
    if (neighborhood) {
      inputNeighborhood.value = neighborhood;
    }

    // ✅ Feedback completo com CEP
    const feedbackEl = document.getElementById('neighborhood-feedback');
    if (feedbackEl) {
      feedbackEl.innerHTML = `
        <span style="color:#10b981; font-size:12px;">
          ✅ ${street ? street + (number ? ', ' + number : '') + ' · ' : ''}
          ${neighborhood ? neighborhood + ', ' : ''}${city}${stateShort ? ' - ' + stateShort : ''}
          ${postalCode ? `<span style="color:#6b7280;"> · CEP: ${postalCode}</span>` : ''}
        </span>`;
    }

    // ✅ Recalcula frete com localização confirmada
    if (place.geometry) {
      waitForGoogleMaps(() => {
        calcShip(
          place.geometry.location.lat(),
          place.geometry.location.lng()
        );
      });
    } else {
      waitForGoogleMaps(() => tryCalculateByText());
    }
  });
}

// Inicializa quando o Google Maps estiver pronto
function initAutocompletes() {
  initGoogleAutocomplete();
  initNeighborhoodAutocomplete();
}

window.initAutocompletes = initAutocompletes;

window.addEventListener('load', () => {
  const tryInit = (tries = 0) => {
    if (window.google && google.maps && google.maps.places) {
      initAutocompletes();
    } else if (tries < 30) {
      setTimeout(() => tryInit(tries + 1), 200);
    }
  };
  tryInit();
});

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

  // ✅ Verifica cache antes de chamar a API
  const enderecoAtual = `${inputAddress.value.trim()}, ${inputNeighborhood.value.trim()}`;
  const cached = checkAddressCache(enderecoAtual);
  if (cached) {
    console.log("📦 Frete do cache:", cached);
    state.distanceKm = cached.distanceKm;
    state.calculatedFee = cached.fee;
    updateCartUI();
    return; // ← não chama a API do Google!
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

      // ✅ Salva no cache para próximas vezes
      if (state.calculatedFee !== -1) {
        saveAddressCache(enderecoAtual, km, state.calculatedFee);
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
  const existingSections = document.querySelectorAll('.category-section');
  if (existingSections.length > 0) {
    setupScrollSpy(); // ✅ garante que o spy está ativo mesmo sem re-renderizar
    return;
  }

  const originalScroll = window.scrollY;

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

  // ✅ Restaura scroll sem pulo, depois ativa o spy
  requestAnimationFrame(() => {
    window.scrollTo({ top: originalScroll, behavior: 'instant' });
    setTimeout(setupScrollSpy, 300);
  });
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

  // Limpa acompanhamentos anteriores
  const container = document.getElementById("pd-acompanhamentos");
  if (container) container.innerHTML = '<div style="text-align:center; padding:10px; color:#aaa; font-size:13px;">Carregando opções...</div>';

  updateModalTotal();

  // ✅ Abre o modal IMEDIATAMENTE — sem esperar a API
  pdModal.setAttribute("aria-hidden", "false");

  // 🔥 Busca acompanhamentos em paralelo (sem travar a abertura)
  try {
    const grupos = await apiGet(`/acompanhamentos/${item.id}`);
    renderAcompanhamentos(grupos);
  } catch (err) {
    console.error("Erro ao buscar acompanhamentos:", err);
    if (container) container.innerHTML = '';
  }
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
  if (state.user && state.token) {
    localStorage.setItem('cart', JSON.stringify(state.cart));
  }
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

if (floatCartBtn) floatCartBtn.addEventListener('click', () => {
  drawer.setAttribute('aria-hidden', 'false');
  loadSavedUserData();
  renderSavedAddress(); // ← adicione
});

document.addEventListener('click', function (e) {
  if (e.target.id === 'close-cart' || e.target.closest('#close-cart')) { drawer.setAttribute('aria-hidden', 'true'); }
  if (e.target === drawer) { drawer.setAttribute('aria-hidden', 'true'); }
  if (e.target.id === 'open-cart' || e.target.closest('#open-cart')) {
  drawer.setAttribute('aria-hidden', 'false');
  loadSavedUserData();
  renderSavedAddress(); // ← adicione
}
});

// ================= CHECKOUT (COM SEGURANÇA SÊNIOR) =================
orderForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  fb.textContent = '';

  const fulfillment = fulfillPickup && fulfillPickup.checked ? 'pickup' : 'delivery';

  if (fulfillment === 'delivery') {
    const endereco = inputAddress.value.trim();

    // 1. Verifica se preencheu o endereço
    if (!endereco) {
      fb.textContent = "⚠️ Preencha o endereço.";
      inputAddress.focus();
      inputAddress.style.borderColor = '#d62300';
      return;
    }

    // 2. Verifica se tem número na rua (pelo menos um dígito depois de vírgula ou espaço)
    const temNumero = /,?\s*\d+/.test(endereco);
    if (!temNumero) {
      fb.textContent = "⚠️ Informe o número da sua casa. Ex: Rua das Flores, 123";
      inputAddress.focus();
      inputAddress.style.borderColor = '#d62300';
      return;
    }

    // 3. Remove o destaque vermelho se passou
    inputAddress.style.borderColor = '';


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
console.log('🔍 createdOrder:', JSON.stringify(createdOrder));
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

    if (o.status === 'aguardando_pagamento') {
      // ✅ Injeta pixData ANTES de salvar no state
      if (!o.pixData) {
        const backup = localStorage.getItem('lastPixData');
        if (backup) {
          try { o.pixData = JSON.parse(backup); } catch {}
        }
      } else {
        localStorage.setItem('lastPixData', JSON.stringify(o.pixData));
      }
      state.activeOrderData = o;

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
  if (
    state.activeOrderData &&
    state.activeOrderData.status === 'aguardando_pagamento'
  ) {
    let pixData = state.activeOrderData?.pixData;

    if (!pixData) {
      const backup = localStorage.getItem('lastPixData');
      if (backup) {
        try { pixData = JSON.parse(backup); } catch {}
      }
    }

    if (pixData) {
      showPixModal(pixData);
    } else {
      alert('Dados do Pix não encontrados. Verifique seu e-mail ou tente novamente.');
    }
  } else {
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

function showPixModal(pixData) {
  const existing = document.getElementById('modal-pix-modern');
  if (existing) existing.remove();

  state.pixModalOpen = true;

  const overlay = document.createElement('div');
  overlay.id = 'modal-pix-modern';
  overlay.className = 'pix-overlay';

  overlay.innerHTML = `
    <div class="pix-card">
      <button id="btn-close-pix" class="pix-close-btn">&times;</button>

      <div style="margin-top:10px;">
        <img src="https://logospng.org/download/pix/logo-pix-icone-512.png" width="40" style="margin-bottom:10px;">
        <h3 class="pix-title">Pagamento via Pix</h3>
        <p class="pix-subtitle">Escaneie o QR Code ou copie o código abaixo</p>
      </div>

      <div class="pix-qr-container">
        <img src="data:image/png;base64,${pixData.qr_base64}" class="pix-qr-img" alt="QR Code Pix">
      </div>

      <div class="pix-copy-area" id="pix-copy-area-box">
        <span class="pix-code-text">${pixData.qr_code}</span>
        <span style="font-size:18px;">📋</span>
      </div>

      <textarea id="pix-hidden-input" style="position:absolute;left:-9999px;">${pixData.qr_code}</textarea>

      <button id="btn-copy-pix" class="pix-btn-copy">COPIAR CÓDIGO PIX</button>

      <div id="pix-timer-box" style="margin-top:16px; text-align:center;">
        <p style="font-size:12px; color:#6b7280; margin-bottom:4px;">⏱ Tempo restante para pagar:</p>
        <div id="pix-modal-timer" style="font-size:28px; font-weight:900; color:#ef4444; letter-spacing:2px;">15:00</div>
        <div style="height:6px; background:#f3f4f6; border-radius:6px; margin-top:8px; overflow:hidden;">
          <div id="pix-timer-bar" style="height:100%; background:#ef4444; border-radius:6px; width:100%; transition:width 1s linear;"></div>
        </div>
      </div>

      <div id="pix-status-box" style="
        margin-top:16px; padding:12px; border-radius:12px;
        background:#f0fdf4; border:1px solid #bbf7d0;
        display:flex; align-items:center; gap:10px;
      ">
        <div id="pix-spinner" style="
          width:20px; height:20px; border:3px solid #10b981;
          border-top-color:transparent; border-radius:50%;
          animation:spin 0.8s linear infinite; flex-shrink:0;
        "></div>
        <span id="pix-status-text" style="font-size:13px; color:#065f46; font-weight:600;">
          Aguardando pagamento...
        </span>
      </div>

      <p style="font-size:11px; color:#9ca3af; margin-top:12px;">
        Após pagar, o pedido atualiza automaticamente.
      </p>
    </div>
  `;

  // Adiciona animação do spinner
  if (!document.getElementById('pix-spin-style')) {
    const style = document.createElement('style');
    style.id = 'pix-spin-style';
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);

  // Fechar
  overlay.querySelector('#btn-close-pix').onclick = () => {
    state.pixModalOpen = false;
    state.pixManuallyClosed = true;
    clearInterval(pixModalTimer);
    clearInterval(pixPollTimer);
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  };

  // Copiar
  const copyBtn = overlay.querySelector('#btn-copy-pix');
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(pixData.qr_code)
      .then(() => feedbackCopy())
      .catch(() => { document.execCommand('copy'); feedbackCopy(); });

    function feedbackCopy() {
      copyBtn.innerText = "CÓDIGO COPIADO! ✅";
      copyBtn.style.backgroundColor = "#059669";
      setTimeout(() => {
        copyBtn.innerText = "COPIAR CÓDIGO PIX";
        copyBtn.style.backgroundColor = "#10b981";
      }, 2000);
    }
  };

  // ⏱ TIMER VISUAL
  const deadline = state.activeOrderData?.created_at
    ? new Date(state.activeOrderData.created_at).getTime() + 15 * 60 * 1000
    : Date.now() + 15 * 60 * 1000;

  const totalMs = 15 * 60 * 1000;
  const timerEl = overlay.querySelector('#pix-modal-timer');
  const timerBar = overlay.querySelector('#pix-timer-bar');

  const pixModalTimer = setInterval(() => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      clearInterval(pixModalTimer);
      timerEl.textContent = '00:00';
      timerBar.style.width = '0%';
      return;
    }
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${min}:${sec < 10 ? '0' : ''}${sec}`;
    timerBar.style.width = `${(remaining / totalMs) * 100}%`;

    // Fica vermelho quando menos de 2 min
    if (remaining < 2 * 60 * 1000) {
      timerEl.style.color = '#dc2626';
      timerBar.style.background = '#dc2626';
    }
  }, 1000);

  // 🔄 POLLING DE CONFIRMAÇÃO EM TEMPO REAL
  const orderId = state.activeOrderData?.id || state.currentOrderId;
  const statusText = overlay.querySelector('#pix-status-text');
  const spinner = overlay.querySelector('#pix-spinner');
  const statusBox = overlay.querySelector('#pix-status-box');

  const pixPollTimer = setInterval(async () => {
    if (!orderId) return;
    try {
      const o = await apiGet(`/orders/${orderId}`);
      if (o.status === 'em_preparo' || o.status === 'novo') {
        clearInterval(pixModalTimer);
        clearInterval(pixPollTimer);

        // ✅ PAGAMENTO CONFIRMADO
        spinner.style.borderColor = '#10b981';
        spinner.style.borderTopColor = 'transparent';
        statusBox.style.background = '#f0fdf4';
        statusBox.style.borderColor = '#10b981';
        statusText.textContent = '✅ Pagamento confirmado!';
        statusText.style.color = '#065f46';

        timerEl.textContent = '✅ Pago!';
        timerEl.style.color = '#10b981';
        timerBar.style.background = '#10b981';
        timerBar.style.width = '100%';

        setTimeout(() => {
          overlay.style.opacity = '0';
          setTimeout(() => {
            overlay.remove();
            trackingModal.setAttribute('aria-hidden', 'false');
          }, 400);
        }, 2000);
      }
    } catch {}
  }, 3000);
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
  renderSavedAddress(); 
  initCarousel();
}

function loadSavedUserData() {
  if (state.user) return;
  const savedAddress = localStorage.getItem('lastAddress');
  const savedNeighborhood = localStorage.getItem('lastNeighborhood');
  if (savedAddress && inputAddress) inputAddress.value = savedAddress;
  if (savedNeighborhood && inputNeighborhood) inputNeighborhood.value = savedNeighborhood;
}

// ================= ENDEREÇO SALVO (ESTILO IFOOD) =================
function renderSavedAddress() {
  const savedAddress = localStorage.getItem('lastAddress');
  const savedNeighborhood = localStorage.getItem('lastNeighborhood');
  const addressWrapper = document.querySelector('.address-wrapper');
  if (!addressWrapper) return;

  // Preenche os inputs ocultos sempre
  if (inputAddress) inputAddress.value = savedAddress || '';
  if (inputNeighborhood) inputNeighborhood.value = savedNeighborhood || '';

  // Remove card anterior se existir
  document.getElementById('saved-address-card')?.remove();

  if (savedAddress) {
    // Esconde os campos de endereço e bairro
    addressWrapper.style.display = 'none';
    const neighborhoodInput = document.getElementById('cust-neighborhood');
    const neighborhoodFeedback = document.getElementById('neighborhood-feedback');
    if (neighborhoodInput) neighborhoodInput.style.display = 'none';
    if (neighborhoodFeedback) neighborhoodFeedback.style.display = 'none';

    // Cria o card
    const card = document.createElement('div');
    card.id = 'saved-address-card';
    card.innerHTML = `
      <div style="
        background:#fff; border:2px solid #e0d0b8; border-radius:16px;
        padding:14px 16px; display:flex; align-items:center; gap:12px;
        margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.06);
      ">
        <div style="width:40px;height:40px;background:#fff5f2;border-radius:50%;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;">
          📍
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:#999;font-weight:600;text-transform:uppercase;
            letter-spacing:0.5px;margin-bottom:2px;">Entregar em</div>
          <div id="saved-address-text" style="font-weight:700;font-size:14px;color:#333;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${savedAddress}${savedNeighborhood ? ' · ' + savedNeighborhood : ''}
          </div>
        </div>
        <button id="btn-edit-address" title="Editar endereço" style="
          background:none;border:none;cursor:pointer;padding:8px;
          border-radius:8px;color:#d62300;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
    `;

    addressWrapper.parentNode.insertBefore(card, addressWrapper);

    document.getElementById('btn-edit-address')?.addEventListener('click', () => {
      openAddressEditor(savedAddress, savedNeighborhood);
    });

    // Calcula frete do cache ou refaz
    const cached = checkAddressCache(`${savedAddress}, ${savedNeighborhood || ''}`);
    if (cached) {
      state.distanceKm = cached.distanceKm;
      state.calculatedFee = cached.fee;
      updateCartUI();
    } else {
      waitForGoogleMaps(() => tryCalculateByText());
    }

  } else {
    // Sem endereço salvo: mostra os campos normais
    addressWrapper.style.display = '';
    const neighborhoodInput = document.getElementById('cust-neighborhood');
    const neighborhoodFeedback = document.getElementById('neighborhood-feedback');
    if (neighborhoodInput) neighborhoodInput.style.display = '';
    if (neighborhoodFeedback) neighborhoodFeedback.style.display = '';
  }
}

function openAddressEditor(currentAddress, currentNeighborhood) {
  document.getElementById('address-editor-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'address-editor-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.5);
    z-index:99999;display:flex;align-items:flex-end;justify-content:center;
    backdrop-filter:blur(4px);
  `;
  modal.innerHTML = `
    <div style="background:#fff;width:100%;max-width:500px;border-radius:24px 24px 0 0;
      padding:24px 20px 40px;animation:slideUpProfile 0.3s ease;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <strong style="font-size:17px;color:#333;">✏️ Editar endereço</strong>
        <button id="close-address-editor" style="background:#f3f4f6;border:none;width:32px;
          height:32px;border-radius:50%;font-size:18px;cursor:pointer;color:#555;">✕</button>
      </div>
      <label style="font-size:12px;font-weight:700;color:#502314;margin-bottom:4px;display:block;">
        Rua e Número
      </label>
      <input id="edit-address-input" class="input" value="${currentAddress || ''}"
        placeholder="Rua e Número..." autocomplete="off" style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:700;color:#502314;margin-bottom:4px;display:block;">
        Bairro
      </label>
      <input id="edit-neighborhood-input" class="input" value="${currentNeighborhood || ''}"
        placeholder="Bairro" style="margin-bottom:20px;">
      <button id="btn-save-address" class="btn primary block"
        style="height:52px;font-size:16px;font-weight:700;border-radius:16px;">
        💾 Salvar endereço
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('close-address-editor')?.addEventListener('click', () => modal.remove());

  // ✅ Autocomplete no campo rua do editor
  waitForGoogleMaps(() => {
    const editAddressInput = document.getElementById('edit-address-input');
    const editNeighborhoodInput = document.getElementById('edit-neighborhood-input');

    if (window.google && google.maps.places && editAddressInput) {
      const acEdit = new google.maps.places.Autocomplete(editAddressInput, {
        componentRestrictions: { country: 'br' },
        fields: ['address_components', 'geometry'],
        types: ['address']
      });

      acEdit.addListener('place_changed', () => {
        const place = acEdit.getPlace();
        if (!place.geometry) return;

        let street = '', number = '', neighborhood = '';
        place.address_components.forEach(c => {
          if (c.types.includes('route')) street = c.long_name;
          if (c.types.includes('street_number')) number = c.long_name;
          if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')) neighborhood = c.long_name;
        });

        editAddressInput.value = `${street}${number ? ', ' + number : ''}`;
        if (neighborhood && editNeighborhoodInput) editNeighborhoodInput.value = neighborhood;
      });
    }

    if (window.google && google.maps.places && editNeighborhoodInput) {
      const acNeighEdit = new google.maps.places.Autocomplete(editNeighborhoodInput, {
        componentRestrictions: { country: 'br' },
        fields: ['address_components', 'geometry'],
        types: ['geocode']
      });

      acNeighEdit.addListener('place_changed', () => {
        const place = acNeighEdit.getPlace();
        if (!place || !place.address_components) return;

        let street = '', number = '', neighborhood = '';
        place.address_components.forEach(c => {
          if (c.types.includes('route')) street = c.long_name;
          if (c.types.includes('street_number')) number = c.long_name;
          if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')) neighborhood = c.long_name;
        });

        if (street && editAddressInput) editAddressInput.value = `${street}${number ? ', ' + number : ''}`;
        if (neighborhood) editNeighborhoodInput.value = neighborhood;
      });
    }
  });

  document.getElementById('btn-save-address')?.addEventListener('click', () => {
    const newAddress = document.getElementById('edit-address-input').value.trim();
    const newNeighborhood = document.getElementById('edit-neighborhood-input').value.trim();

    if (!newAddress) { alert('Informe o endereço.'); return; }
    if (!/,?\s*\d+/.test(newAddress)) {
      alert('⚠️ Informe o número da casa. Ex: Rua das Flores, 123');
      return;
    }

    localStorage.setItem('lastAddress', newAddress);
    localStorage.setItem('lastNeighborhood', newNeighborhood);
    if (inputAddress) inputAddress.value = newAddress;
    if (inputNeighborhood) inputNeighborhood.value = newNeighborhood;

    // Atualiza texto do card
    const addressText = document.getElementById('saved-address-text');
    if (addressText) {
      addressText.textContent = `${newAddress}${newNeighborhood ? ' · ' + newNeighborhood : ''}`;
    }

    addressDirty = true;
    state.calculatedFee = null;
    updateCartUI();
    waitForGoogleMaps(() => tryCalculateByText());
    modal.remove();
  });
}

async function tryLoadMe() { if (!state.token) return; try { const me = await apiGet('/auth/me'); setUser(me); } catch { setToken(''); setUser(null); } }

// 📍 CORREÇÃO UX: SE O USUÁRIO JÁ TEM ENDEREÇO, CALCULA LOGO
function setUser(u) {
  state.user = u || null;
  if (u) {
    // ✅ Restaura carrinho salvo ao logar
    const savedCart = localStorage.getItem('cart');
    state.cart = savedCart ? JSON.parse(savedCart) : [];
    updateCartUI();

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

function setToken(t) {
  state.token = t || '';
  if (t) {
    localStorage.setItem('token', t);
  } else {
    // ✅ Limpa carrinho ao deslogar
    localStorage.removeItem('token');
    localStorage.removeItem('cart');
    state.cart = [];
    updateCartUI();
  }
}

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

    const statusMap = {
        'novo': { label: 'Recebido', color: '#f59e0b', icon: '🟡' },
        'aguardando_pagamento': { label: 'Aguardando Pix', color: '#f59e0b', icon: '⏳' },
        'em_preparo': { label: 'Preparando', color: '#3b82f6', icon: '🔥' },
        'saiu_entrega': { label: 'Saiu para entrega', color: '#8b5cf6', icon: '🛵' },
        'entregue': { label: 'Pedido concluído', color: '#10b981', icon: '✅' },
        'cancelado': { label: 'Cancelado', color: '#ef4444', icon: '❌' }
      };

    orders.forEach(order => {
      const st = statusMap[order.status] || { label: order.status, color: '#888', icon: '•' };
      const total = (order.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const date = new Date(order.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      const card = document.createElement('div');
      card.style.cssText = `
        background:#fff; border-radius:16px; padding:16px;
        margin-bottom:12px; box-shadow:0 2px 12px rgba(0,0,0,0.07);
        border:1px solid #f0f0f0;
      `;

      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;
          padding-bottom:12px;border-bottom:1px solid #f5f5f5;">
          <div style="width:44px;height:44px;border-radius:50%;background:#1f1f1f;
            display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
            🍔
          </div>
          <div>
            <div style="font-weight:700;font-size:15px;color:#111;">Tempero de Mãe</div>
            <div style="display:flex;align-items:center;gap:5px;margin-top:2px;">
              <span style="font-size:12px;color:${st.color};font-weight:600;">${st.label}</span>
              <span style="font-size:14px;">${st.icon}</span>
            </div>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <div style="font-weight:800;font-size:15px;color:#111;">${total}</div>
            <div style="font-size:11px;color:#aaa;margin-top:2px;">${date}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div style="font-size:13px;color:#555;line-height:1.8;flex:1;">
            ${order.items.map(i => `<div>${i.qty}x ${i.name}</div>`).join('')}
          </div>
          ${order.items[0]?.image
            ? `<img src="${order.items[0].image}"
                onerror="this.src='https://placehold.co/60x60?text=🍔'"
                style="width:60px;height:60px;border-radius:10px;object-fit:cover;flex-shrink:0;">`
            : `<div style="font-size:22px;opacity:0.3;">🍽️</div>`
          }
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:14px;
          padding-top:12px;border-top:1px solid #f5f5f5;">
          <button class="btn-pedir-novamente-history"
            style="background:none;border:1px solid #d62300;color:#d62300;
            font-weight:700;font-size:13px;cursor:pointer;padding:6px 16px;
            border-radius:20px;display:flex;align-items:center;gap:6px;">
            🔁 Pedir novamente
          </button>
        </div>
      `;

      card.querySelector('.btn-pedir-novamente-history')?.addEventListener('click', () => {
        order.items.forEach(item => {
          window.state.cart.push({
            id: item.itemId || item.id,
            name: item.name,
            price: Number(item.price),
            image: item.image || '',
            qty: item.qty,
            obs: item.obs || '',
            acompanhamentos: item.acompanhamentos || []
          });
        });
        localStorage.setItem('cart', JSON.stringify(window.state.cart));
        if (typeof window.updateCartUI === 'function') window.updateCartUI();
        historyModal.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('aria-hidden', 'false');
      });

      historyList.appendChild(card);
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
window.updateCartUI = updateCartUI;

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
