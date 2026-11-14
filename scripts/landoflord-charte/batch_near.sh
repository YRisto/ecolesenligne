#!/bin/bash
cd /home/claude/work
for f in "$@"; do n=$(basename $f .json)
  ./bvenv/bin/python -I tools/render_char.py $f r_all/n_$n > logs/n_$n.log 2>&1
  python3 tools/post_char.py r_all/n_$n sheets_n/$n.png 460 332 0.86 2.8 > sheets_n/$n.json 2>> logs/n_$n.log
  echo "$n $(grep -c -E 'Error|Traceback' logs/n_$n.log)"
done
