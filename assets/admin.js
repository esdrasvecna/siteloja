(() => {
  const $ = (s) => document.querySelector(s);

  // --- Login simples ---
  // Troque a senha abaixo para uma senha sua.
  const ADMIN_PASSWORD = "studiomind2026";
  const AUTH_KEY = "adminAuth"; // sessionStorage

  function setAuthed(v){
    if(v) sessionStorage.setItem(AUTH_KEY, "1");
    else sessionStorage.removeItem(AUTH_KEY);
  }

  function isAuthed(){
    return sessionStorage.getItem(AUTH_KEY) === "1";
  }

  function showPanels(){
    const login = $("#loginPanel");
    const admin = $("#adminPanel");
    if(!login || !admin) return;
    const ok = isAuthed();
    login.style.display = ok ? "none" : "block";
    admin.style.display = ok ? "block" : "none";
  }

  function wireLogin(){
    const pass = $("#adminPass");
    const btn = $("#adminLogin");
    if(!pass || !btn) return;

    const tryLogin = () => {
      const value = String(pass.value || "").trim();
      if(value === ADMIN_PASSWORD){
        setAuthed(true);
        pass.value = "";
        showPanels();
        // render é chamado no final do arquivo
      }else{
        alert("Senha incorreta.");
        pass.focus();
      }
    };

    btn.addEventListener("click", tryLogin);
    pass.addEventListener("keydown", (e) => {
      if(e.key === "Enter") tryLogin();
    });
  }

  wireLogin();
  showPanels();

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
    if(box){
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

        if(act === "delete"){
          if(confirm("Remover categoria? (Produtos com essa categoria continuarão com o ID salvo)")){
            categories.splice(i,1);
          }
        }
        if(act === "up" && i>0){
          const tmp = categories[i-1]; categories[i-1]=categories[i]; categories[i]=tmp;
        }
        if(act === "down" && i<categories.length-1){
          const tmp = categories[i+1]; categories[i+1]=categories[i]; categories[i]=tmp;
        }
        renderCategories();
        render();
      });
    }
  }

  function categoryOptionsHtml(selected){
    const opts = categories.map(c => {
      const sel = c.id === selected ? "selected" : "";
      return `<option value="${escapeHtml(c.id)}" ${sel}>${escapeHtml(c.label)}</option>`;
    }).join("");
    // se o produto estiver com uma categoria que não existe mais, mantém como opção
    if(selected && !categories.some(c => c.id === selected)){
      return `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} (não cadastrada)</option>` + opts;
    }
    return `<option value="avulsos" ${selected==="avulsos"?"selected":""}>AVULSOS</option>` + opts;
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
