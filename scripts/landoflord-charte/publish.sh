#!/bin/bash
# usage : publish.sh "message de commit" — vérifie que personne d'autre n'a publié, teste avec un bot, publie
set -e
cd /home/claude/ecolesenligne
git fetch -q --depth=20 origin main
if [ "$(git rev-parse origin/main)" != "$(git rev-parse HEAD)" ]; then echo "DIVERGENCE: origin/main a bougé ($(git log --oneline -1 origin/main))"; exit 3; fi
cp public/landoflord/index.html /home/claude/jeu/index.html
r=$(cd scripts/landoflord-bots && timeout 500 python3 b1.py ${BOT:-03} 2>&1 | tail -1)
echo "$r" | grep -o "bataille:[^/|]*|.*" | cut -c1-200
echo "$r" | grep -q "bataille:réussi" || { echo "BOT KO"; echo "$r" | cut -c1-600; exit 4; }
cp /home/claude/work/tools/*.py /home/claude/work/tools/*.sh scripts/landoflord-charte/ 2>/dev/null || true
git add -A && git commit -q -m "$1

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013WF9bjBy2P11Jkk7anXAXB" && git -c push.negotiate=true push origin main 2>&1 | tail -1
