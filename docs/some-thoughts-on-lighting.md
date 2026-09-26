# Some thoughts on lighting

_A short diary of building the lighting preview, from January to September 2026._

**January.** It started with a simple wish: to see a map at night before anyone plays it. Our first attempt drew a soft circle under every lamp. It looked fine on open grass and wrong everywhere else, because the light poured straight through buildings. The glow was never the hard part. The walls were.

EO maps store walls as pictures on tiles, not as solid shapes. So we stopped treating a wall as a tile and started treating it as the edge between two tiles. A lamp could now light the outside of a wall without leaking into the room behind it. Shadows followed from the same idea: trace outward from the light and stop at the first wall.

**February.** Recalculating every light for every pixel on every frame would never survive a busy town. So the work moved to the moment something changes. Each light writes into a cached field laid over the map, and drawing just reads it back. Moving one lamp redoes only the ground it can reach.

Windows turned out to be half the atmosphere. They are painted into the wall art, and their glass is dark, so no amount of scene light makes a room look lived in. We picked out each window's glass by its exact colours inside a small box, let the glass glow on its own, and let its light spill outward only. A church in Aeven pushed the idea further: its arched windows are split across two wall pieces and glazed with textured glass, and a lantern hangs by its door. A window became a group of parts rather than a single sprite, and the lantern became a fixture of its own.

**March.** Walls still looked patchy on screen. Tall walls are built from several pieces, each shaded on its own, so seams showed where they met. Treating the whole wall as one upright surface, and shading each strip at its real height, made the seams disappear. It also meant a raised light climbs the wall the way you would expect.

**May.** With the picture settled, we built the tool around it. Place a lamp and its graphic together, or drop a light that has no graphic at all. Move it, undo it, save it. Lighting lives in a companion file beside the map, so an existing map can never be broken by it.

**June.** Next came the panel. We wanted it to feel like part of the editor rather than something bolted on. It follows the editor's own look, previews every change as you make it, and shows its guides only when you ask for them.

**August.** Checking wall art by eye had become slow and easy to get wrong, so we wrote an audit. It scans the graphics for window-like glass and checks everything we had catalogued against the art and the maps. Mostly it agreed with us, which was the point: we could stop wondering whether a window was quietly out by a pixel.

**September.** Somewhere along the way the question changed. It stopped being "can we light a map?" and became "does it still feel like the same map at night?" What answered it was not a cleverer effect. It was a few plain rules about where light may go, applied everywhere, with nothing written into the map itself. That felt settled enough to share.
