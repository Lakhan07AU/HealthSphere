/* ---------- AI Assistant — floating chat widget (rule-based) ---------- */

window.Assistant = {
  messages: null,   // null until first open
  el: null,

  mount() {
    if (this.el) { this.show(true); return; }
    const root = document.createElement('div');
    root.id = 'assistant-root';
    root.innerHTML = `
      <button id="ai-fab" title="HealthSphere AI Assistant" aria-label="Open AI assistant">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>
      </button>
      <section id="ai-panel" style="display:none">
        <header>
          <div><b>HealthSphere Assistant</b><span>Rule-based · reads only your records</span></div>
          <button id="ai-close" aria-label="Close">✕</button>
        </header>
        <div id="ai-msgs"></div>
        <div id="ai-chips"></div>
        <form id="ai-form">
          <input id="ai-in" placeholder="Ask about your health records…" autocomplete="off" maxlength="300">
          <button class="btn sm" type="submit">Send</button>
        </form>
        <footer>Informational only — not medical advice.</footer>
      </section>`;
    document.body.appendChild(root);
    this.el = root;

    root.querySelector('#ai-fab').onclick = () => this.toggle();
    root.querySelector('#ai-close').onclick = () => this.toggle(false);
    root.querySelector('#ai-form').onsubmit = e => {
      e.preventDefault();
      const inp = root.querySelector('#ai-in');
      const q = inp.value.trim();
      if (!q) return;
      inp.value = '';
      this.ask(q);
    };
  },

  show(on) {
    const panel = this.el.querySelector('#ai-panel');
    const fab = this.el.querySelector('#ai-fab');
    panel.style.display = on ? 'flex' : 'none';
    fab.style.display = on ? 'none' : 'grid';
    if (on) {
      if (!this.messages) {
        this.messages = [{ who: 'bot', text: 'Hi! I\'m your HealthSphere assistant. I answer from your own records — metrics, reports, reminders, risk signals and lifestyle logs.' }];
        this.renderChips(['My HbA1c trend', 'Am I at risk?', 'Upcoming reminders', 'My latest report', 'Hydration goal']);
      }
      this.renderMsgs();
      this.el.querySelector('#ai-in').focus();
    }
  },

  toggle(force) {
    const open = force !== undefined ? force : this.el.querySelector('#ai-panel').style.display === 'none';
    this.show(open);
  },

  hide() { if (this.el) this.toggle(false); },

  push(who, text) {
    this.messages.push({ who, text });
    this.renderMsgs();
  },

  async ask(q) {
    this.push('user', q);
    this.renderChips([]);
    const typing = document.createElement('div');
    typing.className = 'ai-msg bot';
    typing.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
    const box = this.el.querySelector('#ai-msgs');
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;
    try {
      const r = await api('/api/assistant', { method: 'POST', body: { q } });
      typing.remove();
      this.messages.push({ who: 'bot', text: r.answer.reply, links: r.answer.links || [] });
      this.renderMsgs();
      this.renderChips(r.answer.chips || []);
    } catch (e) {
      typing.remove();
      this.push('bot', 'Sorry — ' + e.message);
    }
  },

  renderMsgs() {
    const esc2 = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const box = this.el.querySelector('#ai-msgs');
    box.innerHTML = this.messages.map(m => `
      <div class="ai-msg ${m.who}">
        <div class="ai-bubble">${esc2(m.text).replace(/\n/g, '<br>')}
          ${m.links?.length ? `<div class="row" style="gap:6px;margin-top:7px;flex-wrap:wrap">${m.links.map(l =>
            `<a class="btn sm secondary ai-link" href="${esc2(l.href)}">${esc2(l.label)}</a>`).join('')}</div>` : ''}
        </div>
      </div>`).join('');
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll('.ai-link').forEach(a => a.onclick = () => this.toggle(false));
  },

  renderChips(chips) {
    const row = this.el.querySelector('#ai-chips');
    row.innerHTML = chips.map(c => `<button class="ai-chip">${String(c).replace(/[<>&"]/g, '')}</button>`).join('');
    row.querySelectorAll('.ai-chip').forEach(b => b.onclick = () => this.ask(b.textContent));
  }
};
