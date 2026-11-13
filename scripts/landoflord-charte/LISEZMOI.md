# Charte graphique du Général déchu

Tout ce qui s'affiche dans la vue vient de la même chaîne :

- **Palette de référence** (`charte.py`) : 16 rampes de 16 tons, arrondies au pas VGA. Le jeu embarque la même palette (`CHP`) et y fait passer tout ce qu'il peint lui-même (`vga`).
- **Lumière** : torche en haut à gauche (chaude), contre-jour froid à droite, liseré arrière. La même pour les personnages et les décors.
- **Densité** : 128 points par case pour murs, sols et plafonds ; personnages à 1,5 fois cette densité (ils sont vus plus près que le mur du fond).
- **Personnages** (`casting.py`, `render_char.py`, `post_char.py`) : modèles 3D de Flare (CC-BY-SA 3.0, `art_src/characters` du dépôt flareteam/flare-game), rendus de face à hauteur d'yeux avec Blender (module `bpy`), 14 images par ennemi (repos 2, marche 4, frappe ou tir 4, touché 1, mort 3), 5 par personnage rencontré.
- **Décors** (`render_tex.py`, `post_tex.py`) : murs, sols et plafonds modélisés puis rendus, bords bouclés par fondu croisé.
- **Assemblage** (`integrate.py`) : repart de la version précédente d'`index.html`, remplace les images et applique les retouches du moteur. `scenes.py` refait les vues composées des scènes.

Les chemins en tête des scripts (`/home/claude/work`, `/home/claude/src/flare-game`) sont ceux de la session de travail : à adapter.
