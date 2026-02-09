// assets/admin.js
import { db, auth, firebaseReady } from "./firebase.js";
import { collection, getDocs, query, orderBy, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const $ = (sel) => document.querySelector(sel);

const loginPanel = $("#loginPanel");
const adminPanel = $("#adminPanel");
const emailEl = $("#adminEmail");
const passEl = $("#adminPass");
const loginBtn = $("#adminLogin");
const loginHint = $("#loginHint");
const logoutBtn = $("#adminLogout");
const userBadge = $("#adminUserBadge");

const categoriesList = $("#categoriesList");
const addCategoryBtn = $("#addCategory");
const saveCategoriesBtn = $("#saveCategories");

const rowsEl = $("#rows");
const addProductBtn = $("#addProduct");
const saveProductsBtn = $("#saveProducts");
const exportJsonBtn = $("#exportJson");
const importJsonInput = $("#importJson");

let categories = [];
let products = []; // { _docId?, id, cat, name, desc, image, priceCents, order, active }

function slugify(label){
  return String(label||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"") || "categoria";
}

function sortCats(list){
  return [...list].sort((a,b)=>{
    const ao = Number.isFinite(+a.order) ? +a.order : 9999;
    const bo = Number.isFinite(+b.order) ? +b.order : 9999;
    if(ao!==bo) return ao-bo;
    return String(a.label||"").localeCompare(String(b.label||""), "pt-BR");
  });
}

function categoryOptionsHtml(selected){
  const sorted = sortCats(categories.map((c,i)=>({ ...c, order: c.order ?? i })));
  const opts = sorted.map(c=>{
    const sel = (c.id === selected) ? "selected" : "";
    return `<option value="${c.id}" ${sel}>${c.label}</option>`;
  }).join("");
  return opts || `<option value="novidades" selected>NOVIDADES</option>`;
}

function moneyToCents(brStr){
  // aceita "12,34" ou "12.34"
  const s = String(brStr||"").trim().replace(/\./g,"").replace(",", ".");
  const v = Number(s);
  return Number.isFinite(v) ? Math.round(v*100) : 0;
}
function centsToMoney(cents){
  const v = (Number(cents||0)/100);
  return v.toFixed(2).replace(".", ",");
}

function setHint(msg, isError=false){
  loginHint.style.display = "block";
  loginHint.textContent = msg;
  loginHint.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function ensureFirebase(){
  if(firebaseReady) return true;
  setHint("Firebase não inicializado. Verifique assets/firebase-config.js", true);
  return false;
}

/* ------------------------- Auth ------------------------- */
async function login(){
  if(!(await ensureFirebase())) return;
  const email = (emailEl.value||"").trim();
  const pass = passEl.value||"";
  if(!email || !pass){ setHint("Preencha email e senha.", true); return; }
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    setHint("Login ok.");
  }catch(e){
    console.warn(e);
    setHint("Falha no login. Confira email/senha e as permissões.", true);
  }
}

async function logout(){
  try{
    await signOut(auth);
  }catch(e){
    console.warn(e);
  }
}

async function watchAuth(){
  if(!(await ensureFirebase())) return;
  onAuthStateChanged(auth, async (user)=>{
    const logged = !!user;
    loginPanel.style.display = logged ? "none" : "block";
    adminPanel.style.display = logged ? "block" : "none";
    if(userBadge){ userBadge.textContent = user ? user.email : ""; userBadge.style.display = logged ? "inline-flex" : "none"; }
    if(logoutBtn) logoutBtn.style.display = logged ? "inline-flex" : "none";
    if(logged){
      await loadAll();
      renderAll();
    }
  });
}

/* ------------------------- Firestore I/O ------------------------- */
async function loadCategoriesFS(){
  const snap = await getDocs(query(collection(db,"categories"), orderBy("order","asc")));
  const out=[];
  snap.forEach(d=>{
    const data=d.data()||{};
    out.push({ id: d.id, label: String(data.label||d.id), order: Number(data.order??9999) });
  });
  return out;
}

async function saveCategoriesFS(newCats){
  const col = collection(db,"categories");
  const existing = await getDocs(col);
  const keepIds = new Set(newCats.map(c=>c.id));
  const batch = writeBatch(db);

  // deletar removidas
  existing.forEach(d=>{
    if(!keepIds.has(d.id)){
      batch.delete(doc(db,"categories", d.id));
    }
  });

  // setar/atualizar em ordem
  newCats.forEach((c, idx)=>{
    batch.set(doc(db,"categories", c.id), { label: c.label, order: idx }, { merge:true });
  });

  await batch.commit();
}

async function loadProductsFS(){
  const snap = await getDocs(query(collection(db,"products"), orderBy("order","asc")));
  const out=[];
  snap.forEach(d=>{
    const data=d.data()||{};
    out.push({
      _docId: d.id,
      id: data.id || d.id,
      cat: data.cat || "novidades",
      name: String(data.name||""),
      desc: String(data.desc||""),
      image: data.image ? String(data.image) : "",
      priceCents: Number.isFinite(+data.priceCents) ? +data.priceCents : 0,
      order: Number.isFinite(+data.order) ? +data.order : 0,
      active: data.active !== false
    });
  });
  return out;
}

async function saveProductsFS(newProducts){
  const col = collection(db,"products");
  const existing = await getDocs(col);
  const keep = new Set(newProducts.map(p=>p._docId).filter(Boolean));
  const batch = writeBatch(db);

  // deletar removidos (somente docs que existiam)
  existing.forEach(d=>{
    if(!keep.has(d.id)){
      batch.delete(doc(db,"products", d.id));
    }
  });

  // set/merge cada produto
  newProducts.forEach((p, idx)=>{
    const docId = p._docId || p.id || undefined;
    const ref = docId ? doc(db,"products", docId) : doc(col); // doc() gera id
    const finalId = ref.id;
    batch.set(ref, {
      id: finalId,
      cat: p.cat || "novidades",
      name: p.name || "",
      desc: p.desc || "",
      image: p.image || "",
      priceCents: Math.max(0, Math.round(+p.priceCents || 0)),
      order: idx,
      active: p.active !== false
    }, { merge:true });
    p._docId = finalId;
    p.id = finalId;
  });

  await batch.commit();
}

/* ------------------------- UI: Categorias ------------------------- */
function renderCategories(){
  const sorted = sortCats(categories.map((c,i)=>({ ...c, order: c.order ?? i })));
  categoriesList.innerHTML = sorted.map((c, idx)=>`
    <div class="catRow" data-id="${c.id}">
      <div class="field">
        <label>Nome</label>
        <input class="input" value="${escapeHtml(c.label)}" data-role="label" />
      </div>
      <div class="field" style="max-width:140px;">
        <label>Ordem</label>
        <input class="input" type="number" value="${idx}" min="0" data-role="order" />
      </div>
      <div class="field" style="align-self:end;">
        <button class="btn btn-danger" data-role="remove">Remover</button>
      </div>
      <div class="muted" style="grid-column:1/-1; font-size:12px;">ID: <strong>${c.id}</strong></div>
    </div>
  `).join("");
}

function collectCategoriesFromUI(){
  const rows = Array.from(categoriesList.querySelectorAll(".catRow"));
  const out=[];
  for(const r of rows){
    const label = r.querySelector('[data-role="label"]').value.trim();
    if(!label) continue;
    const order = Number(r.querySelector('[data-role="order"]').value||0);
    const id = slugify(label);
    out.push({ id, label: label.toUpperCase(), order });
  }
  // garantir ids únicos
  const seen = new Set();
  const uniq = [];
  for(const c of sortCats(out)){
    let id=c.id;
    let k=1;
    while(seen.has(id)){ id = `${c.id}-${k++}`; }
    seen.add(id);
    uniq.push({ ...c, id });
  }
  return uniq;
}

/* ------------------------- UI: Produtos ------------------------- */
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g,(m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

function renderProducts(){
  const sorted = [...products].sort((a,b)=> (a.order??0)-(b.order??0));
  rowsEl.innerHTML = sorted.map((p, idx)=>`
    <tr data-doc="${p._docId||""}">
      <td style="padding:10px 12px;">
        <input class="input" data-k="order" type="number" min="0" value="${idx}" style="width:86px;">
      </td>
      <td style="padding:10px 12px;">
        <select class="input" data-k="cat">${categoryOptionsHtml(p.cat)}</select>
      </td>
      <td style="padding:10px 12px;">
        <input class="input" data-k="name" value="${escapeHtml(p.name)}" placeholder="Nome do produto" />
      </td>
      <td style="padding:10px 12px;">
        <input class="input" data-k="image" value="${escapeHtml(p.image||"")}" placeholder="URL da imagem (opcional)" />
      </td>
      <td style="padding:10px 12px;">
        <textarea class="input" data-k="desc" rows="2" placeholder="Descrição">${escapeHtml(p.desc||"")}</textarea>
      </td>
      <td style="padding:10px 12px; white-space:nowrap;">
        <input class="input" data-k="price" value="${centsToMoney(p.priceCents||0)}" style="width:120px;">
      </td>
      <td style="padding:10px 12px; white-space:nowrap;">
        <button class="btn btn-danger" data-action="remove">Excluir</button>
      </td>
    </tr>
  `).join("");
}

function collectProductsFromUI(){
  const trs = Array.from(rowsEl.querySelectorAll("tr"));
  const out=[];
  trs.forEach((tr, idx)=>{
    const _docId = tr.dataset.doc || "";
    const cat = tr.querySelector('[data-k="cat"]').value;
    const name = tr.querySelector('[data-k="name"]').value.trim();
    const image = tr.querySelector('[data-k="image"]').value.trim();
    const desc = tr.querySelector('[data-k="desc"]').value.trim();
    const priceCents = moneyToCents(tr.querySelector('[data-k="price"]').value);
    const order = idx;
    if(!name) return;
    out.push({ _docId: _docId || null, id: _docId || null, cat, name, image, desc, priceCents, order, active:true });
  });
  return out;
}

/* ------------------------- Actions ------------------------- */
async function loadAll(){
  categories = await loadCategoriesFS();
  if(!categories.length){
    categories = [
      { id:"novidades", label:"NOVIDADES", order:0 },
      { id:"promocoes", label:"PROMOÇÕES", order:1 },
      { id:"kits", label:"KITS", order:2 },
      { id:"avulsos", label:"AVULSOS", order:3 },
    ];
    await saveCategoriesFS(categories);
  }
  products = await loadProductsFS();
}

function renderAll(){
  renderCategories();
  renderProducts();
}

async function addCategory(){
  categories.push({ id:"nova-categoria", label:"NOVA CATEGORIA", order: categories.length });
  renderCategories();
}

async function saveCategories(){
  const newCats = collectCategoriesFromUI();
  if(!newCats.length){ alert("Crie pelo menos 1 categoria."); return; }
  await saveCategoriesFS(newCats);
  categories = await loadCategoriesFS();
  renderCategories();
  // re-render produtos para atualizar selects sem bagunçar valores
  renderProducts();
  alert("Categorias salvas!");
}

function addProduct(){
  const firstCat = sortCats(categories)[0]?.id || "novidades";
  products.push({
    _docId: null,
    id: null,
    cat: firstCat,
    name: "",
    desc: "",
    image: "",
    priceCents: 0,
    order: products.length,
    active: true
  });
  renderProducts();
  // foca no último nome
  const last = rowsEl.querySelector("tr:last-child [data-k='name']");
  if(last) last.focus();
}

async function saveProducts(){
  const newProducts = collectProductsFromUI();
  await saveProductsFS(newProducts);
  products = await loadProductsFS();
  renderProducts();
  alert("Produtos salvos!");
}

function exportJson(){
  const data = collectProductsFromUI();
  const blob = new Blob([JSON.stringify(data.map(p=>({
    id: p.id || undefined,
    cat: p.cat,
    name: p.name,
    desc: p.desc,
    image: p.image,
    priceCents: p.priceCents
  })), null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "products-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importJson(file){
  const text = await file.text();
  const parsed = JSON.parse(text);
  if(!Array.isArray(parsed)) throw new Error("JSON inválido");
  const firstCat = sortCats(categories)[0]?.id || "novidades";
  products = parsed.map((p, idx)=>({
    _docId: p.id || null,
    id: p.id || null,
    cat: p.cat || firstCat,
    name: p.name || "",
    desc: p.desc || "",
    image: p.image || "",
    priceCents: Number.isFinite(+p.priceCents) ? +p.priceCents : 0,
    order: idx,
    active: true
  }));
  renderProducts();
}

/* ------------------------- Events ------------------------- */
loginBtn?.addEventListener("click", login);
passEl?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") login(); });
logoutBtn?.addEventListener("click", logout);

addCategoryBtn?.addEventListener("click", addCategory);
saveCategoriesBtn?.addEventListener("click", ()=>saveCategories().catch(e=>{console.warn(e); alert("Erro ao salvar categorias.");}));

addProductBtn?.addEventListener("click", addProduct);
saveProductsBtn?.addEventListener("click", ()=>saveProducts().catch(e=>{console.warn(e); alert("Erro ao salvar produtos.");}));

rowsEl?.addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-action='remove']");
  if(!btn) return;
  const tr = btn.closest("tr");
  tr.remove();
});

exportJsonBtn?.addEventListener("click", exportJson);
importJsonInput?.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    await importJson(file);
  }catch(err){
    console.warn(err);
    alert("Não consegui importar esse JSON.");
  }finally{
    importJsonInput.value = "";
  }
});

categoriesList?.addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-role='remove']");
  if(!btn) return;
  btn.closest(".catRow")?.remove();
});

// init
watchAuth();