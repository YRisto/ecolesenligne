#!/bin/bash
cd /home/claude/work
for n in "$@"; do ./bvenv/bin/python -I tools/render_tex.py $n r_tex > logs/$n.log 2>&1; if [ -f r_tex/$n.png ]; then python3 tools/post_tex.py r_tex/$n.png tex/$n.png; echo "$n ok"; else echo "$n FAIL $(grep -E 'Error|Exception' logs/$n.log | head -2)"; fi; done
