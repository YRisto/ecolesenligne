import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for name,dev in (('iPhone 6s',p.devices['iPhone 6']),('iPad',p.devices['iPad (gen 7)']),('Android',p.devices['Pixel 5']),('ordinateur',{'viewport':{'width':1366,'height':768}})):
        c=b.new_context(**dev);pg=c.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:120]))
        reqs=[];pg.on('request',lambda r:reqs.append(r.url.split('/')[-1][:30]) if 'pack-' in r.url else None)
        pg.goto('file://'+sys.argv[1]);pg.wait_for_selector('#tNew');pg.wait_for_timeout(300)
        print(name,'-> LITE',pg.evaluate('window.LITE'),reqs,'images',pg.evaluate('Object.keys(IMG).length'),'planches',pg.evaluate('Object.keys(SHEETS.img).length'),errs[:2]);c.close()
    b.close()
