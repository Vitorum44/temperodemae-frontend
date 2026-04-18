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
import { Resend } from "resend";

dotenv.config();



// --- CONFIGURAÇÃO DE DIRETÓRIO (ES Modules) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APPEARANCE_FILE = path.join(__dirname, 'appearance_settings.json');

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

// ================= BANCO DE DADOS (NEON / POSTGRES) =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ✅ Evita crash quando o Neon derruba conexões ociosas
pool.on('error', (err, client) => {
  console.error('⚠️ Conexão perdida com o banco:', err.message);
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONFIGURAÇÕES DE ENV ---
const JWT_SECRET = process.env.JWT_SECRET || "segredo_padrao";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// --- CONFIGURAÇÃO DE E-MAIL ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: 10,
  socketTimeout: 10000 // 10 segundos
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
// ROTAS DE APARÊNCIA (SALVAS NO NEON / POSTGRES)
// ==================================================================

app.get('/store/appearance', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT settings FROM appearance_settings WHERE id = 1");
    
    if (rows.length > 0) {
      res.json(rows[0].settings);
    } else {
      res.json({
        colors: { header: "#0F172A", primary: "#d62300", "background": "#F3F4F6" },
        logo_url: "",
        banners: []
      });
    }
  } catch (error) {
    console.error("Erro ao ler aparência do banco:", error);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.post('/store/appearance', adminMiddleware, async (req, res) => {
  try {
    const settings = req.body;
    if (!settings.colors) return res.status(400).json({ error: "Dados inválidos" });

    // Salva direto no Neon! Atualiza as informações onde o ID é 1
    await pool.query(
      `INSERT INTO appearance_settings (id, settings) 
       VALUES (1, $1) 
       ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings`,
      [JSON.stringify(settings)]
    );

    res.json({ success: true, message: "Configurações salvas no Banco de Dados!" });
  } catch (error) {
    console.error("Erro ao salvar aparência no banco:", error);
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

// 🔥 COLE AQUI EMBAIXO 🔥
app.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    // ✅ busca dados frescos do banco, não do token
    if (req.user.role === "admin") {
      return res.json({ id: null, name: "Administrador", role: "admin" });
    }

    const { rows } = await pool.query(
      "SELECT id, name, phone, email FROM customers WHERE id = $1 LIMIT 1",
      [req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "Usuário não encontrado" });

    res.json({ ...rows[0], role: "customer" });

  } catch (err) {
    res.status(500).json({ error: "Erro ao validar usuário" });
  }
});


// ================= ATUALIZAR DADOS DO USUÁRIO =================
app.patch("/auth/update", authMiddleware, async (req, res) => {
  const { name, phone, email, password } = req.body;

  try {

    let password_hash = null;

    if (password && password.trim().length >= 6) {
      password_hash = await bcrypt.hash(password, 10);
    }

    if (password_hash) {
      await pool.query(
        `UPDATE customers 
         SET name=$1, phone=$2, email=$3, password_hash=$4 
         WHERE id=$5`,
        [name, phone, email, password_hash, req.user.id]
      );
    } else {
      await pool.query(
        `UPDATE customers 
         SET name=$1, phone=$2, email=$3
         WHERE id=$4`,
        [name, phone, email, req.user.id]
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    res.status(500).json({ error: "Erro ao atualizar dados" });
  }
});

// ================= RECUPERAÇÃO DE SENHA (GRÁTIS POR E-MAIL) =================
app.post("/auth/request-reset", async (req, res) => {
  const identifier = req.body.phone || req.body.email || req.body.login;

  if (!identifier) {
    return res.status(400).json({ error: "Informe o número do WhatsApp cadastrado." });
  }

  try {

    // 1️⃣ Procura usuário no banco
    const { rows } = await pool.query(
      "SELECT id, name, email FROM customers WHERE phone = $1 OR email = $1 LIMIT 1",
      [identifier]
    );

    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: "Nenhuma conta encontrada com este número." });
    }

    // 2️⃣ Verifica se tem email cadastrado
    if (!user.email) {
      return res.status(400).json({
        error: "Esta conta não possui e-mail cadastrado. Fale com o suporte."
      });
    }

    // 3️⃣ Gera nova senha provisória
    const novaSenha = Math.floor(100000 + Math.random() * 900000).toString();

    const password_hash = await bcrypt.hash(novaSenha, 10);

    // 4️⃣ Atualiza senha no banco
    await pool.query(
      "UPDATE customers SET password_hash = $1 WHERE id = $2",
      [password_hash, user.id]
    );

    // 5️⃣ Envia e-mail usando RESEND
    await transporter.sendMail({
      from: `"Tempero de Mãe" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Recuperação de Senha - Tempero de Mãe",
      html: `
        <div style="font-family:sans-serif;padding:20px;color:#111">
          <h2>Olá, ${user.name}! 🍔</h2>
          <p>Você solicitou recuperação de senha no nosso site.</p>
          <p>Sua nova senha provisória é:</p>
          <h1 style="color:#d62300;font-size:32px">${novaSenha}</h1>
          <p>Faça login usando essa senha e depois altere no seu perfil se quiser.</p>
          <hr style="margin:20px 0">
          <small style="color:#777">Tempero de Mãe Delivery</small>
        </div>
      `
    });

    return res.json({
      success: true,
      message: "Enviamos uma nova senha para o seu e-mail cadastrado!"
    });

  } catch (err) {
    console.error("❌ ERRO AO RECUPERAR SENHA:", err);
    return res.status(500).json({
      error: "Erro interno. Tente novamente mais tarde."
    });
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

app.post("/upload", adminMiddleware, (req, res) => {
  upload.single("file")(req, res, (err) => {
    // Se der erro no Multer/Cloudinary, ele cai aqui e imprime o erro real!
    if (err) {
      console.error("❌ ERRO NO CLOUDINARY:", err.message);
      console.error("🔍 DETALHES DO ERRO:", JSON.stringify(err, null, 2));
      return res.status(500).json({ error: "Erro ao subir imagem", detalhes: err.message });
    }
    
    if (!req.file) return res.status(400).json({ error: "Arquivo obrigatório" });
    return res.json({ url: req.file.path });
  });
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

// ================= ACOMPANHAMENTOS 🔥 =================

// SALVAR
app.post("/acompanhamentos", adminMiddleware, async (req, res) => {
  try {
    const { produto, groups } = req.body;

    if (!produto || !groups) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    await pool.query(
      `
      INSERT INTO product_acompanhamentos (product_id, groups)
      VALUES ($1, $2)
      ON CONFLICT (product_id)
      DO UPDATE SET groups = EXCLUDED.groups
      `,
      [produto, JSON.stringify(groups)]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Erro ao salvar acompanhamentos:", err);
    res.status(500).json({ error: err.message });
  }
});

// BUSCAR
app.get("/acompanhamentos/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT groups FROM product_acompanhamentos WHERE product_id = $1 LIMIT 1",
      [req.params.id]
    );

    res.json(rows[0]?.groups || []);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

    // ✅ Reconstrói pixData se existir
    if (order.pix_qr_code && order.pix_qr_base64) {
      order.pixData = {
        qr_code: order.pix_qr_code,
        qr_base64: order.pix_qr_base64,
        id: order.pix_payment_id
      };
    }

    res.json(order);
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

    // ✅ VALIDAÇÃO DE PREÇOS (SEGURANÇA SÊNIOR)
    let totalCalculado = 0;
    for (const item of order.items) {
      const { rows } = await pool.query(
        'SELECT price FROM menu_items WHERE id = $1 AND active = true',
        [item.itemId]
      );
      if (!rows[0]) {
        return res.status(400).json({ error: `Produto não encontrado: ${item.name}` });
      }
      const precoReal = Number(rows[0].price);
      const precoEnviado = Number(item.price);
      if (Math.abs(precoReal - precoEnviado) > 0.01) {
        return res.status(400).json({ error: `Preço inválido para ${item.name}. Recarregue a página.` });
      }
      totalCalculado += precoReal * item.qty;
    }

    // Valida o total geral (subtotal)
    if (Math.abs(totalCalculado - order.subtotal) > 0.10) {
      return res.status(400).json({ error: 'Total inválido. Recarregue a página.' });
    }
    // ✅ FIM VALIDAÇÃO

    const customerData = {
      ...order.customer,
      paymentMethod: order.paymentMethod,
      change: order.change,
      scheduledTo: order.scheduledTo
    };

    const { rows } = await pool.query(
  `INSERT INTO orders 
   (items, subtotal, delivery_fee, discount, total, coupon_used, neighborhood, customer, status, fulfillment, user_id, distance_km, "paymentMethod") 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
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
    order.distance_km || 0,
    order.paymentMethod
  ]
);

let savedOrder = rows[0];

    // ================= BAIXAR ESTOQUE =================
try {
  const items = order.items;

  for (const item of items) {

    // verifica estoque atual
    const { rows } = await pool.query(
      "SELECT stock FROM menu_items WHERE id = $1",
      [item.itemId]
    );

    const product = rows[0];

    if (!product) {
      return res.status(400).json({ error: "Produto não encontrado" });
    }

    if (product.stock < item.qty) {
      return res.status(400).json({
        error: `Estoque insuficiente para ${item.name}`
      });
    }

    // diminui estoque
    await pool.query(
      "UPDATE menu_items SET stock = stock - $1 WHERE id = $2",
      [item.qty, item.itemId]
    );
  }

} catch (stockError) {
  console.error("Erro ao atualizar estoque:", stockError);
}

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
  "UPDATE orders SET pix_payment_id = $1, pix_qr_code = $2, pix_qr_base64 = $3 WHERE id = $4",
  [pixData.id, pixDataToSave.qr_code, pixDataToSave.qr_base64, savedOrder.id]
);

      } catch (mpError) {
        console.error("❌ ERRO MP:", mpError);
        savedOrder.pixError = "Erro no Pix.";
      }
    }
    // ✅ EMAIL DE CONFIRMAÇÃO
if (order.customer?.email) {
  try {
    const itemsHtml = (order.items || []).map(i => `
      <tr>
        <td style="padding:8px 0; border-bottom:1px solid #f5f5f5; font-size:13px; color:#333;">${i.qty}x ${i.name}</td>
        <td style="padding:8px 0; border-bottom:1px solid #f5f5f5; font-size:13px; color:#333; text-align:right;">R$ ${(i.price * i.qty).toFixed(2)}</td>
      </tr>
    `).join('');

    const trackUrl = `https://temperodemae-frontend.vercel.app?orderId=${savedOrder.id}`;

    await transporter.sendMail({
      from: `"Tempero de Mãe 🍔" <${process.env.EMAIL_USER}>`,
      to: order.customer.email,
      subject: `✅ Pedido #${savedOrder.id} recebido — Tempero de Mãe`,
      html: `
        <div style="font-family:Arial,sans-serif; max-width:520px; margin:0 auto; background:#f9f9f9; padding:20px;">
          
          <div style="background:#d62300; padding:28px; text-align:center; border-radius:12px 12px 0 0;">
            <div style="font-size:32px;">🍔</div>
            <div style="color:white; font-size:20px; font-weight:bold; margin-top:8px;">Tempero de Mãe</div>
            <div style="color:rgba(255,255,255,0.85); font-size:13px; margin-top:4px;">Seu pedido foi recebido!</div>
          </div>

          <div style="background:#fff; padding:24px; border-radius:0 0 12px 12px;">
            
            <p style="font-size:15px; color:#111; margin:0 0 6px;">Olá, <strong>${order.customer.name?.split(' ')[0] || 'Cliente'}</strong>!</p>
            <p style="font-size:13px; color:#666; margin:0 0 20px; line-height:1.6;">
              Recebemos seu pedido e já estamos preparando tudo com carinho. 😊
            </p>

            <div style="background:#fff8f0; border:1px solid #f59e0b; border-radius:20px; display:inline-block; padding:5px 14px; margin-bottom:20px;">
              <span style="font-size:12px; color:#92400e; font-weight:bold;">🟡 Pedido recebido — aguardando preparo</span>
            </div>

            <div style="background:#f9f9f9; border-radius:8px; padding:16px; margin-bottom:20px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:12px; color:#888;">Pedido</span>
                <span style="font-size:12px; font-weight:bold; color:#111;">#${savedOrder.id}</span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:12px; color:#888;">Data</span>
                <span style="font-size:12px; color:#111;">${new Date().toLocaleString('pt-BR')}</span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:12px; color:#888;">Pagamento</span>
                <span style="font-size:12px; color:#111;">${order.paymentMethod || '—'}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="font-size:12px; color:#888;">Entrega</span>
                <span style="font-size:12px; color:#111; text-align:right; max-width:200px;">
                  ${order.fulfillment === 'pickup' ? 'Retirada na loja' : `${order.customer.address || '—'}`}
                </span>
              </div>
            </div>

            <div style="font-size:13px; font-weight:bold; color:#111; margin-bottom:10px;">Itens do pedido</div>
            
            <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
              ${itemsHtml}
              <tr>
                <td style="padding:8px 0; font-size:12px; color:#888;">Frete</td>
                <td style="padding:8px 0; font-size:12px; color:#888; text-align:right;">
                  ${order.deliveryFee > 0 ? `R$ ${Number(order.deliveryFee).toFixed(2)}` : 'Grátis'}
                </td>
              </tr>
              <tr style="border-top:2px solid #eee;">
                <td style="padding:12px 0 0; font-size:15px; font-weight:bold; color:#111;">Total</td>
                <td style="padding:12px 0 0; font-size:15px; font-weight:bold; color:#d62300; text-align:right;">
                  R$ ${Number(order.total).toFixed(2)}
                </td>
              </tr>
            </table>

            <div style="text-align:center; margin-bottom:20px;">
              <a href="${trackUrl}" style="display:inline-block; background:#d62300; color:white; padding:13px 30px; border-radius:25px; font-size:14px; font-weight:bold; text-decoration:none;">
                Acompanhar meu pedido →
              </a>
            </div>

            <p style="font-size:12px; color:#888; text-align:center; line-height:1.6; margin:0;">
              Dúvidas? Fale com a gente pelo WhatsApp<br>
              <a href="https://wa.me/5584996065229" style="color:#d62300;">(84) 99606-5229</a>
            </p>
          </div>

          <p style="font-size:11px; color:#aaa; text-align:center; margin-top:16px; line-height:1.6;">
            Tempero de Mãe · R. Lauro Bezerra, 89 · Pajuçara · Natal, RN
          </p>
        </div>
      `
    });
    console.log(`📧 E-mail enviado para ${order.customer.email}`);
  } catch (emailErr) {
    console.error('❌ Erro ao enviar e-mail:', emailErr.message);
  }
}

res.json(savedOrder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= RESETAR SENHA =================
app.post("/auth/reset-password", async (req, res) => {

  const { token, password } = req.body;

  try {

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "UPDATE customers SET password_hash=$1 WHERE id=$2",
      [hash, decoded.id]
    );

    res.json({ success: true });

  } catch {

    res.status(400).json({
      error: "Token inválido ou expirado"
    });

  }

});


// ================= ESQUECI MINHA SENHA (LINK MÁGICO) =================
app.post("/auth/forgot-password", async (req, res) => {

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Informe seu e-mail." });
  }

  try {

    const { rows } = await pool.query(
      "SELECT id, name, email FROM customers WHERE email = $1 LIMIT 1",
      [email]
    );

    const user = rows[0];

    if (!user) {
      return res.json({ success: true }); 
      // não revela se existe ou não
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const resetLink = `https://temperodemae.vercel.app/reset-password.html?token=${token}`;

    await resend.emails.send({
      from: "Tempero de Mãe <onboarding@resend.dev>",
      to: user.email,
      subject: "Redefinir senha",
      html: `
        <h2>Olá ${user.name}</h2>

        <p>Clique no botão abaixo para redefinir sua senha:</p>

        <a href="${resetLink}" style="
          background:#d62300;
          color:white;
          padding:12px 20px;
          border-radius:8px;
          text-decoration:none;
          font-weight:bold;
        ">
        Redefinir senha
        </a>

        <p>Este link expira em 15 minutos.</p>
      `
    });

    res.json({ success: true });

  } catch (err) {

    console.error("Erro forgot password:", err);

    res.status(500).json({
      error: "Erro ao enviar recuperação."
    });

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

// Armazena códigos temporários em memória
const resetCodes = new Map();

app.post("/auth/send-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Informe o telefone." });

  try {
    const { rows } = await pool.query(
      "SELECT id, name, email FROM customers WHERE phone = $1 LIMIT 1",
      [phone]
    );

    const user = rows[0];
    if (!user) return res.status(400).json({ error: "Nenhuma conta encontrada." });
    if (!user.email) return res.status(400).json({ error: "Esta conta não possui e-mail cadastrado." });

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();

    // Salva código com expiração de 10 minutos
    resetCodes.set(phone, { codigo, userId: user.id, expira: Date.now() + 10 * 60 * 1000 });

    await transporter.sendMail({
  from: `"Tempero de Mãe" <${process.env.EMAIL_USER}>`,
  to: user.email,
  subject: "Código de verificação - Tempero de Mãe",
  html: `
    <div style="font-family:sans-serif;padding:20px;color:#111">
      <h2>Olá, ${user.name}! 🍔</h2>
      <p>Seu código de verificação é:</p>
      <h1 style="color:#d62300;font-size:40px;letter-spacing:8px">${codigo}</h1>
      <p>Este código expira em 10 minutos.</p>
      <hr style="margin:20px 0">
      <small style="color:#777">Tempero de Mãe Delivery</small>
    </div>
  `
});
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao enviar código." });
  }
});

app.post("/auth/verify-code", async (req, res) => {
  const { phone, codigo, newPassword } = req.body;

  const entry = resetCodes.get(phone);
  if (!entry) return res.status(400).json({ error: "Código não encontrado ou expirado." });
  if (Date.now() > entry.expira) { resetCodes.delete(phone); return res.status(400).json({ error: "Código expirado." }); }
  if (entry.codigo !== codigo) return res.status(400).json({ error: "Código incorreto." });

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE customers SET password_hash = $1 WHERE id = $2", [hash, entry.userId]);
    resetCodes.delete(phone);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar senha." });
  }
});

app.get("/orders/active/:userId", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM orders 
       WHERE user_id = $1 
       AND status NOT IN ('entregue', 'cancelado') 
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.userId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor ON na porta ${PORT}`);
});
