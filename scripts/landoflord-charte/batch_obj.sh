#!/bin/bash
cd /home/claude/work
for n in "$@"; do ./bvenv/bin/python -I tools/render_tex.py $n r_obj > logs/$n.log 2>&1; if grep -q "DONE" logs/$n.log; then k=128; [ "${n:0:1}" = "p" ] && k=96; x=""; case $n in o_flight*) x="ns";; esac; python3 tools/post_obj.py r_obj/$n.png obj/$n.png $k $x; echo "$n ok"; else echo "$n FAIL $(grep -E 'Error|Exception' logs/$n.log | tail -2)"; fi; done
