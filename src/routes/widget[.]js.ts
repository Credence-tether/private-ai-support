// Serves /widget.js — the embeddable visitor chat widget.
// Embed on any website with:
//   <script src="https://<your-app>.lovable.app/widget.js" defer></script>
import { createFileRoute } from "@tanstack/react-router";

const WIDGET_JS = `(function(){
  if (window.__lovable_support_loaded) return;
  window.__lovable_support_loaded = true;

  var scriptEl = document.currentScript;
  var apiBase = (function(){
    try { return new URL(scriptEl.src).origin; } catch(e) { return ''; }
  })();
  var DEFAULTS = { color: '#0ea5e9', position: 'right', greeting: '', name: 'Support' };
  function attr(name, def){ var v = scriptEl && scriptEl.getAttribute('data-'+name); return v || def; }
  var CFG = {
    apiBase: apiBase,
    color: attr('color', DEFAULTS.color),
    position: attr('position', DEFAULTS.position),
    greeting: attr('greeting', DEFAULTS.greeting),
    brand: attr('name', DEFAULTS.name)
  };

  var LS_VID = 'lvs_vid', LS_VTOK = 'lvs_vtok', LS_CID = 'lvs_cid';
  function getLS(k){ try { return localStorage.getItem(k) || ''; } catch(e){ return ''; } }
  function setLS(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

  var state = { vid:getLS(LS_VID), vtok:getLS(LS_VTOK), cid:getLS(LS_CID), msgs:[], status:'bot', lastSince:null, open:false, sending:false };

  function fingerprint(){
    try {
      var s = navigator.userAgent + '|' + (navigator.language||'') + '|' + screen.width + 'x' + screen.height + '|' + new Date().getTimezoneOffset();
      var h = 0; for (var i=0;i<s.length;i++){ h = ((h<<5)-h) + s.charCodeAt(i); h|=0; }
      return 'fp_' + (h>>>0).toString(36);
    } catch(e){ return 'fp_anon'; }
  }

  async function api(path, body){
    var res = await fetch(CFG.apiBase + '/api/public/widget/' + path, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{})
    });
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  // ---------- DOM ----------
  var host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;bottom:20px;'+(CFG.position==='left'?'left:20px':'right:20px')+';z-index:2147483600;';
  document.body.appendChild(host);
  var shadow = host.attachShadow ? host.attachShadow({mode:'open'}) : host;

  var style = document.createElement('style');
  style.textContent = [
    ':host,*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '.bubble{width:60px;height:60px;border-radius:50%;background:'+CFG.color+';color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);border:none;transition:transform .15s}',
    '.bubble:hover{transform:scale(1.05)}',
    '.bubble svg{width:28px;height:28px}',
    '.panel{display:none;width:360px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 100px);background:#fff;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.22);overflow:hidden;flex-direction:column;margin-bottom:12px;border:1px solid rgba(0,0,0,.06)}',
    '.panel.open{display:flex}',
    '.hdr{background:'+CFG.color+';color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}',
    '.hdr h3{margin:0;font-size:15px;font-weight:600}',
    '.hdr .sub{font-size:11px;opacity:.85;margin-top:2px}',
    '.hdr button{background:transparent;border:none;color:#fff;cursor:pointer;padding:4px;font-size:18px;line-height:1}',
    '.body{flex:1;overflow-y:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:8px}',
    '.msg{max-width:80%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}',
    '.msg.visitor{align-self:flex-end;background:'+CFG.color+';color:#fff;border-bottom-right-radius:4px}',
    '.msg.assistant,.msg.operator{align-self:flex-start;background:#fff;color:#111827;border:1px solid #e5e7eb;border-bottom-left-radius:4px}',
    '.msg.operator{background:#ecfdf5;border-color:#a7f3d0}',
    '.msg.system{align-self:center;background:transparent;color:#6b7280;font-size:12px;font-style:italic;padding:4px 8px}',
    '.typing{align-self:flex-start;color:#6b7280;font-size:12px;padding:6px 12px}',
    '.foot{border-top:1px solid #e5e7eb;background:#fff;padding:10px;display:flex;flex-direction:column;gap:8px}',
    '.row{display:flex;gap:6px;align-items:center}',
    '.row textarea{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:8px 10px;font-size:14px;resize:none;max-height:120px;font-family:inherit;outline:none}',
    '.row textarea:focus{border-color:'+CFG.color+'}',
    '.send{background:'+CFG.color+';color:#fff;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600}',
    '.send:disabled{opacity:.5;cursor:not-allowed}',
    '.human-btn{background:transparent;border:1px solid #e5e7eb;color:#374151;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;align-self:center}',
    '.human-btn:hover{background:#f3f4f6}',
    '.human-btn.active{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}',
    '.brand-foot{text-align:center;font-size:10px;color:#9ca3af;padding:4px}'
  ].join('');
  shadow.appendChild(style);

  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = [
    '<div class="hdr"><div><h3>'+escapeHtml(CFG.brand)+'</h3><div class="sub" data-sub>Online</div></div><button data-close aria-label="Close">×</button></div>',
    '<div class="body" data-body></div>',
    '<div class="foot">',
    '  <button class="human-btn" data-human>Talk to a human</button>',
    '  <div class="row"><textarea data-input rows="1" placeholder="Type a message…"></textarea><button class="send" data-send>Send</button></div>',
    '  <div class="brand-foot">Powered by AI</div>',
    '</div>'
  ].join('');
  shadow.appendChild(panel);

  var bubble = document.createElement('button');
  bubble.className = 'bubble';
  bubble.setAttribute('aria-label','Open chat');
  bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  shadow.appendChild(bubble);

  var $body = panel.querySelector('[data-body]');
  var $input = panel.querySelector('[data-input]');
  var $send = panel.querySelector('[data-send]');
  var $human = panel.querySelector('[data-human]');
  var $close = panel.querySelector('[data-close]');
  var $sub = panel.querySelector('[data-sub]');

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function render(){
    $body.innerHTML = '';
    state.msgs.forEach(function(m){
      var d = document.createElement('div');
      d.className = 'msg ' + m.role;
      d.textContent = m.content;
      $body.appendChild(d);
    });
    if (state.sending) {
      var t = document.createElement('div'); t.className='typing'; t.textContent='Typing…'; $body.appendChild(t);
    }
    $body.scrollTop = $body.scrollHeight;
    if (state.status === 'human' || state.status === 'pending_human') {
      $human.classList.add('active'); $human.textContent = state.status==='human'?'Chatting with a human':'Waiting for a human…';
      $sub.textContent = state.status==='human'?'Human agent':'Human requested';
    } else {
      $human.classList.remove('active'); $human.textContent='Talk to a human';
      $sub.textContent='Online';
    }
  }

  async function init(){
    try {
      var data = await api('init', {
        visitor_id: state.vid || undefined,
        visitor_token: state.vtok || undefined,
        fingerprint: fingerprint(),
        site_origin: location.origin,
        page_url: location.href,
        user_agent: navigator.userAgent,
        referrer: document.referrer || undefined
      });
      state.vid = data.visitor_id; setLS(LS_VID, state.vid);
      state.vtok = data.visitor_token; setLS(LS_VTOK, state.vtok);
      state.cid = data.conversation_id; setLS(LS_CID, state.cid);
      state.msgs = data.messages || [];
      state.status = data.status;
      if (state.msgs.length === 0 && (CFG.greeting || data.greeting)) {
        state.msgs.push({ role:'assistant', content: CFG.greeting || data.greeting });
      }
      if (state.msgs.length > 0) state.lastSince = state.msgs[state.msgs.length-1].created_at || null;
      render();
    } catch(e){ console.error('chat init failed', e); }
  }

  async function poll(){
    if (!state.cid) return;
    try {
      var data = await api('poll', {
        visitor_id: state.vid, visitor_token: state.vtok, conversation_id: state.cid,
        since: state.lastSince || undefined
      });
      if (data.messages && data.messages.length) {
        data.messages.forEach(function(m){ state.msgs.push(m); state.lastSince = m.created_at; });
        render();
      }
      if (data.status) { state.status = data.status; render(); }
    } catch(e){}
  }
  setInterval(poll, 4000);

  async function send(){
    var text = $input.value.trim();
    if (!text || state.sending) return;
    state.msgs.push({ role:'visitor', content:text, created_at:new Date().toISOString() });
    state.lastSince = new Date().toISOString();
    $input.value=''; state.sending = true; render();
    try {
      var data = await api('message', {
        visitor_id: state.vid, visitor_token: state.vtok,
        conversation_id: state.cid, content: text
      });
      if (data.assistant_message) {
        state.msgs.push({ role:'assistant', content:data.assistant_message, created_at:new Date().toISOString() });
        state.lastSince = new Date().toISOString();
      } else if (data.handed_over) {
        state.status = 'pending_human';
        if (data.system_note) state.msgs.push({ role:'system', content:data.system_note });
      }
    } catch(e){
      state.msgs.push({ role:'system', content:'Could not send. Check your connection.' });
    } finally { state.sending = false; render(); }
  }

  async function requestHuman(){
    if (!state.cid) return;
    try {
      var data = await api('request-human', {
        visitor_id: state.vid, visitor_token: state.vtok, conversation_id: state.cid
      });
      state.status = 'pending_human';
      if (data.system_note) state.msgs.push({ role:'system', content:data.system_note });
      render();
    } catch(e){}
  }

  bubble.addEventListener('click', function(){
    state.open = !state.open;
    panel.classList.toggle('open', state.open);
    bubble.style.display = state.open ? 'none' : 'flex';
    if (state.open && !state.vid) init();
  });
  $close.addEventListener('click', function(){ state.open=false; panel.classList.remove('open'); bubble.style.display='flex'; });
  $send.addEventListener('click', send);
  $input.addEventListener('keydown', function(e){ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } });
  $human.addEventListener('click', requestHuman);

  // Lazy init when page is idle so we don't slow first paint
  if ('requestIdleCallback' in window) requestIdleCallback(init, { timeout: 3000 });
  else setTimeout(init, 1500);
})();`;

export const Route = createFileRoute("/widget.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(WIDGET_JS, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
