// Grille du planning telle que l'envoie le serveur : allégée (les valeurs vides et ce qui se déduit du jour ou de l'horaire sont omis).
// Cette fonction la remet à plat : chaque case retrouve sa date, le jour férié, l'état de clôture, le libellé et les plages de son horaire.
// Module sans dépendance : il sert à l'écran du planning et aux tests.
export function normaliserGrille(d) {
  for (const r of d.rows) {
    r.cells = r.cells.map((c, i) => {
      const j = d.days[i], m = c.code ? d.codes?.[c.code] : null, sched = c.sched ?? !!c.work;
      return {
        date: j.date, holiday: j.holiday || "", closed: !!j.closed, hors: false, work: false, code: "", label: m?.label || "", minutes: 0,
        ranges: m?.ranges_text || "", color: m?.color || "", source: "", note: "", r: [], absence: null, ...c,
        sched, def: c.def || { sched, minutes: sched ? c.minutes || 0 : 0, code: sched ? c.code || "" : "" },
      };
    });
  }
  return d;
}
