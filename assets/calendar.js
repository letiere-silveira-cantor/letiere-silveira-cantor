// Calendário em forma de braço de violão, usado no site (clientes veem as datas) e no admin (Letieri edita).
// Cada coluna é uma casa do braço (um dia da semana) e cada corda é uma semana do mês.
// À direita fica a mão do violão com as tarraxas de afinação.
(function () {
  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
    "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const TUNING = ["E", "B", "G", "D", "A", "E"]; // da 1ª (mais fina, em cima) à 6ª corda
  const pad = (n) => String(n).padStart(2, "0");
  const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayKey = () => { const t = new Date(); return key(t.getFullYear(), t.getMonth(), t.getDate()); };

  // "2027-03-20" -> "sábado, 20 de março de 2027"
  function formatKey(k, opts = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", opts);
  }

  function create(root, { isBusy, onSelect, isSelected = () => false, monthsAhead = 18, labels = {} }) {
    const now = new Date();
    const first = { y: now.getFullYear(), m: now.getMonth() };
    let y = first.y;
    let m = first.m;
    const free = labels.free || "disponível";
    const busy = labels.busy || "ocupado";
    root.classList.add("cal");

    function render() {
      const today = todayKey();
      const offset = (y - first.y) * 12 + (m - first.m);
      const startDow = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      let frets = "";
      for (let i = 0; i < 42; i++) {
        const d = i - startDow + 1;
        if (d < 1 || d > days) { frets += `<span class="fret"></span>`; continue; }
        const k = key(y, m, d);
        const past = k < today;
        const b = !past && isBusy(k);
        const cls = ["cal-day", past ? "is-past" : b ? "is-busy" : "is-free"];
        if (k === today) cls.push("is-today");
        if (isSelected(k)) cls.push("is-selected");
        const label = `${WEEKDAYS[i % 7]}, ${d} de ${MONTHS[m].toLowerCase()}: ${past ? "data passada" : b ? busy : free}`;
        frets += `<span class="fret"><button type="button" class="${cls.join(" ")}" data-key="${k}" aria-label="${label}"${past ? " disabled" : ""}>${d}</button></span>`;
      }
      root.innerHTML = `
        <div class="cal-head">
          <button type="button" class="cal-nav" data-nav="-1" aria-label="Mês anterior"${offset <= 0 ? " disabled" : ""}>‹</button>
          <strong class="cal-title" aria-live="polite">${MONTHS[m]} ${y}</strong>
          <button type="button" class="cal-nav" data-nav="1" aria-label="Próximo mês"${offset >= monthsAhead ? " disabled" : ""}>›</button>
        </div>
        <div class="neck-labels" aria-hidden="true">${WEEKDAYS.map((w) => `<span>${w}</span>`).join("")}<span class="tune-label">Afinação</span></div>
        <div class="neck">
          <div class="neck-board">
            <i class="inlay" style="--col:1"></i><i class="inlay" style="--col:3"></i><i class="inlay" style="--col:5"></i>
            ${frets}
          </div>
          <div class="neck-nut" aria-hidden="true"></div>
          <div class="neck-head" aria-hidden="true">${TUNING.map((n) => `<span class="peg"><i></i><b>${n}</b></span>`).join("")}</div>
          <div class="neck-strings" aria-hidden="true">${TUNING.map((_, i) => `<i style="--s:${i}"></i>`).join("")}</div>
        </div>`;
    }

    root.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        m += Number(nav.dataset.nav);
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        render();
        return;
      }
      const day = e.target.closest(".cal-day[data-key]");
      if (day && !day.disabled) {
        onSelect(day.dataset.key);
        render();
        root.querySelector(`[data-key="${day.dataset.key}"]`)?.focus();
      }
    });

    render();
    return { render };
  }

  window.MiniCalendar = { create, key, todayKey, formatKey };
})();
