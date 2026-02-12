// ================= RENDERIZAR MENU (CORRIGIDO) =================
function renderItems() {
  const originalScroll = window.scrollY;

  if (!grid) return;

  grid.innerHTML = '';

  const term = state.filters.q ? state.filters.q.toLowerCase() : '';

  state.categories.forEach(cat => {
    
    // 👇 AQUI ESTÁ A CORREÇÃO (BLINDAGEM) 👇
    // Usamos String() para garantir que o ID "1" (texto) seja igual a 1 (número)
    let itemsInCat = state.items.filter(i => {
        const idCategoriaItem = i.category_id || i.categoryId;
        return String(idCategoriaItem) === String(cat.id);
    });

    // Filtra pelo nome se o cliente digitou na busca
    if (term) {
      itemsInCat = itemsInCat.filter(i =>
        i.name.toLowerCase().includes(term)
      );
    }

    // Só desenha a categoria se tiver itens dentro
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
  window.scrollTo(0, originalScroll);
}
