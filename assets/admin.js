// assets/admin.js
import { db, auth, firebaseReady } from "./firebase.js";

const $ = (s) => document.querySelector(s);

let categories = [];
let products = [];

let filterText = "";
let filterCat = "all";
let filterOnlyActive = true;

let firestoreMod = null;
let authMod = null;

async function fs(){
  if(firestoreMod) return firestoreMod;
  firestoreMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  return firestoreMod;
}
async function fa(){
  if(authMod) return authMod;
  authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  return authMod;
}

/* ------------------------- Toast ------------------------- */
function showToast(title, msg = "", ms = 1600){
  const host = $("#toastHost");
  if(!host) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="tTitle">${escapeHtml(title)}</div>
    ${msg ? `<div class="tMsg">${escapeHtml(msg)}</div>` : ""}
  `;
  host.appendChild(el);

  const t = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 180);
  }, ms);

  el.addEventListener("click", ()=>{
    clearTimeout(t);
    el.remove();
  });
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ------------------------- UI helpers ------------------------- */
function showPanels(authed){
  const login = $("#loginPanel");
  const adminPanel = $("#adminPanel");
  const logout = $("#btnLogout");

  if(authed){
    login && (login.style.display = "none");
    adminPanel && (adminPanel.style.display = "");
    logout && (logout.style.display = "");
  }else{
    login && (login.style.display = "");
    adminPanel && (adminPanel.style.display = "none");
    logout && (logout.style.display = "none");
  }
}

function setLoginHint(msg){
  const el = $("#loginHint");
  if(!el) return;
  if(!msg){
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "";
  el.textContent = msg;
}

function slugify(str){
  return String(str || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "categoria";
}

function currencyToCents(v){
  const s = String(v ?? "").trim().replace(/\./g,"").replace(",",".");
  const n = Number(s);
  if(!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function centsToCurrency(cents){
  const n = Number(cents || 0) / 100;
  return n.toFixed(2).replace(".", ",");
}

function updateStats(){
  $("#statProducts") && ($("#statProducts").textContent = String(products.length));
  $("#statCats") && ($("#statCats").textContent = String(categories.length));
  const activeCount = products.filter(p => p.active !== false).length;
  $("#statActive") && ($("#statActive").textContent = String(activeCount));
}

function categoryOptionsHtml(selected){
  const opts = [
    `<option value="all">Todas</option>`,
    ...categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
  ].join("");
  if($("#filterCat")) $("#filterCat").innerHTML = opts;

  // para selects em cada linha
  return categories.map(c => `
    <option value="${escapeHtml(c.id)}" ${c.id === selected ? "selected":""}>${escapeHtml(c.label)}</option>
  `).join("");
}

/* ------------------------- Firestore IO ------------------------- */
async function loadCategories(){
  if(!firebaseReady) return [];
  const { collection, getDocs, query, orderBy } = await fs();
  const snap = await getDocs(query(collection(db, "categories"), orderBy("order","asc")));
  const out = [];
  snap.forEach(d => {
    const data = d.data() || {};
    out.push({
      id: d.id,
      label: data.label || d.id,
      order: Number(data.order ?? 9999)
    });
  });
  return out;
}

async function loadProducts(){
  if(!firebaseReady) return [];
  const { collection, getDocs, query, orderBy } = await fs();
  const snap = await getDocs(query(collection(db, "products"), orderBy("order","asc")));
  const out = [];
  snap.forEach(d => {
    const data = d.data() || {};
    out.push({
      id: d.id,
      cat: data.cat || "avulsos",
      name: data.name || "",
      desc: data.desc || "",
      priceCents: Number(data.priceCents ?? 0),
      order: Number(data.order ?? 9999),
      active: data.active !== false
    });
  });
  return out;
}

async function saveCategories(){
  if(!firebaseReady) throw new Error("Firebase não configurado.");
  const { doc, writeBatch } = await fs();

  // reordena por posição atual
  categories = categories.map((c, idx) => ({ ...c, order: idx }));

  const batch = writeBatch(db);
  categories.forEach((c) => {
    batch.set(doc(db, "categories", c.id), { label: c.label, order: c.order }, { merge: true });
  });
  await batch.commit();
}

async function saveProducts(){
  if(!firebaseReady) throw new Error("Firebase não configurado.");
  const { doc, writeBatch } = await fs();

  // ordem do jeito que está na lista
  products = products.map((p, idx) => ({ ...p, order: idx }));

  const batch = writeBatch(db);
  products.forEach((p) => {
    batch.set(doc(db, "products", p.id), {
      cat: p.cat,
      name: p.name,
      desc: p.desc,
      priceCents: Number(p.priceCents ?? 0),
      order: p.order,
      active: p.active !== false
    }, { merge: true });
  });
  await batch.commit();
}

async function deleteProduct(id){
  if(!firebaseReady) throw new Error("Firebase não configurado.");
  const { doc, deleteDoc } = await fs();
  await deleteDoc(doc(db, "products", id));
}

async function importFromProductsJson(){
  // importa assets/products.json para o Firestore (útil se a vitrine tinha um catálogo padrão)
  const res = await fetch("./assets/products.json", { cache: "no-store" });
  if(!res.ok) throw new Error("Não consegui ler assets/products.json");
  const list = await res.json();
  if(!Array.isArray(list)) throw new Error("products.json inválido");

  const { doc, writeBatch, collection } = await fs();

  // cria ids novos para não conflitar se já existir
  const batch = writeBatch(db);
  list.forEach((p, idx) => {
    const id = p.id ? String(p.id) : doc(collection(db, "products")).id;
    batch.set(doc(db, "products", id), {
      cat: p.cat || "avulsos",
      name: p.name || "",
      desc: p.desc || "",
      priceCents: Number(p.priceCents ?? 0),
      order: idx,
      active: p.active !== false
    }, { merge: true });
  });
  await batch.commit();
}

/* ------------------------- Render ------------------------- */
function renderCategories(){
  const el = $("#categoriesList");
  if(!el) return;

  el.innerHTML = categories.map((c, idx) => `
    <div class="catRow" data-id="${escapeHtml(c.id)}">
      <div class="catId">${escapeHtml(c.id)}</div>
      <label class="adminField" style="margin:0;">
        <span>Nome</span>
        <input class="input" data-cat-label value="${escapeHtml(c.label)}" />
      </label>
      <div class="catActions">
        <button class="miniBtn" data-cat-act="up" ${idx===0 ? "disabled":""} title="Subir">↑</button>
        <button class="miniBtn" data-cat-act="down" ${idx===categories.length-1 ? "disabled":""} title="Descer">↓</button>
        <button class="miniBtn miniBtn--danger" data-cat-act="del" title="Remover">Remover</button>
      </div>
    </div>
  `).join("");

  categoryOptionsHtml();
  updateStats();
}

function getFilteredProducts(){
  const t = filterText.trim().toLowerCase();
  return products.filter(p => {
    if(filterOnlyActive && p.active === false) return false;
    if(filterCat !== "all" && p.cat !== filterCat) return false;
    if(!t) return true;
    return (p.name || "").toLowerCase().includes(t) || (p.desc || "").toLowerCase().includes(t);
  });
}

function renderProducts(){
  const tbody = $("#rows");
  if(!tbody) return;

  const list = getFilteredProducts();

  tbody.innerHTML = list.map((p, idx) => {
    const orderIndex = products.indexOf(p); // ordem real na lista completa
    const catSelect = categoryOptionsHtml(p.cat);
    const catExists = categories.some(c => c.id === p.cat);
    const catWarning = catExists ? "" : `<div style="margin-top:6px; color:#ff9bb0; font-size:12px;">Categoria removida</div>`;

    return `
      <tr data-id="${escapeHtml(p.id)}">
        <td>
          <div class="rowActions" style="justify-content:flex-start;">
            <button class="miniBtn" data-act="up" ${orderIndex===0 ? "disabled":""}>↑</button>
            <button class="miniBtn" data-act="down" ${orderIndex===products.length-1 ? "disabled":""}>↓</button>
          </div>
        </td>
        <td>
          <label class="adminCheck" style="gap:8px;">
            <input type="checkbox" data-field="active" ${p.active!==false ? "checked":""} />
            <span style="color:var(--muted); font-size:12px;">ok</span>
          </label>
        </td>
        <td>
          <select class="input" data-field="cat">
            ${catSelect}
          </select>
          ${catWarning}
        </td>
        <td>
          <input class="input" data-field="name" value="${escapeHtml(p.name)}" />
        </td>
        <td>
          <textarea class="input" data-field="desc" rows="2" style="resize:vertical; min-height:44px;">${escapeHtml(p.desc)}</textarea>
        </td>
        <td style="white-space:nowrap;">
          <input class="input" data-field="price" value="${escapeHtml(centsToCurrency(p.priceCents))}" inputmode="decimal" />
        </td>
        <td>
          <div class="rowActions">
            <button class="miniBtn miniBtn--danger" data-act="delete">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  updateStats();
}

/* ------------------------- Wiring ------------------------- */
function wireFilters(){
  $("#filterText")?.addEventListener("input", (e)=>{
    filterText = e.target.value || "";
    renderProducts();
  });

  $("#filterCat")?.addEventListener("change", (e)=>{
    filterCat = e.target.value || "all";
    renderProducts();
  });

  $("#filterOnlyActive")?.addEventListener("change", (e)=>{
    filterOnlyActive = !!e.target.checked;
    renderProducts();
  });
}

function wireCategories(){
  $("#addCategory")?.addEventListener("click", ()=>{
    const label = "Nova categoria";
    let id = slugify(label);
    let i = 2;
    while(categories.some(c => c.id === id)){
      id = `${slugify(label)}-${i++}`;
    }
    categories.unshift({ id, label, order: 0 });
    renderCategories();
    showToast("Categoria adicionada", "Você pode renomear sem mudar o ID.");
  });

  $("#categoriesList")?.addEventListener("input", (e)=>{
    const row = e.target.closest("[data-id]");
    if(!row) return;
    const id = row.dataset.id;
    const cat = categories.find(c => c.id === id);
    if(!cat) return;
    if(e.target.matches("[data-cat-label]")){
      cat.label = e.target.value || "";
      categoryOptionsHtml();
      updateStats();
    }
  });

  $("#categoriesList")?.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-cat-act]");
    if(!btn) return;
    const row = btn.closest("[data-id]");
    if(!row) return;
    const id = row.dataset.id;
    const act = btn.dataset.catAct;
    const idx = categories.findIndex(c => c.id === id);
    if(idx < 0) return;

    if(act === "up" && idx > 0){
      [categories[idx-1], categories[idx]] = [categories[idx], categories[idx-1]];
      renderCategories(); renderProducts();
    }
    if(act === "down" && idx < categories.length-1){
      [categories[idx+1], categories[idx]] = [categories[idx], categories[idx+1]];
      renderCategories(); renderProducts();
    }
    if(act === "del"){
      categories.splice(idx,1);
      renderCategories(); renderProducts();
      showToast("Categoria removida", "Produtos dessa categoria ficam marcados como 'Categoria removida'.");
    }
  });

  $("#saveCategories")?.addEventListener("click", async ()=>{
    try{
      await saveCategories();
      showToast("Categorias salvas");
    }catch(err){
      showToast("Erro", err?.message || "Não foi possível salvar.");
    }
  });
}

function wireProducts(){
  $("#addProduct")?.addEventListener("click", async ()=>{
    try{
      const { doc, collection } = await fs();
      const id = doc(collection(db, "products")).id;

      const defaultCat = categories[0]?.id || "avulsos";
      const p = { id, cat: defaultCat, name: "Novo produto", desc: "", priceCents: 0, active: true, order: 0 };

      // entra no topo, sem scroll
      products.unshift(p);

      renderProducts();

      // rola pro topo e foca no nome
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(()=>{
        const row = document.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
        const nameInput = row?.querySelector('[data-field="name"]');
        nameInput?.focus();
        nameInput?.select();
      }, 60);

      showToast("Pronto", "Produto criado no topo. Preencha e clique em Salvar.");
    }catch(err){
      showToast("Erro", err?.message || "Não foi possível criar.");
    }
  });

  $("#rows")?.addEventListener("input", (e)=>{
    const row = e.target.closest("tr[data-id]");
    if(!row) return;
    const id = row.dataset.id;
    const p = products.find(x => x.id === id);
    if(!p) return;

    const field = e.target.dataset.field;
    if(!field) return;

    if(field === "active") p.active = !!e.target.checked;
    if(field === "cat") p.cat = e.target.value || p.cat;
    if(field === "name") p.name = e.target.value || "";
    if(field === "desc") p.desc = e.target.value || "";
    if(field === "price") p.priceCents = currencyToCents(e.target.value);

    updateStats();
  });

  $("#rows")?.addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-act]");
    if(!btn) return;
    const row = btn.closest("tr[data-id]");
    if(!row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    const idx = products.findIndex(p => p.id === id);
    if(idx < 0) return;

    if(act === "up" && idx > 0){
      [products[idx-1], products[idx]] = [products[idx], products[idx-1]];
      renderProducts();
    }
    if(act === "down" && idx < products.length-1){
      [products[idx+1], products[idx]] = [products[idx], products[idx+1]];
      renderProducts();
    }
    if(act === "delete"){
      // remove na hora (e apaga no Firestore também)
      try{
        await deleteProduct(id);
      }catch(err){
        // se falhar, ainda permite remover da lista local (mas avisa)
        showToast("Atenção", "Não consegui apagar no Firebase. Verifique permissões.");
      }
      products.splice(idx,1);
      renderProducts();
      showToast("Excluído", "Produto removido.");
    }
  });

  $("#saveProducts")?.addEventListener("click", async ()=>{
    try{
      await saveCategories(); // garante ordem/labels atualizadas também
      await saveProducts();
      showToast("Salvo", "Atualize a vitrine se já estiver aberta.");
    }catch(err){
      showToast("Erro", err?.message || "Não foi possível salvar.");
    }
  });
}

function wireMore(){
  $("#btnReload")?.addEventListener("click", async ()=>{
    await refreshAll(true);
  });

  $("#exportJson")?.addEventListener("click", ()=>{
    const payload = { categories, products };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogo.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exportado", "catalogo.json baixado.");
  });

  $("#importJson")?.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const text = await file.text();
      const parsed = JSON.parse(text);
      if(Array.isArray(parsed.categories)) categories = parsed.categories;
      if(Array.isArray(parsed.products)) products = parsed.products;

      // normaliza
      categories = categories.map((c, idx)=>({ id: String(c.id||slugify(c.label||"categoria")), label: String(c.label||c.id||"Categoria"), order: idx }));
      products = products.map((p, idx)=>({
        id: String(p.id || ""),
        cat: String(p.cat || "avulsos"),
        name: String(p.name || ""),
        desc: String(p.desc || ""),
        priceCents: Number(p.priceCents ?? 0),
        order: idx,
        active: p.active !== false
      })).filter(p => !!p.id);

      renderCategories();
      renderProducts();
      showToast("Importado", "Agora clique em Salvar para enviar ao Firebase.");
    }catch(err){
      showToast("Erro", "JSON inválido.");
    }finally{
      e.target.value = "";
    }
  });

  $("#importFromProductsJson")?.addEventListener("click", async ()=>{
    try{
      await importFromProductsJson();
      await refreshAll(true);
      showToast("Importado", "products.json foi enviado para o Firebase.");
    }catch(err){
      showToast("Erro", err?.message || "Não foi possível importar.");
    }
  });
}

/* ------------------------- Auth ------------------------- */
async function wireLogin(){
  const btn = $("#adminLogin");
  if(!btn) return;

  btn.addEventListener("click", async ()=>{
    setLoginHint("");
    if(!firebaseReady || !auth){
      setLoginHint("Firebase não configurado. Preencha /assets/firebase-config.js e publique novamente.");
      return;
    }
    const email = String($("#adminEmail")?.value || "").trim();
    const pass = String($("#adminPass")?.value || "").trim();
    if(!email || !pass){
      setLoginHint("Informe email e senha.");
      return;
    }
    try{
      const { signInWithEmailAndPassword } = await fa();
      await signInWithEmailAndPassword(auth, email, pass);
    }catch(err){
      setLoginHint("Não foi possível entrar. Verifique email/senha.");
    }
  });

  $("#btnLogout")?.addEventListener("click", async ()=>{
    try{
      const { signOut } = await fa();
      await signOut(auth);
      showToast("Saiu");
    }catch(_){}
  });

  // enter para logar
  $("#adminPass")?.addEventListener("keydown", (e)=>{
    if(e.key === "Enter") btn.click();
  });
}

async function refreshAll(showToasts=false){
  try{
    categories = await loadCategories();
    if(!categories.length){
      // fallback mínimo para não quebrar selects
      categories = [
        { id:"novidades", label:"Novidades", order:0 },
        { id:"promocoes", label:"Promoções", order:1 },
        { id:"kits", label:"Kits", order:2 },
        { id:"avulsos", label:"Avulsos", order:3 },
      ];
      showToasts && showToast("Categorias", "Nenhuma categoria no Firebase. Use + Categoria e Salvar.");
    }
    products = await loadProducts();

    // filtros default
    filterText = "";
    filterCat = "all";
    filterOnlyActive = true;
    $("#filterText") && ($("#filterText").value = "");
    $("#filterOnlyActive") && ($("#filterOnlyActive").checked = true);

    renderCategories();
    renderProducts();

    showToasts && showToast("Atualizado", "Dados carregados do Firebase.");
  }catch(err){
    showToasts && showToast("Erro", err?.message || "Não foi possível carregar.");
  }
}

(async ()=>{
  await wireLogin();
  wireFilters();
  wireCategories();
  wireProducts();
  wireMore();

  if(!firebaseReady || !auth){
    showPanels(false);
    setLoginHint("Firebase não configurado. Preencha /assets/firebase-config.js e publique novamente.");
    return;
  }

  const { onAuthStateChanged } = await fa();
  onAuthStateChanged(auth, async (user)=>{
    showPanels(!!user);
    if(user){
      await refreshAll(true);
    }
  });
})();
