/* ==================================================================== */
/* ARQUIVO: cliente.js (VERSÃO FINAL - PRODUÇÃO)                        */
/* ==================================================================== */

import { API_URL } from "./app-api.js";

// ====================================================================
// 1. CONFIGURAÇÃO & ESTADO GLOBAL
// ====================================================================

const RESTAURANT_LOCATION = {
  lat: -5.746906,
  lng: -35.240273
};

const MY_CITY_STATE = "Natal, RN";

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

// ====================================================================
// 2. ELEMENTOS DO DOM (SELETORES)
// ====================================================================

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Menu & Carrinho
const chipsCat = $('#category-chips');
const grid = $('#menu-grid');
const drawer = $('#carrinho');
const closeCart = $('#close-cart');
const cartList = $('#cart-items');
const cartCount = $('#cart-count');
const viewSubtotal = $('#cart-subtotal');
const viewFee = $('#cart-fee');
const viewGrandTotal = $('#cart-grandtotal');
const floatCartBtn = $('#float-cart-btn');
const floatCartCount = $('#float-cart-count');

// Checkout & Endereço
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
const orderSchedule = $('#order-schedule');

// Pagamento & Troco
const checkNeedChange = $('#need-change');
const inputChangeAmount = $('#change-amount');
const payCash = document.getElementById('pay-cash');
const cashChangeBox = document.getElementById('cash-change-box');

// Mapa & GPS
const mapModal = document.getElementById('map-modal');
const btnOpenMap = document.getElementById('btn-open-map');
const btnCloseMap = document.getElementById('close-map');
const btnConfirmMap = document.getElementById('btn-confirm-map');
const btnGps = document.getElementById('btn-gps');

// Auth (Login/Cadastro)
const authModal = $('#auth-modal');
const formLogin = $('#form-login');
const formSignup = $('#form-signup');
const settingsModal = $('#settings-modal');

// Rastreamento & Detalhes do Produto
const trackingModal = $('#tracking-modal');
const trackingBubble = $('#tracking-bubble');
const trackId = $('#track-id');
const trackMsg = $('#track-msg');
const timelineProgress = $('#timeline-progress');
const trackTotalEl = $('#track-total-display');
const btnTrackWa = $('#btn-track-wa');
const btnCancelOrder = $('#btn-cancel-order');
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

// Steps Visualização
const stepNovo = $('#step-novo');
const stepPreparo = $('#step-em_preparo');
const stepSaiu = $('#step-saiu_entrega');
const stepEntregue = $('#step-entregue');

// ====================================================================
// 3. HELPERS GERAIS & API
// ====================================================================

const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => { fn.apply(this, args); }, delay);
  };
}

// Helper para garantir que o Google Maps carregou
function waitForGoogleMaps(callback, tries = 0) {
  if (window.google && google.maps && google.maps.DirectionsService) {
    callback();
  } else if (tries < 50) {
    setTimeout(() => waitForGoogleMaps(callback, tries + 1), 100);
  } else {
    console.error("Google Maps não carregou a tempo");
  }
}

async function apiGet(path) {
  const r = await fetch(`${API_URL}${path}`, {
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {}
  });
  if (!r.ok) throw new Error(`GET ${path} falhou`);
  return r.json();
}

async function apiSend(path, method, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    let j = {};
    try { j = await r.json(); } catch {}
    throw new Error(j.error || `Erro ${method} ${path}`);
  }
  return r.json();
}

// ====================================================================
// 4. LÓGICA DE FRETE & ENDEREÇO (CODE LIMPO E ÚNICO)
// ====================================================================

// 1. Eventos para calcular frete automaticamente
// Garante que só adiciona os eventos se os elementos existirem
if (inputAddress) {
  // Remove ouvintes antigos para evitar duplicidade (opcional, mas boa prática)
  const newAddress = inputAddress.cloneNode(true);
  inputAddress.parentNode.replaceChild(newAddress, inputAddress);
  // Re-seleciona para usar a referência nova
}
const inputAddressClean = document.getElementById('cust-address');
const inputNeighborhoodClean = document.getElementById('cust-neighborhood');

if (inputAddressClean) {
  inputAddressClean.addEventListener('blur', () => calcShipByAddress());
  inputAddressClean.addEventListener('input', debounce(() => calcShipByAddress(), 1000));
}

if (inputNeighborhoodClean) {
  inputNeighborhoodClean.addEventListener('blur', () => calcShipByAddress());
  inputNeighborhoodClean.addEventListener('input', debounce(() => calcShipByAddress(), 1000));
}

// 2. Função: Converte Texto em Coordenada (Retorna Promise)
function calcShipByAddress() {
  return new Promise((resolve) => {
    const address = document.getElementById('cust-address')?.value?.trim();
    const neighborhood = document.getElementById('cust-neighborhood')?.value?.trim();

    // Se faltar dados, retorna null imediatamente
    if (!address || !neighborhood) {
      if(state) state.calculatedFee = null;
      updateCartUI();
      resolve(null);
      return;
    }

    // Feedback visual
    if (viewFee) viewFee.innerHTML = "<span style='color:orange'>Calculando...</span>";
    if (btnFinalize) btnFinalize.disabled = true;

    const fullAddress = `${address}, ${neighborhood}, Natal, RN`;
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({ address: fullAddress }, (results, status) => {
      if (status !== "OK" || !results[0]) {
        console.warn("Endereço não encontrado:", status);
        if(state) state.calculatedFee = -1;
        updateCartUI();
        resolve(null);
        return;
      }
      
      const location = results[0].geometry.location;
      
      // Chama a função de rota (que agora também é uma Promise)
      calcShip(location.lat(), location.lng())
        .then(val => resolve(val))
        .catch(() => resolve(null));
    });
  });
}

// 3. Função: Calcula Distância e Preço (Retorna Promise)
function calcShip(lat, lng) {
  return new Promise((resolve) => {
    state.distanceKm = 0;
    state.calculatedFee = null;
    updateCartUI();

    // Se for retirada, é grátis
    if (fulfillPickup && fulfillPickup.checked) {
      state.distanceKm = 0;
      state.calculatedFee = 0;
      updateCartUI();
      resolve(0);
      return;
    }

    if (!lat || !lng) {
      resolve(null);
      return;
    }

    const service = new google.maps.DirectionsService();
    service.route({
        origin: RESTAURANT_LOCATION,
        destination: { lat, lng },
        travelMode: google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        if (status !== "OK" || !result.routes?.length) {
          state.calculatedFee = -1; // Erro
          updateCartUI();
          resolve(-1);
          return;
        }

        const meters = result.routes[0].legs[0].distance.value;
        const km = meters / 1000;
        state.distanceKm = km;

        // --- REGRA DE PREÇO ---
        if (km <= 2) {
          state.calculatedFee = 0; // Grátis até 2km
        } else if (km > 15) { // Limite máximo
          state.calculatedFee = -1;
        } else {
          // Exemplo: Arredonda pra cima
          state.calculatedFee = Math.ceil(km); 
        }
        // ----------------------

        updateCartUI();
        resolve(state.calculatedFee);
      }
    );
  });
}

// 4. Toggle Entrega / Retirada
if (fulfillPickup && fulfillDelivery) {
  function toggleDeliveryMode() {
    const isPickup = fulfillPickup.checked;
    if (isPickup) {
      if (deliveryFields) deliveryFields.style.display = 'none';
      state.calculatedFee = 0;
      state.distanceKm = 0;
    } else {
      if (deliveryFields) deliveryFields.style.display = 'block';
      const addr = document.getElementById('cust-address');
      const neigh = document.getElementById('cust-neighborhood');
      if(addr && neigh && addr.value && neigh.value) calcShipByAddress();
    }
    updateCartUI();
  }
  fulfillPickup.addEventListener('change', toggleDeliveryMode);
  fulfillDelivery.addEventListener('change', toggleDeliveryMode);
}

// 5. Autocomplete do Google
// AQUI ESTAVA O ERRO: Esta função só pode aparecer UMA vez no arquivo
function initGoogleAutocomplete() {
  const addrInput = document.getElementById('cust-address');
  if (!window.google || !google.maps || !google.maps.places || !addrInput) return;

  // Remove ouvintes anteriores do Google para evitar bugs de duplicação
  const newEl = addrInput.cloneNode(true);
  addrInput.parentNode.replaceChild(newEl, addrInput);
  const finalInput = document.getElementById('cust-address');

  // Re-aplica os eventos de blur/input porque o cloneNode removeu
  finalInput.addEventListener('blur', () => calcShipByAddress());
  finalInput.addEventListener('input', debounce(() => calcShipByAddress(), 1000));

  const autocomplete = new google.maps.places.Autocomplete(finalInput, {
    types: ['address'],
    componentRestrictions: { country: 'br' },
    fields: ['address_components', 'geometry']
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (place?.geometry) {
      // Preenche campos se disponível
      let street = '', number = '', neighborhood = '';
      place.address_components.forEach(c => {
        if (c.types.includes('route')) street = c.long_name;
        if (c.types.includes('street_number')) number = c.long_name;
        if (c.types.includes('sublocality_level_1')) neighborhood = c.long_name;
      });
      
      const currentVal = finalInput.value;
      const typedNum = currentVal.match(/,\s*(\d+)/)?.[1] || '';
      
      finalInput.value = `${street}${number || typedNum ? ', ' + (number || typedNum) : ''}`;
      
      const neighInput = document.getElementById('cust-neighborhood');
      if (neighInput && neighborhood) neighInput.value = neighborhood;

      calcShip(place.geometry.location.lat(), place.geometry.location.lng());
    } else {
      calcShipByAddress();
    }
  });
}
window.addEventListener('load', initGoogleAutocomplete);

// 3. Função: Calcula Distância e Preço (Retorna Promise)
function calcShip(lat, lng) {
  return new Promise((resolve) => {
    state.distanceKm = 0;
    state.calculatedFee = null;
    
    // Se for retirada, é grátis e imediato
    if (fulfillPickup && fulfillPickup.checked) {
      state.distanceKm = 0;
      state.calculatedFee = 0;
      updateCartUI();
      resolve(0);
      return;
    }

    if (!lat || !lng) {
      resolve(null);
      return;
    }

    const service = new google.maps.DirectionsService();
    service.route({
        origin: RESTAURANT_LOCATION,
        destination: { lat, lng },
        travelMode: google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        if (status !== "OK" || !result.routes?.length) {
          state.calculatedFee = -1; // Erro de rota
          updateCartUI();
          resolve(-1);
          return;
        }

        const meters = result.routes[0].legs[0].distance.value;
        const km = meters / 1000;
        state.distanceKm = km;

        // --- REGRA DE PREÇO ---
        if (km <= 2) {
          state.calculatedFee = 0; // Grátis até 2km
        } else if (km > 15) { // Limite máximo de entrega
          state.calculatedFee = -1; 
        } else {
          // Exemplo: Arredonda pra cima
          state.calculatedFee = Math.ceil(km); 
        }
        // ----------------------

        updateCartUI();
        resolve(state.calculatedFee);
      }
    );
  });
}

// 4. Toggle Entrega / Retirada
if (fulfillPickup && fulfillDelivery) {
  function toggleDeliveryMode() {
    const isPickup = fulfillPickup.checked;
    if (isPickup) {
      if (deliveryFields) deliveryFields.style.display = 'none';
      state.calculatedFee = 0;
      state.distanceKm = 0;
    } else {
      if (deliveryFields) deliveryFields.style.display = 'block';
      // Tenta recalcular se já tiver endereço preenchido
      if(inputAddress.value && inputNeighborhood.value) calcShipByAddress();
    }
    updateCartUI();
  }
  fulfillPickup.addEventListener('change', toggleDeliveryMode);
  fulfillDelivery.addEventListener('change', toggleDeliveryMode);
}

// 5. Autocomplete do Google
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
      // Preenche campos se disponível
      let street = '', number = '', neighborhood = '';
      place.address_components.forEach(c => {
        if (c.types.includes('route')) street = c.long_name;
        if (c.types.includes('street_number')) number = c.long_name;
        if (c.types.includes('sublocality_level_1') || c.types.includes('sublocality')) neighborhood = c.long_name;
      });
      
      // Tenta manter número digitado se o Google não trouxer
      const currentVal = inputAddress.value;
      const typedNum = currentVal.match(/,\s*(\d+)/)?.[1] || '';
      
      inputAddress.value = `${street}${number || typedNum ? ', ' + (number || typedNum) : ''}`;
      if (inputNeighborhood && neighborhood) inputNeighborhood.value = neighborhood;

      // Calcula direto pela geometria (mais rápido e preciso)
      calcShip(place.geometry.location.lat(), place.geometry.location.lng());
    } else {
      // Fallback: calcula pelo texto
      calcShipByAddress();
    }
  });
}
window.addEventListener('load', initGoogleAutocomplete);

// 4. Toggle Entrega / Retirada
if (fulfillPickup && fulfillDelivery) {
  function toggleDeliveryMode() {
    const isPickup = fulfillPickup.checked;
    if (isPickup) {
      if (deliveryFields) deliveryFields.style.display = 'none';
      state.calculatedFee = 0;
      state.distanceKm = 0;
    } else {
      if (deliveryFields) deliveryFields.style.display = 'block';
      if(inputAddress.value && inputNeighborhood.value) calcShipByAddress();
    }
    updateCartUI();
  }
  fulfillPickup.addEventListener('change', toggleDeliveryMode);
  fulfillDelivery.addEventListener('change', toggleDeliveryMode);
}

// ====================================================================
// SUBSTITUIR A FUNÇÃO calcShip POR ESTA:
// ====================================================================
function calcShip(lat, lng) {
  return new Promise((resolve, reject) => {
    state.distanceKm = 0;
    state.calculatedFee = null;
    
    // Se for retirada, resolve na hora
    if (fulfillPickup && fulfillPickup.checked) {
      state.distanceKm = 0;
      state.calculatedFee = 0;
      updateCartUI();
      resolve(0);
      return;
    }

    if (!lat || !lng) {
      resolve(null);
      return;
    }

    const service = new google.maps.DirectionsService();
    service.route({
        origin: RESTAURANT_LOCATION,
        destination: { lat, lng },
        travelMode: google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        if (status !== "OK" || !result.routes?.length) {
          state.calculatedFee = -1;
          updateCartUI();
          resolve(-1); // Erro de rota
          return;
        }

        const meters = result.routes[0].legs[0].distance.value;
        const km = meters / 1000;
        state.distanceKm = km;

        // Lógica de Preço
        if (km <= 2) {
          state.calculatedFee = 0; // Grátis até 2km
        } else if (km > 15) { // Aumentei um pouco a margem de segurança
          state.calculatedFee = -1; // Muito longe
        } else {
          // Exemplo: R$ 1,50 por KM ou valor fixo
          state.calculatedFee = Math.ceil(km); 
        }

        updateCartUI();
        resolve(state.calculatedFee); // Sucesso!
      }
    );
  });
}

// Toggle Entrega / Retirada
if (fulfillPickup && fulfillDelivery) {
  function toggleDeliveryMode() {
    const isPickup = fulfillPickup.checked;
    if (isPickup) {
      if (deliveryFields) deliveryFields.style.display = 'none';
      state.calculatedFee = 0;
      state.distanceKm = 0;
    } else {
      if (deliveryFields) deliveryFields.style.display = 'block';
    }
    updateCartUI();
  }
  fulfillPickup.addEventListener('change', toggleDeliveryMode);
  fulfillDelivery.addEventListener('change', toggleDeliveryMode);
}


// ====================================================================
// 5. MAPA VISUAL (LEAFLET / VISUALIZAÇÃO)
// ====================================================================
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
      } catch (e) {
        console.log("Erro geo mapa:", e);
      }
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
    if (!selectedLatLng) {
      alert("Marque o local no mapa!");
      return;
    }
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
    if (!navigator.geolocation) {
      alert("GPS não suportado.");
      return;
    }
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
        setTimeout(() => {
          btnGps.textContent = originalText;
          btnGps.disabled = false;
        }, 2000);
        waitForGoogleMaps(() => {
          calcShip(latitude, longitude);
        });
      },
      (error) => {
        alert("Ative o GPS do celular.");
        btnGps.textContent = originalText;
        btnGps.disabled = false;
      }, { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function initMap(lat, lng) {
  if (map) { map.remove(); map = null; }
  map = L.map('map').setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);
  marker = L.marker([lat, lng], { draggable: true }).addTo(map);
  selectedLatLng = { lat, lng };
  
  marker.on('dragend', function(e) {
    const pos = e.target.getLatLng();
    selectedLatLng = { lat: pos.lat, lng: pos.lng };
  });
  
  map.on('click', function(e) {
    marker.setLatLng(e.latlng);
    selectedLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
  });
  
  setTimeout(() => map.invalidateSize(), 200);
}

// ====================================================================
// 6. LÓGICA DO MENU & RENDERIZAÇÃO
// ====================================================================

function renderItems() {
  const grid = document.getElementById('menu-grid');
  if (!grid) return;

  grid.innerHTML = '';
  const term = state.filters.q ? state.filters.q.toLowerCase() : '';

  if (!state.items || state.items.length === 0) {
    console.warn("Nenhum item carregado no estado.");
    return;
  }

  let itensVisiveis = 0;

  state.categories.forEach(cat => {
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
        // Conversão do HTML para Template Literal
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

  if (itensVisiveis === 0 && term) {
    grid.innerHTML = '<div style="padding:20px; text-align:center;">Nenhum produto encontrado.</div>';
  }

  setTimeout(setupScrollSpy, 500);
}

function setupScrollSpy() {
  const sections = document.querySelectorAll('.category-section');
  const navChips = document.querySelectorAll('#category-chips .chip');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navChips.forEach(chip => {
          chip.classList.toggle('active', chip.dataset.target === entry.target.id);
        });
      }
    });
  }, { rootMargin: '-100px 0px -60% 0px' });
  sections.forEach(s => observer.observe(s));
}

function renderFilters() {
  chipsCat.innerHTML = '';
  const activeCats = state.categories.filter(c =>
    state.items.some(i => String(i.category_id || i.categoryId) === String(c.id))
  );

  activeCats.forEach((c, idx) => {
    const btn = document.createElement('button');
    btn.className = idx === 0 ? 'chip active' : 'chip';
    btn.textContent = c.name;
    btn.dataset.target = `cat-${c.id}`;
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

// Modal de Produto
function openProductModal(item) {
  state.selectedItem = item;
  state.selectedQty = 1;
  pdImage.src = item.image_url || 'https://placehold.co/300x200?text=Sem+Foto';
  pdName.textContent = item.name;
  pdDesc.textContent = item.description || "";
  pdPrice.textContent = brl(Number(item.price));
  pdQty.textContent = "1";
  pdObs.value = "";
  updateModalTotal();
  pdModal.setAttribute("aria-hidden", "false");
}

function updateModalTotal() {
  pdTotalBtn.textContent = brl(Number(state.selectedItem.price) * state.selectedQty);
}

if (pdClose && pdModal) {
  pdClose.addEventListener('click', () => {
    pdModal.setAttribute("aria-hidden", "true");
  });
}

pdPlus?.addEventListener('click', () => {
  state.selectedQty++;
  pdQty.textContent = state.selectedQty;
  updateModalTotal();
});
pdMinus?.addEventListener('click', () => {
  if (state.selectedQty > 1) {
    state.selectedQty--;
    pdQty.textContent = state.selectedQty;
    updateModalTotal();
  }
});
pdAddBtn?.addEventListener('click', () => {
  addToCart(state.selectedItem, state.selectedQty, pdObs.value);
  pdModal.setAttribute("aria-hidden", "true");
});

// ====================================================================
// 7. LÓGICA DO CARRINHO
// ====================================================================

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
}

function addToCart(item, qty = 1, obs = "") {
  if (!state.token || !state.user) {
    pdModal.setAttribute("aria-hidden", "true");
    openAuthModal('login'); // Certifique-se que essa função existe ou está global
    return;
  }
  const existingItem = state.cart.find(x => x.id === item.id && x.obs === obs);
  if (existingItem) {
    existingItem.qty += qty;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      image: item.image_url || item.imageUrl,
      qty: qty,
      obs: obs
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

function removeFromCart(index) {
  state.cart.splice(index, 1);
  saveCart();
  updateCartUI();
}

function changeQty(index, delta) {
  const item = state.cart[index];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart.splice(index, 1);
  saveCart();
  updateCartUI();
}

function cartSubtotal() {
  return state.cart.reduce((s, i) => s + Number(i.price) * i.qty, 0);
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
    let finalFee = 0;
    let feeDisplay = "";

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
  // 1. Abre o carrinho
  drawer.setAttribute('aria-hidden', 'false');
  
  // 2. 🔥 NOVO: Verifica se tem endereço salvo e calcula o frete sozinho
  setTimeout(() => {
      // Verifica se os campos existem e têm valor
      if (inputAddress && inputAddress.value && inputNeighborhood && inputNeighborhood.value) {
          // Chama a função de cálculo (sem await aqui pois é apenas visual)
          calcShipByAddress();
      }
  }, 300); // Espera 300ms para o modal terminar de abrir
});
document.addEventListener('click', function(e) {
  if (e.target.id === 'close-cart' || e.target.closest('#close-cart')) {
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (e.target === drawer) {
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (e.target.id === 'open-cart' || e.target.closest('#open-cart')) {
    drawer.setAttribute('aria-hidden', 'false');
    // loadSavedUserData();
  }
});

// Lógica de Pagamento / Troco
document.querySelectorAll('input[name="payment"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (payCash && payCash.checked) {
      if (cashChangeBox) cashChangeBox.style.display = 'block';
    } else {
      if (cashChangeBox) cashChangeBox.style.display = 'none';
      if (checkNeedChange) checkNeedChange.checked = false;
      if (inputChangeAmount) {
        inputChangeAmount.style.display = 'none';
        inputChangeAmount.value = '';
      }
    }
  });
});

if (checkNeedChange) {
  checkNeedChange.addEventListener('change', () => {
    if (checkNeedChange.checked) {
      if (inputChangeAmount) inputChangeAmount.style.display = 'block';
    } else {
      if (inputChangeAmount) {
        inputChangeAmount.style.display = 'none';
        inputChangeAmount.value = '';
      }
    }
  });
}


// ====================================================================
// 8. FINALIZAÇÃO DE PEDIDO (CHECKOUT - UNIFICADO)
// ====================================================================

orderForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  fb.textContent = '';

  // 1. Definição do modo de entrega
  const fulfillment = fulfillPickup && fulfillPickup.checked ? 'pickup' : 'delivery';

  // 2. Validações Iniciais
  if (!state.user || !state.token) {
    alert("Faça login para continuar.");
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

  // 3. 🔥 LÓGICA DE SEGURANÇA DO FRETE 🔥
  // Aqui está a mágica: ele espera o cálculo terminar antes de prosseguir
  if (fulfillment === 'delivery') {
    // 3.1 Verifica campos
    if (!inputAddress.value || !inputNeighborhood.value) {
      alert("Por favor, preencha o endereço completo e o bairro.");
      return;
    }

    // 3.2 Força o cálculo e aguarda (await)
    try {
      if(btnFinalize) {
        btnFinalize.disabled = true;
        btnFinalize.textContent = "Calculando frete...";
      }
      
      await calcShipByAddress();
      
    } catch (error) {
      console.error("Erro cálculo:", error);
    } finally {
      if(btnFinalize) {
        btnFinalize.disabled = false;
        btnFinalize.textContent = "Finalizar Pedido";
      }
    }

    // 3.3 Verifica se o frete é válido após o cálculo
    if (state.calculatedFee === null || state.calculatedFee === -1) {
      fb.textContent = "Endereço não atendido ou inválido.";
      alert("Não conseguimos calcular a entrega para este endereço. Verifique o número e bairro, ou marque no mapa.");
      return; 
    }
  }

  // 4. Pagamento e Troco
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

  // 5. Monta Objetos
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
      image: i.image
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

  // 6. Envia para API
  try {
    if(btnFinalize) {
        btnFinalize.textContent = "Processando...";
        btnFinalize.disabled = true;
    }

    const createdOrder = await apiSend('/orders', 'POST', order);
    
    state.cart = [];
    saveCart();
    orderForm.reset();
    drawer.setAttribute('aria-hidden', 'true');
    updateCartUI();
    
    if (createdOrder.pixData) localStorage.setItem('lastPixData', JSON.stringify(createdOrder.pixData));
    
    startTracking(createdOrder.id);
    
    if (createdOrder.pixData && typeof showPixModal === 'function') {
        showPixModal(createdOrder.pixData); 
    }

    if(btnFinalize) {
        btnFinalize.textContent = "Finalizar Pedido";
        btnFinalize.disabled = false;
    }

  } catch (err) {
    console.error(err);
    fb.textContent = 'Erro: ' + err.message;
    if(btnFinalize) {
        btnFinalize.textContent = "Tentar Novamente";
        btnFinalize.disabled = false;
    }
  }
});

// ====================================================================
// 9. RASTREAMENTO (TRACKING)
// ====================================================================

function startTracking(id) {
  state.currentOrderId = id;
  localStorage.setItem('lastOrderId', id);
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
      // if (!state.pixTimerInterval) startPixVisualTimer(deadline, o.id); // Descomentar se existir
      if (trackingModal.getAttribute('aria-hidden') === 'false') trackingModal.setAttribute('aria-hidden', 'true');
      return;
    }
    if (state.pixTimerInterval) {
      clearInterval(state.pixTimerInterval);
      state.pixTimerInterval = null;
    }
    updateTrackUI(o);
    if (o.status === 'entregue' || o.status === 'cancelado') {
      stopTracking();
      setTimeout(() => {
        trackingModal.setAttribute('aria-hidden', 'true');
        trackingBubble.style.display = 'none';
      }, 10000);
    }
  } catch (e) {
    if (e.message && e.message.includes('404')) stopTracking();
  }
};

function stopTracking() {
  if (state.trackingInterval) clearInterval(state.trackingInterval);
  state.trackingInterval = null;
}

function updateTrackUI(order) {
  if (!trackingBubble) return;
  trackingBubble.style.setProperty('display', 'flex', 'important');
  const s = order.status;
  let m = '...',
    i = '🕒',
    pw = "0%";
  if (stepNovo) $$('.step').forEach(e => e.classList.remove('active'));

  if (s === 'novo') {
    if (stepNovo) stepNovo.classList.add('active');
    m = 'Recebido';
    i = '✅';
    pw = "10%";
  } else if (s === 'em_preparo') {
    if (stepNovo) stepNovo.classList.add('active');
    if (stepPreparo) stepPreparo.classList.add('active');
    m = 'Preparando';
    i = '🔥';
    pw = "40%";
  } else if (s === 'saiu_entrega') {
    if (stepNovo) stepNovo.classList.add('active');
    if (stepPreparo) stepPreparo.classList.add('active');
    if (stepSaiu) stepSaiu.classList.add('active');
    m = 'Saiu!';
    i = '🛵';
    pw = "70%";
  } else if (s === 'entregue') {
    if (stepNovo) $$('.step').forEach(e => e.classList.add('active'));
    m = 'Entregue';
    i = '🏠';
    pw = "100%";
  } else if (s === 'cancelado') {
    m = 'Cancelado';
    i = '❌';
    pw = "0%";
    trackingBubble.style.background = '#EF4444';
  } else {
    trackingBubble.style.background = '#10B981';
  }

  trackingBubble.innerHTML = `<span style="font-size:20px;">${i}</span>`;
  if (trackId) trackId.textContent = order.id;
  if (trackMsg) trackMsg.textContent = m;
  if (timelineProgress) timelineProgress.style.width = pw;

  const itemsList = document.getElementById("track-items-list");
  if (itemsList && order.items) {
    // Conversão do HTML para Template Literal
    itemsList.innerHTML = order.items.map(i => {
      const obs = i.obs ? `<div style="font-size:12px; color:#d62300;">⚠️ ${i.obs}</div>` : "";
      return `<div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div><strong>${i.qty}x</strong> ${i.name}${obs}</div>
                <div style="white-space:nowrap;">${brl(i.price * i.qty)}</div>
              </div>`;
    }).join("");
  }

  if (trackTotalEl) trackTotalEl.textContent = brl(order.total);
  if (btnTrackWa) btnTrackWa.href = `https://wa.me/5584996065229?text=${encodeURIComponent(`Olá, sobre meu pedido #${order.id}...`)}`;
  if (btnCancelOrder) {
    btnCancelOrder.style.display = (s === 'novo' || s === 'agendado') ? 'block' : 'none';
    btnCancelOrder.onclick = () => cancelMyOrder(order.id); // Verificar se existe
  }
}

trackingBubble?.addEventListener('click', () => {
  if (state.activeOrderData && state.activeOrderData.status === 'aguardando_pagamento') {
    let pixData = state.activeOrderData.pixData;
    if (!pixData) {
      const backup = localStorage.getItem('lastPixData');
      if (backup) pixData = JSON.parse(backup);
    }
    if (pixData) showPixModal(pixData); // Verificar se existe
  } else {
    trackingModal.setAttribute('aria-hidden', 'false');
  }
});
tmClose?.addEventListener('click', () => trackingModal.setAttribute('aria-hidden', 'true'));
