// Indoor walls: plaster, panelled and plank rooms, curtained walls, their end
// strips and the low stubs drawn for a room's near walls. The doorways in the
// same series (380, 381, 385, 386, 391, 392, 396, 397, 405, 406, 412, 413,
// 421, 422, 425 and 426) stay open.
const indoorWalls = [
  262, 263, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374,
  375, 376, 377, 378, 379, 382, 383, 384, 387, 388, 389, 390, 393, 394, 395,
  398, 399, 400, 401, 402, 403, 404, 407, 408, 409, 410, 411, 414, 415, 416,
  417, 418, 419, 420, 423, 424, 427, 428, 429, 430,
];

// Snow-roofed log cabins: log walls, end caps, gables, roof slopes, the
// chimney and the closed doors. The window (438) is listed below.
const logCabins = [433, 434, 435, 436, 437, 439, 440, 441, 442, 443, 574, 576];

// Opaque surfaces in gfx006 that block light and are shaded as upright
// surfaces. Wall layers also contain fences, posts, fires and decorations,
// which let light through and take one tint per bitmap. Walkability
// (TileSpec.Wall) is deliberately not used as an optical property.
export const solidWalls = [
  3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 92, 93, 94, 95, 96, 98, 99, 100, 116, 342,
  344, 350, 351, 352, 353, 354, 355, 356, 357, 431, 432, 438, 462, 464, 465,
  467, 468, 469, 471, 472, 474, 475, 476, 477, 479, 480, 482, 483, 484, 486,
  534, 535,
].concat(indoorWalls, logCabins);
