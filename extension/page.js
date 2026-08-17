// Runs in the PAGE (MAIN) world, right after the bundled wa-js engine, so it can reach
// window.WPP. The UI lives in an isolated content script and can never touch WPP directly,
// so everything crosses through window.postMessage with a fixed message type.
//
// Commands are dispatched from a fixed table — the isolated side can only ask for an
// operation that exists here, never send code to run.
(() => {
  const TAG = 'WACRM';
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const jidOf = (n) => (String(n).includes('@') ? String(n) : digits(n) + '@c.us');
  const spin = (t) => String(t || '').replace(/\{([^{}]+)\}/g, (_, g) => {
    const o = g.split('|'); return o[Math.floor(Math.random() * o.length)];
  });

  // isFullReady is the engine's own "everything has synced" flag. On WhatsApp Business
  // Web it can stay false long after the app is fully usable, which made every operation
  // fail with "still loading" while the user was plainly chatting. What actually matters
  // is narrower: the chat module is loaded and the session is authenticated.
  const usable = () => {
    try {
      if (!window.WPP) return false;
      if (WPP.isFullReady) return true;
      return !!(WPP.chat && typeof WPP.chat.list === 'function');
    } catch (e) { return false; }
  };

  // Give a just-opened tab a moment rather than failing on the first click.
  const waitUsable = async (ms = 8000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (usable()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return usable();
  };

  // Getting a real phone number out of a chat is fiddly now: WhatsApp has moved many
  // chats to @lid identifiers where id.user is an internal id, not a number. Every
  // operation that reports a number must go through this — handing the CRM a LID produces
  // records that can never be messaged.
  const looksLikePhone = (v) => /^\d{7,15}$/.test(String(v || ''));
  const phoneOf = (idOrChat) => {
    try {
      const c = idOrChat || {};
      const id = c.server || c.user ? c : c.id;
      if (id && id.server === 'c.us' && looksLikePhone(id.user)) return id.user;
      const ct = c.contact || {};
      if (ct.id && ct.id.server === 'c.us' && looksLikePhone(ct.id.user)) return ct.id.user;
      for (const v of [ct.phoneNumber && ct.phoneNumber.user, ct.phoneNumber, ct.userid]) {
        if (looksLikePhone(v)) return String(v);
      }
      if (id && id.server === 'lid') {
        const fns = (window.WPP && WPP.whatsapp && WPP.whatsapp.functions) || {};
        for (const n of ['getPhoneNumber', 'getCusFromLid', 'getUserFromLid', 'getPnFromLid']) {
          try {
            const r = typeof fns[n] === 'function' ? fns[n](id) : null;
            const u = String((r && (r.user || r._serialized || r)) || '').split('@')[0];
            if (looksLikePhone(u)) return u;
          } catch (e) { /* try the next one */ }
        }
      }
    } catch (e) { /* fall through */ }
    return '';
  };

  const OPS = {
    async status() {
      if (!window.WPP) return { state: 'loading' };
      try {
        const auth = await WPP.conn.isAuthenticated();
        if (!auth) return { state: 'qr' };
        // isMainReady can stay false on WhatsApp Business Web even when everything works,
        // so treat a readable chat module as connected too.
        let main = false;
        try { main = typeof WPP.conn.isMainReady === 'function' ? await WPP.conn.isMainReady() : !!WPP.isReady; } catch (e) {}
        if (!main) main = usable();
        let me = null;
        try { me = WPP.conn.getMyUserId() && WPP.conn.getMyUserId().user; } catch (_) {}
        return { state: main ? 'connected' : 'syncing', me };
      } catch (e) { return { state: 'loading' }; }
    },

    async activeChat() {
      try {
        const c = WPP.chat.getActiveChat && WPP.chat.getActiveChat();
        if (!c) return null;
        const user = phoneOf(c);
        const name = (c.contact && c.contact.name) || c.name || c.formattedTitle || user;
        return { id: c.id && c.id._serialized, number: user, name, isGroup: !!(c.id && c.id.server === 'g.us') };
      } catch (e) { return null; }
    },

    async sendText({ to, text }) {
      // linkPreview:false — wa-js would otherwise send any URL in the message to
      // third-party preview servers. See wpp-config.js.
      await WPP.chat.sendTextMessage(jidOf(to), spin(text), { createChat: true, linkPreview: false });
      return { ok: true };
    },

    async sendFile({ to, data, caption, filename }) {
      await WPP.chat.sendFileMessage(jidOf(to), data, {
        type: 'auto', caption: spin(caption || ''), filename: filename || 'file', createChat: true,
      });
      return { ok: true };
    },

    async groups() {
      const g = await WPP.chat.list({ onlyGroups: true });
      return g.map((x) => ({
        jid: x.id && x.id._serialized,
        name: (x.groupMetadata && x.groupMetadata.subject) || x.name || x.formattedTitle || '',
      }));
    },

    // One pass over the chat list, bucketed the way the filter bar needs it. Doing this
    // here rather than shipping every chat across the bridge keeps the payload small.
    async chatStats() {
      const all = await WPP.chat.list();
      const out = { all: 0, unread: 0, groups: 0, community: 0, business: 0, contacts: 0, unsaved: 0 };
      for (const c of all) {
        out.all++;
        if ((c.unreadCount || 0) > 0) out.unread++;
        const isGroup = !!(c.id && c.id.server === 'g.us');
        if (isGroup) out.groups++;
        if (c.isParentGroup || c.parentGroup || (c.groupMetadata && c.groupMetadata.isParentGroup)) out.community++;
        const ct = c.contact || {};
        if (!isGroup && (ct.isBusiness || ct.isEnterprise)) out.business++;
        if (!isGroup && ct.isMyContact) out.contacts++;
        if (!isGroup && !ct.isMyContact) out.unsaved++;
      }
      return out;
    },

    // Numbers from a chosen bucket, so Bulk Send and Export can be filled without the
    // user pasting anything.
    async chatNumbers({ bucket }) {
      const all = await WPP.chat.list();
      const pick = (c) => {
        const isGroup = !!(c.id && c.id.server === 'g.us');
        const ct = c.contact || {};
        switch (bucket) {
          case 'unread': return !isGroup && (c.unreadCount || 0) > 0;
          case 'groups': return isGroup;
          case 'business': return !isGroup && (ct.isBusiness || ct.isEnterprise);
          case 'contacts': return !isGroup && ct.isMyContact;
          case 'unsaved': return !isGroup && !ct.isMyContact;
          default: return !isGroup;
        }
      };
      // Getting a real phone number out of a chat is genuinely fiddly now: WhatsApp has
      // moved many chats to @lid identifiers, where c.id.user is an internal id and not a
      // number at all. Try every source, in order of reliability, and resolve LIDs
      // properly rather than guessing.
      return all.filter(pick).map((c) => {
        const server = (c.id && c.id.server) || '';
        return {
          jid: c.id && c.id._serialized,
          number: phoneOf(c),
          name: (c.contact && (c.contact.name || c.contact.pushname)) || c.name || c.formattedTitle || '',
          unread: c.unreadCount || 0,
          isGroup: server === 'g.us',
        };
      });
    },

    // Members of the groups you belong to — the desktop app's richest extraction source.
    async groupMembers({ jids }) {
      const out = [];
      const seen = new Set();
      const groups = await WPP.chat.list({ onlyGroups: true });
      const wanted = jids && jids.length ? new Set(jids) : null;
      for (const g of groups) {
        const jid = g.id && g.id._serialized;
        if (wanted && !wanted.has(jid)) continue;
        let parts = [];
        try {
          const meta = await WPP.group.getParticipants(g.id);
          parts = meta || [];
        } catch (e) {
          parts = (g.groupMetadata && g.groupMetadata.participants) || [];
        }
        const gname = (g.groupMetadata && g.groupMetadata.subject) || g.name || '';
        for (const p of parts) {
          const id = p.id || p;
          const user = phoneOf(id);
          if (!user) continue;
          if (seen.has(user)) continue;
          seen.add(user);
          let contact = null;
          try { contact = WPP.contact.get(id); } catch (e) {}
          out.push({
            number: user,
            name: (contact && (contact.name || contact.pushname)) || '',
            saved: !!(contact && contact.isMyContact),
            group: gname,
          });
        }
      }
      return out;
    },

    async openChat({ jid }) {
      await WPP.chat.openChatBottom(jid);
      return { ok: true };
    },

    async contacts() {
      const cs = await WPP.contact.list();
      return cs.map((c) => ({
        jid: c.id && c.id._serialized,
        number: phoneOf(c),
        name: c.name || c.pushname || '',
        saved: !!c.isMyContact,
      })).filter((c) => c.number);
    },

    async checkNumber({ number }) {
      const r = await WPP.contact.queryExists(digits(number));
      return { number: digits(number), exists: !!r };
    },
  };

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.tag !== TAG || m.dir !== 'req') return;
    const fn = OPS[m.op];
    let res;
    if (!fn) {
      res = { ok: false, err: 'unknown_op' };
    } else if (m.op !== 'status' && !(await waitUsable())) {
      res = { ok: false, err: 'The WhatsApp engine has not loaded. Reload this page and try again.' };
    } else {
      // Report the real failure rather than hiding it behind a readiness guess.
      try { res = { ok: true, data: await fn(m.args || {}) }; }
      catch (e) { res = { ok: false, err: String((e && e.message) || e) }; }
    }
    window.postMessage({ tag: TAG, dir: 'res', id: m.id, res }, '*');
  });

  // Incoming messages. The chatbot advertised that it "watches incoming messages", but
  // nothing was ever subscribed — so no flow could fire. This forwards each inbound
  // message to the isolated side, which decides whether any flow matches.
  const wired = { on: false };
  function wireIncoming() {
    if (wired.on || !window.WPP || !WPP.ev || typeof WPP.ev.on !== 'function') return;
    try {
      WPP.ev.on('chat.new_message', (msg) => {
        try {
          if (!msg || msg.fromMe || msg.isStatusV3) return;
          const from = (msg.from && (msg.from.user || msg.from._serialized)) || '';
          window.postMessage({
            tag: TAG, dir: 'msg',
            data: {
              from: String(from),
              jid: (msg.from && msg.from._serialized) || '',
              body: String(msg.body || msg.caption || ''),
              isGroup: !!(msg.from && msg.from.server === 'g.us'),
            },
          }, '*');
        } catch (e) {}
      });
      wired.on = true;
    } catch (e) {}
  }
  wireIncoming();
  const wiv = setInterval(() => { wireIncoming(); if (wired.on) clearInterval(wiv); }, 1500);
  setTimeout(() => clearInterval(wiv), 120000);

  // Let the isolated side know the engine is present.
  const announce = () => window.postMessage({ tag: TAG, dir: 'ready', ready: usable() }, '*');
  announce();
  const iv = setInterval(() => { if (usable()) { announce(); clearInterval(iv); } }, 1000);
  setTimeout(() => clearInterval(iv), 120000);
})();
