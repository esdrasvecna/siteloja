// assets/app.js
// Loja com carrinho (LocalStorage) + checkout + contato via WhatsApp.

// WhatsApp do atendimento (formato: 55DDDNÚMERO, sem + e sem espaços)
const WHATSAPP_NUMBER = "5564999076197";

// Produtos
const PRODUCTS_URL = "./assets/products.json";

const CUSTOM_PRODUCTS_KEY = "customProducts"; // usado pela página /admin.html
const CATEGORIES_KEY = "storeCategories"; // usado pelo /admin.html

function loadCustomProducts(){
  try{
    const raw = localStorage.getItem(CUSTOM_PRODUCTS_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);

    // formatos antigos aceitos:
    // 1) array direto: [...]
    // 2) objeto: { products: [...] } ou { catalog: [...] }
    let arr = null;
    if(Array.isArray(parsed)) arr = parsed;
    else if(parsed && Array.isArray(parsed.products)) arr = parsed.products;
    else if(parsed && Array.isArray(parsed.catalog)) arr = parsed.catalog;

    if(!arr || arr.length === 0) return null;

    // migra para o formato atual (array puro), para evitar quebrar depois
    if(!Array.isArray(parsed)){
      try{ localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(arr)); }catch{}
    }

    return arr;
  }catch{
    return null;
  }
}


function slugifyCategory(label){
  return String(label||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"") || "categoria";
}

function getDefaultCategories(){
  return [
    { id: "novidades", label: "NOVIDADES" },
    { id: "promocoes", label: "PROMOÇÕES" },
    { id: "kits", label: "KITS" },
  ];
}

function loadCategories(){
  try{
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if(!raw) return getDefaultCategories();
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed) || parsed.length === 0) return getDefaultCategories();
    // sanitiza
    const seen = new Set();
    const clean = [];
    parsed.forEach((c, idx) => {
      if(!c) return;
      const id = String(c.id || "").trim() || `cat-${idx+1}`;
      const label = String(c.label || c.name || id).trim() || id;
      if(seen.has(id)) return;
      seen.add(id);
      clean.push({ id, label });
    });
    return clean.length ? clean : getDefaultCategories();
  }catch{
    return getDefaultCategories();
  }
}
async function loadProducts(){
  try{
    // Se existir catálogo personalizado salvo no navegador, usa ele.
    const custom = loadCustomProducts();
    if(custom) return custom;

    const res = await fetch(PRODUCTS_URL, { cache: "no-store" });
    if(!res.ok) throw new Error("Falha ao carregar products.json");
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error("Formato inválido em products.json");
    return data;
  }catch(e){
    // fallback
    return [
      { id: "p1", cat: "novidades", name: "Produto 01", desc: "Descrição curta e premium do produto.", priceCents: 12990 },
      { id: "p2", cat: "promocoes", name: "Produto 02", desc: "Descrição curta e premium do produto.", priceCents: 8990 },
      { id: "p3", cat: "kits", name: "Kit Identidade Visual Completo", desc: "Pacote completo para elevar sua identidade.", priceCents: 79990 },
      { id: "p4", cat: "avulsos", name: "Logo Digital", desc: "Versão digital pronta para uso.", priceCents: 14990 },
      { id: "p5", cat: "avulsos", name: "Material Impresso", desc: "Cartões, panfletos e peças gráficas.", priceCents: 24990 },
      { id: "p6", cat: "avulsos", name: "Fachada", desc: "Arte e orientação para fachada.", priceCents: 39990 },
    ];
  }
}

let products = [];


const CART_KEY = "site_loja_cart_v1";

/* ------------------------- Helpers ------------------------- */
function brlFromCents(cents){
  return (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
function clampInt(n, min, max){
  const v = Number.parseInt(n, 10);
  if(Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}
function waLink(text){
  const msg = encodeURIComponent(text);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

/* ------------------------- Cart state ------------------------- */
function loadCart(){
  try{
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : { items: [] };
    if(!parsed || !Array.isArray(parsed.items)) return { items: [] };
    // normalize
    return {
      items: parsed.items
        .filter(i => i && typeof i.id === "string")
        .map(i => ({ id: i.id, qty: clampInt(i.qty ?? 1, 1, 99) }))
    };
  }catch{
    return { items: [] };
  }
}
function saveCart(cart){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function getProduct(id){
  return products.find(p => p.id === id);
}
function cartCount(cart){
  return cart.items.reduce((acc, i) => acc + i.qty, 0);
}
function cartTotalCents(cart){
  return cart.items.reduce((acc, i) => {
    const p = getProduct(i.id);
    return acc + (p ? p.priceCents * i.qty : 0);
  }, 0);
}
function addToCart(id, qty=1){
  const cart = loadCart();
  const found = cart.items.find(i => i.id === id);
  if(found) found.qty = clampInt(found.qty + qty, 1, 99);
  else cart.items.push({ id, qty: clampInt(qty, 1, 99) });
  saveCart(cart);
  syncCartUI();
  openCart();
}
function removeFromCart(id){
  const cart = loadCart();
  cart.items = cart.items.filter(i => i.id !== id);
  saveCart(cart);
  syncCartUI();
}
function setQty(id, qty){
  const cart = loadCart();
  const item = cart.items.find(i => i.id === id);
  if(!item) return;
  item.qty = clampInt(qty, 1, 99);
  saveCart(cart);
  syncCartUI();
}

/* ------------------------- Products render ------------------------- */
const grid = document.getElementById("productGrid");
const prevBtn = document.querySelector(".carouselBtn.prev");
const nextBtn = document.querySelector(".carouselBtn.next");

function scrollCarousel(dir){
  if(!grid) return;
  const first = grid.querySelector(".productCard");
  const step = first ? (first.getBoundingClientRect().width + 14) : 340;
  grid.scrollBy({ left: dir * step, behavior: "smooth" });
}
if(prevBtn) prevBtn.addEventListener("click", () => scrollCarousel(-1));
if(nextBtn) nextBtn.addEventListener("click", () => scrollCarousel(1));
const tabsEl = document.getElementById("categoryTabs") || document.querySelector(".tabs");
let tabs = [];
let categories = loadCategories();

function buildTabs(){
  if(!tabsEl) return;
  categories = loadCategories();
  const buttons = [
    { id: "todos", label: "TODOS" },
    ...categories
  ];
  tabsEl.innerHTML = buttons.map((b, i) => `
    <button aria-selected="${i===0 ? "true":"false"}" class="tab ${i===0 ? "is-active":""}" data-tab="${b.id}" role="tab">${b.label}</button>
  `).join("");
  tabs = Array.from(tabsEl.querySelectorAll(".tab"));
}

function renderProducts(filter){
  if(!grid) return;
  const f = filter === "todos" ? null : filter;
  let list = products.filter(p => !f || p.cat === f || p.cat === "todos");

  // Em "TODOS", organiza por ordem das categorias e depois pela ordem dos produtos.
  if(!f){
    const order = new Map(categories.map((c, idx) => [c.id, idx+1]));
    list = list.slice().sort((a,b) => {
      const oa = order.get(a.cat) ?? 999;
      const ob = order.get(b.cat) ?? 999;
      if(oa !== ob) return oa - ob;
      return products.indexOf(a) - products.indexOf(b);
    });
  }

  grid.innerHTML = list.map(p => `
    <article class="productCard" data-open="${p.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${p.name}">
      <div class="productImg" aria-hidden="true"></div>
      <div class="productBody">
        <h3 class="productTitle">${p.name}</h3>
        <div class="productMeta">
          <div class="productPrice">${brlFromCents(p.priceCents)}</div>
          <button class="productBtn" data-add="${p.id}" type="button">Adicionar ao carrinho</button>
        </div>
      </div>
    </article>
  `).join("");
}

function setActiveTab(tabId){
  tabs.forEach(t => {
    const active = t.dataset.tab === tabId;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  renderProducts(tabId);
}

function wireTabs(){
  tabs.forEach(t => t.addEventListener("click", () => setActiveTab(t.dataset.tab)));
}

if(grid){
  grid.addEventListener("click", (e) => {
    const addBtn = e.target?.closest?.("button[data-add]");
    if(addBtn){
      const id = addBtn.dataset.add;
      if(id) addToCart(id, 1);
      return;
    }

    const card = e.target?.closest?.("article[data-open]");
    if(!card) return;
    const id = card.dataset.open;
    if(id) openProductModal(id);
  });

  grid.addEventListener("keydown", (e) => {
    if(e.key !== "Enter" && e.key !== " ") return;
    const card = e.target?.closest?.("article[data-open]");
    if(!card) return;
    e.preventDefault();
    const id = card.dataset.open;
    if(id) openProductModal(id);
  });
}

/* ------------------------- Product modal ------------------------- */
const productModal = document.getElementById("productModal");
const productModalBackdrop = document.getElementById("productModalBackdrop");
const productModalClose = document.getElementById("productModalClose");
const productModalContent = document.getElementById("productModalContent");

let lastFocusEl = null;

function openProductModal(id){
  if(!productModal || !productModalContent) return;
  const p = getProduct(id);
  if(!p) return;

  lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  productModalContent.innerHTML = `
    <div class="productModal__grid">
      <div class="productModal__img" aria-hidden="true"></div>
      <div>
        <h3 class="productModal__title">${escapeHtml(p.name)}</h3>
        <div class="productModal__desc muted">${renderDescription(p.desc)}</div>
        <div class="productModal__meta">
          <div class="productModal__price">${brlFromCents(p.priceCents)}</div>
          <div class="productModal__actions">
            <button class="btn btn--accent btn--pill" type="button" data-modal-add="${p.id}">Adicionar ao carrinho</button>
          </div>
        </div>
      </div>
    </div>
  `;

  productModal.classList.add("is-open");
  productModal.setAttribute("aria-hidden","false");
  document.body.classList.add("noScroll");
  productModalClose?.focus?.();
}

function closeProductModal(){
  if(!productModal) return;
  productModal.classList.remove("is-open");
  productModal.setAttribute("aria-hidden","true");
  document.body.classList.remove("noScroll");
  if(lastFocusEl) lastFocusEl.focus();
}

productModalBackdrop?.addEventListener("click", closeProductModal);
productModalClose?.addEventListener("click", closeProductModal);
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && productModal?.classList.contains("is-open")) closeProductModal();
});

productModalContent?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.("button[data-modal-add]");
  if(!btn) return;
  const id = btn.dataset.modalAdd;
  if(!id) return;
  addToCart(id, 1);
  closeProductModal();
});


function renderDescription(descRaw){
  const raw = String(descRaw ?? "");
  const lines = raw.replace(/\r\n/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
  if(lines.length === 0) return "";

  let htmlOut = "";
  let inList = false;

  const closeList = () => {
    if(inList){
      htmlOut += "</ul>";
      inList = false;
    }
  };

  const escapeAndFormatInline = (s) => {
    // Escapa HTML e suporta **negrito**
    const esc = escapeHtml(s);
    return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  };

  for(const line of lines){
    // Header (ex: "O que está incluso:")
    if(line.endsWith(":") && line.length <= 80){
      closeList();
      htmlOut += `<h4 class="desc__h">${escapeAndFormatInline(line)}</h4>`;
      continue;
    }

    // Itens com check
    const checkPrefixes = ["✅","✔","☑","✓"];
    const isCheck = checkPrefixes.some(p => line.startsWith(p)) || /^-\s*\[x\]\s+/i.test(line);
    const isBullet = line.startsWith("- ") || line.startsWith("• ");

    if(isCheck || isBullet){
      const cleaned = line
        .replace(/^✅\s*/,"")
        .replace(/^✔\s*/,"")
        .replace(/^☑\s*/,"")
        .replace(/^✓\s*/,"")
        .replace(/^-\s*\[x\]\s+/i,"")
        .replace(/^-\s+/,"")
        .replace(/^•\s+/,"")
        .trim();

      if(!inList){
        htmlOut += `<ul class="desc__list">`;
        inList = true;
      }
      htmlOut += `<li class="desc__item"><span class="desc__check" aria-hidden="true">✓</span><span class="desc__text">${escapeAndFormatInline(cleaned)}</span></li>`;
      continue;
    }

    // Linhas de destaque com emoji (ex: "⏱ Prazo...")
    const firstChar = line.charCodeAt(0);
    if(firstChar > 1000 && line.includes(" ")){
      closeList();
      const firstSpace = line.indexOf(" ");
      const icon = line.slice(0, firstSpace).trim();
      const rest = line.slice(firstSpace + 1).trim();
      htmlOut += `<div class="desc__note"><span class="desc__icon" aria-hidden="true">${escapeHtml(icon)}</span><span>${escapeAndFormatInline(rest)}</span></div>`;
      continue;
    }

    // Parágrafo normal
    closeList();
    htmlOut += `<p class="desc__p">${escapeAndFormatInline(line)}</p>`;
  }

  closeList();
  return htmlOut;
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

/* ------------------------- Cart drawer UI ------------------------- */
const drawer = document.getElementById("cartDrawer");
const backdrop = document.getElementById("cartBackdrop");
const closeBtn = document.getElementById("cartClose");
const itemsEl = document.getElementById("cartItems");
const emptyEl = document.getElementById("cartEmpty");
const totalEl = document.getElementById("cartTotal");
const subtitleEl = document.getElementById("cartSubtitle");
const cartCountEl = document.getElementById("cartCount");

const btnCheckout = document.getElementById("btnCheckout");
const btnWhatsApp = document.getElementById("btnWhatsApp") || document.getElementById("btnsuporte");

function openCart(){
  if(!drawer) return;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden","false");
  document.body.classList.add("noScroll");
}
function closeCart(){
  if(!drawer) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden","true");
  document.body.classList.remove("noScroll");
}

document.getElementById("cartBtnTop")?.addEventListener("click", openCart);
document.getElementById("openCartPanel")?.addEventListener("click", openCart);
backdrop?.addEventListener("click", closeCart);
closeBtn?.addEventListener("click", closeCart);
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closeCart(); });

// Hero button: rolar pra produtos
document.getElementById("scrollToProducts")?.addEventListener("click", () => {
  document.getElementById("produtos")?.scrollIntoView({behavior:"smooth", block:"start"});
});

function syncCartUI(){
  const cart = loadCart();
  const count = cartCount(cart);
  if(cartCountEl) cartCountEl.textContent = String(count);
  if(subtitleEl) subtitleEl.textContent = `${count} ${count === 1 ? "item" : "itens"}`;

  const total = cartTotalCents(cart);
  if(totalEl) totalEl.textContent = brlFromCents(total);

  const hasItems = cart.items.length > 0;
  if(emptyEl) emptyEl.style.display = hasItems ? "none" : "block";
  if(itemsEl) itemsEl.style.display = hasItems ? "block" : "none";

  if(btnCheckout) btnCheckout.disabled = !hasItems;
  if(btnWhatsApp) btnWhatsApp.disabled = !hasItems;

  if(!itemsEl) return;

  itemsEl.innerHTML = cart.items.map(i => {
    const p = getProduct(i.id);
    if(!p) return "";
    const line = p.priceCents * i.qty;
    return `
      <div class="cartItem" data-id="${p.id}">
        <div class="cartItem__main">
          <div class="cartItem__name">${p.name}</div>
          <div class="cartItem__desc muted">${p.desc}</div>
          <div class="cartItem__meta">
            <strong>${brlFromCents(line)}</strong>
            <span class="muted small">${brlFromCents(p.priceCents)} un.</span>
          </div>
        </div>

        <div class="cartItem__actions">
          <div class="qty">
            <button class="qtyBtn" data-dec="${p.id}" type="button" aria-label="Diminuir">−</button>
            <input class="qtyInput" data-qty="${p.id}" inputmode="numeric" pattern="[0-9]*" value="${i.qty}" />
            <button class="qtyBtn" data-inc="${p.id}" type="button" aria-label="Aumentar">+</button>
          </div>
          <button class="linkBtn" data-remove="${p.id}" type="button">Remover</button>
        </div>
      </div>
    `;
  }).join("");
}

// Events inside cart
itemsEl?.addEventListener("click",(e)=>{
  const dec = e.target?.dataset?.dec;
  const inc = e.target?.dataset?.inc;
  const rem = e.target?.dataset?.remove;

  if(dec){
    const cart = loadCart();
    const it = cart.items.find(x=>x.id===dec);
    if(!it) return;
    const next = it.qty - 1;
    if(next <= 0) removeFromCart(dec);
    else setQty(dec, next);
  }
  if(inc){
    const cart = loadCart();
    const it = cart.items.find(x=>x.id===inc);
    if(!it) return;
    setQty(inc, it.qty + 1);
  }
  if(rem){
    removeFromCart(rem);
  }
});

itemsEl?.addEventListener("change",(e)=>{
  const id = e.target?.dataset?.qty;
  if(!id) return;
  setQty(id, e.target.value);
});

/* ------------------------- Checkout (Stripe) ------------------------- */
async function startCheckout(){
  const cart = loadCart();
  if(cart.items.length === 0) return;

  const items = cart.items
    .map(i => {
      const p = getProduct(i.id);
      return p ? ({ name: p.name, price: p.priceCents, quantity: i.qty }) : null;
    })
    .filter(Boolean);

  try{
    btnCheckout && (btnCheckout.disabled = true);
    btnCheckout && (btnCheckout.textContent = "INICIANDO PAGAMENTO...");

    const res = await fetch("/.netlify/functions/create-checkout-session",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        items,
        successUrl: `${window.location.origin}/?pagamento=sucesso`,
        cancelUrl: `${window.location.origin}/?pagamento=cancelado`
      })
    });

    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || "Não foi possível iniciar o checkout.");
    window.location.href = data.url;
  }catch(err){
    alert(err.message || "Erro ao iniciar pagamento.");
    btnCheckout && (btnCheckout.textContent = "PAGAR AGORA");
    btnCheckout && (btnCheckout.disabled = false);
  }
}

btnCheckout?.addEventListener("click", startCheckout);

/* ------------------------- WhatsApp (somente no carrinho) ------------------------- */
function buildWhatsAppMessage(){
  const cart = loadCart();
  const lines = cart.items.map(i => {
    const p = getProduct(i.id);
    if(!p) return null;
    return `• ${p.name} — ${i.qty}x`;
  }).filter(Boolean);

  const total = brlFromCents(cartTotalCents(cart));

  return [
    "Olá! Quero tirar uma dúvida antes de finalizar 🙂",
    "",
    "Meu carrinho:",
    ...lines,
    "",
    `Total: ${total}`,
    "",
    "Pode me ajudar com prazos e como funciona o processo?"
  ].join("\n");
}

btnWhatsApp?.addEventListener("click", ()=>{
  const cart = loadCart();
  if(cart.items.length === 0) return;
  window.open(waLink(buildWhatsAppMessage()), "_blank", "noopener,noreferrer");
});

/* ------------------------- Pós-checkout ------------------------- */

// Aviso simples pós-checkout (opcional)
(() => {
  const p = new URLSearchParams(window.location.search).get("pagamento");
  if(p === "sucesso") alert("Pagamento confirmado! Obrigado(a). Em instantes você recebe a confirmação.");
  if(p === "cancelado") alert("Pagamento cancelado. Se quiser, finalize pelo carrinho quando estiver pronto(a).");
})();

/* ------------------------- Init ------------------------- */
(async ()=>{
  products = await loadProducts();
  // Normaliza categorias vindas de versões antigas (ex.: "NOVIDADES" em vez de "novidades")
  try{
    const ids = new Set(categories.map(c => c.id));
    const labelToId = new Map(categories.map(c => [String(c.label||"").trim().toLowerCase(), c.id]));
    products = products.map((p) => {
      const catRaw = String(p.cat ?? p.category ?? "").trim();
      if(!catRaw) return { ...p, cat: categories[0]?.id || "todos" };

      if(ids.has(catRaw)) return { ...p, cat: catRaw };

      const byLabel = labelToId.get(catRaw.toLowerCase());
      if(byLabel) return { ...p, cat: byLabel };

      const slug = slugifyCategory(catRaw);
      if(ids.has(slug)) return { ...p, cat: slug };

      // se não bater com nada, joga em "todos" (para não sumir)
      return { ...p, cat: "todos" };
    });
  }catch{}

  buildTabs();
  wireTabs();
  setActiveTab("todos");
  syncCartUI();
})();
