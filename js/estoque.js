/* ================= DEBUG ================= */
console.log("SCRIPT ESTOQUE.JS: VERSÃO FINAL - MODAL DE EXCLUSÃO ROBUSTO");

// Use o link do seu servidor no Render
const API = "https://api-temperodemae.onrender.com";
const PRODUCTS_ENDPOINT = "/items";

let isFirstLoad = true;
let productSearchTerm = "";

let state = {
  categories: [],
  subcategories: [],
  products: []
};

let editingProductId = null;
let selectedImageFile = null;

const $ = id => document.getElementById(id);

/* ================= API ================= */
async function api(url, method = "GET", body) {
  try {
    const res = await fetch(API + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!res.ok) {
      console.error("Erro na requisição:", res.status);
      const errorText = await res.text();
      console.error("Resposta servidor:", errorText);
      return null;
    }

    // 🔥 TRATAMENTO SE NÃO TIVER JSON
    const text = await res.text();
    if (!text) return true;

    return JSON.parse(text);

  } catch (error) {
    console.error("Erro API:", error);
    return null;
  }
}


/* ================= LOAD ================= */
async function loadData() {
  let openIds = getOpenCategories();

  state.categories = await api("/categories") || [];
  state.subcategories = await api("/subcategories") || [];
  state.products = await api(PRODUCTS_ENDPOINT) || [];

  if (isFirstLoad) {
    openIds = state.categories.map(c => String(c.id));
    isFirstLoad = false;
  }

  renderCategories(openIds);
  renderProducts();
}

function getOpenCategories() {
  const openIds = [];
  document.querySelectorAll(".ns-subs:not(.hidden)").forEach(el => {
    openIds.push(el.id.replace("subs-", ""));
  });
  return openIds;
}

/* ================= RENDERIZAR CATEGORIAS ================= */
function renderCategories(openIds = []) {
  const root = $("category-list");
  if (!root) return;

  root.innerHTML = "";

  state.categories.forEach(cat => {
    const catWrapper = document.createElement("div");
    catWrapper.className = "ns-category";

    const isOpen = openIds.includes(String(cat.id));
    const hiddenClass = isOpen ? "" : "hidden";
    const arrowClass = isOpen ? "ns-arrow open" : "ns-arrow";

    catWrapper.innerHTML = `
      <div class="ns-category-row">
        <div class="ns-left action-toggle" data-id="${cat.id}">
          <span class="${arrowClass}" id="arrow-${cat.id}">▼</span>
          <span class="ns-name">${cat.name}</span>
        </div>
        <button class="ns-dots btn-menu-cat" data-id="${cat.id}">⋮</button>
      </div>

      <div class="ns-subs ${hiddenClass}" id="subs-${cat.id}">
        <div id="subs-list-${cat.id}">
            ${renderSubRows(cat.id)}
        </div>
        
        <div class="ns-sub-new hidden" id="new-sub-${cat.id}">
          <input type="text" id="sub-input-${cat.id}" placeholder="Nome da subcategoria..." autocomplete="off">
          <button class="action-save-sub" data-id="${cat.id}" title="Salvar">✔</button>
          <button class="action-cancel-sub" data-id="${cat.id}" title="Cancelar">✖</button>
        </div>
      </div>
    `;

    root.appendChild(catWrapper);
  });
}

function renderSubRows(categoryId) {
  const subs = state.subcategories.filter(s => {
    const pai = s.category_id || s.categoryId || s.parent_id;
    return String(pai) === String(categoryId);
  });

  if (subs.length === 0) return "";

  return subs.map(s => `
      <div class="ns-sub-row">
        <span>${s.name}</span>
        <button class="ns-dots btn-menu-sub" data-id="${s.id}">⋮</button>
      </div>
    `).join("");
}

/* ================= GERENCIADOR DE CLIQUES ================= */
document.addEventListener("click", (e) => {
  const target = e.target;

  const toggle = target.closest(".action-toggle");
  if (toggle) { e.preventDefault(); toggleSubs(toggle.dataset.id); return; }

  const btnCat = target.closest(".btn-menu-cat");
  if (btnCat) { e.preventDefault(); e.stopPropagation(); openMenuReal(btnCat, "category", btnCat.dataset.id); return; }

  const btnSub = target.closest(".btn-menu-sub");
  if (btnSub) { e.preventDefault(); e.stopPropagation(); openMenuReal(btnSub, "subcategory", btnSub.dataset.id); return; }

  const btnSave = target.closest(".action-save-sub");
  if (btnSave) { saveSub(btnSave.dataset.id); return; }

  const btnCancel = target.closest(".action-cancel-sub");
  if (btnCancel) { cancelSub(btnCancel.dataset.id); return; }

  if (!target.closest(".ns-menu")) { closeMenus(); }
});

function toggleSubs(id) {
  const el = document.getElementById(`subs-${id}`);
  const arrow = document.getElementById(`arrow-${id}`);
  if (el) {
    const isHidden = el.classList.toggle("hidden");
    if (arrow) {
      if (isHidden) arrow.classList.remove("open");
      else arrow.classList.add("open");
    }
  }
}

/* ================= MENU FLUTUANTE ================= */
function closeMenus() { document.querySelectorAll(".ns-menu").forEach(el => el.remove()); }

function openMenuReal(button, type, id) {
  closeMenus();
  const menu = document.createElement("div");
  menu.className = "ns-menu";

  if (type === "category") {
    const btnNew = document.createElement("button"); btnNew.innerHTML = "➕ Criar subcategoria"; btnNew.onclick = () => actionNewSub(id); menu.appendChild(btnNew);
    const btnEdit = document.createElement("button"); btnEdit.innerHTML = "✏️ Editar"; btnEdit.onclick = () => actionEditCat(id); menu.appendChild(btnEdit);
    const btnDel = document.createElement("button"); btnDel.className = "danger"; btnDel.innerHTML = "🗑️ Excluir"; btnDel.onclick = () => actionDelCat(id); menu.appendChild(btnDel);
  } else {
    const btnEdit = document.createElement("button"); btnEdit.innerHTML = "✏️ Editar"; btnEdit.onclick = () => actionEditSub(id); menu.appendChild(btnEdit);
    const btnDel = document.createElement("button"); btnDel.className = "danger"; btnDel.innerHTML = "🗑️ Excluir"; btnDel.onclick = () => actionDelSub(id); menu.appendChild(btnDel);
  }

  const rect = button.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 5;
  const left = rect.left + window.scrollX - 140;
  menu.style.position = "absolute"; menu.style.top = top + "px"; menu.style.left = left + "px";
  document.body.appendChild(menu);
}

/* ================= AÇÕES (SALVAR / EDITAR / EXCLUIR) ================= */

function actionNewSub(id) {
  closeMenus();
  const subsDiv = document.getElementById(`subs-${id}`);
  const arrow = document.getElementById(`arrow-${id}`);

  if (subsDiv) {
    subsDiv.classList.remove("hidden");
    if (arrow) arrow.classList.add("open");
  }

  const box = document.getElementById(`new-sub-${id}`);
  const input = document.getElementById(`sub-input-${id}`);
  if (box && input) {
    box.classList.remove("hidden");
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.onkeydown = (ev) => {
      if (ev.key === "Enter") saveSub(id);
      if (ev.key === "Escape") cancelSub(id);
    };
  }
}

async function saveSub(catId) {
  const input = document.getElementById(`sub-input-${catId}`);
  const name = input.value.trim();
  if (!name) return alert("Digite um nome!");

  const payload = { name: name, categoryId: catId };
  const result = await api("/subcategories", "POST", payload);

  if (result) {
    state.subcategories.push({ id: Date.now(), name: name, category_id: catId });
    cancelSub(catId);

    const openIds = getOpenCategories();
    if (!openIds.includes(String(catId))) openIds.push(String(catId));
    renderCategories(openIds);

    setTimeout(loadData, 1000);
  } else {
    alert("Erro ao salvar.");
  }
}

function cancelSub(catId) {
  const box = document.getElementById(`new-sub-${catId}`);
  const input = document.getElementById(`sub-input-${catId}`);
  if (box) box.classList.add("hidden");
  if (input) input.value = "";
}

/* --- EDITAR (MODAL) --- */
function actionEditCat(id) {
  closeMenus();
  const cat = state.categories.find(c => String(c.id) === String(id));
  if (!cat) return;
  $("edit-modal-title").innerText = "Editar Categoria";
  $("edit-input").value = cat.name;
  $("edit-id").value = id;
  $("edit-type").value = "category";
  openEditModal();
}

function actionEditSub(id) {
  closeMenus();
  const sub = state.subcategories.find(s => String(s.id) === String(id));
  if (!sub) return;
  $("edit-modal-title").innerText = "Editar Subcategoria";
  $("edit-input").value = sub.name;
  $("edit-id").value = id;
  $("edit-type").value = "subcategory";
  openEditModal();
}

function openEditModal() {
  const modal = $("edit-modal");
  const input = $("edit-input");
  modal.classList.remove("hidden");
  setTimeout(() => input.focus(), 100);
  input.onkeydown = (e) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") closeEditModal();
  };
}

function closeEditModal() { $("edit-modal").classList.add("hidden"); }

async function saveEdit() {
  const id = $("edit-id").value;
  const type = $("edit-type").value;
  const name = $("edit-input").value.trim();
  if (!name) return alert("O nome não pode ser vazio.");
  const endpoint = type === "category" ? `/categories/${id}` : `/subcategories/${id}`;
  const result = await api(endpoint, "PATCH", { name });
  if (result) { closeEditModal(); loadData(); }
  else { alert("Erro ao salvar a edição."); }
}


/* --- EXCLUSÃO (MODAL NOVO ROBUSTO) --- */
function actionDelCat(id) {
  closeMenus();
  const cat = state.categories.find(c => String(c.id) === String(id));
  if (!cat) return;
  openDeleteModal(id, "category", cat.name);
}

function actionDelSub(id) {
  closeMenus();
  const sub = state.subcategories.find(s => String(s.id) === String(id));
  if (!sub) return;
  openDeleteModal(id, "subcategory", sub.name);
}

function openDeleteModal(id, type, name) {
  const modal = $("delete-modal");
  const msg = $("delete-message");

  // Configura o texto
  if (type === "category") {
    msg.innerText = `Você tem certeza que deseja excluir a categoria "${name}"? Todas as subcategorias serão apagadas.`;
  } else if (type === "subcategory") {
    msg.innerText = `Você tem certeza que deseja excluir a subcategoria "${name}"?`;
  } else if (type === "product") {
    msg.innerText = `Você tem certeza que deseja excluir o produto "${name}"?`;
  }


  // Configura os IDs ocultos
  $("delete-id").value = id;
  $("delete-type").value = type;

  modal.classList.remove("hidden");
}

function closeDeleteModal() {
  $("delete-modal").classList.add("hidden");
}

async function confirmDelete() {
  const id = $("delete-id").value;
  const type = $("delete-type").value;

  let endpoint = "";

  if (type === "category") {
    endpoint = `/categories/${id}`;
  } else if (type === "subcategory") {
    endpoint = `/subcategories/${id}`;
  } else if (type === "product") {
    endpoint = `/items/${id}`;
  }

  if (!endpoint) return;

  await api(endpoint, "DELETE");

  closeDeleteModal();
  await loadData();
}



/* ================= MODAL PRODUTO ================= */
window.openNewProduct = () => {
  editingProductId = null; selectedImageFile = null; removeImage();
  $("product-modal-title").innerText = "Novo Produto";
  $("prod-id").value = ""; $("prod-name").value = ""; $("prod-description").value = ""; $("prod-price").value = ""; $("prod-stock").value = "";
  fillCategorySelects();
  openProductModal();
};

window.editProduct = (id) => {
  const p = state.products.find(x => x.id === id); if (!p) return;
  editingProductId = id;
  $("product-modal-title").innerText = "Editar Produto";
  $("prod-id").value = p.id; $("prod-name").value = p.name; $("prod-description").value = p.description || ""; $("prod-price").value = p.price; $("prod-stock").value = p.stock;
  fillCategorySelects(p.category_id, p.subcategory_id);
  if (p.image_url) { $("image-preview").src = p.image_url; $("image-preview").classList.remove("hidden"); $("upload-placeholder").classList.add("hidden"); showImageActions(); } else { removeImage(); }
  openProductModal();
};

window.openProductModal = () => $("product-modal").classList.remove("hidden");
window.closeProductModal = () => { $("product-modal").classList.add("hidden"); editingProductId = null; selectedImageFile = null; removeImage(); };
window.openImagePicker = () => $("prod-image").click();
window.previewImage = (e) => { const f = e.target.files[0]; if (!f) return; selectedImageFile = f; const r = new FileReader(); r.onload = () => { $("image-preview").src = r.result; $("image-preview").classList.remove("hidden"); $("upload-placeholder").classList.add("hidden"); showImageActions(); }; r.readAsDataURL(f); };
window.removeImage = () => { selectedImageFile = null; $("image-preview").src = ""; $("image-preview").classList.add("hidden"); $("upload-placeholder").classList.remove("hidden"); hideImageActions(); };
function showImageActions() { hideImageActions(); const a = document.createElement("div"); a.id = "image-actions"; a.className = "image-actions"; a.innerHTML = `<button type="button" onclick="openImagePicker()">✏️</button><button type="button" onclick="removeImage()">✖️</button>`; $("image-preview").parentElement.appendChild(a); }
function hideImageActions() { const a = $("image-actions"); if (a) a.remove(); }
async function uploadImage(file) { const fd = new FormData(); fd.append("file", file); const res = await fetch(`${API}/upload`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body: fd }); if (!res.ok) throw new Error("Erro"); return (await res.json()).url; }

window.saveProduct = async () => {
  const btn = document.querySelector('#product-modal .btn-confirm');
  const originalText = btn.innerText;

  // 1. Avisa que está salvando
  btn.innerText = "Salvando...";
  btn.disabled = true;

  try {
    const id = $("prod-id").value;
    let imageUrl = null;

    // Upload de imagem (se tiver)
    if (selectedImageFile) {
      imageUrl = await uploadImage(selectedImageFile);
    }

    const data = {
      name: $("prod-name").value,
      description: $("prod-description").value,
      price: Number($("prod-price").value.replace(',', '.')),
      stock: Number($("prod-stock").value),
      category_id: $("prod-category").value,
      subcategory_id: $("prod-subcategory").value || null,
      active: true
    };


    if (!data.name.trim()) {
      alert("Informe o nome do produto.");
      btn.innerText = originalText;
      btn.disabled = false;
      return;
    }

    if (isNaN(data.price)) {
      alert("Informe um preço válido.");
      btn.innerText = originalText;
      btn.disabled = false;
      return;
    }

    if (isNaN(data.stock)) {
      alert("Informe o estoque.");
      btn.innerText = originalText;
      btn.disabled = false;
      return;
    }

    if (!data.category_id) {
      alert("Selecione uma categoria.");
      btn.innerText = originalText;
      btn.disabled = false;
      return;
    }




    if (imageUrl) data.image_url = imageUrl;

    // 2. Envia para o servidor e ESPERA a resposta
    const result = await api(id ? `/items/${id}` : "/items", id ? "PATCH" : "POST", data);

    // 3. Só fecha se deu certo (se result não for null)
    if (result !== null && result !== undefined) {


      showNotify("Sucesso 🎉", "Produto salvo com sucesso!");
      // Feedback visual
      closeProductModal();
      await loadData(); // <--- ISSO AQUI ATUALIZA A LISTA SOZINHO
    } else {
      alert("Erro ao salvar. Verifique se você está logado como Admin.");
    }

  } catch (error) {
    console.error(error);
    alert("Erro técnico ao salvar.");
  } finally {
    // Restaura o botão
    btn.innerText = originalText;
    btn.disabled = false;
  }
};


/* ================= MODAL CATEGORIA (CRIAR) ================= */
window.openCategoryModal = () => {
  const modal = $("category-modal");
  const input = $("category-name-input");

  modal.classList.remove("hidden");
  input.value = "";
  setTimeout(() => input.focus(), 100);

  input.onkeydown = (e) => {
    if (e.key === "Enter") saveCategory();
    if (e.key === "Escape") closeCategoryModal();
  };
};

window.closeCategoryModal = () => $("category-modal").classList.add("hidden");

window.saveCategory = async () => {
  const name = $("category-name-input").value.trim();
  if (!name) return alert("Informe o nome da categoria");
  await api("/categories", "POST", { name });
  closeCategoryModal();
  loadData();
};


/* ================= LISTA E SELECTS ================= */
function renderProducts() {
  const tbody = $("inventory-list");
  if (!tbody) return;
  tbody.innerHTML = "";

  // 🔍 Ordena trazendo o buscado para o topo
  const orderedProducts = sortProductsBySearch(state.products, productSearchTerm);

  orderedProducts.forEach(p => {
    const cat = state.categories.find(c => String(c.id) === String(p.category_id))?.name || "-";
    const sub = state.subcategories.find(s => String(s.id) === String(p.subcategory_id))?.name || "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img src="${p.image_url || 'https://via.placeholder.com/56'}" class="product-thumb"></td>
      <td>
        <div class="product-name-text">${p.name}</div>
        ${p.description ? `<div class="product-description">${p.description}</div>` : ""}
      </td>
      <td>${cat}</td>
      <td>${sub}</td>
      <td>R$ ${Number(p.price).toFixed(2)}</td>
      <td>${p.stock}</td>
      <td>
        <label class="switch">
          <input type="checkbox" ${p.active ? "checked" : ""} 
            onchange="toggleProductStatus('${p.id}', ${p.active})">
          <span class="slider"></span>
        </label>
      </td>
      <td style="position: relative;">
  <div class="product-actions">

    <!-- DESKTOP -->
    <div class="product-buttons">
      <button onclick="editProduct('${p.id}')">Editar</button>
      <button class="danger" onclick="deleteProduct('${p.id}')">Excluir</button>
    </div>

    <!-- MOBILE -->
    <div class="product-dots">⋮</div>

    <div class="product-menu">
      <button onclick="editProduct('${p.id}')">Editar</button>
      <button class="danger" onclick="deleteProduct('${p.id}')">Excluir</button>
    </div>

  </div>
</td>





    `;
    tbody.appendChild(tr);
  });


  function sortProductsBySearch(products, term) {
    if (!term) return products;

    const t = term.toLowerCase();

    return products.slice().sort((a, b) => {
      const aMatch = a.name.toLowerCase().includes(t);
      const bMatch = b.name.toLowerCase().includes(t);

      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }


}

function fillCategorySelects(catId = null, subId = null) {
  const catSelect = $("prod-category");
  const subSelect = $("prod-subcategory");
  catSelect.innerHTML = `<option value="">Selecione a categoria</option>`;
  subSelect.innerHTML = `<option value="">Selecione a subcategoria</option>`;
  state.categories.forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = c.name; if (String(c.id) === String(catId)) o.selected = true; catSelect.appendChild(o); });
  if (catId) {
    const subsFiltradas = state.subcategories.filter(s => { const pai = s.category_id || s.categoryId; return String(pai) === String(catId); });
    subsFiltradas.forEach(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; if (String(s.id) === String(subId)) o.selected = true; subSelect.appendChild(o); });
  }
}
$("prod-category")?.addEventListener("change", e => { fillCategorySelects(e.target.value, null); });

window.toggleProductStatus = async (id, current) => { await api(`/items/${id}`, "PATCH", { active: !current }); const p = state.products.find(x => x.id === id); if (p) p.active = !current; renderProducts(); };
window.deleteProduct = (id) => {
  const product = state.products.find(p => String(p.id) === String(id));
  if (!product) return;

  openDeleteModal(id, "product", product.name);
};


loadData();


document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("search-product");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      productSearchTerm = e.target.value.trim();
      renderProducts();
    });
  }
});


function showNotify(title, message) {
  $("notify-title").innerText = title;
  $("notify-message").innerText = message;
  $("notify-modal").classList.remove("hidden");
}

function closeNotify() {
  $("notify-modal").classList.add("hidden");
}

function closeOnOverlay(event) {
  if (event.target.classList.contains("modal-overlay")) {
    event.target.classList.add("hidden");
  }
}

document.addEventListener("click", function (e) {
  const dots = e.target.closest(".product-dots");
  const menuClicked = e.target.closest(".product-menu");

  // Se clicou nos 3 pontinhos
  if (dots) {
    e.stopPropagation();

    // Fecha todos primeiro
    document.querySelectorAll(".product-menu").forEach(menu => {
      menu.style.display = "none";
    });

    const menu = dots.nextElementSibling;
    menu.style.display = "flex";
    return;
  }

  // Se clicou dentro do menu, não fecha
  if (menuClicked) return;

  // Se clicou fora, fecha tudo
  document.querySelectorAll(".product-menu").forEach(menu => {
    menu.style.display = "none";
  });
});






