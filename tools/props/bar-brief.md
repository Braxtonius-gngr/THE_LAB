# The bar on the river: props brief

The third place (HANDOFF next step 2). Marco tends bar and Dante runs the line at a cocktail bar
on the San Antonio River Walk. Their memories already describe it, so the room should match:
the rail, the ice machine that drags on busy nights, the kitchen pass where Dante hands Marco a
water, the end seat Marco keeps telling Brax to take, and the river crowd at the windows.

**The room** (about 9 x 7 m, 3.2 m ceiling): Texas limestone on the back wall, Saltillo tile
floor, a dark cypress bar top, warm pendants over the bar, tall windows onto the river walk on
one side, the kitchen pass and a swinging door at the back. One long bar with six stools, three
two-top tables, one booth.

## How to make them

Same as the apartments (`tools/props/README.md`): one prop per Meshy generation, realistic PBR,
then name the export with its real size (`..._w240cm_...`, `..._h76cm_...`) so the baker scales
it right. Ask for a game-ready, low-poly result: several recent Meshy exports came out at
millions of triangles, and three of Dante's props are still too heavy to simplify cleanly.

Ids start with `b-` like Dante's start with `d-`. Every prompt ends with the same style tail so
the set matches:

> realistic, photoreal PBR materials, game-ready low-poly, single object, neutral studio lighting, no background, no text or logos

## Must have (the room doesn't read as a bar without these): 12

1. **b-barcounter** · w240 h107 d70 · the bar, one straight section (it repeats to make the run).
   > a straight section of a cocktail bar counter, dark stained cypress wood top with rounded front edge, front panel in reclaimed wood planks, a brass foot rail along the bottom on brass brackets
2. **b-barend** · w70 h107 d70 · the rounded end cap where the end seat is.
   > the rounded end cap of a cocktail bar counter, dark stained cypress wood top, reclaimed wood plank front panel curving around, brass foot rail following the curve
3. **b-barstool** · h76 (seat) w45 d45 · six of these.
   > a bar stool with a round dark leather seat, black steel frame with four legs, a brass footrest ring, slightly worn
4. **b-backbar** · w240 h220 d45 · the wall of bottles behind Marco.
   > a back bar shelving unit for a cocktail bar, three dark wood shelves on black steel brackets lined with assorted liquor bottles, a long mirror behind the shelves, a closed cabinet base with wood doors
5. **b-station** · w120 h90 d60 · Marco's workstation under the bar (the "rail").
   > a stainless steel bartender workstation, an ice well filled with ice, a speed rail of liquor bottles along the front, a small sink and a drain board
6. **b-icemachine** · w76 h100 d70 · the one that drags.
   > a commercial undercounter ice machine, brushed stainless steel, front grille vent, slightly scuffed
7. **b-taps** · w45 h55 d25 · beer tap tower on the bar top.
   > a beer tap tower with three wooden tap handles, chrome tower on a drip tray
8. **b-pass** · w150 h120 d30 · the kitchen pass window in the back wall.
   > a restaurant kitchen pass-through window, stainless steel shelf with a heat lamp above, a ticket rail with paper order tickets clipped on it, set in a wall opening
9. **b-kitchendoor** · w90 h210 d10 · swinging door to the kitchen.
   > a single swinging restaurant kitchen door, dark wood with a round porthole window and a brushed steel kick plate
10. **b-twotop** · w70 h76 d70 · three small tables.
    > a small square bistro table for two, dark wood top, black cast iron pedestal base
11. **b-bistrochair** · h85 w45 d50 · six of these.
    > a bistro chair, bentwood dark wood frame, woven rattan seat
12. **b-booth** · w180 h110 d70 · one booth against the window wall.
    > a restaurant booth bench seat, tufted oxblood leather upholstery, dark wood frame and high back

## Nice to have (life on the bar top and walls): 8

13. **b-pendant** · h40 w25 · over the bar, three or four.
    > a hanging pendant light, amber glass dome shade on a black cord, brass fitting
14. **b-register** · w35 h35 d30 · on the back bar.
    > a point of sale tablet on a swivel stand with a small cash drawer and a receipt printer
15. **b-garnish** · w30 h10 d15 · on the bar top by the station.
    > a bar garnish tray with compartments of lime wedges, lemon twists, orange peels and cherries
16. **b-coupe** · h15 w10 · cocktail glass (the hibiscus spritz goes in one).
    > a coupe cocktail glass with a pink drink and a lime wheel garnish
17. **b-rocks** · h9 w8 · old fashioned glass.
    > a heavy rocks glass with an old fashioned cocktail, one large clear ice cube, an orange peel
18. **b-menuboard** · w90 h120 d4 · chalkboard on the wall.
    > a wall chalkboard menu in a dark wood frame, hand chalked cocktail list (illegible scribbles, no real words)
19. **b-busbin** · w50 h18 d38 · dirty glasses waiting, under the bar.
    > a grey plastic bus tub holding a few used glasses and crumpled napkins
20. **b-ceilingfan** · w130 h40 · slow fan overhead.
    > a ceiling fan with five dark wood blades and an oil-rubbed bronze motor housing

## Already in the catalog (reuse, no new generation)

`liquorbottle`, `glass`, `pintglass`, `beerbottle`, `shaker`, `plate`, `plant`, `smallplant`,
`window`, `door`, `trashcan`, `wallclock`.

## After the props

The place itself is a new entry in `world/places.mjs` with `location: 'the-bar'` (the value
the off-screen life already writes). Seats come from the props through `world/seats.mjs`, which
needs two new rules: `b-barstool` (sit, high) and `b-booth` (sit). Then evenings and Saturdays
stop showing empty apartments, because the men are at the bar and the bar exists.
