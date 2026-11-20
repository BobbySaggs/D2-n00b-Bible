// Campaigns still in Destiny 2, in story order, with their missions, from Claude's research for the classic
// Steeped (Nov 15, 2026). The Red War, Curse of Osiris, Warmind and Forsaken campaigns were removed from the game.
// "keys" match the quest line Bungie gives each campaign's quest, so the app can find the one you carry.

export interface Campaign { id: string; name: string; where: string; unlocks: string; missions: string[]; keys: RegExp; start: string[] }

export const CAMPAIGNS: Campaign[] = [
  { id: "shadowkeep", name: "Shadowkeep", where: "The Moon. Talk to Eris Morn.", unlocks: "The Moon and the start of the Pyramid story. Free for everyone.",
    missions: ["A Mysterious Disturbance", "In Search of Answers", "Ghosts of Our Past", "The Scarlet Keep", "In the Deep", "The Nightmare Cometh", "Beyond"],
    keys: /shadowkeep|eris|pyramid|scarlet keep|essence of/i,
    start: ["Fly to the Moon and open its map. Look for a campaign marker on \"A Mysterious Disturbance\" or your next mission.", "No marker? Pick the Shadowkeep quest back up at the quest kiosk (Quest Archive) in the Tower.", "Then talk to Eris Morn at Sanctuary on the Moon. If she only shows bounties, the quest still isn't on you."] },
  { id: "beyondlight", name: "Beyond Light", where: "Europa.", unlocks: "Stasis, your first Darkness subclass.",
    missions: ["Darkness's Doorstep", "The New Kell", "Rising Resistance", "The Warrior", "The Technocrat", "The Kell of Darkness", "Sabotaging Salvation", "The Aftermath", "Stealing Stasis", "Reforging the Past"],
    keys: /beyond light|darkness's doorstep|europa|stasis|exo stranger|eramis/i,
    start: ["Open the Europa map and look for the campaign marker.", "No marker? Pick the Beyond Light quest back up at the quest kiosk (Quest Archive) in the Tower.", "The story continues with the Exo Stranger and Variks at Eventide on Europa."] },
  { id: "witchqueen", name: "The Witch Queen", where: "Mars, then Savathûn's Throne World.", unlocks: "Weapon crafting and Glaives.",
    missions: ["The Arrival", "The Investigation", "The Ghosts", "The Communion", "The Mirror", "The Cunning", "The Last Chance", "The Ritual"],
    keys: /witch queen|savath|throne world|the arrival|lucent/i,
    start: ["Open the Director: The Witch Queen campaign has its own node. Missions you've done stay replayable.", "No node? Pick the quest back up at the quest kiosk (Quest Archive) in the Tower."] },
  { id: "lightfall", name: "Lightfall", where: "Neomuna, on Neptune.", unlocks: "Strand, the grapple subclass.",
    missions: ["First Contact", "Under Siege", "Downfall", "Breakneck", "On the Verge", "No Time Left", "Headlong", "Desperate Measures"],
    keys: /lightfall|neomuna|calus|strand|nimbus|first contact/i,
    start: ["Open the Director and choose Neomuna. The campaign missions sit on its map.", "No marker? Pick the Lightfall quest back up at the quest kiosk (Quest Archive) in the Tower."] },
  { id: "finalshape", name: "The Final Shape", where: "The Pale Heart, inside the Traveler.", unlocks: "Prismatic, the subclass that mixes Light and Darkness. Ends the Light and Darkness saga.",
    missions: ["Transmigration", "Temptation", "Exegesis", "Requiem", "Ascent", "Dissent", "Iconoclasm", "Excision"],
    keys: /final shape|pale heart|transmigration|the witness|excision/i,
    start: ["Open the Director and choose The Pale Heart. The campaign missions sit on its map.", "No marker? Pick the quest back up at the quest kiosk (Quest Archive) in the Tower."] },
  { id: "edgeoffate", name: "The Edge of Fate", where: "Kepler.", unlocks: "Kepler and the Year of Prophecy story; the start of today's tiered gear.",
    missions: ["The Invitation", "Fallow", "Nostos", "Commencement", "Transient", "Saturnism", "Gouge", "Morphology", "Charge", "Disruption", "Calculus", "Quarantine", "Criticality", "The Message"],
    keys: /edge of fate|kepler|the invitation|fallow|nostos/i,
    start: ["Open the Director and choose Kepler. The campaign missions sit on its map.", "No marker? Pick the quest back up at the quest kiosk (Quest Archive) in the Tower."] },
  { id: "renegades", name: "Renegades", where: "The Lawless Frontier.", unlocks: "Lawless Frontier, the Fire and Ice exotic mission, and the Renegades armor sets.",
    missions: ["Imperium", "Fearsome Retainer", "Out in the Cold", "Fire and Ice", "The Long Con", "Glory Beyond"],
    keys: /renegade|lawless frontier|imperium|fire and ice/i,
    start: ["Open the Director and choose the Lawless Frontier. The campaign missions sit on its map.", "No marker? Pick the quest back up at the quest kiosk (Quest Archive) in the Tower."] },
];

export const REMOVED_CAMPAIGNS = ["The Red War", "Curse of Osiris", "Warmind", "Forsaken"];
