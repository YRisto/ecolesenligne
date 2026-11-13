#!/bin/bash
# Reprend dans la base de travail ce qu'une autre session a publié entre-temps, puis reconstruit par-dessus.
set -e
cd /home/claude/ecolesenligne
MINE=$(git rev-parse HEAD); git stash -q -u 2>/dev/null || true
git show $MINE:public/landoflord/index.html > /home/claude/work/port_base.html
git show origin/main:public/landoflord/index.html > /home/claude/work/port_theirs.html
git diff --stat $MINE origin/main | grep -v "vox/" | tail -6
cd /home/claude/work && cp old_voix.html port_cur.html
if git merge-file -p port_cur.html port_base.html port_theirs.html > port_out.html; then cp port_out.html old_voix.html; echo "PORT OK"; else echo "CONFLITS: $(grep -c '^<<<<<<<' port_out.html)"; exit 5; fi
cd /home/claude/ecolesenligne && git stash drop -q 2>/dev/null || true; git reset -q --hard origin/main
