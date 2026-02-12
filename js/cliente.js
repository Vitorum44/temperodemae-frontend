/* ==================================================================== */
/* ARQUIVO: cliente.js (VERSÃO FINAL - PRODUÇÃO)                        */
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
  categories: [], subcategories: [], items: [],
  cart: JSON.parse(localStorage.getItem('cart') || '[]'),
  filters: { cat: null, sub: null, q: '' },
  token: localStorage.getItem('token') || '',
  user: null,
  calculatedFee: 0, distanceKm: 0,
  currentOrderId: localStorage.getItem('lastOrderId') || null,
  isStoreOpen: true, storeConfig: null,
  trackingInterval: null, pixTimerInterval: null,
  selectedItem: null, selectedQty: 1, activeOrderData: null
};

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
const inputReference = $('#cust-reference');
const inputName = $('#cust-name');
const inputPhone = $('#cust-phone');
const inputEmail = $('#cust-email');

// ================= 🔥 EVENTOS PARA CALCULAR FRETE AUTOMATICAMENTE =================

// 1️⃣ Quando o usuário TERMINAR de digitar o endereço (perde o foco)
inputAddress?.addEventListener('blur', () => {
  calcShipByAddress();
});

// 2️⃣ Quando o usuário TERMINAR de digitar o bairro (perde o foco)
inputNeighborhood?.addEventListener('blur', () => {
  calcShipByAddress();
});

// 3️⃣ Enquanto o usuário digita (debounce para evitar chamadas excessivas)
inputAddress?.addEventListener('input', debounce(() => {
  calcShipByAddress();
}, 800));

inputNeighborhood?.addEventListener('input', debounce(() => {
  calcShipByAddress();
}, 800));



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
    if (payCash && payCash.checked) {
      if(cashChangeBox) cashChangeBox.style.display = 'block';
    } else {
      if(cashChangeBox) cashChangeBox.style.display = 'none';
      if(checkNeedChange) checkNeedChange.checked = false;
      if(inputChangeAmount) {
          inputChangeAmount.style.display = 'none';
          inputChangeAmount.value = '';
      }
    }
  });
});

if(checkNeedChange) {
    checkNeedChange.addEventListener('change', () => {
      if (checkNeedChange.checked) {
        if(inputChangeAmount) inputChangeAmount.style.display = 'block';
      } else {
        if(inputChangeAmount) {
            inputChangeAmount.style.display = 'none';
            inputChangeAmount.value = '';
        }
      }
    });
}


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
const recStep2 = $('#rec-step-2');
const recPhoneInput = $('#rec-phone-input');
const btnSendCode = $('#btn-send-code');
const recTokenInput = $('#rec-token-input');
const recNewPassInput = $('#rec-newpass-input');
const btnVerifyCode = $('#btn-verify-code');
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

// ================= LÓGICA DO MAPA =================
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
        waitForGoogleMaps(() => { calcShip(latitude, longitude); });
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

    if (place?.geometry) {
      let street = ''; let number = ''; let neighborhood = '';
      place.address_components.forEach(c => {
        if (c.types.includes('route')) street = c.long_name;
        if (c.types.includes('street_number')) number = c.long_name;
        if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')) neighborhood = c.long_name;
      });
      const typedValue = inputAddress.value;
      const typedNumberMatch = typedValue.match(/,\s*(\d+)/);
      const typedNumber = typedNumberMatch ? typedNumberMatch[1] : '';
      const finalNumber = number || typedNumber;
      inputAddress.value = `${street}${finalNumber ? ', ' + finalNumber : ''}`;
      if (inputNeighborhood) inputNeighborhood.value = neighborhood;
      waitForGoogleMaps(() => { calcShip(place.geometry.location.lat(), place.geometry.location.lng()); });
      return;
    }

    const fullAddress = `${inputAddress.value}, ${inputNeighborhood ? inputNeighborhood.value : ''}, Natal, RN`;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: fullAddress }, (results, status) => {
      if (status !== "OK" || !results[0]) return;
      const location = results[0].geometry.location;
      waitForGoogleMaps(() => { calcShip(location.lat(), location.lng()); });
    });
  });
}
window.addEventListener('load', initGoogleAutocomplete);


function calcShip(lat, lng) {
  state.distanceKm = 0;
  state.calculatedFee = null;
  updateCartUI();

  if (!lat || !lng) return;
  if (fulfillPickup && fulfillPickup.checked) {
    state.distanceKm = 0; state.calculatedFee = 0; updateCartUI(); return;
  }

  const service = new google.maps.DirectionsService();
  service.route(
    { origin: RESTAURANT_LOCATION, destination: { lat, lng }, travelMode: google.maps.TravelMode.DRIVING },
    (result, status) => {
      if (status !== "OK" || !result.routes?.length) {
        state.calculatedFee = -1; updateCartUI(); return;
      }
      const meters = result.routes[0].legs[0].distance.value;
      const km = meters / 1000;
      state.distanceKm = km;
      if (km <= 2) { state.calculatedFee = 0; }
      else if (km > 8) { state.calculatedFee = -1; }
      else { state.calculatedFee = Math.ceil(km); }
      updateCartUI();
    }
  );
}

if (fulfillPickup && fulfillDelivery) {
  function toggleDeliveryMode() {
    const isPickup = fulfillPickup.checked;
    if (isPickup) { if (deliveryFields) deliveryFields.style.display = 'none'; state.calculatedFee = 0; state.distanceKm = 0; }
    else { if (deliveryFields) deliveryFields.style.display = 'block'; }
    updateCartUI();
  }
  fulfillPickup.addEventListener('change', toggleDeliveryMode);
  fulfillDelivery.addEventListener('change', toggleDeliveryMode);
}


// ================= NOVA FUNÇÃO: CALCULAR FRETE POR ENDEREÇO ESCRITO =================
function calcShipByAddress() {
  const address = inputAddress?.value?.trim();
  const neighborhood = inputNeighborhood?.value?.trim();

  if (!address || !neighborhood) return; // só calcula quando ambos estiverem preenchidos

  const fullAddress = `${address}, ${neighborhood}, Natal, RN`;

  const geocoder = new google.maps.Geocoder();

  geocoder.geocode({ address: fullAddress }, (results, status) => {
    if (status !== "OK" || !results[0]) {
      console.warn("Não consegui converter o endereço manual:", status);
      return;
    }

    const location = results[0].geometry.location;

    waitForGoogleMaps(() => {
      calcShip(location.lat(), location.lng());
    });
  });
}



// ================= RENDERIZAR MENU (VERSÃO BLINDADA) =================
function renderItems() {
  const originalScroll = window.scrollY;

  const grid = document.getElementById('menu-grid');
  if (!grid) return;

  // 🔥 SEMPRE LIMPA E REDESENHA
  grid.innerHTML = '';

  const term = state.filters.q ? state.filters.q.toLowerCase() : '';


  // Verifica se tem itens para mostrar
  if (!state.items || state.items.length === 0) {
     console.warn("Nenhum item carregado no estado.");
     return;
  }

  let itensVisiveis = 0;

  state.categories.forEach(cat => {
    // 🔥 AQUI ESTÁ O SEGREDO: String() em ambos os lados
    let itemsInCat = state.items.filter(i => {
        const idCatItem = i.category_id || i.categoryId;
        return String(idCatItem) === String(cat.id);
    });

    if (term) {
      itemsInCat = itemsInCat.filter(i => i.name.toLowerCase().includes(term));
    }

    if (itemsInCat.length > 0) {
      itensVisiveis++;
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
        // Garante que o clique abre o modal corretamente
        c.onclick = () => openProductModal(i);
        itemsContainer.appendChild(c);
      });

      section.appendChild(itemsContainer);
      grid.appendChild(section);
    }
  });

  // Se filtrou e não sobrou nada, avisa (opcional)
  if (itensVisiveis === 0 && term) {
    grid.innerHTML = '<div style="padding:20px; text-align:center;">Nenhum produto encontrado.</div>';
  }

  setTimeout(setupScrollSpy, 500);
}


function setupScrollSpy() {
  const sections = document.querySelectorAll('.category-section'); const navChips = document.querySelectorAll('#category-chips .chip');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) { navChips.forEach(chip => { chip.classList.toggle('active', chip.dataset.target === entry.target.id); }); } });
  }, { rootMargin: '-100px 0px -60% 0px' });
  sections.forEach(s => observer.observe(s));
}

function renderFilters() {
  chipsCat.innerHTML = ''; 
  const activeCats = state.categories.filter(c => 
    state.items.some(i => String(i.category_id || i.categoryId) === String(c.id))
  );

  activeCats.forEach((c, idx) => {
    const btn = document.createElement('button'); btn.className = idx === 0 ? 'chip active' : 'chip'; btn.textContent = c.name; btn.dataset.target = `cat-${c.id}`;
    btn.onclick = (e) => { 
        e.preventDefault();
        const section = document.getElementById(`cat-${c.id}`); 
        if (section) { 
            const y = section.getBoundingClientRect().top + window.scrollY - 80; 
            window.scrollTo({ top: y, behavior: 'smooth' }); 
        } 
    };
    chipsCat.appendChild(btn);
  });
}

function openProductModal(item) {
  state.selectedItem = item; state.selectedQty = 1; pdImage.src = item.image_url || 'https://placehold.co/300x200?text=Sem+Foto';
  pdName.textContent = item.name; pdDesc.textContent = item.description || ""; pdPrice.textContent = brl(Number(item.price));
  pdQty.textContent = "1"; pdObs.value = ""; updateModalTotal(); pdModal.setAttribute("aria-hidden", "false");
}

function updateModalTotal() {
  pdTotalBtn.textContent = brl(Number(state.selectedItem.price) * state.selectedQty);
}

if (pdClose && pdModal) {
  pdClose.addEventListener('click', () => {
    pdModal.setAttribute("aria-hidden", "true");
  });
}

pdPlus?.addEventListener('click', () => { state.selectedQty++; pdQty.textContent = state.selectedQty; updateModalTotal(); });
pdMinus?.addEventListener('click', () => { if (state.selectedQty > 1) { state.selectedQty--; pdQty.textContent = state.selectedQty; updateModalTotal(); } });
pdAddBtn?.addEventListener('click', () => { addToCart(state.selectedItem, state.selectedQty, pdObs.value); pdModal.setAttribute("aria-hidden", "true"); });

// ================= CARRINHO =================
function saveCart() { localStorage.setItem('cart', JSON.stringify(state.cart)); }
function addToCart(item, qty = 1, obs = "") {
  if (!state.token || !state.user) { pdModal.setAttribute("aria-hidden", "true"); openAuthModal('login'); return; }
  const existingItem = state.cart.find(x => x.id === item.id && x.obs === obs);
  if (existingItem) { existingItem.qty += qty; } else { state.cart.push({ id: item.id, name: item.name, price: Number(item.price), image: item.image_url || item.imageUrl, qty: qty, obs: obs }); }
  saveCart(); updateCartUI(); if (fb) { fb.textContent = "Item adicionado!"; setTimeout(() => fb.textContent = "", 2000); }
  if (floatCartBtn) { floatCartBtn.classList.add('anim-pop'); setTimeout(() => floatCartBtn.classList.remove('anim-pop'), 300); }
}
function removeFromCart(index) { state.cart.splice(index, 1); saveCart(); updateCartUI(); }
function changeQty(index, delta) { const item = state.cart[index]; if (!item) return; item.qty += delta; if (item.qty <= 0) state.cart.splice(index, 1); saveCart(); updateCartUI(); }
function cartSubtotal() { return state.cart.reduce((s, i) => s + Number(i.price) * i.qty, 0); }

function updateCartUI() {
  if (!viewFee || !btnFinalize || !cartList) return;
  try {
    if (state.calculatedFee === null) { viewFee.innerHTML = "<span style='color:orange'>Calculando…</span>"; btnFinalize.disabled = true; }
    const totalQty = state.cart.reduce((s, i) => s + i.qty, 0);
    if (floatCartBtn && floatCartCount) {
      if (totalQty > 0) { floatCartBtn.hidden = false; floatCartCount.textContent = totalQty; } else { floatCartBtn.hidden = true; }
    }
    if (cartCount) cartCount.textContent = totalQty;
    cartList.innerHTML = '';

    if (state.cart.length === 0) {
      cartList.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">Vazio</div>';
    } else {
      state.cart.forEach((i, index) => {
        const r = document.createElement('div');
        r.className = 'cart-item-row';
        r.innerHTML = `
          <div class="cart-thumb"><img src="${i.image}" onerror="this.src='https://placehold.co/100?text=Foto'"></div>
          <div class="cart-info">
            <div class="cart-name">${i.name}</div>
            <div class="cart-price-unit">${brl(i.price)}</div>
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
    let finalFee = 0; let feeDisplay = "";

    if (isPickup) { feeDisplay = "Grátis (Retirada)"; finalFee = 0; btnFinalize.disabled = false; }
    else if (state.calculatedFee === -1) { feeDisplay = `<span style="color:red">Muito longe ${distText}</span>`; finalFee = 0; btnFinalize.disabled = true; }
    else { finalFee = state.calculatedFee || 0; feeDisplay = finalFee === 0 ? `Grátis ${distText}` : `${brl(finalFee)} ${distText}`; btnFinalize.disabled = false; }

    if (viewSubtotal) viewSubtotal.textContent = brl(sub);
    if (viewFee) viewFee.innerHTML = feeDisplay;
    if (viewGrandTotal) viewGrandTotal.textContent = brl(sub + finalFee);

  } catch (err) { console.error("Erro no updateCartUI:", err); }
}

if (floatCartBtn) floatCartBtn.addEventListener('click', () => { drawer.setAttribute('aria-hidden', 'false'); loadSavedUserData(); });
document.addEventListener('click', function (e) {
  if (e.target.id === 'close-cart' || e.target.closest('#close-cart')) { drawer.setAttribute('aria-hidden', 'true'); }
  if (e.target === drawer) { drawer.setAttribute('aria-hidden', 'true'); }
  if (e.target.id === 'open-cart' || e.target.closest('#open-cart')) { drawer.setAttribute('aria-hidden', 'false'); loadSavedUserData(); }
});

// ================= CHECKOUT =================
orderForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

 await new Promise(resolve => {
  calcShipByAddress();
  setTimeout(resolve, 800);
});

fb.textContent = '';

if (!state.user || !state.token) {
  openAuthModal('login');
  return;
}



  if (!state.user || !state.token) { openAuthModal('login'); return; }
  if (state.cart.length === 0) { fb.textContent = 'Carrinho vazio.'; return; }
  if (!state.isStoreOpen && (!orderSchedule || !orderSchedule.value)) { fb.textContent = "Loja fechada! Agende um horário."; return; }
  const fulfillment = fulfillPickup && fulfillPickup.checked ? 'pickup' : 'delivery';
  const paymentEl = document.querySelector('input[name="payment"]:checked');
  if (!paymentEl) { fb.textContent = "Selecione o pagamento"; return; }
  const selectedPayment = paymentEl.value;
  let changeData = null;
  if (selectedPayment === 'Dinheiro' && checkNeedChange.checked) {
    if (!inputChangeAmount.value) { fb.textContent = 'Informe o troco.'; return; }
    changeData = `Troco para R$ ${inputChangeAmount.value}`;
  }
  if (fulfillment === 'delivery') { localStorage.setItem('lastAddress', inputAddress.value); localStorage.setItem('lastNeighborhood', inputNeighborhood.value); }
  const customer = {
    id: state.user.id, name: inputName.value || state.user.name, phone: inputPhone.value || state.user.phone,
    address: fulfillment === 'pickup' ? 'Retirada na Loja' : inputAddress.value,
    neighborhood: fulfillment === 'pickup' ? '' : inputNeighborhood.value,
    reference: inputReference ? inputReference.value : '', email: inputEmail ? inputEmail.value : '',
    paymentMethod: selectedPayment, change: changeData, scheduledTo: (!state.isStoreOpen) ? orderSchedule.value : null
  };
  const order = {
    items: state.cart.map(i => ({ itemId: i.id, name: i.name, qty: i.qty, price: +i.price, obs: i.obs, image: i.image })),
    subtotal: cartSubtotal(),
    deliveryFee: fulfillment === 'pickup' ? 0 : state.calculatedFee,
    discount: 0,
   total: cartSubtotal() + (fulfillment === 'pickup' ? 0 : (state.calculatedFee || 0)),

    neighborhood: customer.neighborhood, customer: customer, fulfillment: fulfillment, paymentMethod: selectedPayment,
    change: changeData, user_id: state.user.id, distance_km: state.distanceKm || 0
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
  const s = order.status; let m = '...', i = '🕒', pw = "0%";
  if (stepNovo) $$('.step').forEach(e => e.classList.remove('active'));
  if (s === 'novo') { if (stepNovo) stepNovo.classList.add('active'); m = 'Recebido'; i = '✅'; pw = "10%"; }
  else if (s === 'em_preparo') { if (stepNovo) stepNovo.classList.add('active'); if (stepPreparo) stepPreparo.classList.add('active'); m = 'Preparando'; i = '🔥'; pw = "40%"; }
  else if (s === 'saiu_entrega') { if (stepNovo) stepNovo.classList.add('active'); if (stepPreparo) stepPreparo.classList.add('active'); if (stepSaiu) stepSaiu.classList.add('active'); m = 'Saiu!'; i = '🛵'; pw = "70%"; }
  else if (s === 'entregue') { if (stepNovo) $$('.step').forEach(e => e.classList.add('active')); m = 'Entregue'; i = '🏠'; pw = "100%"; }
  else if (s === 'cancelado') { m = 'Cancelado'; i = '❌'; pw = "0%"; trackingBubble.style.background = '#EF4444'; } else { trackingBubble.style.background = '#10B981'; }
  trackingBubble.innerHTML = `<span style="font-size:20px;">${i}</span>`;
  if (trackId) trackId.textContent = order.id; if (trackMsg) trackMsg.textContent = m;
  if (timelineProgress) timelineProgress.style.width = pw;
  const itemsList = document.getElementById("track-items-list");
  if (itemsList && order.items) {
    itemsList.innerHTML = order.items.map(i => {
      const obs = i.obs ? `<div style="font-size:12px; color:#d62300;">⚠️ ${i.obs}</div>` : "";
      return `<div style="display:flex; justify-content:space-between; align-items:flex-start;"><div><strong>${i.qty}x</strong> ${i.name}${obs}</div><div style="white-space:nowrap;">${brl(i.price * i.qty)}</div></div>`;
    }).join("");
  }
  if (trackTotalEl) trackTotalEl.textContent = brl(order.total);
  if (btnTrackWa) btnTrackWa.href = `https://wa.me/5584996065229?text=${encodeURIComponent(`Olá, sobre meu pedido #${order.id}...`)}`;
  if (btnCancelOrder) { btnCancelOrder.style.display = (s === 'novo' || s === 'agendado') ? 'block' : 'none'; btnCancelOrder.onclick = () => cancelMyOrder(order.id); }
}
trackingBubble?.addEventListener('click', () => {
  if (state.activeOrderData && state.activeOrderData.status === 'aguardando_pagamento') {
    let pixData = state.activeOrderData.pixData;
    if (!pixData) { const backup = localStorage.getItem('lastPixData'); if (backup) pixData = JSON.parse(backup); }
    if (pixData) showPixModal(pixData);
  } else { trackingModal.setAttribute('aria-hidden', 'false'); }
});
tmClose?.addEventListener('click', () => trackingModal.setAttribute('aria-hidden', 'true'));
function startPixVisualTimer(deadline, orderId) { updatePixTick(deadline, orderId); state.pixTimerInterval = setInterval(() => { updatePixTick(deadline, orderId); }, 1000); }
function updatePixTick(deadline, orderId) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) { clearInterval(state.pixTimerInterval); state.pixTimerInterval = null; stopTracking(); alert("Pix expirou."); }
  else {
    if (trackingBubble) {
      trackingBubble.style.setProperty('display', 'flex', 'important'); trackingBubble.style.background = '#EF4444';
      const min = Math.floor(remaining / 60000); const sec = Math.floor((remaining % 60000) / 1000);
      trackingBubble.innerHTML = `<div style="text-align:center;line-height:1.1"><small style="color:white;font-weight:bold;">Pagar Pix</small><br><strong style="color:white;">${min}:${sec < 10 ? '0' : ''}${sec}</strong></div>`;
    }
  }
}
function showPixModal(pixData) {
  const existing = document.getElementById('modal-pix-dynamic'); if (existing) existing.remove();
  state.pixModalOpen = true;
  const div = document.createElement('div');
  div.id = 'modal-pix-dynamic'; div.className = 'modal active'; div.setAttribute('aria-hidden', 'false'); div.style.zIndex = '10000';
  div.innerHTML = `
    <div class="modal-dialog" style="max-width:350px; text-align:center; padding:30px; position:relative;">
      <button id="btn-close-pix" style="position:absolute; top:10px; right:15px; border:none; background:none; font-size:26px; cursor:pointer;">&times;</button>
      <h3>Pagamento Pix</h3><p style="color:var(--primary); font-weight:bold; margin-bottom:15px">Aguardando pagamento...</p>
      <div style="background:#fff; padding:10px; display:inline-block; border:1px solid #ddd; border-radius:8px; margin-bottom:15px">
        <img src="data:image/png;base64,${pixData.qr_base64}" style="width:180px;height:180px;">
      </div>
      <textarea id="pix-copy-paste" readonly style="width:100%; height:55px; font-size:11px; padding:8px; margin-bottom:10px;">${pixData.qr_code}</textarea>
      <button id="btn-copy-pix" class="btn primary block">Copiar Código</button>
    </div>`;
  document.body.appendChild(div);
  div.querySelector('#btn-close-pix').onclick = () => { state.pixModalOpen = false; state.pixManuallyClosed = true; div.remove(); };
  div.querySelector('#btn-copy-pix').onclick = () => {
    const txt = div.querySelector('#pix-copy-paste');
    navigator.clipboard.writeText(txt.value).then(() => alert("Código Pix copiado!")).catch(() => alert("Erro ao copiar. Tente selecionar manualmente."));
  };
}
async function cancelMyOrder(id) { if (!confirm("Cancelar?")) return; try { await apiSend(`/orders/${id}/cancel`, 'PATCH', {}); alert("Cancelado."); stopTracking(); checkStatus(); } catch (err) { alert(err.message); } }
function stopTracking() {
  clearInterval(state.trackingInterval); if (state.pixTimerInterval) { clearInterval(state.pixTimerInterval); state.pixTimerInterval = null; }
  state.currentOrderId = null; localStorage.removeItem('lastOrderId');
  if (trackingBubble && !(state.activeOrderData?.status === 'aguardando_pagamento')) { trackingBubble.style.display = 'none'; }
  if (trackingModal) trackingModal.setAttribute('aria-hidden', 'true');
}

// ================= AUTH/RECOVERY =================
btnSendCode?.addEventListener('click', async () => {
  const phone = recPhoneInput.value.replace(/\D/g, '');
  if (!phone) { recFb.style.color = 'red'; recFb.textContent = "Informe um WhatsApp válido."; return; }
  recFb.style.color = '#666'; recFb.textContent = "Enviando código...";
  try { await apiSend('/auth/request-reset', 'POST', { phone }); recFb.style.color = 'green'; recFb.textContent = "Código enviado!"; recStep1.style.display = 'none'; recStep2.style.display = 'block'; }
  catch (err) { recFb.style.color = 'red'; recFb.textContent = err.message; }
});
btnVerifyCode?.addEventListener('click', async () => {
  const phone = recPhoneInput.value.replace(/\D/g, ''), token = recTokenInput.value.trim(), newPass = recNewPassInput.value.trim();
  if (token.length !== 6 || newPass.length < 6) { recFb.style.color = 'red'; recFb.textContent = "Verifique os dados."; return; }
  recFb.style.color = '#666'; recFb.textContent = "Validando...";
  try { await apiSend('/auth/confirm-reset', 'POST', { phone, token, newPassword: newPass }); recFb.style.color = 'green'; recFb.textContent = "Senha alterada!"; setTimeout(() => setAuthMode('login'), 2000); }
  catch (err) { recFb.style.color = 'red'; recFb.textContent = err.message; }
});
function setAuthMode(mode) {
  formLogin.style.display = 'none'; formSignup.style.display = 'none'; recFlow.style.display = 'none'; authTabs.style.display = 'flex'; authTitle.textContent = "Acesse sua conta";
  if (mode === 'login') { formLogin.style.display = 'block'; $('#tab-login').classList.add('primary'); $('#tab-signup').classList.remove('primary'); }
  else if (mode === 'signup') { formSignup.style.display = 'block'; $('#tab-signup').classList.add('primary'); $('#tab-login').classList.remove('primary'); }
  else if (mode === 'recovery') { authTabs.style.display = 'none'; authTitle.textContent = "Recuperar Senha"; recFlow.style.display = 'block'; recStep1.style.display = 'block'; recStep2.style.display = 'none'; recFb.textContent = ''; }
}
function openAuthModal(t = 'login') { authModal.setAttribute('aria-hidden', 'false'); setAuthMode(t); }
$('#tab-login')?.addEventListener('click', () => setAuthMode('login')); $('#tab-signup')?.addEventListener('click', () => setAuthMode('signup')); btnForgot?.addEventListener('click', () => setAuthMode('recovery')); btnBackAuth?.addEventListener('click', () => setAuthMode('login')); amClose?.addEventListener('click', () => authModal.setAttribute('aria-hidden', 'true'));
formLogin?.addEventListener('submit', async (e) => {
  e.preventDefault(); loginFb.textContent = 'Entrando...';
  try {
    const cleanPhone = loginPhone.value.replace(/\D/g, '');
    const r = await apiSend('/auth/login', 'POST', { phone: cleanPhone, password: loginPass.value });
    setToken(r.token); setUser(r.user); authModal.setAttribute('aria-hidden', 'true');
    await loadData(); // 🔄 Recarrega dados com token
    // 🔥 O ERRO ESTAVA AQUI: sem o String() no renderItems, essa função loadData() quebrava
  } catch (err) { loginFb.textContent = err.message; }
});
formSignup?.addEventListener('submit', async (e) => { e.preventDefault(); suFb.textContent = 'Cadastrando...'; try { const cleanPhone = suPhone.value.replace(/\D/g, ''); const r = await apiSend('/auth/register', 'POST', { name: suName.value, phone: cleanPhone, email: suEmail.value, password: suPass.value }); setToken(r.token); setUser(r.user); authModal.setAttribute('aria-hidden', 'true'); loadData(); } catch (err) { suFb.textContent = err.message; } });

// ================= INIT =================
async function loadData() {
  await tryLoadMe();
  if (localStorage.getItem('lastOrderId')) startTracking(localStorage.getItem('lastOrderId'));
  try { const s = await apiGet("/settings"); state.storeConfig = s; if (s.mode === 'force_closed') { state.isStoreOpen = false; if (fb) fb.textContent = "Fechado temporariamente."; } } catch (e) { }
  try {
    const [c, s, i] = await Promise.all([apiGet('/categories'), apiGet('/subcategories'), apiGet('/items')]); state.categories = c || []; state.subcategories = s || []; state.items = i || [];
    renderFilters(); renderItems();
  } catch (err) { console.error("Erro menu", err); }
  updateCartUI(); loadSavedUserData(); initCarousel();
}
function loadSavedUserData() {
  if (state.user) return;

  const savedAddress = localStorage.getItem('lastAddress');
  const savedNeighborhood = localStorage.getItem('lastNeighborhood');

  if (savedAddress && inputAddress) inputAddress.value = savedAddress;
  if (savedNeighborhood && inputNeighborhood) inputNeighborhood.value = savedNeighborhood;

  // ✅ AQUI SIM — DEPOIS que os campos foram preenchidos
  setTimeout(() => {
  if (inputAddress?.value && inputNeighborhood?.value) {
    calcShipByAddress();
  }
}, 600);

}


async function tryLoadMe() { if (!state.token) return; try { const me = await apiGet('/auth/me'); setUser(me); } catch { setToken(''); setUser(null); } }
function setUser(u) { state.user = u || null; if (u) { if (btnProfile) btnProfile.textContent = `Olá, ${u.name.split(' ')[0]}`; if (inputName) inputName.value = u.name || ''; if (inputPhone) inputPhone.value = u.phone || ''; if (inputEmail) inputEmail.value = u.email || ''; } else { if (btnProfile) btnProfile.textContent = '👤 Perfil'; } }
function setToken(t) { state.token = t || ''; if (t) localStorage.setItem('token', t); else localStorage.removeItem('token'); }
btnProfile?.addEventListener('click', (e) => { e.stopPropagation(); if (state.user) { const isHidden = profileMenu.getAttribute('aria-hidden') === 'true'; profileMenu.setAttribute('aria-hidden', isHidden ? 'false' : 'true'); } else { openAuthModal('login'); } });
document.addEventListener('click', (e) => {
  if (!profileMenu) return; const isOpen = profileMenu.getAttribute('aria-hidden') === 'false';
  if (isOpen && !profileMenu.contains(e.target) && e.target !== btnProfile && !e.target.closest('#edit-profile')) { profileMenu.setAttribute('aria-hidden', 'true'); }
});
pmLogout?.addEventListener('click', () => { setToken(''); setUser(null); window.location.reload(); });
function initCarousel() { if (!carouselTrack || slides.length === 0) return; let currentSlide = 0; const totalSlides = slides.length; let slideInterval; const updateSlide = () => { carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`; dots.forEach((dot, index) => { dot.classList.toggle('active', index === currentSlide); }); }; const nextSlide = () => { currentSlide = (currentSlide + 1) % totalSlides; updateSlide(); }; const prevSlide = () => { currentSlide = (currentSlide - 1 + totalSlides) % totalSlides; updateSlide(); }; nextBtn?.addEventListener('click', nextSlide); prevBtn?.addEventListener('click', prevSlide); slideInterval = setInterval(nextSlide, 5000); }
pmHistory?.addEventListener('click', async () => {
  if (!state.user) { openAuthModal('login'); return; }
  profileMenu.setAttribute('aria-hidden', 'true'); historyModal.setAttribute('aria-hidden', 'false');
  historyList.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Carregando pedidos... 🔄</div>';
  try {
    const orders = await apiGet('/orders/me');
    if (!orders || orders.length === 0) { historyList.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Você ainda não fez pedidos. 🍔</div>'; return; }
    historyList.innerHTML = '';
    orders.forEach(order => {
      const date = new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const statusMap = { 'novo': '🟡 Recebido', 'aguardando_pagamento': '⏳ Aguardando Pix', 'em_preparo': '🔥 Preparando', 'saiu_entrega': '🛵 Saiu para Entrega', 'entregue': '✅ Entregue', 'cancelado': '❌ Cancelado' };
      const statusLabel = statusMap[order.status] || order.status;
      const statusColor = order.status === 'cancelado' ? '#ef4444' : order.status === 'entregue' ? '#10b981' : '#f59e0b';
      const div = document.createElement('div'); div.className = 'history-card';
      div.innerHTML = `<div class="history-header" style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:5px;"><strong>Pedido #${order.id}</strong><span style="font-size:12px; color:#666;">${date}</span></div><div style="font-size:13px; color:#444; margin-bottom:10px;">${order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}</div><div style="display:flex; justify-content:space-between; align-items:center;"><span style="background:${statusColor}; color:white; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold;">${statusLabel}</span><strong style="color:var(--primary);">${brl(order.total)}</strong></div>${order.status === 'aguardando_pagamento' ? `<button class="btn block" style="margin-top:10px; font-size:12px; height:auto; padding:8px;" onclick="window.location.reload()">Pagar Agora (Ver Rastreio)</button>` : ''}`;
      historyList.appendChild(div);
    });
  } catch (err) { historyList.innerHTML = `<div style="color:red; text-align:center;">Erro ao carregar: ${err.message}</div>`; }
});
hmClose?.addEventListener('click', () => { historyModal.setAttribute('aria-hidden', 'true'); });
pmSettings?.addEventListener('click', async () => {
  if (!state.user) { openAuthModal('login'); return; }
  const btnSave = formSettings.querySelector('button[type="submit"]'); const originalText = btnSave.textContent; btnSave.textContent = "Carregando..."; btnSave.disabled = true;
  profileMenu.setAttribute('aria-hidden', 'true'); settingsModal.setAttribute('aria-hidden', 'false');
  try { const freshUser = await apiGet('/auth/me'); setUser(freshUser); } catch (err) { if (setName) setName.value = state.user.name || ''; if (setPhone) setPhone.value = state.user.phone || ''; if (setEmail) setEmail.value = state.user.email || ''; } finally { if (setPass) setPass.value = ''; if (settingsFb) settingsFb.textContent = ''; btnSave.textContent = originalText; btnSave.disabled = false; }
});
formSettings?.addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = formSettings.querySelector('button[type="submit"]'); const originalText = btn.textContent; btn.textContent = "Salvando..."; btn.disabled = true; if (settingsFb) settingsFb.textContent = '';
  try { const payload = { name: setName.value, phone: setPhone.value, email: setEmail.value, password: setPass.value }; const res = await apiSend('/auth/update', 'PATCH', payload); if (res.success) { alert("✅ Dados atualizados com sucesso!"); state.user = res.user; if (res.token) { localStorage.setItem('token', res.token); state.token = res.token; } setUser(res.user); settingsModal.setAttribute('aria-hidden', 'true'); } } catch (err) { if (settingsFb) { settingsFb.style.color = 'red'; settingsFb.textContent = err.message || "Erro ao atualizar."; } } finally { btn.textContent = originalText; btn.disabled = false; }
});
smClose?.addEventListener('click', () => { settingsModal.setAttribute('aria-hidden', 'true'); });
const searchInput = document.getElementById('search');

searchInput?.addEventListener('input', debounce(() => {
  const value = searchInput.value.trim();

  // 🔥 EVITA FILTRAR QUANDO NÃO É BUSCA REAL
  if (!value || value.match(/^\d+$/)) {
    state.filters.q = '';
  } else {
    state.filters.q = value.toLowerCase();
  }

  renderItems();
}, 300));

window.addEventListener('DOMContentLoaded', async () => { await loadData(); });
document.addEventListener('DOMContentLoaded', () => {
  const sections = document.querySelectorAll('.section-categoria'); const navButtons = document.querySelectorAll('.btn-categoria');
  const observer = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) { const currentId = entry.target.getAttribute('id'); navButtons.forEach(btn => { btn.classList.remove('active'); if (btn.getAttribute('href') === `#${currentId}` || btn.dataset.target === currentId) { btn.classList.add('active'); btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } }); } }); }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
  sections.forEach(section => { observer.observe(section); });
});
