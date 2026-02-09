(() => {
  const $ = (s) => document.querySelector(s);

  // --- Login simples ---
  // Senha padrão do admin (você pode trocar aqui).
  // Dica: também dá para setar uma senha em localStorage com a chave "adminPassword".
  const ADMIN_PASSWORD_DEFAULT = "studiomind2026";
  const ADMIN_PASSWORD = ADMIN_PASSWORD_DEFAULT;
  const AUTH_KEY = "adminAuth"; // sessionStorage

  function setAuthed(v){
    try{ if(v) sessionStorage.setItem(AUTH_KEY, "1"); else sessionStorage.removeItem(AUTH_KEY); }catch(_){ }
    try{ if(v) localStorage.setItem(AUTH_KEY, "1"); else localStorage.removeItem(AUTH_KEY); }catch(_){ }
  }

  function isAuthed(){
    try{ if(sessionStorage.getItem(AUTH_KEY) === "1") return true; }catch(_){ }
    try{ if(localStorage.getItem(AUTH_KEY) === "1") return true; }catch(_){ }
    return false;
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

  // Redefinição escondida: 5 cliques no título "Acesso admin" limpa autenticação e volta para a senha padrão.
  (function wireHiddenReset(){
    const title = document.querySelector("#loginPanel .panelTitle");
    if(!title) return;
    let c = 0;
    let t = null;
    const reset = () => { c = 0; if(t) clearTimeout(t); t = null; };
    title.addEventListener("click", () => {
      c += 1;
      if(!t) t = setTimeout(reset, 1500);
      if(c >= 5){
        reset();
        try{ localStorage.removeItem("adminPassword"); }catch(_){}
        try{ localStorage.removeItem(AUTH_KEY); }catch(_){}
        try{ sessionStorage.removeItem(AUTH_KEY); }catch(_){}
        alert("Acesso redefinido. Senha: " + ADMIN_PASSWORD_DEFAULT);
        showPanels();
      }
    });
  })();

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

      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.products) ? parsed.products : null);
      if (!Array.isArray(arr) || arr.length === 0) return getDefaultProducts();

      return arr.map((p, idx) => {
        const obj = (p && typeof p === "object") ? p : {};
        const id = String(obj.id || obj.sku || `p${idx + 1}`);
        const cat = String(obj.cat || obj.category || obj.categoria || "avulsos");
        const name = String(obj.name || obj.title || obj.nome || "Produto");
        const desc = String(obj.desc || obj.description || obj.descricao || "");
        let priceCents = obj.priceCents;
        if (priceCents == null) {
          const br = obj.price ?? obj.preco;
          if (typeof br === "number") priceCents = Math.round(br * 100);
          else if (typeof br === "string") {
            const num = Number(String(br).replace(/[R$\s]/g, "").replace(".", "").replace(",", "."));
            if (!Number.isNaN(num)) priceCents = Math.round(num * 100);
          }
        }
        priceCents = Number.isFinite(Number(priceCents)) ? Number(priceCents) : 0;
        return { id, cat, name, desc, priceCents };
      });
    } catch {
      return getDefaultProducts();
    }
  })();
