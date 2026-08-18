# -*- coding: utf-8 -*-
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = 'index.html'
with open(PATH, 'r', encoding='utf-8') as f:
    content = f.read()

START = '<!-- 机库（默认页）：完全照搬 mockup_terminal 布局 -->'
END = '<!-- 军械库 -->'
assert START in content, 'START anchor missing'
assert END in content, 'END anchor missing'

# ---- 新的机库 HTML：mockup 框架皮肤 + game.js 真实容器 ----
NEW_HTML = '''      <!-- 机库（默认页）：mockup 框架皮肤 + game.js 真实功能实装 -->
      <div class="tab-pane on" id="tab-hangar">
        <div id="metaInfo" class="hk-meta"></div>
        <main class="main">
          <!-- 左：机体档案大框 -->
          <section class="frame aircraft-panel">
            <div class="ap-title">机体档案</div>
            <div class="ap-body">
              <div class="ap-visual" id="acftDisplay"></div>
              <div class="ap-info">
                <div class="r-title">参数</div>
                <div id="acftInfo"></div>
              </div>
            </div>
            <div id="aircraftList" class="ap-select"></div>
          </section>

          <!-- 右：四框 -->
          <div class="right-col">
            <section class="frame r-area shop-area">
              <div class="r-title">永久强化</div>
              <div class="r-sub">消耗灵玉 · 永久提升战力</div>
              <div id="shopList"></div>
            </section>

            <section class="frame r-area loadout-area">
              <div class="r-title">法器装配</div>
              <div class="r-sub">已装备槽位与战力预览</div>
              <div id="equipSlots"></div>
              <div id="loadoutPreview"></div>
            </section>

            <section class="frame r-area tier-area">
              <div class="r-title">难度选择</div>
              <div id="tierScrollWrap"><div id="tierRow"></div></div>
            </section>

            <section class="frame r-area deploy-area">
              <button id="startBtn" class="launch"><span class="main">出击 &#9654;</span></button>
            </section>
          </div>
        </main>
      </div>
'''

start_idx = content.index(START)
end_idx = content.index(END)
content = content[:start_idx] + NEW_HTML + '\n' + content[end_idx:]

# ---- 追加 #tab-hangar 作用域的布局/配色 CSS（让 game.js 生成的元素贴合 mockup） ----
NEW_CSS = '''
  /* ===== 机库：game.js 真实容器接入 mockup 框架 ===== */
  #tab-hangar #metaInfo { flex:0 0 auto; text-align:center; font-size:clamp(10px,1.4cqw,13px); color:var(--muted); padding:clamp(2px,0.5cqw,6px); letter-spacing:.5px; }
  #tab-hangar #metaInfo .ok { color:#8EC98E; }

  /* 左：机体大图 */
  #tab-hangar #acftDisplay { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; }
  #tab-hangar #acftDisplay .acft-platform { filter:drop-shadow(0 0 20px rgba(201,162,75,.22)); display:flex; align-items:center; justify-content:center; }
  #tab-hangar #acftDisplay .acft-platform svg { width:auto; height:clamp(140px,24cqh,340px); max-width:92%; }
  #tab-hangar #acftDisplay .acft-display-meta { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-top:clamp(6px,1cqw,12px); }
  #tab-hangar #acftDisplay .acft-display-meta span { font-size:clamp(10px,1.5cqw,14px); color:var(--gold); border:1px solid rgba(201,162,75,.3); border-radius:99px; padding:2px 10px; }

  /* 左：机体参数卡 */
  #tab-hangar #acftInfo { display:flex; flex-direction:column; gap:clamp(3px,0.6cqw,8px); overflow:auto; height:100%; }
  #tab-hangar #acftInfo .acft-info-name { font-size:clamp(17px,2.8cqw,26px); font-weight:900; letter-spacing:2px; text-shadow:0 0 10px rgba(201,162,75,.2); }
  #tab-hangar #acftInfo .acft-info-desc { font-size:clamp(11px,1.5cqw,14px); color:var(--muted); line-height:1.5; }

  /* 左：机体选择条 */
  #tab-hangar #aircraftList { flex:0 0 auto; display:flex; gap:clamp(6px,1cqw,12px); min-height:0; }
  #tab-hangar #aircraftList .acft-thumb { flex:1 1 0; border:1px solid rgba(201,162,75,.25); border-radius:8px; background:linear-gradient(180deg, rgba(0,0,0,.4), rgba(201,162,75,.04)); padding:clamp(6px,1cqw,12px); display:flex; align-items:center; gap:8px; cursor:pointer; transition:filter .15s,border-color .15s,box-shadow .15s; min-width:0; }
  #tab-hangar #aircraftList .acft-thumb:hover { filter:brightness(1.12); border-color:rgba(201,162,75,.5); }
  #tab-hangar #aircraftList .acft-thumb.picked { border-color:var(--gold); background:linear-gradient(180deg, rgba(201,162,75,.18), rgba(201,162,75,.04)); box-shadow:0 0 14px rgba(201,162,75,.22); }
  #tab-hangar #aircraftList .acft-thumb.locked { opacity:.45; cursor:not-allowed; }
  #tab-hangar #aircraftList .acft-thumb svg { width:clamp(36px,6cqw,60px); height:auto; flex-shrink:0; filter:drop-shadow(0 0 6px currentColor); }
  #tab-hangar #aircraftList .acft-thumb .acft-name { font-size:clamp(13px,2cqw,18px); font-weight:800; }
  #tab-hangar #aircraftList .acft-thumb .acft-desc { font-size:clamp(9px,1.3cqw,12px); color:var(--muted); }
  #tab-hangar #aircraftList .acft-thumb .lock { font-size:clamp(9px,1.2cqw,12px); color:#E08A9A; margin-left:auto; flex-shrink:0; }

  /* 右1：永久强化 */
  #tab-hangar #shopList { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:repeat(3,1fr); gap:clamp(6px,1cqw,12px); align-content:start; overflow:auto; }
  #tab-hangar #shopList .shop { background:rgba(0,0,0,.32); border:1px solid rgba(201,162,75,.25); border-radius:8px; padding:clamp(6px,1cqw,10px); }
  #tab-hangar #shopList .shop.canbuy { border-color:rgba(201,162,75,.55); box-shadow:0 0 12px rgba(201,162,75,.14); cursor:pointer; }
  #tab-hangar #shopList .shop.canbuy:hover { background:rgba(40,30,12,.6); }
  #tab-hangar #shopList .shop.maxed { opacity:.6; }
  #tab-hangar #shopList .shop.cant { opacity:.5; }
  #tab-hangar #shopList .shop .sname { font-size:clamp(13px,2cqw,17px); font-weight:800; color:var(--gold); text-shadow:0 0 8px rgba(201,162,75,.3); }
  #tab-hangar #shopList .shop .muted { font-size:clamp(9px,1.3cqw,12px); color:var(--muted); }
  #tab-hangar #shopList .shop .lvlbar { height:6px; background:rgba(0,0,0,.5); border:1px solid rgba(201,162,75,.2); border-radius:99px; overflow:hidden; margin:4px 0; }
  #tab-hangar #shopList .shop .lvlfill { height:100%; background:linear-gradient(90deg,var(--ember),var(--gold)); }
  #tab-hangar #shopList .shop .slevel { font-size:clamp(9px,1.3cqw,12px); color:var(--muted); }

  /* 右2：法器装配 */
  #tab-hangar #equipSlots { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:repeat(4,1fr); gap:clamp(5px,1cqw,12px); align-content:start; overflow:auto; }
  #tab-hangar #equipSlots .eq-slot { border:1px solid rgba(201,162,75,.28); border-radius:8px; background:rgba(0,0,0,.32); min-height:clamp(48px,9cqw,86px); justify-content:center; }
  #tab-hangar #equipSlots .eq-slot.on { border-color:var(--gold); background:linear-gradient(180deg, rgba(201,162,75,.16), rgba(201,162,75,.03)); box-shadow:0 0 12px rgba(201,162,75,.2); }
  #tab-hangar #equipSlots .eq-slot .eq-count { font-size:clamp(11px,1.8cqw,16px); color:var(--gold); font-weight:800; }
  #tab-hangar #equipSlots .eq-slot .eq-item-name { font-size:clamp(9px,1.4cqw,12px); font-weight:700; }
  #tab-hangar #equipSlots .eq-slot .eq-off { font-size:9px; color:#E08A9A; }
  #tab-hangar #loadoutPreview { flex:0 0 auto; padding-top:clamp(4px,0.8cqw,8px); border-top:1px solid rgba(201,162,75,.18); }
  #tab-hangar #loadoutPreview .lp-row { display:flex; flex-wrap:wrap; gap:4px 12px; }
  #tab-hangar #loadoutPreview .lp-row span { font-size:clamp(10px,1.4cqw,13px); color:var(--muted); white-space:nowrap; }
  #tab-hangar #loadoutPreview .lp-row b { color:var(--gold); margin-left:3px; }

  /* 右3：难度选择 */
  #tab-hangar #tierScrollWrap { flex:1 1 auto; min-height:0; display:flex; overflow:hidden; }
  #tab-hangar #tierRow { flex:1 1 auto; min-height:0; width:100%; display:flex; flex-direction:column; gap:clamp(4px,0.8cqw,10px); }
  #tab-hangar #tierRow .tcard { width:100%; height:auto; aspect-ratio:auto; flex:1 1 0; min-height:clamp(26px,4.5cqw,46px); background:linear-gradient(180deg, rgba(0,0,0,.5), rgba(201,162,75,.05)); border:1px solid rgba(201,162,75,.28); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; padding:clamp(3px,0.6cqw,8px); }
  #tab-hangar #tierRow .tcard:hover { border-color:rgba(201,162,75,.55); background:linear-gradient(180deg, rgba(0,0,0,.35), rgba(201,162,75,.12)); box-shadow:0 0 14px rgba(201,162,75,.18); }
  #tab-hangar #tierRow .tcard.picked { border-color:var(--gold); background:linear-gradient(180deg, rgba(201,162,75,.2), rgba(201,162,75,.05)); box-shadow:0 0 16px rgba(201,162,75,.3); }
  #tab-hangar #tierRow .tcard.locked { filter:grayscale(.7) brightness(.6); opacity:.7; cursor:not-allowed; }
  #tab-hangar #tierRow .tcard .ttitle { font-size:clamp(13px,2cqw,18px); font-weight:900; color:var(--gold); letter-spacing:1px; text-shadow:0 1px 3px rgba(0,0,0,.9); }
  #tab-hangar #tierRow .tcard.picked .ttitle { color:#F2DAA0; }
  #tab-hangar #tierRow .tcard .mini { font-size:clamp(10px,1.5cqw,13px); color:var(--muted); margin-top:2px; text-shadow:0 1px 2px rgba(0,0,0,.9); }
  #tab-hangar #tierRow .tcard .lock { font-size:9px; color:#E08A9A; margin-top:2px; }

  /* 右4：出击 */
  #tab-hangar #startBtn { width:100%; font-family:inherit; }
'''

style_idx = content.rindex('</style>')
content = content[:style_idx] + NEW_CSS + '\n' + content[style_idx:]

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(content)

# ---- 校验 ----
import re
def check():
    ids = ['metaInfo','tierScrollWrap','tierRow','aircraftList','shopList','acftInfo','acftDisplay','loadoutPreview','equipSlots','startBtn','resJade','resArsenal','resProgress']
    miss = [i for i in ids if ('id="%s"'%i) not in content]
    print('缺失 id:', miss if miss else '无')
    # 旧 mockup 死容器不应再出现在 hangar
    dead = [d for d in ['apInfo','apTrack','shop-card','tname-row','tierPreview','top-tabs'] if d in content]
    print('残留 mockup 死类:', dead if dead else '无')
    # CSS 括号
    m = re.search(r'<style>[\s\S]*</style>', content)
    css = m.group(0)
    o = len(re.findall(r'{', css)); c = len(re.findall(r'}', css))
    print('CSS 括号:', o, c, 'OK' if o==c else '!!BAD')
    # startBtn 唯一
    print('startBtn 出现次数:', content.count('id="startBtn"'))
check()
print('DONE')
