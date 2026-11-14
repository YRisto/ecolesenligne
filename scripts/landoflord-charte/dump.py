import sys,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context().new_page()
    pg.goto('file:///home/claude/ecolesenligne/public/landoflord/index.html?hd');pg.wait_for_selector('#tNew');pg.wait_for_timeout(1200)
    print(pg.evaluate(sys.argv[1]));b.close()
