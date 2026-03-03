import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import nodemailer from "nodemailer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import pkg from "pg";
const { Pool } = pkg;
import { MercadoPagoConfig, Payment } from 'mercadopago';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// --- CONFIGURAÇÃO DE DIRETÓRIO (ES Modules) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APPEARANCE_FILE = path.join(__dirname, 'appearance_settings.json');

const app = express();

// ================= BANCO DE DADOS (NEON / POSTGRES) =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= CONFIGURAÇÃO CLOUDINARY =================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ================= FUNÇÕES AUXILIARES SQL =================
const buildInsert = (table, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  return {
    text: `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values
  };
};

const buildUpdate = (table, data, idCol, idVal) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  return {
    text: `UPDATE ${table} SET ${setString} WHERE ${idCol} = $${keys.length + 1} RETURNING *`,
    values: [...values, idVal]
  };
};

// ================= CORS DEFINITIVO =================
const allowedOrigins = [
  "http://localhost:5173",
  "https://temperodemae-frontend.vercel.app"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

// --- CONFIGURAÇÕES DE ENV ---
const JWT_SECRET = process.env.JWT_SECRET || "segredo_padrao";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// --- CONFIGURAÇÃO DE E-MAIL ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const mpClient = MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN }) : null;

// --- CONFIGURAÇÃO DE UPLOAD (CLOUDINARY) ---
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cardapio_imagens', 
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

// --- FUNÇÃO AUXILIAR: GERADOR DE CPF (Para testes do Pix) ---
function geraCPF() {
  const rnd = (n) => Math.round(Math.random() * n);
  const mod = (base, div) => Math.round(base - Math.floor(base / div) * div);
  const n = Array(9).fill(0).map(() => rnd(9));
  let d1 = n.reduce((total, num, i) => total + (num * (10 - i)), 0);
  d1 = 11 - mod(d1, 11); if (d1 >= 10) d1 = 0;
  let d2 = n.reduce((total, num, i) => total + (num * (11 - i)), 0) + (d1 * 2);
  d2 = 11 - mod(d2, 11); if (d2 >= 10) d2 = 0;
  return `${n.join('')}${d1}${d2}`;
}

// --- MIDDLEWARES ---
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Token ausente" });
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso restrito a admin" });
    next();
  });
}

app.get('/favicon.ico', (req, res) => res.status(204).end());

// ==================================================================
// ROTAS DE APARÊNCIA (CARDÁPIO)
// ==================================================================

app.get('/store/appearance', (req, res) => {
  try {
    if (fs.existsSync(APPEARANCE_FILE)) {
      const data = fs.readFileSync(APPEARANCE_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({
        colors: { header: "#0F172A", primary: "#3B82F6", background: "#F3F4F6" },
        logo_url: "",
        banners: []
      });
    }
  } catch (error) {
    console.error("Erro ao ler aparência:", error);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.post('/store/appearance', (req, res) => {
  try {
    const settings = req.body;
    if (!settings.colors) return res.status(400).json({ error: "Dados inválidos" });
    fs.writeFileSync(APPEARANCE_FILE, JSON.stringify(settings, null, 2));
    res.json({ success: true, message: "Configurações salvas!" });
  } catch (error) {
    console.error("Erro ao salvar aparência:", error);
    res.status(500).json({ error: "Erro ao salvar" });
  }
});

// ==================================================================
// OUTRAS ROTAS (AUTH, PEDIDOS, ETC)
// ==================================================================

app.post("/auth/login", async (req, res) => {
  const { email, phone, password } = req.body;

  // Login Admin
  if (email) {
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
      const token = jwt.sign({ role: "admin", name: "Administrador" }, JWT_SECRET, { expiresIn: "1d" });
      return res.json({ token, user: { name: "Admin", role: "admin" } });
    }
    return res.status(401).json({ error: "Credenciais de admin inválidas" });
  }

  // Login Cliente
  if (phone) {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM customers WHERE phone = $1 LIMIT 1",
        [phone]
      );

      const user = rows[0];
      if (!user) return res.status(400).json({ error: "Usuário não encontrado" });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(400).json({ error: "Senha incorreta" });

      const token = jwt.sign(
        { id: user.id, phone: user.phone, name: user.name, role: "customer" },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      return res.json({ token, user: { id: user.id, phone: user.phone, name: user.name } });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro no servidor" });
    }
  }
  return res.status(400).json({ error: "Informe login" });
});

app.post("/auth/register", async (req, res) => {
  const { name, phone, password, email } = req.body;
  try {
    const { rows: existingRows } = await pool.query(
      "SELECT id FROM customers WHERE phone = $1 LIMIT 1",
      [phone]
    );

    if (existingRows.length) {
      return res.status(400).json({ error: "Telefone já cadastrado" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      "INSERT INTO customers (name, phone, password_hash, email) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, phone, password_hash, email || null]
    );

    const data = rows[0];
    const token = jwt.sign({ id: data.id, role: "customer" }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({ token, user: { id: data.id, name: data.name, phone: data.phone } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/settings", async (req, res) => { 
  try {
    const { rows } = await pool.query("SELECT * FROM store_settings ORDER BY id ASC");
    res.json(rows); 
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= ROTAS DE LEITURA (CARDÁPIO PARA O CLIENTE) =================

app.get("/categories", async (req, res) => { 
  try {
    const { rows } = await pool.query("SELECT * FROM categories ORDER BY position ASC, id ASC");
    res.json(rows || []); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/subcategories", async (req, res) => { 
  try {
    const { rows } = await pool.query("SELECT * FROM subcategories ORDER BY position ASC, id ASC");
    res.json(rows || []); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 👉 Rota que o painel Admin (estoque.js) costuma chamar:
app.get("/items", async (req, res) => { 
  try {
    const { rows } = await pool.query("SELECT * FROM menu_items WHERE active = true ORDER BY name ASC");
    res.json(rows || []); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 👉 Rota extra caso o frontend do cliente (cliente.js) esteja chamando com outro nome:
app.get("/menu_items", async (req, res) => { 
  try {
    const { rows } = await pool.query("SELECT * FROM menu_items WHERE active = true ORDER BY name ASC");
    res.json(rows || []); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= ROTAS ADMIN (Migradas para pg e Cloudinary) =================

app.post("/upload", adminMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo obrigatório" });
  return res.json({ url: req.file.path });
});

app.post("/items", adminMiddleware, async (req, res) => { 
  try {
    const query = buildInsert("menu_items", req.body);
    await pool.query(query);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/items/:id", adminMiddleware, async (req, res) => { 
  try {
    const query = buildUpdate("menu_items", req.body, "id", req.params.id);
    await pool.query(query);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/items/:id", adminMiddleware, async (req, res) => { 
  try {
    await pool.query("DELETE FROM menu_items WHERE id = $1", [req.params.id]);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/categories", adminMiddleware, async (req, res) => { 
  try {
    const query = buildInsert("categories", req.body);
    await pool.query(query);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/categories/:id", adminMiddleware, async (req, res) => { 
  try {
    await pool.query("DELETE FROM categories WHERE id = $1", [req.params.id]);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/subcategories", adminMiddleware, async (req, res) => { 
  try {
    await pool.query("INSERT INTO subcategories (name, category_id) VALUES ($1, $2)", [req.body.name, req.body.categoryId]);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/subcategories/:id", adminMiddleware, async (req, res) => { 
  try {
    await pool.query("DELETE FROM subcategories WHERE id = $1", [req.params.id]);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/settings", adminMiddleware, async (req, res) => { 
  try {
    const query = buildUpdate("store_settings", req.body, "id", 1);
    await pool.query(query);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/orders", adminMiddleware, async (req, res) => { 
  try {
    const { rows } = await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100");
    res.json(rows || []); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/orders/:id/status", adminMiddleware, async (req, res) => { 
  try {
    await pool.query("UPDATE orders SET status = $1 WHERE id = $2", [req.body.status, req.params.id]);
    res.json({ success: true }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= PEDIDOS (Migrados para pg) =================

app.get("/orders/me", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
    res.json(rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/orders/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/orders/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT user_id, status FROM orders WHERE id = $1", [req.params.id]);
    const order = rows[0];

    if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
    if (order.user_id !== req.user.id) return res.status(403).json({ error: "Proibido" });
    if (order.status !== 'novo' && order.status !== 'agendado' && order.status !== 'aguardando_pagamento') return res.status(400).json({ error: "Já em preparo." });
    
    await pool.query("UPDATE orders SET status = 'cancelado' WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/orders", async (req, res) => {
  try {
    const order = req.body;
    const isPickup = (order.fulfillment === "pickup");
    if (isPickup) order.deliveryFee = 0;
    const initialStatus = order.paymentMethod === 'Pix' ? 'aguardando_pagamento' : 'novo';

    const customerData = {
      ...order.customer,
      paymentMethod: order.paymentMethod,
      change: order.change,
      scheduledTo: order.scheduledTo
    };

    const { rows } = await pool.query(
      `INSERT INTO orders 
       (items, subtotal, delivery_fee, discount, total, coupon_used, neighborhood, customer, status, fulfillment, user_id, distance_km) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        JSON.stringify(order.items),
        order.subtotal,
        order.deliveryFee,
        order.discount,
        order.total,
        order.couponUsed,
        order.neighborhood,
        JSON.stringify(customerData),
        initialStatus,
        order.fulfillment || "delivery",
        order.user_id,
        order.distance_km || 0
      ]
    );

    let savedOrder = rows[0];

    if (order.paymentMethod === 'Pix' && mpClient) {
      try {
        console.log(`🤖 Gerando Pix para Pedido #${savedOrder.id}...`);
        const payment = new Payment(mpClient);
        const randomPart = Math.floor(Math.random() * 10000);
        const cpfGerado = geraCPF();

        const bodyPayment = {
          transaction_amount: Number(savedOrder.total),
          description: `Pedido ${savedOrder.id} - Tempero`,
          payment_method_id: 'pix',
          payer: {
            email: `cliente_teste_${randomPart}@gmail.com`,
            first_name: order.customer.name.split(' ')[0] || 'Cliente',
            identification: { type: 'CPF', number: cpfGerado }
          },
          notification_url: 'https://api-temperodemae.onrender.com/webhook/mercadopago'
        };

        const requestOptions = { idempotencyKey: `order_${savedOrder.id}_${Date.now()}` };
        const pixData = await payment.create({ body: bodyPayment, requestOptions });

        console.log("✅ Pix Gerado com Sucesso!");
        
        const pixDataToSave = {
          qr_code: pixData.point_of_interaction.transaction_data.qr_code,
          qr_base64: pixData.point_of_interaction.transaction_data.qr_code_base64,
          id: pixData.id
        };
        savedOrder.pixData = pixDataToSave;

        await pool.query(
          "UPDATE orders SET pix_payment_id = $1 WHERE id = $2",
          [pixData.id, savedOrder.id]
        );

      } catch (mpError) {
        console.error("❌ ERRO MP:", mpError);
        savedOrder.pixError = "Erro no Pix.";
      }
    }
    res.json(savedOrder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= WEBHOOK MERCADO PAGO =================
app.post("/webhook/mercadopago", express.json(), async (req, res) => {
  console.log("🔔 Webhook recebido:", req.body);
  const { type, data } = req.body;

  res.sendStatus(200);

  if (type !== "payment" || !data?.id || !mpClient) return;

  try {
    const payment = new Payment(mpClient);
    const payInfo = await payment.get({ id: data.id });

    console.log("📥 Status do Pix:", payInfo.status, "ID:", data.id);

    if (payInfo.status === "approved") {
      const { rows } = await pool.query(
        "SELECT id FROM orders WHERE pix_payment_id = $1 LIMIT 1",
        [data.id]
      );
      
      const order = rows[0];

      if (!order) {
        console.warn("⚠️ Pedido não encontrado para este Pix:", data.id);
        return;
      }

      await pool.query(
        "UPDATE orders SET status = 'em_preparo' WHERE id = $1",
        [order.id]
      );

      console.log(`✅ Pedido #${order.id} marcado como PAGO.`);
    }

  } catch (err) {
    console.error("❌ Erro no webhook:", err);
  }
});

// ================= SERVIR ARQUIVOS HTML =================
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor ON na porta ${PORT}`);
});
