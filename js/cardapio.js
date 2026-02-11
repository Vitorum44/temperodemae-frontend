import { API_URL } from "./app-api.js";

const token = localStorage.getItem('token');
if (!token) { window.location.href = "admin.html"; }

// ELEMENTOS
const form = document.getElementById('appearance-form');
const iframe = document.getElementById('preview-iframe');

// Inputs de Cor
const inpHeader = document.getElementById('input-header-bg');
const txtHeader = document.getElementById('text-header-bg');
const inpPrimary = document.getElementById('input-primary-color');
const txtPrimary = document.getElementById('text-primary-color');
const inpBody = document.getElementById('input-body-bg');
const txtBody = document.getElementById('text-body-bg');

// Inputs de Upload (Logo)
const fileLogo = document.getElementById('file-logo');
const inpLogo = document.getElementById('input-logo');
const imgLogoSmall = document.getElementById('logo-preview-small');
const loadLogo = document.getElementById('loading-logo');

// Inputs de Upload (Banner)
const fileBanner = document.getElementById('file-banner');
const loadBanner = document.getElementById('loading-banner');
const listContainer = document.getElementById('banners-list-container');

let banners = [];

// --- FUNÇÃO DE UPLOAD (MANDA PRO SERVIDOR) ---
async function uploadImage(fileElement, loadingElement) {
    const file = fileElement.files[0];
    if (!file) return null;

    // Mostra "Carregando..."
    if(loadingElement) loadingElement.style.display = 'block';
    fileElement.disabled = true;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API_URL}/upload`, {
            method: "POST",
            headers: { 'Authorization': `Bearer ${token}` }, // Token para permissão
            body: formData
        });

        if (!res.ok) throw new Error("Falha no upload");

        const data = await res.json();
        return data.url; // Retorna o link da imagem no Supabase
    } catch (error) {
        alert("Erro ao enviar imagem. Verifique se o arquivo não é muito grande.");
        console.error(error);
        return null;
    } finally {
        // Esconde "Carregando..."
        if(loadingElement) loadingElement.style.display = 'none';
        fileElement.disabled = false;
        fileElement.value = ""; // Limpa o input para poder enviar o mesmo arquivo se quiser
    }
}

// --- COMUNICAÇÃO COM IPHONE ---
function sendToIframe(type, payload) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type, ...payload }, '*');
    }
}
function updateLivePreview() {
    sendToIframe('UPDATE_COLORS', {
        header: inpHeader.value,
        primary: inpPrimary.value,
        background: inpBody.value
    });
}

// --- EVENTOS DE UPLOAD ---

// 1. Upload de Logo
fileLogo.addEventListener('change', async () => {
    const url = await uploadImage(fileLogo, loadLogo);
    if (url) {
        inpLogo.value = url; // Salva o link no input texto
        imgLogoSmall.src = url; // Mostra na miniatura
        sendToIframe('UPDATE_LOGO', { src: url }); // Atualiza iPhone
    }
});

// 2. Upload de Banner
fileBanner.addEventListener('change', async () => {
    const url = await uploadImage(fileBanner, loadBanner);
    if (url) {
        banners.push(url); // Adiciona na lista
        renderBanners(); // Atualiza HTML
        sendToIframe('UPDATE_BANNERS', { banners }); // Atualiza iPhone
    }
});

// --- EVENTOS DE COR (Sincronizados) ---
const colorPairs = [
    { color: inpHeader, text: txtHeader },
    { color: inpPrimary, text: txtPrimary },
    { color: inpBody, text: txtBody }
];

colorPairs.forEach(pair => {
    if(pair.color && pair.text) {
        pair.color.addEventListener('input', (e) => {
            pair.text.value = e.target.value.toUpperCase(); 
            updateLivePreview();
        });
        pair.text.addEventListener('input', (e) => {
            let val = e.target.value;
            if (!val.startsWith('#') && val.length > 0) val = '#' + val;
            if (/^#[0-9A-F]{6}$/i.test(val)) {
                pair.color.value = val;
                updateLivePreview();
            }
        });
    }
});

// --- RENDERIZAR LISTA DE BANNERS ---
function renderBanners() {
    listContainer.innerHTML = banners.map((url, i) => `
        <div style="display:flex; gap:10px; margin-top:8px; background:#f9fafb; padding:8px; border-radius:4px; align-items:center; border:1px solid #eee;">
            <img src="${url}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
            <span style="flex:1; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${url}</span>
            <button type="button" onclick="removeBanner(${i})" style="color:red; border:none; background:none; cursor:pointer; font-weight:bold; font-size:16px;">&times;</button>
        </div>
    `).join('');
}

window.removeBanner = (i) => { 
    banners.splice(i, 1); 
    renderBanners(); 
    sendToIframe('UPDATE_BANNERS', { banners }); 
};

// --- CARREGAR DADOS INICIAIS ---
async function init() {
    try {
        const res = await fetch(`${API_URL}/store/appearance`, { headers: { 'Authorization': `Bearer ${token}` } });
        if(res.ok) {
            const data = await res.json();
            
            if(data.colors) {
                inpHeader.value = data.colors.header; if(txtHeader) txtHeader.value = data.colors.header.toUpperCase();
                inpPrimary.value = data.colors.primary; if(txtPrimary) txtPrimary.value = data.colors.primary.toUpperCase();
                inpBody.value = data.colors.background; if(txtBody) txtBody.value = data.colors.background.toUpperCase();
            }

            if(data.logo_url) {
                inpLogo.value = data.logo_url;
                imgLogoSmall.src = data.logo_url;
            }

            if(data.banners && Array.isArray(data.banners)) banners = data.banners;
            
            renderBanners();

            const forceUpdate = () => {
                sendToIframe('UPDATE_COLORS', data.colors);
                sendToIframe('UPDATE_LOGO', { src: data.logo_url });
                sendToIframe('UPDATE_BANNERS', { banners });
            };
            forceUpdate();
            iframe.onload = forceUpdate;
        }
    } catch(e) { console.error(e); }
}

// --- SALVAR ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const txtOriginal = btn.innerText;
    btn.innerText = "SALVANDO..."; btn.disabled = true;

    try {
        const body = {
            colors: { header: inpHeader.value, primary: inpPrimary.value, background: inpBody.value },
            logo_url: inpLogo.value,
            banners: banners
        };
        await fetch(`${API_URL}/store/appearance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        alert("Salvo com sucesso!");
    } catch(e) { alert("Erro ao salvar"); }
    finally { btn.innerText = txtOriginal; btn.disabled = false; }
});

init();