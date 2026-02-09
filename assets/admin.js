const FIRESTORE_ONLY = true; // admin só grava/lê do Firestore


// --- Firestore (opcional) ---
// Estrutura esperada:
//  - collection "categories": docId = slug (ex.: "kits"), campos { label, order }
//  - collection "products": docId auto, campos { name, price, image, desc, cat, order, active }
async function fs(){
  const mod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  return mod;
}

async function fsLoadCategories(){
  if(!firebaseReady) return null;
  try{
    const { collection, getDocs, query, orderBy } = await fs();
    const snap = await getDocs(query(collection(db,"categories"), orderBy("order","asc")));
    const out=[];
    snap.forEach(d=>{
      const data=d.data()||{};
      out.push({ id:d.id, label:data.label||d.id, order:Number(data.order??9999) });
    });
    return out.length?out:null;
  }catch(e){ console.warn(e); return null; }
}

async function fsSaveCategories(cats){
  if(!firebaseReady) return false;
  const { doc, setDoc, writeBatch } = await fs();
  const batch = writeBatch(db);
  cats.forEach((c, idx)=>{
    batch.set(doc(db,"categories", c.id), { label: c.label, order: idx }, { merge:true });
  });
  await batch.commit();
  return true;
}

async function fsLoadProducts(){
  if(!firebaseReady) return null;
  try{
    const { collection, getDocs, query, orderBy } = await fs();
    const snap = await getDocs(query(collection(db,"products"), orderBy("order","asc")));
    const out=[];
    snap.forEach(d=>{
      const data=d.data()||{};
      out.push({
        id:d.id,
        name:data.name||"",
        price:data.price??"",
        image:data.image||data.img||"",
        desc:data.desc||data.description||"",
        cat:data.cat||data.category||"todos",
        order:Number(data.order??9999),
        active:data.active!==false,
      });
    });
    return out;
  }catch(e){ console.warn(e); return null; }
}

async function fsUpsertProduct(p){
  const { collection, doc, setDoc } = await fs();
  if(!firebaseReady) return false;
  const ref = p.id ? doc(db,"products",p.id) : doc(collection(db,"products"));
  const data = {
    name: p.name,
    price: p.price,
    image: p.image,
    desc: p.desc,
    cat: p.cat,
    order: Number(p.order ?? 9999),
    active: p.active !== false,
  };
  await setDoc(ref, data, { merge:true });
  return ref.id;
}

async function fsDeleteProduct(id){
  if(!firebaseReady) return false;
  const { doc, deleteDoc } = await fs();
  await deleteDoc(doc(db,"products",id));
  return true;
}

import { db, auth, firebaseReady } from "./firebase.js";

(async () => {
  const $ = (s) => document.querySelector(s);

  // ------------------------- Categorias (LocalStorage) -------------------------
  // Mantém a mesma chave usada pelo app.js.
  const CATEGORIES_KEY = "storeCategories";

  function slugify(label){
    return String(label||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/(^-|-$)/g,"") || "categoria";
  }

  function getDefaultCategories(){
    // Inclui as categorias citadas no rodapé do admin.
    return [
      { id: "kits", label: "KITS" },
      { id: "avulsos", label: "AVULSOS" },
      { id: "promocoes", label: "PROMOÇÕES" },
      { id: "novidades", label: "NOVIDADES" },
    ];
  }

  function loadCategories(){
    try{
      const raw = localStorage.getItem(CATEGORIES_KEY);
      if(!raw) return getDefaultCategories();
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed) || parsed.length === 0) return getDefaultCategories();

      const seen = new Set();
      const clean = [];
      parsed.forEach((c, idx) => {
        if(!c) return;
        const id = String(c.id || "").trim() || `cat-${idx+1}`;
        if(seen.has(id)) return;
        seen.add(id);
        const label = String(c.label || c.name || id).trim() || id;
        clean.push({ id, label });
      });
      return clean.length ? clean : getDefaultCategories();
    }catch{
      return getDefaultCategories();
    }
  }

  function saveCategories(){
    try{
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories, null, 2));
    }catch(e){
      console.warn(e);
    }
  }

  function categoryOptionsHtml(selected){
    const opts = [{ id: "todos", label: "TODOS" }, ...categories];
    return opts.map(c => {
      const sel = (c.id === selected) ? "selected" : "";
      return `<option value="${escapeHtml(c.id)}" ${sel}>${escapeHtml(c.label)}</option>`;
    }).join("");
  }

  let categories = loadCategories();

  // --- Login (Firebase Auth) ---
// Requer Authentication (Email/Senha) habilitado no Firebase.
let authReady = false;
let authMod = null;

async function authApi(){
  if(authMod) return authMod;
  authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  return authMod;
}

function showPanels(authed){
  const login = $("#loginPanel");
  const admin = $("#adminPanel");
  if(authed){
    login.style.display = "none";
    admin.style.display = "";
  }else{
    login.style.display = "";
    admin.style.display = "none";
  }
}

function setLoginHint(msg){
  const el = $("#loginHint");
  if(!el) return;
  if(!msg){ el.style.display="none"; el.textContent=""; return; }
  el.style.display="";
  el.textContent = msg;
}

  function wireLogin(){
    const email = $("#adminEmail");
    const pass = $("#adminPass");
    const btn = $("#adminLogin");
    if(!btn) return;

    const doLogin = async () => {
      setLoginHint("");
      if(!firebaseReady || !auth){
        setLoginHint("Firebase não configurado. Preencha /assets/firebase-config.js e publique novamente.");
        return;
      }
      const e = String(email?.value || "").trim();
      const p = String(pass?.value || "").trim();
      if(!e || !p){
        setLoginHint("Informe email e senha.");
        return;
      }
      try{
        const { signInWithEmailAndPassword } = await authApi();
        await signInWithEmailAndPassword(auth, e, p);
        if(pass) pass.value = "";
      }catch(err){
        console.warn(err);
        setLoginHint("Não foi possível entrar. Verifique email/senha e se o login por Email/Senha está ativado no Firebase.");
      }
    };

    btn.addEventListener("click", doLogin);
    pass?.addEventListener("keydown", (ev)=>{ if(ev.key==="Enter") doLogin(); });
    email?.addEventListener("keydown", (ev)=>{ if(ev.key==="Enter") doLogin(); });
  }

  wireLogin();

  // Botão sair (opcional)
  try{
    const adminPanel = $("#adminPanel");
    if(adminPanel && !document.querySelector('#adminLogout')){
      const btn = document.createElement('button');
      btn.id='adminLogout';
      btn.className='btn';
      btn.textContent='Sair';
      btn.style.marginLeft='auto';
      btn.addEventListener('click', async ()=>{
        try{
          const { signOut } = await authApi();
          await signOut(auth);
        }catch(e){ console.warn(e); }
      });
      // coloca no topo do painel
      const topRow = document.createElement('div');
      topRow.style.display='flex';
      topRow.style.alignItems='center';
      topRow.style.gap='12px';
      const title = adminPanel.querySelector('h1.panelTitle');
      if(title){
        title.parentNode.insertBefore(topRow, title);
        topRow.appendChild(title);
        topRow.appendChild(btn);
      }else{
        adminPanel.prepend(btn);
      }
    }
  }catch{}

  // Observa login do Firebase e alterna telas
  try{
    if(firebaseReady && auth){
      const { onAuthStateChanged } = await authApi();
      onAuthStateChanged(auth, (user)=>{ showPanels(!!user); });
    }else{
      showPanels(false);
      setLoginHint("Firebase não configurado. Preencha /assets/firebase-config.js e publique novamente.");
    }
  }catch(e){
    console.warn(e);
    showPanels(false);
  }


  const formatMoney = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const parsePriceToCents = (value) => {
    // Accept "199,90" or "199.90" or "199"
    const v = String(value || "").trim().replace(/\./g, "").replace(",", ".");
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  };

  function getDefaultProducts() {
    // Mirror defaults from app.js (fallback)
    return [
      { id: "p1", cat: "novidades", name: "Produto 01", desc: "Descrição curta e premium do produto.", priceCents: 12990 },
      { id: "p2", cat: "promocoes", name: "Produto 02", desc: "Descrição curta e premium do produto.", priceCents: 8990 },
      { id: "p3", cat: "kits", name: "Kit Completo", desc: "Pacote completo para elevar sua identidade.", priceCents: 79990 },
      { id: "p4", cat: "avulsos", name: "Logo Digital", desc: "Versão digital pronta para uso.", priceCents: 14990 },
      { id: "p5", cat: "avulsos", name: "Material Impresso", desc: "Cartões, panfletos e peças gráficas.", priceCents: 24990 },
      { id: "p6", cat: "avulsos", name: "Fachada", desc: "Arte e orientação para fachada.", priceCents: 39990 },
    ];
  }

  function loadProducts() {
    try {
      const raw = localStorage.getItem("customProducts");
      if (!raw) return getDefaultProducts();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultProducts();
      return parsed;
    } catch {
      return getDefaultProducts();
    }
  }

  let products = loadProducts();

  function ensureIds() {
    const seen = new Set();
    products = products.map((p, idx) => {
      const base = (p.id || `p${idx + 1}`).toString().trim() || `p${idx + 1}`;
      let id = base.replace(/\s+/g, "-").toLowerCase();
      if (!id) id = `p${idx + 1}`;
      while (seen.has(id)) id = `${id}-${Math.floor(Math.random() * 9999)}`;
      seen.add(id);
      return { id, cat: p.cat || "avulsos", name: p.name || "", desc: p.desc || "", priceCents: Number(p.priceCents) || 0 };
    });
  }


  function renderCategories(){
    const box = $("#categoriesList");
    if(!box) return;

    box.innerHTML = categories.map((c, i) => `
      <div class="panel" style="padding:12px; margin-top:10px; display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <input class="input" data-c-k="label" data-c-i="${i}" value="${escapeHtml(c.label)}" style="width:220px;" placeholder="Nome da categoria" />
          <div class="muted" style="font-size:12px;">ID: <code>${escapeHtml(c.id)}</code></div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn" data-c-act="up" data-c-i="${i}" aria-label="Subir">↑</button>
          <button class="btn" data-c-act="down" data-c-i="${i}" aria-label="Descer">↓</button>
          <button class="btn" data-c-act="delete" data-c-i="${i}">Remover</button>
        </div>
      </div>
    `).join("");
  }


function wireCategories(){
  const add = $("#addCategory");
  const save = $("#saveCategories");

  if(add){
    add.addEventListener("click", () => {
      const label = prompt("Nome da categoria:");
      if(!label) return;
      let id = slugify(label);
      const used = new Set(categories.map(c => c.id));
      if(used.has(id)){
        let n = 2;
        while(used.has(`${id}-${n}`)) n++;
        id = `${id}-${n}`;
      }
      categories.push({ id, label: label.toUpperCase() });
      saveCategories();
      renderCategories();
      render(); // atualiza selects na tabela
    });
  }

  if(save){
    save.addEventListener("click", () => {
      saveCategories();
      alert("Categorias salvas.");
    });
  }

  const box = $("#categoriesList");
  if(!box) return;

  box.addEventListener("input", (e) => {
    const el = e.target;
    const k = el?.dataset?.cK;
    const i = Number(el?.dataset?.cI);
    if(k === "label" && Number.isFinite(i) && categories[i]){
      categories[i].label = String(el.value || "").trim() || categories[i].id;
    }
  });

  box.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-c-act]");
    if(!btn) return;
    const act = btn.dataset.cAct;
    const i = Number(btn.dataset.cI);
    if(!Number.isFinite(i)) return;

    if(act === "delete" && categories[i]){
      const ok = confirm(`Remover a categoria "${categories[i].label}"?`);
      if(!ok) return;
      const removed = categories.splice(i,1)[0];
      // Move produtos dessa categoria para "todos" para não sumirem
      products = products.map(p => (p.cat === removed.id ? { ...p, cat: "todos" } : p));
      saveCategories();
      renderCategories();
      render();
    }

    if(act === "up" && i > 0){
      const tmp = categories[i-1]; categories[i-1]=categories[i]; categories[i]=tmp;
      saveCategories();
      renderCategories();
      render();
    }

    if(act === "down" && i < categories.length-1){
      const tmp = categories[i+1]; categories[i+1]=categories[i]; categories[i]=tmp;
      saveCategories();
      renderCategories();
      render();
    }
  });
}

  function render() {
    ensureIds();
    const tbody = $("#rows");
    tbody.innerHTML = "";

    products.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding:12px 14px; white-space:nowrap;">
          <button class="btn" data-act="up" data-i="${i}" aria-label="Subir">↑</button>
          <button class="btn" data-act="down" data-i="${i}" aria-label="Descer">↓</button>
        </td>
        <td style="padding:12px 14px;">
          <select class="input" data-k="cat" data-i="${i}" style="width:160px;">${categoryOptionsHtml(p.cat)}</select>
        </td>
        <td style="padding:12px 14px;">
          <input class="input" data-k="name" data-i="${i}" value="${escapeHtml(p.name)}" style="width:220px;" />
          <div class="muted" style="font-size:12px; margin-top:6px;">ID: <code>${escapeHtml(p.id)}</code></div>
        </td>
        <td style="padding:12px 14px;">
          <textarea class="input" data-k="desc" data-i="${i}" style="width:320px; min-height:72px; resize:vertical;">${escapeHtml(p.desc)}</textarea>
        </td>
        <td style="padding:12px 14px; white-space:nowrap;">
          <input class="input" data-k="price" data-i="${i}" value="${centsToBR(p.priceCents)}" style="width:120px;" />
          <div class="muted" style="font-size:12px; margin-top:6px;">${formatMoney(p.priceCents)}</div>
        </td>
        <td style="padding:12px 14px; white-space:nowrap;">
          <button class="btn" data-act="delete" data-i="${i}">Remover</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function centsToBR(cents){
    const n = (Number(cents)||0)/100;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const i = Number(el.dataset.i);
    const k = el.dataset.k;
    if (!Number.isFinite(i) || !k) return;

    if (k === "price") {
      products[i].priceCents = parsePriceToCents(el.value);
      // Don't auto-format while typing; re-render on save or blur
      return;
    }
    products[i][k] = el.value;
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const i = Number(btn.dataset.i);
    if (!act || !Number.isFinite(i)) return;

    if (act === "delete") {
      products.splice(i, 1);
      render();
    }
    if (act === "up" && i > 0) {
      const tmp = products[i - 1]; products[i - 1] = products[i]; products[i] = tmp;
      render();
    }
    if (act === "down" && i < products.length - 1) {
      const tmp = products[i + 1]; products[i + 1] = products[i]; products[i] = tmp;
      render();
    }
  });

  $("#addProduct").addEventListener("click", () => {
    products.push({ id: `p${products.length + 1}`, cat: "avulsos", name: "Novo produto", desc: "Descrição", priceCents: 0 });
    render();
  });

  $("#saveProducts").addEventListener("click", () => {
    ensureIds();
    localStorage.setItem("customProducts", JSON.stringify(products, null, 2));
    saveCategories();
    alert("Salvo! Atualize a página inicial para ver as mudanças.");
  });

  $("#resetProducts").addEventListener("click", () => {
    localStorage.removeItem("customProducts");
    localStorage.removeItem(CATEGORIES_KEY);
    categories = getDefaultCategories();
    products = getDefaultProducts();
    renderCategories();
    render();
    alert("Ok! Voltou ao padrão.");
  });

  $("#exportJson").addEventListener("click", () => {
    ensureIds();
    const payload = { categories, products };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogo.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#importJson").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try{
      const parsed = JSON.parse(text);
      // aceita: array (legado) OU {categories, products}
      if(Array.isArray(parsed)){
        products = parsed;
      }else if(parsed && typeof parsed === "object"){
        if(Array.isArray(parsed.categories)) categories = parsed.categories;
        if(Array.isArray(parsed.products)) products = parsed.products;
      }else{
        throw new Error("JSON inválido.");
      }
      saveCategories();
      render();
      alert("Importado! Clique em Salvar para aplicar no site.");
    }catch(err){
      alert(err.message || "Não foi possível importar.");
    }finally{
      e.target.value = "";
    }
  });

  renderCategories();
  wireCategories();
  render();
})();