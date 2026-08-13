# 图像生成提示词归档

生成模式：内置图像生成。

## 基地机库

```text
Use case: stylized-concept
Asset type: PC game base hub background, 16:9, behind UI
Primary request: a polished top-down-oblique interior of a supernatural aircraft bureau hangar for a Chinese urban fantasy shoot-and-extract game
Scene/backdrop: a broad safe base at night, central circular aircraft maintenance platform left of center, modular armory wall, research workbench, glowing forge station, archive cabinets, distant sealed launch gate, subtle city skyline and floating mountain silhouettes beyond tall windows
Style/medium: high-end 2D cel-shaded game environment, crisp vector-like ink outlines, three to four tone cartoon shading, consistent with compact Chinese mythic aircraft sprites
Composition/framing: wide 16:9 landscape, no characters, no aircraft, functional readable stations, generous darker negative space for UI panels on the left and lower areas, strong depth but no photographic perspective distortion
Lighting/mood: safe and calm warm amber lantern light with restrained cyan rim lighting, night navy shadows, small gold emissive accents
Color palette: #0E1424 ink, #1B2A4A night blue, #2BD4C4 cyan, #FFC24B gold, #F4EFE6 highlights, warm orange only in base lighting
Materials/textures: dark lacquered metal, jade inlays, talisman motifs, restrained cloud and thunder patterns, clean cel-shaded surfaces
Constraints: no text, no letters, no numbers, no logos, no watermark, no UI overlays, no people, no aircraft, no clutter blocking the central platform
Avoid: photorealism, cyberpunk city cliches, gothic horror, muted wasteland, cute anime character art, excessive bloom
```

用途：`base/base_hub_hangar.png` 为原始图，`base/base_hub_hangar_1920x1080.webp` 为运行版本，接入基地页面背景。

## 核心战斗特效表

```text
Use case: stylized-concept
Asset type: game VFX sprite sheet for a top-down 2D shooter
Primary request: one clean 4 by 3 sprite sheet containing twelve distinct supernatural combat effects, each centered inside an equal cell and fully separated
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background across the whole canvas, uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subjects by row, left to right: row 1 cyan aircraft muzzle flash, cyan diamond bullet impact, gold critical-hit starburst, red player-hit slash burst; row 2 red enemy death explosion, double-ring gold elite death explosion, purple-red double-ring boss death explosion, cyan inward summoning circle; row 3 red-to-cyan lifesteal beam segment, gold loot pickup burst, green extraction completion burst, purple-red boss phase shockwave
Style/medium: crisp 2D cel-shaded game VFX, vector-like ink accents, readable at 48 to 96 pixels, high-contrast silhouettes, restrained glow, Chinese talisman and cloud motifs only where useful
Composition/framing: exact 4 columns by 3 rows, generous padding in every cell, no overlap between cells, each effect isolated with clean edges
Color palette: cyan #2BD4C4, gold #FFC24B, red #FF3B5C, boss red #D11A2A, purple #B06BFF, green #3CFFA0, white cores #F4EFE6; do not use #00ff00 inside any effect
Constraints: no text, no letters, no numbers, no icons unrelated to effects, no watermark, no cast shadow, no contact shadow, no border around the whole sheet, crisp separable cells
Avoid: smoke clouds obscuring silhouettes, photoreal fire, soft fuzzy edges, excessive bloom, visual clutter
```

用途：`vfx/sources/vfx_core_chroma.png` 为原始图，完成色键抠图后得到 `vfx/vfx_core_atlas.png`，再切分为 `vfx/sprites/` 下的十二个透明 PNG 并接入战斗事件。

## 遗迹湾任务情报背景

```text
Use case: stylized-concept
Asset type: 16:9 mission intelligence backdrop for a PC shoot-and-extract game, displayed behind live HTML UI
Primary request: a polished top-down tactical view of a handcrafted supernatural aircraft graveyard battlefield named Relic Bay, designed for route planning before deployment
Scene/backdrop: a wide coastal sky platform and broken aircraft carrier ruins suspended above clouds, a central circular boss arena, western low-risk extraction pad, northeastern fast high-risk extraction gate, two isolated high-value vault sites, narrow wreck corridors, broad aircraft flight lanes, defensive partitions and ruined engine blocks
Style/medium: high-end 2D cel-shaded game environment concept, crisp ink outlines, simplified readable masses, Chinese urban fantasy aviation bureau aesthetic, consistent with a dark lacquered supernatural hangar
Composition/framing: wide 16:9, oblique top-down strategic view, large readable landmark silhouettes, clear route hierarchy and negative space for interface cards on the left and bottom, no overlaid UI
Lighting/mood: cold moonlit cyan battlefield with restrained amber landmarks, red-purple danger concentrated only around the central boss arena, pale clouds below the platform
Color palette: #0E1424 ink, #1B2A4A night blue, #2BD4C4 cyan routes, #FFC24B valuable landmarks, #FF3B5C danger, #B06BFF boss threat, #F4EFE6 highlights
Materials/textures: broken lacquered aircraft hulls, jade circuitry, talisman seals, weathered metal plates, cloud motifs, crisp cel-shaded surfaces
Constraints: no text, no labels, no letters, no numbers, no logos, no watermark, no people, no UI overlay, functional readable handcrafted layout
Avoid: random procedural maze, indoor rooms, realistic satellite imagery, photorealism, cyberpunk city skyline, clutter, excessive fog, excessive bloom
```

## 战术交互特效表

```text
Use case: stylized-concept
Asset type: second game VFX sprite sheet for a top-down 2D shoot-and-extract game
Primary request: one clean 4 by 3 sprite sheet containing twelve distinct tactical and interaction effects, each centered inside an equal cell and fully separated
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background across the entire canvas, uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subjects by row, left to right: row 1 long red boss dash warning arrow with chevrons, circular red danger grid telegraph, shattered green extraction ring for interrupted extraction, gold objective activation pulse with talisman seals; row 2 cyan terminal hacking rings, purple shield-node destruction burst, gold locked-vault seal, green vault-unlocked seal breaking apart; row 3 cyan aircraft dash afterimage, red low-health cracked vignette emblem, gold mission route arrow marker, cyan discovery scan pulse
Style/medium: crisp 2D cel-shaded game VFX, vector-like ink accents, readable at 48 to 128 pixels, high-contrast silhouettes, restrained glow, Chinese talisman, cloud and thunder motifs
Composition/framing: exact 4 columns by 3 rows, generous padding inside every cell, no overlap between cells, each effect isolated with clean edges
Color palette: cyan #2BD4C4, gold #FFC24B, red #FF3B5C, purple #B06BFF, green #3CFFA0, white #F4EFE6, dark ink #0E1424; do not use #00ff00 inside any effect
Constraints: no text, no letters, no numbers, no unrelated icons, no watermark, no cast shadow, no contact shadow, no border around the whole sheet, crisp separable cells
Avoid: photoreal fire, opaque smoke, fuzzy edges, excessive bloom, clutter, overlapping cells
```

## 法器与消耗品图标表

```text
Create a polished 4 by 3 sprite sheet of twelve distinct top down sci fi extraction shooter inventory icons for a game set aboard a massive aircraft. Every cell must contain exactly one centered isolated object, equal 256 by 256 visual cell spacing, generous transparent safe margin, no overlap, no text, no letters, no numbers, no UI frame, no shadows extending into adjacent cells. Use a perfectly flat solid chroma green background #00FF00 across the entire canvas. Do not use green anywhere on the objects.

Row 1 from left to right: compact crimson plasma blade weapon with black grip, heavy amber aircraft rotary cannon, white ceramic jade armor plate with cyan seams, dark titanium pressure armor plate.
Row 2: electric blue thunder reactor core, violet void reactor core, gold talisman ammunition case, cyan crystal ammunition capsule.
Row 3: orange stun grenade with lightning coil, icy cyan hexagonal shield projector, white and gold healing ampoule with red seal, violet time slow talisman device.

Style: premium stylized 2D game inventory art, crisp silhouettes, controlled highlights, dark navy materials, cyan and amber accents, readable at 64 pixels, Delta Force inspired tactical extraction UI mood while remaining fully original, consistent three quarter top view, unified lighting from upper left, high contrast, game production asset sheet.
```

用途：`items/sources/items_consumables_sheet.png` 保留透明源图，切分为 8 个法器图标和 4 个消耗品图标。

## 符文图标表

```text
Create a polished 4 by 3 sprite sheet of twelve distinct mystical technology rune sigils for a top down sci fi extraction shooter aboard a giant aircraft. Every cell must contain exactly one centered isolated rune device, equal 256 by 256 visual cell spacing, generous margin, no overlap, no text, no letters, no numbers, no UI frame. Use a perfectly flat solid chroma green background #00FF00 across the entire canvas. Do not use green anywhere in the rune art.

Row 1 from left to right: red orange fire attack rune with upward blade flame, red orange fire burst rune with expanding circular blast, icy cyan water shield rune with layered hexagonal barrier, icy cyan water healing rune with luminous droplet and medical pulse.
Row 2: electric blue thunder rapid fire rune with three energy bolts, electric blue thunder chain rune with branching lightning nodes, pale cyan wind speed rune with forward chevrons and turbine swirl, pale cyan wind homing rune with target spiral and wing fins.
Row 3: amber earth vitality rune with armored heart and mountain geometry, amber earth pierce rune with drill spear through layered plates, white gold critical precision rune with reticle and fractured star, violet summon rune with orbiting drone nodes around a portal.

Style: original premium 2D game inventory icon art, each sigil is a compact engraved aircraft alloy medallion with luminous energy, crisp silhouette, dark navy metal, consistent three quarter top view, unified lighting from upper left, high contrast, readable at 48 pixels, tactical extraction UI mood, no typography.
```

用途：`items/sources/runes_sheet_green.png` 为生成源图，`items/sources/runes_sheet.png` 为透明处理图，切分为 12 个符文图标。
