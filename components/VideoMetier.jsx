"use client";
import { useState } from "react";

// Lecture au clic : aucun cookie ni requête vers YouTube avant que le visiteur lance la vidéo.
export default function VideoMetier({ id, titre, chaine, ecole }) {
  const [on, setOn] = useState(false);
  return (
    <figure className="video">
      <div className="video-frame">
        {on ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} title={titre} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <button type="button" className="video-play" onClick={() => setOn(true)} aria-label={`Lire la vidéo : ${titre}`}>
            <span className="video-icon" aria-hidden="true">▶</span>
            <span className="video-titre">{titre}</span>
            <span className="video-note">Lecture sur YouTube (service tiers) au clic</span>
          </button>
        )}
      </div>
      <figcaption className="small muted">Vidéo : « {titre} »{chaine ? ` — ${chaine}` : ""}{ecole ? " (chaîne d'une école du comparateur)" : ""}</figcaption>
    </figure>
  );
}
