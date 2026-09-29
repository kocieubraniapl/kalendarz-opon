// Warstwa danych: Firebase (logowanie + baza Firestore w Warszawie).
// Reszta aplikacji korzysta tylko z obiektu Store. Odczyty są natychmiastowe (z pamięci),
// zapisy idą do bazy; zmiany zrobione przez drugą osobę przychodzą same (onSnapshot).
// Bez internetu zapisy czekają w urządzeniu i wysyłają się po powrocie połączenia.

const Store = (() => {
  const DRAFT_KEY = 'kalendarz-opon:szkic';
  const listeners = [];
  const data = { bookings: {}, blocked: {} };   // bookings: id -> wizyta, blocked: 'RRRR-MM-DD' -> powód

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => { /* np. tryb prywatny — działa bez pamięci offline */ });

  const col = { bookings: db.collection('bookings'), blocked: db.collection('blocked'), meta: db.collection('meta') };
  let unsub = [];
  let onWriteError = () => {};

  const notify = () => listeners.forEach(fn => fn());
  const clean = obj => JSON.parse(JSON.stringify(obj));   // Firestore nie przyjmuje „undefined”
  const failed = err => { console.error(err); onWriteError(err); };

  // Nasłuch obu kolekcji; resolve po pierwszym komplecie danych.
  function subscribe() {
    let pending = 2;
    return new Promise(resolve => {
      const ready = () => { if (--pending === 0) resolve(); };
      let first1 = true, first2 = true;
      unsub.push(col.bookings.onSnapshot(snap => {
        snap.docChanges().forEach(c => {
          if (c.type === 'removed') delete data.bookings[c.doc.id];
          else data.bookings[c.doc.id] = { ...c.doc.data(), id: c.doc.id };
        });
        if (first1) { first1 = false; ready(); } else notify();
      }, failed));
      unsub.push(col.blocked.onSnapshot(snap => {
        snap.docChanges().forEach(c => {
          if (c.type === 'removed') delete data.blocked[c.doc.id];
          else data.blocked[c.doc.id] = c.doc.data().reason || '';
        });
        if (first2) { first2 = false; ready(); } else notify();
      }, failed));
    });
  }

  function unsubscribeAll() {
    unsub.forEach(fn => fn()); unsub = [];
    data.bookings = {}; data.blocked = {};
  }

  return {
    // Start: callbacki dla zalogowania / wylogowania.
    start({ onSignedIn, onSignedOut, onError }) {
      onWriteError = onError || onWriteError;
      auth.onAuthStateChanged(async user => {
        if (!user) { unsubscribeAll(); onSignedOut(); return; }
        await subscribe();
        onSignedIn(user);
      });
    },
    signIn: (email, password) => auth.signInWithEmailAndPassword(email, password),
    signOut: () => auth.signOut(),
    userEmail: () => auth.currentUser?.email || '',

    // Dane przykładowe tylko raz na całą bazę (znacznik w meta/setup).
    async seedOnce(seedFn) {
      const ref = col.meta.doc('setup');
      const snap = await ref.get().catch(() => null);
      if (!snap || snap.exists) return;
      await ref.set({ seeded: true, at: new Date().toISOString() });
      seedFn();
    },

    onChange: fn => listeners.push(fn),

    bookings: () => Object.values(data.bookings),
    booking: id => data.bookings[id],
    saveBooking(b) {
      if (!b.id) { b.id = col.bookings.doc().id; b.createdAt = new Date().toISOString(); }
      b.updatedAt = new Date().toISOString();
      data.bookings[b.id] = b;
      notify();
      const { id, ...rest } = b;
      col.bookings.doc(id).set(clean(rest)).catch(failed);
      return b;
    },
    deleteBooking(id) {
      delete data.bookings[id];
      notify();
      col.bookings.doc(id).delete().catch(failed);
    },

    blocked: () => data.blocked,
    setBlocked(date, reason) {
      if (reason === null) { delete data.blocked[date]; col.blocked.doc(date).delete().catch(failed); }
      else { data.blocked[date] = reason; col.blocked.doc(date).set({ reason }).catch(failed); }
      notify();
    },

    // Szkic niedokończonej wizyty — zostaje na tym urządzeniu, przetrwa zamknięcie okna.
    draft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { return null; } },
    saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {} },
    clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} },
  };
})();
