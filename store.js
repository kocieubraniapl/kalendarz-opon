// Warstwa danych. Teraz: zapis w przeglądarce (localStorage).
// W kroku 3 ta sama funkcjonalność zostanie podmieniona na Firebase —
// reszta aplikacji korzysta tylko z obiektu Store, więc nic innego się nie zmieni.

const Store = (() => {
  const KEY = 'kalendarz-opon:v1';
  const DRAFT_KEY = 'kalendarz-opon:szkic';
  const listeners = [];

  const empty = () => ({
    bookings: {},            // id -> wizyta
    blocked: {},             // 'RRRR-MM-DD' -> powód
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(empty(), JSON.parse(raw));
    } catch (e) { /* uszkodzone dane — zaczynamy od zera */ }
    return null;
  }

  let data = load();
  let isNew = false;
  if (!data) { data = empty(); isNew = true; }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    listeners.forEach(fn => fn());
  }

  // Zmiany zrobione w innej karcie przeglądarki od razu widoczne tutaj.
  window.addEventListener('storage', e => {
    if (e.key === KEY) { data = load() || empty(); listeners.forEach(fn => fn()); }
  });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    isNew: () => isNew,
    onChange: fn => listeners.push(fn),

    bookings: () => Object.values(data.bookings),
    booking: id => data.bookings[id],
    saveBooking(b) {
      if (!b.id) { b.id = uid(); b.createdAt = new Date().toISOString(); }
      b.updatedAt = new Date().toISOString();
      data.bookings[b.id] = b;
      persist();
      return b;
    },
    deleteBooking(id) { delete data.bookings[id]; persist(); },

    blocked: () => data.blocked,
    setBlocked(date, reason) {
      if (reason === null) delete data.blocked[date]; else data.blocked[date] = reason;
      persist();
    },

    // Szkic niedokończonej wizyty — przetrwa zamknięcie okna.
    draft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { return null; } },
    saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {} },
    clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} },
  };
})();
