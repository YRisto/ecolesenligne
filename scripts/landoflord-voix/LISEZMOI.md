# Voix des personnages — Le Général déchu

Les voix sont des fichiers `public/landoflord/vox/<clé>.mp3` (une réplique par fichier, mono 24 kHz, 40 kb/s).
La clé est un hachage FNV-1a de `locuteur|texte` (voir `voxKey` dans la page et `key` dans `lignes.py`) :
changer le texte d'une réplique, c'est la rendre muette tant qu'elle n'est pas réenregistrée.

## Important : après chaque nouvelle construction du jeu

Le code des voix est un correctif appliqué **sur la page construite**. Une construction qui n'en tient pas compte
publie un jeu muet. Pour le remettre :

    python3 scripts/landoflord-voix/p21_site.py public/landoflord/index.html scripts/landoflord-voix/table_vox.json

(le script refuse de s'appliquer deux fois et s'arrête si une ancre a changé).

## Chaîne d'enregistrement

1. `PAGE=public/landoflord/index.html python3 lignes.py` : relève toutes les répliques → `lignes.json`
   (dialogues, chronique, échoppes, variantes des quatre généraux) avec la voix de `distribution.json`.
2. `python3 gen.py 0` : enregistre ce qui manque (Pocket TTS de Kyutai, modèle `french_24l`, voix clonées
   du corpus CML-TTS ; reprenable). `python3 gen.py <graine> <clés…>` refait des prises.
3. `python3 ctl.py` puis `python3 bilan.py` : retranscription de contrôle et liste des répliques douteuses ;
   `python3 pick.py _r1 _r2` garde la meilleure prise.
4. `python3 enc.py` : encode en mp3 ; la table `table_vox.json` donne la durée de chaque réplique (dixièmes de seconde).

Distribution : `distribution.json` (identifiant du personnage → numéro de voix, rang dans la liste CML-TTS française de
`kyutai/tts-voices`). Le faussaire du prologue, non distribué, emprunte la voix du prévôt de Karst.

Licences : Pocket TTS (Kyutai) CC-BY 4.0 ; timbres CML-TTS (lectures LibriVox) CC-BY 4.0. Crédités dans le jeu.
