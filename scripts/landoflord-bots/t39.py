# mixage : fondu des scènes parlées, baisse sous une voix en jeu, trois curseurs, reprise des anciens réglages, version sans site
from playwright.sync_api import sync_playwright
import json
G="({m:BUS.mus?+BUS.mus.gain.value.toFixed(3):null,a:+BUS.amb.gain.value.toFixed(2),s:+BUS.sfx.gain.value.toFixed(2),v:+BUS.vox.gain.value.toFixed(2),sc:mixScene,base:+musBase().toFixed(3),el:MUS.volume,tr:curTrack,paused:MUS.paused})"
SKIP="()=>{let n=0;while(!$('dlg').hidden&&n++<400){twDone();const bs=[...$('dlgBtns').querySelectorAll('button')];(bs[0]||{click(){}}).click();}}"
with sync_playwright() as p:
    br=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);errs=[]
    c=br.new_context(viewport={'width':1280,'height':800});pg=c.new_page();pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.goto('http://localhost:8766/landoflord/');pg.wait_for_selector('#tNew');pg.wait_for_timeout(300);pg.mouse.click(5,5);pg.wait_for_timeout(1200)
    print('titre           ',pg.evaluate(G))
    pg.click('#tNew');pg.wait_for_timeout(400)
    if pg.locator('[data-diff="1"]').count():pg.click('[data-diff="1"]')
    pg.wait_for_timeout(3000);print('prologue (3 s)  ',pg.evaluate(G),pg.evaluate("[cineMode,!$('dlg').hidden,!!voxSrc||!!voxWait]"))
    pg.evaluate("skipCine()");pg.wait_for_timeout(300);pg.evaluate(SKIP);pg.wait_for_timeout(3500);print('scène finie (3 s)',pg.evaluate(G),pg.evaluate("[!$('dlg').hidden,!$('heroSel').hidden]"))
    pg.evaluate("()=>{$('heroSel').hidden=true;$('title').hidden=true;newGame(1);}");pg.evaluate(SKIP);pg.wait_for_timeout(2500);print('en jeu          ',pg.evaluate(G))
    pg.evaluate("say([['brune',\"Général ? On vous disait pendu. Ou traître. Ou les deux, dans l'ordre qui vous arrange.\"]])");pg.wait_for_timeout(1500);print('voix en jeu     ',pg.evaluate(G),pg.evaluate("[cineMode,!!voxSrc]"))
    pg.evaluate("twDone();nextLine()");pg.wait_for_timeout(150);print('coupée (0,15 s) ',pg.evaluate("[!!voxSrc,$('dlg').hidden]"));pg.wait_for_timeout(2200);print('après           ',pg.evaluate(G))
    pg.evaluate("optModal()");print('curseurs:',pg.locator('.vols input').count(),pg.locator('.vols label span').all_inner_texts(),'| anciens boutons:',pg.locator('[data-m="mus"],[data-m="sfx"],[data-m="vox"],[data-m="vv"]').count())
    def setv(k,v):pg.evaluate("([k,v])=>{const i=document.querySelector('[data-vol=\"'+k+'\"]');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));}",[k,v])
    setv('lm',0);pg.wait_for_timeout(200);print('musique 0  ',pg.evaluate("[PREF.mus,MUS.paused,curTrack]"))
    setv('lm',100);pg.wait_for_timeout(600);print('musique 100',pg.evaluate(G))
    setv('ls',0);print('bruitages 0',pg.evaluate("[PREF.sfx,+BUS.sfx.gain.value.toFixed(2)]"));setv('ls',80)
    pg.focus('[data-vol="lv"]');pg.keyboard.press('ArrowLeft');print('clavier ← sur Voix:',pg.evaluate("[PREF.lv,document.querySelector('[data-vol=\"lv\"]').nextElementSibling.textContent]"))
    setv('lv',0);print('voix 0     ',pg.evaluate("[PREF.vox,voxOn()]"));pg.evaluate("closeModal()")
    pg.evaluate("say([['reine','Vous avez une heure, Malvoisin.',0,'throne','x']])");pg.wait_for_timeout(1200);print('scène, voix coupées: musique gardée',pg.evaluate(G));pg.evaluate("twDone();nextLine()")
    print('enregistré:',pg.evaluate("JSON.parse(localStorage.getItem('gd2_prefs'))"));c.close()
    # reprise d'anciens réglages
    c=br.new_context(viewport={'width':667,'height':375},has_touch=True,is_mobile=True);c.add_init_script("try{if(!localStorage.getItem('gd2_prefs'))localStorage.setItem('gd2_prefs',JSON.stringify({mus:0,sfx:1,vox:1,vv:2}))}catch(e){}")
    pg=c.new_page();pg.on('pageerror',lambda e:errs.append(str(e)[:300]));pg.goto('http://localhost:8766/landoflord/');pg.wait_for_selector('#tNew');print('anciens réglages →',pg.evaluate("[PREF.lm,PREF.ls,PREF.lv,PREF.mus,PREF.sfx,PREF.vox]"))
    pg.evaluate("optModal()");pg.wait_for_timeout(200);pg.screenshot(path='t39_paysage.png');c.close()
    # hors site (artefact)
    c=br.new_context(viewport={'width':390,'height':780});pg=c.new_page();pg.on('pageerror',lambda e:errs.append(str(e)[:300]));pg.goto('file:///home/claude/vox/out22.html');pg.wait_for_selector('#tNew');pg.mouse.click(5,5)
    pg.evaluate("optModal()");print('hors site: curseurs',pg.locator('.vols label span').all_inner_texts(),pg.locator('.vols small').all_inner_texts());pg.screenshot(path='t39_portrait.png')
    pg.evaluate("closeModal();$('title').hidden=true;newGame(1)");pg.evaluate(SKIP);pg.evaluate("sfx('coin');sfx('step')");print('hors site: jeu lancé',pg.evaluate("[!!S,mixScene]"));c.close()
    print('ERR',errs);br.close()
