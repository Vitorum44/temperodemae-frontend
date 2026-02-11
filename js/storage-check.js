// js/storage-check.js
import { app, storage } from "./app.js";
import { ref } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-storage.js";

const loader   = document.getElementById("loader");
const alertBox = document.getElementById("alert-storage");

// Esconde o loader quando o DOM montar
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => loader?.classList?.add("hidden"), 600);
});

// Verificação robusta do bucket do Storage (sem upload)
try {
  const bucket =
    app?.options?.storageBucket ||
    storage?.app?.options?.storageBucket;

  if (!bucket || !bucket.includes("appspot.com")) {
    throw new Error("Bucket ausente/ inválido na config");
  }

  // Cria uma referência “no-op” só para validar objeto/SDK
  ref(storage, "healthcheck/_noop.txt");

  // Se chegou aqui, está tudo OK → esconde alerta
  if (alertBox) alertBox.hidden = true;
} catch (e) {
  console.warn("[Storage check]", e);
  if (alertBox) alertBox.hidden = false;
}
