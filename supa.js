/* App Obra Residencial Madrid — versão fora do Claude.
   Este arquivo faz o papel do "window.claude" do claude.ai usando o Supabase:
   login por e-mail, base da obra (tabela docs), fotos (bucket privado) e equipe (tabela membros).
   O app (index.html) não precisa saber onde está rodando. */
(function () {
  'use strict';
  const CFG = window.OBRA_CFG || {};
  const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
  window.__sb = sb;

  let sessao = null, membro = null;
  const cache = {}, subs = {}, urls = {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const erro = (e, code) => Object.assign(new Error((e && e.message) || String(e)), { code: code || (e && e.code) || 'upstream_error' });
  window.__fotoUrl = id => urls[id] || '';
  // chat de IA: função "perguntar" do Supabase (o token de login vai junto automaticamente)
  window.__perguntar = async (mensagens, contexto) => {
    const { data, error } = await sb.functions.invoke('perguntar', { body: { mensagens, contexto } });
    if (!error) return data || { erro: 'Resposta vazia.' };
    try { const j = await error.context.json(); if (j && j.erro) return { erro: j.erro }; } catch (e) {}
    return { erro: 'Não foi possível falar com a IA. Confira a internet e tente de novo.' };
  };

  // ---------- estilos das telas próprias (login, conta, equipe)
  const css = document.createElement('style');
  css.textContent = `
  .sx-tela{position:fixed;inset:0;z-index:90;background:var(--bg,#EEF0EE);display:flex;align-items:center;justify-content:center;padding:16px}
  .sx-caixa{background:var(--panel,#fff);border:1px solid var(--line,#ccc);border-radius:8px;padding:22px;width:min(420px,100%);display:flex;flex-direction:column;gap:12px;font:14px/1.45 var(--f-ui,Arial)}
  .sx-caixa h1{font-size:19px;margin:0}.sx-caixa p{margin:0;color:var(--muted,#555)}
  .sx-caixa input,.sx-caixa select{font:inherit;color:inherit;background:var(--panel,#fff);border:1px solid var(--line,#ccc);border-radius:5px;padding:9px 10px;width:100%}
  .sx-caixa button{font:inherit;font-weight:600;border-radius:5px;padding:9px 14px;cursor:pointer;border:1px solid var(--accent,#1D5A86);background:var(--accent,#1D5A86);color:var(--accent-ink,#fff)}
  .sx-caixa button.sec{background:transparent;color:var(--accent,#1D5A86)}
  .sx-msg{font-size:13px;color:var(--muted,#555)}.sx-msg.ruim{color:var(--bad,#A3271F)}
  .sx-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:40;border-radius:99px;padding:10px 16px;font:600 14px var(--f-ui,Arial);border:1px solid var(--line,#ccc);background:var(--panel,#fff);color:var(--ink,#111);box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:pointer}
  .sx-painel{position:fixed;inset:0;z-index:80;background:rgba(10,15,18,.35);display:flex;justify-content:flex-end}
  .sx-painel>div{background:var(--panel,#fff);width:min(560px,100%);height:100%;overflow:auto;padding:calc(16px + env(safe-area-inset-top,0px)) 16px 24px;display:flex;flex-direction:column;gap:16px;font:14px/1.45 var(--f-ui,Arial);color:var(--ink,#111)}
  .sx-painel h2{font-size:16px;margin:0}.sx-painel table{border-collapse:collapse;width:100%}.sx-painel td,.sx-painel th{padding:6px;border-bottom:1px solid var(--line,#ddd);text-align:left;font-size:13px}
  .sx-linha{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.sx-linha label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted,#555);flex:1;min-width:140px}
  .sx-linha input,.sx-linha select{font:inherit;color:inherit;background:var(--panel,#fff);border:1px solid var(--line,#ccc);border-radius:5px;padding:7px 8px}
  .sx-btn{font:600 13px var(--f-ui,Arial);border:1px solid var(--line,#ccc);background:var(--panel,#fff);color:inherit;border-radius:5px;padding:7px 12px;cursor:pointer}
  .sx-btn.pri{background:var(--accent,#1D5A86);color:var(--accent-ink,#fff);border-color:var(--accent,#1D5A86)}.sx-btn.del{color:var(--bad,#A3271F)}`;
  document.head.appendChild(css);

  // ---------- login
  function telaLogin(msg) {
    return new Promise(resolve => {
      const d = document.createElement('div'); d.className = 'sx-tela';
      d.innerHTML = `<form class="sx-caixa" id="sx-f1"><h1>Obra Residencial Madrid</h1><p>Entre com o e-mail cadastrado pela engenharia. Você recebe um link e um código de acesso.</p>
        <input type="email" name="email" required autocomplete="email" placeholder="seu@email.com" aria-label="E-mail">
        <button type="submit">Receber acesso por e-mail</button><div class="sx-msg ${msg ? 'ruim' : ''}" id="sx-m">${esc(msg || '')}</div></form>`;
      document.body.appendChild(d);
      const f1 = d.querySelector('#sx-f1'), m = d.querySelector('#sx-m');
      f1.addEventListener('submit', async ev => {
        ev.preventDefault(); const email = f1.email.value.trim().toLowerCase(); m.className = 'sx-msg'; m.textContent = 'Enviando…';
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) { m.className = 'sx-msg ruim'; m.textContent = 'Não foi possível enviar: ' + error.message; return; }
        f1.innerHTML = `<h1>Confira seu e-mail</h1><p>Enviamos o acesso para <b>${esc(email)}</b>. Toque no link do e-mail ou digite aqui o código que veio nele.</p>
          <input name="codigo" inputmode="numeric" autocomplete="one-time-code" placeholder="Código de 6 dígitos" aria-label="Código"><button type="submit">Entrar com o código</button>
          <button type="button" class="sec" id="sx-volta">Usar outro e-mail</button><div class="sx-msg" id="sx-m2"></div>`;
        f1.querySelector('#sx-volta').onclick = () => { d.remove(); telaLogin().then(resolve); };
        f1.onsubmit = async ev2 => {
          ev2.preventDefault(); ev2.stopImmediatePropagation(); const m2 = f1.querySelector('#sx-m2'); m2.className = 'sx-msg'; m2.textContent = 'Conferindo…';
          const { error: e2 } = await sb.auth.verifyOtp({ email, token: f1.codigo.value.trim(), type: 'email' });
          if (e2) { m2.className = 'sx-msg ruim'; m2.textContent = 'Código inválido ou vencido. Peça outro.'; }
        };
      }, { once: true });
      const { data: { subscription } } = sb.auth.onAuthStateChange((ev, s) => { if (s && (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION' || ev === 'TOKEN_REFRESHED')) { subscription.unsubscribe(); d.remove(); resolve(s); } });
    });
  }
  function semAcesso() {
    const d = document.createElement('div'); d.className = 'sx-tela';
    d.innerHTML = `<div class="sx-caixa"><h1>Sem acesso à obra</h1><p>O e-mail <b>${esc(sessao.user.email)}</b> entrou, mas ainda não foi liberado. Peça para a engenharia incluir você na equipe do app.</p><button id="sx-sair">Sair</button></div>`;
    document.body.appendChild(d); d.querySelector('#sx-sair').onclick = sair;
  }
  async function sair() { await sb.auth.signOut(); location.reload(); }

  const entrada = (async () => {
    const { data } = await sb.auth.getSession();
    sessao = data.session || await telaLogin();
    sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') location.reload(); if (s) sessao = s; });
    const { data: ms, error } = await sb.from('membros').select('*').eq('email', sessao.user.email.toLowerCase()).maybeSingle();
    if (error || !ms) { semAcesso(); return new Promise(() => {}); }
    membro = ms; botaoConta(); return true;
  })();

  // ---------- base da obra
  const mergeLocal = (a, b) => { const o = { ...(a || {}) }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) ? mergeLocal(a[k], b[k]) : b[k]; return o; };
  async function assinarFotos(col) {
    if (col !== 'fotos') return;
    const ids = []; for (const d of Object.values(cache.fotos || {})) for (const f of Object.values(d.f || {})) if (f && f.a && !urls[f.a]) ids.push(f.a);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb.storage.from('fotos').createSignedUrls(ids.slice(i, i + 100), 60 * 60 * 12);
      for (const r of data || []) if (r.signedUrl) urls[r.path] = r.signedUrl;
    }
  }
  async function emitir(col) {
    await assinarFotos(col);
    const o = cache[col] || {}; const snap = { docs: Object.keys(o).map(id => ({ id, data: () => o[id] })) };
    for (const cb of subs[col] || []) try { cb(snap); } catch (e) { console.error(e); }
  }
  async function carregar(col) {
    const o = {}; let de = 0;
    for (;;) {
      const { data, error } = await sb.from('docs').select('path,data').eq('colecao', col).range(de, de + 999);
      if (error) throw erro(error); for (const r of data) o[r.path.slice(col.length + 1)] = r.data;
      if (data.length < 1000) break; de += 1000;
    }
    cache[col] = o;
  }
  entrada.then(() => sb.channel('docs-ao-vivo').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
    const r = p.new && p.new.path ? p.new : null; if (!r) return; const col = r.path.split('/')[0];
    if (!subs[col]) return; (cache[col] || (cache[col] = {}))[r.path.slice(col.length + 1)] = r.data; emitir(col);
  }).subscribe());
  // ao voltar para o app (celular), recarrega o que estiver aberto
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && membro) for (const col of Object.keys(subs)) carregar(col).then(() => emitir(col)).catch(() => {}); });

  const db = {
    collection(col) {
      return { onSnapshot(cb, onErr) { (subs[col] || (subs[col] = [])).push(cb); carregar(col).then(() => emitir(col)).catch(e => onErr && onErr(e)); return () => { subs[col] = (subs[col] || []).filter(x => x !== cb); }; } };
    },
    doc(path) {
      const col = path.split('/')[0], id = path.slice(col.length + 1);
      return {
        async update(dados) {
          if (membro.papel !== 'editor') throw erro('Acesso só de leitura', 'not_granted');
          const { error } = await sb.rpc('doc_juntar', { p_path: path, p_dados: dados }); if (error) throw erro(error);
          (cache[col] || (cache[col] = {}))[id] = mergeLocal(cache[col][id], dados); emitir(col);
        },
        async set(dados) {
          if (membro.papel !== 'editor') throw erro('Acesso só de leitura', 'not_granted');
          const { error } = await sb.from('docs').upsert({ path, data: dados }); if (error) throw erro(error);
          (cache[col] || (cache[col] = {}))[id] = dados; emitir(col);
        },
        async get() { const v = (cache[col] || {})[id]; return { exists: v != null, data: () => v }; }
      };
    }
  };
  const user = {
    async can(n) { return (n === 'data.write' || n === 'assets.write') ? membro.papel === 'editor' : null; },
    async canEdit() { return membro.papel === 'editor'; },
    async isOwner() { return false; },
    async id() { return sessao.user.id; },
    async me() { return { id: sessao.user.id, name: membro.nome || sessao.user.email }; },
    async profiles(ids) {
      const out = {}; if (!ids || !ids.length) return out;
      const { data } = await sb.from('membros').select('user_id,nome,email').in('user_id', ids.filter(x => /^[0-9a-f-]{36}$/.test(x)));
      for (const r of data || []) out[r.user_id] = { id: r.user_id, name: r.nome || r.email };
      return out;
    }
  };
  // fotos: reduz para no máximo 2400 px antes de enviar (economiza dados no celular)
  async function reduzir(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5e6) return file;
    try {
      const img = await createImageBitmap(file); const k = Math.min(1, 2400 / Math.max(img.width, img.height));
      if (k >= 1 && file.size < 4e6) return file;
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(ok => c.toBlob(b => ok(b || file), 'image/jpeg', 0.85));
    } catch (e) { return file; }
  }
  const assets = {
    async upload(file) {
      if (file.size > 20 * 1024 * 1024) throw erro('Arquivo grande demais', 'too_large');
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw erro('Tipo não aceito', 'unsupported_type');
      const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-z0-9]/gi, '');
      const blob = await reduzir(file);
      const { error } = await sb.storage.from('fotos').upload(id, blob, { contentType: blob.type || file.type, upsert: false });
      if (error) throw erro(error);
      const { data } = await sb.storage.from('fotos').createSignedUrl(id, 60 * 60 * 12); urls[id] = data && data.signedUrl;
      return { id, url: urls[id], sizeBytes: blob.size, contentType: blob.type };
    },
    async list() { return { assets: [], usage: {} }; },
    async delete() { return { deleted: false }; }
  };
  const downloads = {
    async save({ filename, data }) {
      const b = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  };
  window.claude = {
    async use(nome) {
      await entrada;
      if (nome === 'db') return db;
      if (nome === 'user') return user;
      if (nome === 'downloads') return downloads;
      if (nome === 'assets') return membro.papel === 'editor' ? assets : null;
      return null;
    }
  };

  // ---------- conta, equipe e importação
  function botaoConta() {
    const b = document.createElement('button'); b.className = 'sx-fab'; b.textContent = '☰ Conta'; b.setAttribute('aria-label', 'Conta e equipe');
    b.onclick = abrirConta; document.body.appendChild(b);
  }
  async function abrirConta() {
    const ed = membro.papel === 'editor';
    const p = document.createElement('div'); p.className = 'sx-painel';
    p.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Conta"><div class="sx-linha" style="justify-content:space-between"><h2>Conta</h2><button class="sx-btn" data-x>Fechar</button></div>
      <p>${esc(membro.nome || '')} · ${esc(sessao.user.email)} · ${ed ? 'pode editar' : 'só acompanha'}</p>
      <div class="sx-linha"><button class="sx-btn" data-sair>Sair deste aparelho</button></div>
      ${ed ? `<h2>Equipe</h2><div id="sx-eq">Carregando…</div>
      <form class="sx-linha" id="sx-add"><label>E-mail<input name="email" type="email" required></label><label>Nome<input name="nome"></label>
        <label>Acesso<select name="papel"><option value="leitor">Só acompanha</option><option value="editor">Pode editar</option></select></label><button class="sx-btn pri">Incluir</button></form>
      <p class="sx-msg">A pessoa incluída entra pelo endereço do app com o próprio e-mail. Quem só acompanha vê tudo, inclusive custos, mas não altera nada.</p>
      <h2>Importar base ou ajustes</h2><p class="sx-msg">Arquivo de ajustes (preparado pela engenharia): junta as mudanças com o que já está no app, sem apagar nada. Arquivo de base completa: só para a carga inicial ou para restaurar um backup.</p>
      <div class="sx-linha"><label>Base (.json)<input type="file" id="sx-json" accept="application/json,.json"></label><label>Fotos<input type="file" id="sx-fotos" accept="image/*" multiple></label><button class="sx-btn pri" id="sx-imp">Importar</button></div>
      <div class="sx-msg" id="sx-impm"></div>` : ''}</div>`;
    document.body.appendChild(p);
    p.addEventListener('click', e => { if (e.target === p || e.target.hasAttribute('data-x')) p.remove(); if (e.target.hasAttribute('data-sair')) sair(); });
    if (!ed) return;
    const lista = async () => {
      const { data } = await sb.from('membros').select('*').order('nome');
      p.querySelector('#sx-eq').innerHTML = `<table><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th></th></tr></thead><tbody>${(data || []).map(m => `<tr><td>${esc(m.nome)}</td><td>${esc(m.email)}</td><td>${m.papel === 'editor' ? 'Edita' : 'Acompanha'}</td><td>${m.email === membro.email ? '' : `<button class="sx-btn del" data-del="${esc(m.email)}">Tirar</button>`}</td></tr>`).join('')}</tbody></table>`;
    };
    lista();
    p.querySelector('#sx-eq').addEventListener('click', async e => {
      const em = e.target.dataset && e.target.dataset.del; if (!em) return;
      if (!e.target.dataset.ok) { e.target.dataset.ok = 1; e.target.textContent = 'Confirmar'; return; }
      await sb.from('membros').delete().eq('email', em); lista();
    });
    p.querySelector('#sx-add').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      const { error } = await sb.from('membros').upsert({ email: f.email.value.trim().toLowerCase(), nome: f.nome.value.trim(), papel: f.papel.value });
      if (error) alert('Não incluiu: ' + error.message); else { f.reset(); lista(); }
    });
    p.querySelector('#sx-imp').addEventListener('click', async () => {
      const m = p.querySelector('#sx-impm'), fj = p.querySelector('#sx-json').files[0], fs = [...p.querySelector('#sx-fotos').files];
      if (!fj && !fs.length) { m.textContent = 'Escolha o arquivo da base ou as fotos.'; return; }
      try {
        if (fj) {
          const base = JSON.parse(await fj.text());
          if (base && base._ajustes && base.docs) {
            // arquivo de AJUSTES: junta só os campos informados com o que já existe (não apaga nada)
            const ps = Object.entries(base.docs); let k = 0;
            for (const [path, dados] of ps) { m.textContent = `Aplicando ajustes: ${++k} de ${ps.length}…`; const { error } = await sb.rpc('doc_juntar', { p_path: path, p_dados: dados }); if (error) throw error; }
          } else {
            const linhas = Object.entries(base).map(([path, data]) => ({ path, data }));
            for (let i = 0; i < linhas.length; i += 20) { m.textContent = `Gravando base: ${i} de ${linhas.length}…`; const { error } = await sb.from('docs').upsert(linhas.slice(i, i + 20)); if (error) throw error; }
          }
        }
        let n = 0;
        for (const f of fs) { m.textContent = `Enviando foto ${++n} de ${fs.length}…`; const id = f.name.replace(/\.[^.]+$/, ''); const { error } = await sb.storage.from('fotos').upload(id, await reduzir(f), { contentType: 'image/jpeg', upsert: true }); if (error) throw error; }
        m.textContent = 'Importação concluída. Recarregando…'; setTimeout(() => location.reload(), 1200);
      } catch (e) { m.textContent = 'Parou com erro: ' + (e.message || e); }
    });
  }
})();
