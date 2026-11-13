#!/bin/bash
# rend puis convertit chaque personnage ; un journal par personnage
cd /home/claude/work
for f in "$@"; do n=$(basename $f .json)
  ./bvenv/bin/python -I tools/render_char.py $f r_all/c_$n > logs/$n.log 2>&1
  python3 tools/post_char.py r_all/c_$n sheets/$n.png 288 208 0.86 2.8 > sheets/$n.json 2>> logs/$n.log
  echo "$n $(cat sheets/$n.json) $(grep -c -E 'Error|Traceback' logs/$n.log)"
done
