import bots,sys,json
from playwright.sync_api import sync_playwright
sel=sys.argv[1:]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    bots.SIM=[s for s in bots.SIM if s[0][:2] in sel];r=bots.sim(b,1);b.close()
