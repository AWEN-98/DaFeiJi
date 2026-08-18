import re, sys

PROJ = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype"
MOCK = f"{PROJ}\\mockup_terminal_v22.html"
IDX = f"{PROJ}\\index.html"

src = open(MOCK, encoding="utf-8").read()
idx = open(IDX, encoding="utf-8").read()

# ---- 1. 提取 mockup 的 <style>, <main>, <script> ----
style = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
main_html = re.search(r'(<main class="main">.*?</main>)', src, re.S).group(1)
script = re.search(r'(<script>.*?</script>)', src, re.S).group(1)

# 去掉注释，避免注释里的 { } 干扰括号匹配
style = re.sub(r"/\*.*?\*/", "", style, flags=re.S)

# ---- 2. 递归括号匹配解析器：给选择器加 #tab-hangar 前缀 ----
DROP = {"html", "body", "*", "html,body", "html, body"}
def parse(css, prefix):
    out = []
    i, n = 0, len(css)
    buf = ""
    while i < n:
        c = css[i]
        if c == "{":
            sel = buf.strip()
            buf = ""
            depth, j = 1, i + 1
            while j < n and depth > 0:
                if css[j] == "{": depth += 1
                elif css[j] == "}": depth -= 1
                j += 1
            inner = css[i + 1:j - 1]
            if sel.startswith("@"):
                if sel.startswith("@keyframes") or sel.startswith("@-"):
                    out.append(sel + " {" + inner + "}")
                elif sel.startswith("@media") or sel.startswith("@supports"):
                    out.append(sel + " {" + parse(inner, prefix) + "}")
                else:
                    out.append(sel + " {" + inner + "}")
            elif sel == ":root" or sel == "":
                out.append(sel + " {" + inner + "}")
            elif sel.replace(" ", "") in DROP or sel in DROP:
                pass  # 丢弃全局 reset，避免污染其它 tab
            else:
                sels = [prefix + s.strip() for s in sel.split(",") if s.strip()]
                out.append(", ".join(sels) + " {" + inner + "}")
            i = j
        elif c == "}":
            buf = ""
            i += 1
        else:
            buf += c
            i += 1
    return "".join(out)

scoped_css = parse(style, "#tab-hangar ")

# ---- 3. 给 mockup 的 .launch 补 id="startBtn"（维持 game.js 绑定，外观不变） ----
main_html = main_html.replace('<button class="launch"><span class="main">出击</span></button>',
                                '<button id="startBtn" class="launch"><span class="main">出击</span></button>')

# ---- 4. 隐藏占位（renderBase 直接取值不判空，必须存在；display:none 不影响外观） ----
stubs = """        <!-- game.js 依赖的隐藏占位：renderBase 直接取值不判空，必须存在，display:none 不影响外观 -->
        <div style="display:none" aria-hidden="true">
          <div id="metaInfo"></div>
          <div id="tierScrollWrap"></div>
          <div id="tierRow"></div>
          <div id="aircraftList"></div>
          <div id="shopList"></div>
          <div id="acftInfo"></div>
          <div id="acftDisplay"></div>
          <div id="loadoutPreview"></div>
        </div>
"""

# mockup 内联脚本包进 IIFE，避免与 game.js 全局变量冲突
script_body = script[len("<script>"):-len("</script>")]
script_wrapped = "<script>\n(function(){\n" + script_body + "\n})();\n</script>"

new_hangar = (
    "      <!-- 机库（默认页）：完全照搬 mockup_terminal 布局 -->\n"
    "      <div class=\"tab-pane on\" id=\"tab-hangar\">\n"
    + stubs
    + "        <!-- ===== 以下为 mockup_terminal 逐字照搬 ===== -->\n"
    + main_html
    + "\n"
    + script_wrapped
    + "      </div>"
)

# ---- 5. CSS 替换：从「机库」注释到 .hall-bottom .launch-help 规则，换成 scoped mockup CSS + 隐藏全局底栏 ----
css_start = "  /* 机库：套用 mockup_terminal"
css_end = "  .hall-bottom .launch-help { position: absolute; right: 24px; top: 50%; transform: translateY(-50%); }"
si = idx.find(css_start)
ei = idx.find(css_end)
if si == -1 or ei == -1:
    print("CSS anchor not found", si, ei); sys.exit(1)
new_css = (
    "#tab-hangar { display: flex; flex-direction: column; min-height: 0; }\n"
    + scoped_css
    + "\n\n  /* 全局底栏已并入机库出击框，隐藏以匹配 mockup（mockup 无独立底栏） */\n"
    + "  .hall-bottom { display: none; }\n"
)
idx = idx[:si] + new_css + idx[ei + len(css_end):]

# ---- 6. HTML 替换：从「机库」注释到 <!-- 军械库 --> 之前，整段换成 new_hangar ----
start_marker = "      <!-- 机库（默认页）"
end_marker = "      <!-- 军械库 -->"
he = idx.find(start_marker)
ee = idx.find(end_marker)
if he == -1 or ee == -1:
    print("HTML anchor not found", he, ee); sys.exit(1)
idx = idx[:he] + new_hangar + "\n\n" + end_marker + idx[ee + len(end_marker):]

open(IDX, "w", encoding="utf-8").write(idx)
print("OK port done; scoped_css bytes:", len(scoped_css), "new_hangar bytes:", len(new_hangar))
