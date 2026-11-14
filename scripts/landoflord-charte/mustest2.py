from playwright.sync_api import sync_playwright
Q="({src:MUS.src.split('/').pop(),paused:MUS.paused,t:+MUS.currentTime.toFixed(2),vol:+MUS.volume.toFixed(3),cur:curTrack,pm:PREF.mus,lm:PREF.lm,cine:cineMode,lv:S&&S.lv})"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=document-user-activation-required']);cx=b.new_context(viewport={'width':1280,'height':800});pg=cx.new_page()
    pg.goto('http://localhost:8765/landoflord/index.html');pg.wait_for_selector('#tNew');pg.wait_for_timeout(800)
    print(pg.evaluate("[...document.querySelectorAll('#title button')].map(b=>b.id+':'+b.textContent+':'+b.hidden)"))
    pg.click('#tNew');pg.wait_for_timeout(300);pg.click('[data-diff="0"]');pg.wait_for_timeout(800)
    for i in range(80):
        st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
        if st['hero']:pg.click('[data-hero="aldric"]');pg.wait_for_timeout(200);pg.click('#heroYes');pg.wait_for_timeout(500);continue
        if st['dlg']:
            pg.keyboard.press('Escape');pg.wait_for_timeout(200)
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Enter');pg.wait_for_timeout(150)
            continue
        if pg.evaluate("typeof S!=='undefined'&&S&&S.lv&&!cineMode"):break
        pg.wait_for_timeout(200)
    pg.keyboard.press('ArrowUp');pg.wait_for_timeout(800);pg.evaluate("typeof autosave==='function'&&autosave()");pg.wait_for_timeout(300)
    print('clés',pg.evaluate("Object.keys(localStorage)"))
    # cas 1 : reprise d'une partie, entièrement au clavier puis à la souris
    pg.reload();pg.wait_for_selector('#tNew');pg.wait_for_timeout(800)
    btn=pg.evaluate("[...document.querySelectorAll('#title button')].filter(b=>!b.hidden&&b.offsetParent).map(b=>b.id)");print(btn)
    for c in btn:
        if c!='tNew':pg.click('#'+c);break
    pg.wait_for_timeout(800)
    if pg.evaluate("!document.getElementById('modal').hidden"):
        print('modal',pg.evaluate("[...document.querySelectorAll('#modalBox button')].map(b=>b.textContent.slice(0,30)+(b.disabled?'(x)':''))"));pg.click('#modalBox button:not([disabled])')
    pg.wait_for_timeout(4000);print('reprise',pg.evaluate(Q))
    # cas 2 : musique coupée autrefois dans les préférences
    pg.evaluate("localStorage.setItem('gd2_prefs',JSON.stringify({mus:0,sfx:1,vox:1,vv:1}))");pg.reload();pg.wait_for_selector('#tNew');pg.mouse.click(640,100);pg.wait_for_timeout(1500);print('ancien réglage mus:0',pg.evaluate(Q))
    b.close()
