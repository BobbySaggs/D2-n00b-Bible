import type { StatKey } from "../bungie/config";

// Hunter loop knowledge. Written by Claude from Bungie's own rules text (Tyler's snapshot, Nov 18 2026,
// Monument of Triumph era) and checked by hand. Not taken from anyone's tier list.
//
// Every piece of a build MAKES things and USES things. A build is strong when what one piece makes is what
// another piece uses, and the loop comes back around to the abilities you spend. Tokens:
//   energy:  gEn mEn cEn sEn (grenade, melee, class ability, super)
//   kills:   kAbility kGrenade kMelee kWeapon kPrecision kDebuffed finisher kSuper multikill
//   actions: dodge sprint airborne orbPickup
//   Stasis:  slow freeze crystal shatter shard frost
//   Void:    invis weaken volatile devour suppress overshield
//   Solar:   scorch ignite radiant restoration cure firesprite
//   Arc:     jolt amplified blind bolt ionic
//   Strand:  sever unravel tangle suspend woven threadling
//   other:   orb heal dr reload ammo dmg bossDmg transcend teamBuff breach champion
// Kill power vs control: freeze, slow and crystals only hold enemies. Kills come from tokens that actually
// delete packs: multikill (chain explosions, shatters that wipe a group), kWeapon, kGrenade, kAbility.
// "token:2" means a strong effect. In uses, "a|b|c" means any one of them is enough. Debuffs (slow, freeze, weaken, scorch, jolt, sever...) automatically
// count as kDebuffed when the build also kills things.

export type Kind = "super" | "grenade" | "melee" | "classAbility" | "aspect" | "fragment" | "exotic" | "weapon" | "artifact";
export type Subclass = "Revenant" | "Nightstalker" | "Gunslinger" | "Arcstrider" | "Threadrunner" | "Prismatic Hunter";
export const SUBCLASSES: Subclass[] = ["Prismatic Hunter", "Revenant", "Nightstalker", "Gunslinger", "Arcstrider", "Threadrunner"];
export const ELEMENT: Record<Subclass, string> = {
  Revenant: "Stasis", Nightstalker: "Void", Gunslinger: "Solar", Arcstrider: "Arc", Threadrunner: "Strand", "Prismatic Hunter": "Prismatic",
};

export interface K {
  name: string;
  kind: Kind;
  subs?: Subclass[]; // where it can be used (abilities, aspects, fragments)
  makes: string[];
  uses: string[];
  wants?: Partial<Record<StatKey, number>>; // which stats make it come back faster or hit harder
  slots?: number; // aspects: fragment slots they open
  needs?: string[]; // hard requirement: one of these must be in the build or this piece does nothing
  role?: string[]; // bossDps, adClear, survival, team, champion
  says: string; // what it does for you, in plain words
  artifact?: string; // artifact perks: which artifact has it
}

const S = (subs: Subclass[]) => subs;
const STASIS = S(["Revenant"]), VOID = S(["Nightstalker"]), SOLAR = S(["Gunslinger"]), ARC = S(["Arcstrider"]), STRAND = S(["Threadrunner"]);
const P = "Prismatic Hunter" as const;

export const HUNTER: K[] = [
  // ---------- Supers ----------
  { name: "Silence and Squall", kind: "super", subs: [...STASIS, P], makes: ["freeze:2", "slow:2", "kSuper"], uses: ["sEn"], wants: { super: 1 }, role: ["adClear", "survival"], says: "Two kamas: one freezes a whole room, the other leaves a slowing storm. Great for crowd control, weak on bosses." },
  { name: "Golden Gun: Marksman", kind: "super", subs: [...SOLAR, P], makes: ["orb:2", "kSuper", "bossDmg:2", "scorch"], uses: ["sEn", "radiant", "kPrecision"], wants: { super: 1 }, role: ["bossDps"], says: "Six precise pistol shots that make orbs on crits. Strong single-target damage." },
  { name: "Golden Gun: Deadshot", kind: "super", subs: SOLAR, makes: ["kSuper", "scorch"], uses: ["sEn"], wants: { super: 1 }, role: ["adClear"], says: "Rapid Golden Gun shots that ignite crowds." },
  { name: "Blade Barrage", kind: "super", subs: SOLAR, makes: ["kSuper", "bossDmg:2", "scorch"], uses: ["sEn"], wants: { super: 1 }, role: ["bossDps"], says: "A burst of explosive knives. One of the best one-shot damage supers." },
  { name: "Shadowshot: Deadfall", kind: "super", subs: [...VOID, P], makes: ["weaken:2", "suppress:2", "teamBuff"], uses: ["sEn"], wants: { super: 1 }, role: ["team", "bossDps"], says: "Tethers enemies, making them take more damage from your whole team." },
  { name: "Shadowshot: Moebius Quiver", kind: "super", subs: VOID, makes: ["weaken", "kSuper", "bossDmg"], uses: ["sEn"], wants: { super: 1 }, role: ["bossDps"], says: "Three rapid tether shots that hurt a single target." },
  { name: "Spectral Blades", kind: "super", subs: VOID, makes: ["invis", "kSuper"], uses: ["sEn"], wants: { super: 1 }, role: ["adClear"], says: "Invisible blade slashes for clearing crowds." },
  { name: "Storm's Edge", kind: "super", subs: [...ARC, P], makes: ["jolt", "kSuper", "bossDmg"], uses: ["sEn"], wants: { super: 1 }, role: ["adClear", "bossDps"], says: "Throw a dagger, teleport to it and spin. Good all-rounder." },
  { name: "Gathering Storm", kind: "super", subs: ARC, makes: ["jolt:2", "bossDmg:2"], uses: ["sEn"], wants: { super: 1 }, role: ["bossDps"], says: "Throws a staff that calls down a big lightning strike." },
  { name: "Arc Staff", kind: "super", subs: ARC, makes: ["kSuper", "jolt"], uses: ["sEn"], wants: { super: 1 }, role: ["adClear"], says: "A roaming melee super." },
  { name: "Silkstrike", kind: "super", subs: [...STRAND, P], makes: ["kSuper", "sever"], uses: ["sEn"], wants: { super: 1 }, role: ["adClear"], says: "A rope dart for clearing crowds." },

  // ---------- Grenades ----------
  { name: "Duskfield Grenade", kind: "grenade", subs: [...STASIS, P], makes: ["slow:2", "freeze", "dr"], uses: ["gEn"], wants: { grenade: 1 }, role: ["survival"], says: "A slowing field that freezes anything that stays in it." },
  { name: "Glacier Grenade", kind: "grenade", subs: STASIS, makes: ["crystal:2", "freeze"], uses: ["gEn"], wants: { grenade: 1 }, says: "A wall of Stasis crystals that freezes what it lands on. On its own it only holds enemies; shattering the wall is what kills them." },
  { name: "Coldsnap Grenade", kind: "grenade", subs: STASIS, makes: ["freeze:2", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "Seekers that freeze enemies down a line." },
  { name: "Shatter Grenade", kind: "grenade", subs: STASIS, makes: ["shatter", "kGrenade", "multikill", "champion"], uses: ["gEn", "freeze"], wants: { grenade: 1 }, role: ["adClear", "champion"], says: "Sticky grenade that bursts into ricocheting shrapnel; frozen enemies shatter instantly. Stuns Unstoppable Champions." },
  { name: "Vortex Grenade", kind: "grenade", subs: VOID, makes: ["kGrenade", "weaken"], uses: ["gEn"], wants: { grenade: 1 }, says: "A pulling vortex of damage." },
  { name: "Scatter Grenade", kind: "grenade", subs: VOID, makes: ["kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "Lots of small explosions." },
  { name: "Axion Bolt", kind: "grenade", subs: VOID, makes: ["kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "Seeking Void bolts." },
  { name: "Solar Grenade", kind: "grenade", subs: SOLAR, makes: ["scorch:2", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "A flare that burns everything in it." },
  { name: "Fusion Grenade", kind: "grenade", subs: SOLAR, makes: ["scorch", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "A sticky explosive." },
  { name: "Firebolt Grenade", kind: "grenade", subs: SOLAR, makes: ["scorch", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "Seeking fire bolts." },
  { name: "Swarm Grenade", kind: "grenade", subs: [...SOLAR, P], makes: ["scorch", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "Seeking drones that scorch." },
  { name: "Storm Grenade", kind: "grenade", subs: ARC, makes: ["jolt", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "A focused lightning storm." },
  { name: "Pulse Grenade", kind: "grenade", subs: ARC, makes: ["kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "Pulses damage in an area." },
  { name: "Arcbolt Grenade", kind: "grenade", subs: [...ARC, P], makes: ["jolt", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, says: "Lightning that chains between enemies." },
  { name: "Magnetic Grenade", kind: "grenade", subs: [P], makes: ["kGrenade", "bossDmg"], uses: ["gEn"], wants: { grenade: 1 }, says: "Sticks and explodes twice: strong single-target hit." },
  { name: "Grapple", kind: "grenade", subs: [...STRAND, P], makes: ["unravel", "airborne"], uses: ["gEn", "tangle"], wants: { grenade: 1 }, says: "Grappling hook. Grappling to a Tangle refunds it instantly." },

  // ---------- Melees ----------
  { name: "Withering Blade", kind: "melee", subs: [...STASIS, P], makes: ["slow:2", "freeze", "kMelee"], uses: ["mEn"], wants: { melee: 1 }, says: "Two Stasis shuriken that slow; stacking slow on one enemy freezes it." },
  { name: "Snare Bomb", kind: "melee", subs: [...VOID, P], makes: ["weaken", "invis", "teamBuff"], uses: ["mEn"], wants: { melee: 1 }, role: ["team"], says: "A smoke bomb that weakens enemies and turns allies invisible." },
  { name: "Knife Trick", kind: "melee", subs: [...SOLAR, P], makes: ["scorch", "kMelee"], uses: ["mEn"], wants: { melee: 1 }, says: "A fan of burning knives." },
  { name: "Proximity Explosive Knife", kind: "melee", subs: SOLAR, makes: ["scorch", "kMelee"], uses: ["mEn"], wants: { melee: 1 }, says: "A knife that sticks and explodes when enemies get close." },
  { name: "Combination Blow", kind: "melee", subs: [...ARC, P], makes: ["kMelee", "cEn", "heal", "dmg"], uses: ["mEn"], wants: { melee: 1, class: 0.5 }, role: ["survival"], says: "A punch that heals you and refunds your dodge on kills, stacking melee damage." },
  { name: "Disorienting Blow", kind: "melee", subs: ARC, makes: ["blind", "kMelee"], uses: ["mEn"], wants: { melee: 1 }, says: "A blinding strike." },
  { name: "Threaded Spike", kind: "melee", subs: [...STRAND, P], makes: ["sever", "kMelee", "mEn"], uses: ["mEn"], wants: { melee: 1 }, says: "A bouncing rope dart that severs and returns melee energy when caught." },

  // ---------- Class abilities ----------
  { name: "Gambler's Dodge", kind: "classAbility", subs: [...STASIS, ...VOID, ...SOLAR, ...ARC, P], makes: ["dodge", "mEn"], uses: ["cEn"], wants: { class: 1, melee: 0.3 }, says: "A dodge that refills your melee." },
  { name: "Marksman's Dodge", kind: "classAbility", subs: [...STASIS, ...VOID, ...SOLAR, ...ARC, ...STRAND, P], makes: ["dodge", "reload", "ammo"], uses: ["cEn"], wants: { class: 1 }, says: "A dodge that reloads all weapons and grabs ammo." },
  { name: "Acrobat's Dodge", kind: "classAbility", subs: [...SOLAR, P], makes: ["dodge", "radiant", "teamBuff"], uses: ["cEn"], wants: { class: 1 }, role: ["team", "bossDps"], says: "A dodge that makes you and nearby allies radiant (more weapon damage)." },

  // ---------- Aspects ----------
  { name: "Winter's Shroud", kind: "aspect", subs: [...STASIS, P], slots: 3, makes: ["slow", "cEn"], uses: ["dodge"], wants: { class: 1 }, says: "Dodging slows enemies around you, and slowing refunds your dodge." },
  { name: "Shatterdive", kind: "aspect", subs: STASIS, slots: 3, makes: ["shatter:2", "multikill", "frost"], uses: ["airborne", "freeze|crystal"], says: "Slam down from the air to shatter frozen enemies and crystals, gaining Frost Armor." },
  { name: "Grim Harvest", kind: "aspect", subs: STASIS, slots: 2, makes: ["frost:2", "shatter", "multikill", "cEn"], uses: ["shard"], role: ["survival", "adClear"], says: "Picking up shards gives Frost Armor; with it, your Stasis and Kinetic kills shatter enemies, and taking damage refills your dodge." },
  { name: "Touch of Winter", kind: "aspect", subs: STASIS, slots: 2, makes: ["crystal:2", "gEn"], uses: ["gEn"], wants: { grenade: 0.5 }, needs: ["Glacier Grenade", "Duskfield Grenade", "Coldsnap Grenade", "Shatter Grenade"], says: "Upgrades every Stasis grenade: Glacier gets an extra crystal, Duskfield a bigger field, Coldsnap seekers split, Shatter gets more shrapnel and refunds grenade energy on frozen targets." },
  { name: "Vanishing Step", kind: "aspect", subs: VOID, slots: 2, makes: ["invis:2"], uses: ["dodge"], wants: { class: 0.7 }, role: ["survival"], says: "Dodging turns you invisible." },
  { name: "Stylish Executioner", kind: "aspect", subs: [...VOID, P], slots: 2, makes: ["invis", "weaken"], uses: ["kDebuffed"], role: ["survival"], says: "Killing any debuffed enemy turns you invisible, and your next melee weakens." },
  { name: "Trapper's Ambush", kind: "aspect", subs: VOID, slots: 2, makes: ["weaken", "invis"], uses: ["airborne"], says: "Diving from the air leaves a weakening smoke trap." },
  { name: "On the Prowl", kind: "aspect", subs: VOID, slots: 2, makes: ["suppress"], uses: ["invis"], needs: ["Snare Bomb"], says: "Your Snare Bomb tracks enemies and suppresses them while you're invisible." },
  { name: "Knock 'Em Down", kind: "aspect", subs: SOLAR, slots: 2, makes: ["mEn", "sEn"], uses: ["radiant"], wants: { melee: 0.5 }, needs: ["Knife Trick", "Proximity Explosive Knife", "Golden Gun: Marksman", "Golden Gun: Deadshot", "Blade Barrage"], says: "While radiant, your Solar melee comes back faster and supers last longer." },
  { name: "On Your Mark", kind: "aspect", subs: SOLAR, slots: 3, makes: ["reload", "dmg"], uses: ["kPrecision", "dodge"], says: "Precision kills stack weapon handling and reload, and your dodge spends the stacks for a boost." },
  { name: "Gunpowder Gamble", kind: "aspect", subs: [...SOLAR, P], slots: 2, makes: ["ignite", "kAbility"], uses: ["kWeapon"], wants: { grenade: 0.3 }, says: "Kills charge a throwable explosive you can shoot for an ignition." },
  { name: "Flow State", kind: "aspect", subs: ARC, slots: 2, makes: ["amplified", "reload", "dr"], uses: ["jolt"], says: "Defeating jolted enemies charges your dodge; while amplified you reload faster and take less damage." },
  { name: "Lethal Current", kind: "aspect", subs: ARC, slots: 2, makes: ["jolt", "blind"], uses: ["dodge"], needs: ["Combination Blow", "Disorienting Blow"], says: "After dodging, your melee lunges further and jolts." },
  { name: "Ascension", kind: "aspect", subs: [...ARC, P], slots: 1, makes: ["jolt", "amplified", "teamBuff"], uses: ["cEn", "airborne"], wants: { class: 1 }, says: "Spend your dodge in the air to burst upward, jolting enemies and amplifying allies." },
  { name: "Widow's Silk", kind: "aspect", subs: STRAND, slots: 2, makes: ["woven", "gEn"], uses: ["tangle"], role: ["survival"], says: "An extra Grapple charge, and grappling to a Tangle gives Woven Mail." },
  { name: "Ensnaring Slam", kind: "aspect", subs: STRAND, slots: 1, makes: ["suspend"], uses: ["airborne"], says: "A slam from the air that suspends enemies." },
  { name: "Threaded Specter", kind: "aspect", subs: [...STRAND, P], slots: 2, makes: ["threadling", "kAbility"], uses: ["cEn"], wants: { class: 1 }, says: "Your dodge leaves a decoy that explodes into Threadlings." },

  // ---------- Fragments: Stasis ----------
  { name: "Whisper of Hedrons", kind: "fragment", subs: [...STASIS], makes: ["dmg"], uses: ["freeze"], says: "Freezing enemies boosts your weapons." },
  { name: "Whisper of Fissures", kind: "fragment", subs: STASIS, makes: ["dmg"], uses: ["shatter"], says: "Shatters hit harder and wider." },
  { name: "Whisper of Refraction", kind: "fragment", subs: STASIS, makes: ["cEn"], uses: ["slow|freeze"], says: "Killing slowed or frozen enemies refunds your dodge." },
  { name: "Whisper of Durance", kind: "fragment", subs: STASIS, makes: ["slow"], uses: ["slow"], says: "Your slows last longer." },
  { name: "Whisper of Bonds", kind: "fragment", subs: STASIS, makes: ["orb"], uses: ["freeze"], says: "Killing frozen enemies makes Orbs of Power. Costs 10 Super." },
  { name: "Whisper of Shards", kind: "fragment", subs: STASIS, makes: ["gEn:2"], uses: ["crystal"], wants: { grenade: 0.3 }, says: "Shattering crystals speeds up your grenade." },
  { name: "Whisper of Chains", kind: "fragment", subs: STASIS, makes: ["shard"], uses: ["frost"], says: "Kills while you have Frost Armor can make Stasis shards." },
  { name: "Whisper of Torment", kind: "fragment", subs: STASIS, makes: ["gEn"], uses: ["frost"], role: ["survival"], says: "Taking damage refills your grenade (more with Frost Armor). Costs 10 Grenade." },
  { name: "Whisper of Fractures", kind: "fragment", subs: STASIS, makes: ["frost"], uses: ["freeze", "mEn"], says: "Shattering a frozen enemy with a melee gives Frost Armor." },
  { name: "Whisper of Impetus", kind: "fragment", subs: STASIS, makes: ["reload"], uses: ["mEn"], says: "Stasis melee hits reload your weapons." },
  { name: "Whisper of Conduction", kind: "fragment", subs: STASIS, makes: ["shard"], uses: ["shard"], says: "Stasis shards fly to you. Shards are built into Stasis now, so this always has something to pull." },
  { name: "Whisper of Rending", kind: "fragment", subs: STASIS, makes: ["shatter"], uses: ["crystal|freeze"], says: "Primary weapons break crystals and frozen enemies faster." },
  { name: "Whisper of Hunger", kind: "fragment", subs: STASIS, makes: ["mEn"], uses: ["shard"], says: "Shards refill more melee. Costs 20 Melee." },
  { name: "Whisper of Rime", kind: "fragment", subs: STASIS, makes: ["frost"], uses: ["frost"], role: ["survival"], says: "Frost Armor stacks last longer (6 seconds instead of 5)." },

  // ---------- Fragments: Solar ----------
  { name: "Ember of Singeing", kind: "fragment", subs: SOLAR, makes: ["cEn"], uses: ["scorch"], says: "Scorching enemies refunds your dodge." },
  { name: "Ember of Benevolence", kind: "fragment", subs: SOLAR, makes: ["gEn", "mEn", "cEn"], uses: ["radiant|restoration|cure"], role: ["team"], says: "Buffing allies speeds up all your abilities." },
  { name: "Ember of Beams", kind: "fragment", subs: SOLAR, makes: [], uses: ["kSuper"], says: "Your Solar super aims better." },
  { name: "Ember of Combustion", kind: "fragment", subs: SOLAR, makes: ["ignite", "firesprite"], uses: ["kSuper"], says: "Super kills ignite." },
  { name: "Ember of Torches", kind: "fragment", subs: SOLAR, makes: ["radiant:2", "teamBuff"], uses: ["mEn"], role: ["team"], says: "Powered melee hits make you and allies radiant." },
  { name: "Ember of Tempering", kind: "fragment", subs: SOLAR, makes: ["heal", "firesprite"], uses: ["kWeapon"], role: ["survival"], says: "Solar weapon kills heal you and allies." },
  { name: "Ember of Blistering", kind: "fragment", subs: SOLAR, makes: ["gEn"], uses: ["ignite"], says: "Ignition kills refill your grenade." },
  { name: "Ember of Solace", kind: "fragment", subs: SOLAR, makes: ["radiant", "restoration"], uses: ["radiant|restoration"], says: "Radiant and Restoration last longer." },
  { name: "Ember of Ashes", kind: "fragment", subs: SOLAR, makes: ["scorch", "ignite"], uses: ["scorch"], says: "More scorch stacks, so more ignitions." },
  { name: "Ember of Wonder", kind: "fragment", subs: SOLAR, makes: ["orb"], uses: ["ignite"], says: "Ignition multikills make orbs." },

  // ---------- Fragments: Arc ----------
  { name: "Spark of Beacons", kind: "fragment", subs: ARC, makes: ["blind"], uses: ["amplified"], says: "Amplified Special/Heavy Arc kills blind." },
  { name: "Spark of Resistance", kind: "fragment", subs: ARC, makes: ["dr"], uses: [], role: ["survival"], says: "Less damage when surrounded." },
  { name: "Spark of Momentum", kind: "fragment", subs: ARC, makes: ["reload", "bolt"], uses: [], says: "Sliding over ammo reloads." },
  { name: "Spark of Shock", kind: "fragment", subs: ARC, makes: ["jolt"], uses: ["gEn"], says: "Arc grenades jolt." },
  { name: "Spark of Discharge", kind: "fragment", subs: ARC, makes: ["ionic", "bolt"], uses: ["kWeapon"], says: "Arc weapon kills drop Ionic Traces." },
  { name: "Spark of Frequency", kind: "fragment", subs: ARC, makes: ["reload", "bolt"], uses: ["mEn"], says: "Melee hits speed up reloads." },
  { name: "Spark of Focus", kind: "fragment", subs: ARC, makes: ["cEn"], uses: ["sprint"], says: "Sprinting speeds up your dodge." },
  { name: "Spark of Recharge", kind: "fragment", subs: ARC, makes: ["gEn", "mEn"], uses: [], says: "Abilities recharge faster at low health." },
  { name: "Spark of Magnitude", kind: "fragment", subs: ARC, makes: [], uses: ["gEn"], says: "Lingering Arc grenades last longer." },
  { name: "Spark of Volts", kind: "fragment", subs: ARC, makes: ["amplified", "bolt"], uses: ["finisher"], says: "Finishers amplify you." },

  // ---------- Fragments: Void ----------
  { name: "Echo of Expulsion", kind: "fragment", subs: VOID, makes: ["kAbility"], uses: ["kAbility"], says: "Void ability kills explode." },
  { name: "Echo of Provision", kind: "fragment", subs: VOID, makes: ["mEn"], uses: ["gEn"], says: "Grenade damage refills your melee." },
  { name: "Echo of Exchange", kind: "fragment", subs: VOID, makes: ["gEn"], uses: ["kMelee"], says: "Melee kills refill your grenade." },
  { name: "Echo of Remnants", kind: "fragment", subs: VOID, makes: [], uses: ["gEn"], says: "Lingering Void grenades last longer." },
  { name: "Echo of Reprisal", kind: "fragment", subs: VOID, makes: ["sEn"], uses: [], says: "Kills while surrounded give super energy." },
  { name: "Echo of Undermining", kind: "fragment", subs: VOID, makes: ["weaken"], uses: ["gEn"], says: "Void grenades weaken." },
  { name: "Echo of Persistence", kind: "fragment", subs: VOID, makes: ["invis"], uses: ["invis|overshield|devour"], says: "Invisibility and overshields last longer. Costs 10 Class, Weapons and Health." },
  { name: "Echo of Leeching", kind: "fragment", subs: VOID, makes: ["heal"], uses: ["kMelee"], role: ["survival"], says: "Melee kills start healing you and allies." },
  { name: "Echo of Domineering", kind: "fragment", subs: VOID, makes: ["reload"], uses: ["suppress"], says: "Suppressing reloads you." },
  { name: "Echo of Dilation", kind: "fragment", subs: VOID, makes: [], uses: [], says: "Crouch-sneak faster." },

  // ---------- Fragments: Prismatic (Tyler has these 8 unlocked) ----------
  { name: "Facet of Hope", kind: "fragment", subs: [P], makes: ["cEn"], uses: ["radiant|frost|woven|overshield|amplified|restoration|invis|devour"], says: "Any elemental buff speeds up your dodge." },
  { name: "Facet of Courage", kind: "fragment", subs: [P], makes: ["dmg"], uses: ["slow|freeze|sever|suspend"], says: "Light abilities hit harder on Darkness-debuffed enemies." },
  { name: "Facet of Balance", kind: "fragment", subs: [P], makes: ["mEn", "gEn"], uses: ["kWeapon"], says: "Rapid Light kills refill melee; rapid Darkness kills refill grenade." },
  { name: "Facet of Dawn", kind: "fragment", subs: [P], makes: ["radiant:2", "teamBuff"], uses: ["mEn"], says: "Powered melee hits make you radiant (more weapon damage). Costs 10 Melee." },
  { name: "Facet of Protection", kind: "fragment", subs: [P], makes: ["dr:2"], uses: [], role: ["survival"], says: "Take less damage when surrounded." },
  { name: "Facet of Blessing", kind: "fragment", subs: [P], makes: ["heal"], uses: ["kMelee"], role: ["survival"], says: "Melee kills start healing." },
  { name: "Facet of Purpose", kind: "fragment", subs: [P], makes: ["frost", "restoration", "overshield", "woven", "bolt"], uses: ["orbPickup"], role: ["survival"], says: "Orbs give a buff based on your super's element (Frost Armor with a Stasis super). Costs 10 Class." },
  { name: "Facet of Ruin", kind: "fragment", subs: [P], makes: ["dmg"], uses: ["shatter|ignite"], says: "Bigger shatters and ignitions." },

  // ---------- Fragments: Strand (Tyler's unlocks unclear; only Thread of Ascent confirmed) ----------
  { name: "Thread of Ascent", kind: "fragment", subs: STRAND, makes: ["reload"], uses: ["gEn"], says: "Grenades reload your weapon." },

  // ---------- Exotic armor (Tyler owns all of these) ----------
  { name: "Star-Eater Scales", kind: "exotic", makes: ["sEn:2", "heal", "overshield"], uses: ["orb:2", "orbPickup"], wants: { super: 1 }, role: ["bossDps"], says: "Orbs overcharge your super: more super energy and a big boost to your next super's damage. Only worth boss damage when your super is a boss super." },
  { name: "Celestial Nighthawk", kind: "exotic", makes: ["bossDmg:3", "sEn"], uses: ["kPrecision"], wants: { super: 1 }, role: ["bossDps"], needs: ["Golden Gun: Marksman", "Golden Gun: Deadshot"], says: "Golden Gun becomes one massive shot." },
  { name: "Shards of Galanor", kind: "exotic", makes: ["sEn:2"], uses: ["kSuper"], wants: { super: 1 }, role: ["bossDps"], needs: ["Blade Barrage"], says: "Blade Barrage refunds super; knife kills too." },
  { name: "Orpheus Rig", kind: "exotic", makes: ["sEn", "gEn", "mEn", "cEn"], uses: ["suppress|weaken"], role: ["team"], needs: ["Shadowshot: Deadfall", "Shadowshot: Moebius Quiver"], says: "Deadfall tethers refund your abilities." },
  { name: "Gyrfalcon's Hauberk", kind: "exotic", makes: ["volatile:2", "dmg", "overshield", "cEn", "teamBuff"], uses: ["invis"], role: ["survival", "adClear"], says: "Coming out of invisibility gives Void weapons Volatile Rounds; invisible finishers buff the team." },
  { name: "Graviton Forfeit", kind: "exotic", makes: ["gEn", "mEn", "cEn", "overshield"], uses: ["invis"], wants: { class: 0.5 }, role: ["survival"], says: "Longer invisibility, and abilities recharge faster while invisible." },
  { name: "Khepri's Sting", kind: "exotic", makes: ["weaken", "mEn"], uses: ["weaken"], needs: ["Snare Bomb"], says: "Killing weakened enemies spreads more weakening smoke and refunds your melee." },
  { name: "Gwisin Vest", kind: "exotic", makes: ["sEn", "weaken"], uses: ["kSuper"], needs: ["Spectral Blades"], says: "Spectral Blades refunds super." },
  { name: "Caliban's Hand", kind: "exotic", makes: ["ignite:2", "scorch", "mEn:2"], uses: ["mEn"], wants: { melee: 1 }, role: ["adClear"], needs: ["Proximity Explosive Knife"], says: "Proximity Knives ignite, and ignition kills refund the knife." },
  { name: "Wormhusk Crown", kind: "exotic", makes: ["cure", "heal"], uses: ["dodge"], role: ["survival"], says: "Dodging heals you." },
  { name: "Relativism", kind: "exotic", makes: ["invis", "kMelee"], uses: ["mEn"], says: "Class item with two spirit perks; the Assassin spirit makes melee kills and finishers turn you invisible." },
  { name: "Fr0st-EE5", kind: "exotic", makes: ["gEn", "mEn", "cEn", "frost", "dmg:2"], uses: ["sprint"], role: ["survival"], says: "Sprinting recharges every ability and builds Frost Armor; Frost Armor boosts Stasis weapons." },
  { name: "Renewal Grasps", kind: "exotic", makes: ["frost", "dr:2", "teamBuff"], uses: ["gEn"], role: ["survival", "team"], needs: ["Duskfield Grenade"], says: "Huge Duskfields that give allies Frost Armor and weaken enemy damage." },
  { name: "The Sixth Coyote", kind: "exotic", makes: ["orb", "dodge"], uses: ["dodge"], wants: { class: 0.5 }, says: "Two dodges, and a kill after dodging makes an orb." },
  { name: "The Dragon's Shadow", kind: "exotic", makes: ["reload", "cEn"], uses: ["dodge"], says: "Dodging reloads and speeds you up." },
  { name: "Fortune's Favor", kind: "exotic", makes: ["overshield", "dmg"], uses: ["kWeapon"], role: ["survival"], says: "Kills at full health build an overshield that boosts your weapons." },
  { name: "Moirai", kind: "exotic", makes: ["mEn:2", "unravel"], uses: ["tangle", "mEn"], wants: { melee: 1 }, needs: ["Threaded Spike"], says: "Threaded Spike detonates Tangles and comes straight back." },
  { name: "Gifted Conviction", kind: "exotic", makes: ["jolt", "dr"], uses: ["cEn"], role: ["survival"], needs: ["Ascension"], says: "Ascension throws jolting explosives, and jolting gives damage resistance." },
  { name: "Raiju's Harness", kind: "exotic", makes: ["jolt", "amplified", "sEn"], uses: ["kDebuffed"], needs: ["Gathering Storm"], says: "Gathering Storm jolts everything and amplifies allies." },
  { name: "Raiden Flux", kind: "exotic", makes: ["jolt", "dmg"], uses: ["kSuper"], needs: ["Arc Staff"], says: "Arc Staff gets stronger with quick hits." },
  { name: "Liar's Handshake", kind: "exotic", makes: ["heal", "kMelee"], uses: ["mEn"], wants: { melee: 1 }, needs: ["Combination Blow", "Disorienting Blow"], says: "Arc melee lets you counterpunch for big damage and healing." },
  { name: "Lucky Raspberry", kind: "exotic", makes: ["jolt", "gEn:2"], uses: ["jolt"], wants: { grenade: 1 }, needs: ["Arcbolt Grenade"], says: "Arcbolt Grenades chain further, jolt, and refill themselves." },
  { name: "Ophidia Spathe", kind: "exotic", makes: ["kMelee", "dmg"], uses: ["mEn"], wants: { melee: 1 }, needs: ["Knife Trick", "Proximity Explosive Knife"], says: "Two throwing knives per charge." },
  { name: "The Bombardiers", kind: "exotic", makes: ["slow", "scorch", "suppress", "sever", "blind"], uses: ["dodge"], says: "Dodging leaves a bomb that matches your super's element." },
  { name: "Foetracer", kind: "exotic", makes: ["dmg"], uses: ["kAbility"], says: "Ability hits on big enemies boost matching weapon damage." },
  { name: "Lucky Pants", kind: "exotic", makes: ["dmg"], uses: [], needs: ["__type:Hand Cannon"], says: "Hand cannon damage boost." },
  { name: "Oathkeeper", kind: "exotic", makes: ["dmg"], uses: [], needs: ["__type:Combat Bow"], says: "Hold bow draws forever." },
  { name: "Knucklehead Radar", kind: "exotic", makes: [], uses: [], says: "Radar while aiming." },
  { name: "St0mp-EE5", kind: "exotic", makes: ["dr"], uses: [], says: "Better jumps and slides." },
  { name: "Gemini Jester", kind: "exotic", makes: [], uses: ["dodge"], says: "Dodging disorients (mostly PvP)." },
  { name: "Mechaneer's Tricksleeves", kind: "exotic", makes: ["dmg"], uses: [], needs: ["__type:Sidearm"], says: "Sidearm boost at low health." },
  { name: "Young Ahamkara's Spine", kind: "exotic", makes: ["gEn"], uses: ["kAbility"], needs: ["Tripmine Grenade"], says: "Tripmine grenades (Gunslinger)." },
  { name: "Shinobu's Vow", kind: "exotic", makes: ["gEn", "bolt", "heal"], uses: ["gEn"], needs: ["Skip Grenade"], says: "Extra Skip Grenade charge (Arcstrider)." },
  { name: "Sealed Ahamkara Grasps", kind: "exotic", makes: ["reload", "dmg"], uses: ["kMelee", "finisher"], says: "Melee kills reload your weapons and boost freshly drawn ones." },

  // ---------- Weapons and weapon perks Tyler owns ----------
  { name: "Monte Carlo", kind: "weapon", makes: ["mEn:2", "kWeapon"], uses: ["kMelee"], wants: { melee: 0.5 }, says: "Damage refills your melee, and kills can fully recharge it." },
  { name: "Choir of One", kind: "weapon", makes: ["kWeapon", "dmg", "volatile"], uses: [], role: ["adClear", "bossDps"], says: "Explosive Void auto rifle: strong everywhere." },
  { name: "Quicksilver Storm", kind: "weapon", makes: ["kWeapon", "kGrenade"], uses: [], role: ["adClear"], says: "Strand auto rifle that loads its own grenades." },
  { name: "Wavesplitter", kind: "weapon", makes: ["suppress", "kWeapon"], uses: ["orbPickup"], says: "Orbs supercharge it." },
  { name: "The Jade Rabbit", kind: "weapon", makes: ["kPrecision", "orbPickup", "reload"], uses: [], says: "Precision scout that can shoot orbs to pick them up." },
  { name: "Still Hunt", kind: "weapon", makes: ["kPrecision", "bossDmg:2"], uses: ["orbPickup"], role: ["bossDps"], says: "Sniper that charges Golden Gun shots from orbs." },
  { name: "Verglas Curve", kind: "weapon", makes: ["freeze", "crystal:2", "kWeapon"], uses: [], says: "Stasis bow that freezes and makes crystals." },
  { name: "Witherhoard", kind: "weapon", makes: ["kWeapon", "bossDmg"], uses: [], says: "Leaves damaging blight." },
  { name: "Tessellation", kind: "weapon", makes: ["gEn", "transcend"], uses: ["gEn"], says: "Fusion rifle that matches your grenade's element and refills it." },
  { name: "One Thousand Voices", kind: "weapon", makes: ["scorch", "ignite", "bossDmg"], uses: [], role: ["bossDps"], says: "Heavy beam that ignites." },
  { name: "Service of Luzaku", kind: "weapon", makes: ["threadling", "heal"], uses: [], role: ["team"], says: "Strand machine gun that heals allies." },
  { name: "Third Iteration", kind: "weapon", makes: ["kWeapon"], uses: [], says: "Void scout." },
  { name: "Telesto", kind: "weapon", makes: ["kWeapon"], uses: [], says: "Void fusion." },
  { name: "Delicate Tomb", kind: "weapon", makes: ["ionic", "jolt"], uses: [], says: "Arc fusion that jolts." },
  { name: "Headstone", kind: "weapon", makes: ["crystal:2"], uses: ["kPrecision"], says: "Precision kills make Stasis crystals." },
  { name: "Rimestealer", kind: "weapon", makes: ["frost:2"], uses: ["crystal|freeze"], role: ["survival"], says: "Breaking crystals or frozen enemies gives Frost Armor." },
  { name: "Destabilizing Rounds", kind: "weapon", makes: ["volatile:2", "multikill"], uses: ["kWeapon"], role: ["adClear"], says: "Kills make nearby enemies volatile, so packs blow each other up." },
  { name: "Repulsor Brace", kind: "weapon", makes: ["overshield:2"], uses: ["weaken|volatile|suppress"], role: ["survival"], says: "Killing Void-debuffed enemies gives an overshield." },
  { name: "Incandescent", kind: "weapon", makes: ["scorch:2", "ignite", "multikill"], uses: ["kWeapon"], role: ["adClear"], says: "Kills spread scorch, which ignites packs." },
  { name: "Voltshot", kind: "weapon", makes: ["jolt:2", "multikill"], uses: ["reload"], role: ["adClear"], says: "Reloading after a kill jolts, and jolt chains through packs." },
  { name: "Hatchling", kind: "weapon", makes: ["threadling:2"], uses: ["kPrecision"], says: "Precision kills make Threadlings." },
  { name: "Slice", kind: "weapon", makes: ["sever:2"], uses: ["cEn"], says: "After your dodge, this weapon severs." },
  { name: "Demolitionist", kind: "weapon", makes: ["gEn:2", "reload"], uses: ["gEn"], wants: { grenade: 0.3 }, says: "Kills refill your grenade, and throwing a grenade reloads." },
  { name: "Attrition Orbs", kind: "weapon", makes: ["orb"], uses: [], says: "Sustained damage makes orbs." },
  { name: "Explosive Light", kind: "weapon", makes: ["bossDmg:2"], uses: ["orbPickup"], role: ["bossDps"], says: "Orbs supercharge your next rocket." },
  { name: "Envious Arsenal", kind: "weapon", makes: ["bossDmg"], uses: [], role: ["bossDps"], says: "Refills the launcher from reserves." },
  { name: "Bait and Switch", kind: "weapon", makes: ["bossDmg"], uses: [], role: ["bossDps"], says: "Damage boost after hitting with all three weapons." },
  { name: "Golden Tricorn Enhanced", kind: "weapon", makes: ["dmg"], uses: ["kGrenade", "kMelee"], says: "Kills plus a matching ability kill boost damage." },
  { name: "Rolling Storm", kind: "weapon", makes: ["bolt"], uses: [], says: "Kills give Bolt Charge." },
  { name: "Cold Steel", kind: "weapon", makes: ["slow"], uses: [], says: "Sword hits slow." },
  { name: "Reconstruction", kind: "weapon", makes: ["bossDmg:2", "reload"], uses: [], role: ["bossDps"], says: "Reloads itself over time, up to double capacity: big boss damage on a rocket." },
  { name: "Killing Tally", kind: "weapon", makes: ["dmg"], uses: ["kWeapon"], says: "Kills stack damage until you reload." },
  { name: "Cynosure", kind: "weapon", makes: [], uses: [], role: ["bossDps"], says: "Strand rocket launcher." },
  { name: "Chain Reaction", kind: "weapon", makes: ["kWeapon", "multikill"], uses: [], role: ["adClear"], says: "Kills explode." },
  { name: "Gnawing Hunger", kind: "weapon", makes: ["kWeapon"], uses: [], role: ["adClear", "bossDps"], says: "Void auto rifle. With volatile rounds every kill chains explosions through the pack." },
  { name: "Subsistence", kind: "weapon", makes: ["reload"], uses: ["kWeapon"], says: "Kills refill the magazine, so you rarely stop shooting." },
  { name: "Kill Clip", kind: "weapon", makes: ["dmg:2"], uses: ["kWeapon", "reload"], says: "Reloading after a kill gives a big damage boost." },
  { name: "Firefly", kind: "weapon", makes: ["kPrecision", "multikill"], uses: [], role: ["adClear"], says: "Precision kills explode." },

  // ---------- Artifact perks (Monument of Triumph: seven artifacts, perks saved with loadouts) ----------
  { name: "Volatile Flow", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["volatile:2", "multikill"], uses: ["orbPickup"], needs: ["__el:Void"], role: ["adClear"], says: "Picking up an orb loads Volatile Rounds into your Void weapons." },
  { name: "Void Weapon Channeling", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["dmg:2"], uses: [], needs: ["__el:Void+__sub:Void", "__el:Void+__sub:Prismatic"], says: "Void weapon kills while a Void ability is fully charged boost your Void weapon damage. Needs Void abilities, so a Void or Prismatic subclass." },
  { name: "Unto the Breach", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["breach"], uses: ["weaken|volatile|suppress"], needs: ["__sub:Void", "__sub:Prismatic"], says: "Killing a Void-debuffed enemy leaves a Void Breach, only while your Void or Prismatic subclass is equipped." },
  { name: "Protective Breach", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["overshield:2"], uses: ["breach"], role: ["survival"], says: "Walking over a Void Breach gives you an overshield." },
  { name: "Supernova", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["dmg"], uses: ["breach"], says: "Picking up a Void Breach empowers your next Void attack." },
  { name: "Bricks from Beyond", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["ammo", "bossDmg"], uses: [], needs: ["__el:Void"], role: ["bossDps", "team"], says: "Killing elites with Void weapons makes Heavy ammo for the team." },
  { name: "Shatter Orbs", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["orb"], uses: [], says: "Breaking a shield with a matching element drops an Orb of Power." },
  { name: "Targeting Autoloader", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["reload", "dmg"], uses: [], needs: ["__type:Auto Rifle"], says: "Auto rifle kills reload the magazine and boost damage." },
  { name: "Sustained Fire", kind: "artifact", artifact: "NPA Repulsion Regulator", makes: ["dr"], uses: [], needs: ["__type:Auto Rifle"], role: ["survival"], says: "Holding the trigger on an auto rifle gives damage resistance." },
  { name: "Hail the Storm", kind: "artifact", artifact: "Slayer Baron Apothecary Satchel", makes: ["multikill:2"], uses: ["shatter"], role: ["adClear"], says: "Shattering Stasis crystals sends out explosive ice shrapnel." },
  { name: "Wind Chill", kind: "artifact", artifact: "Slayer Baron Apothecary Satchel", makes: ["frost", "shard"], uses: ["freeze|slow"], says: "Fast Stasis hits build Frost Armor; hitting frozen targets drops shards." },
  { name: "Crystalline Converter", kind: "artifact", artifact: "Slayer Baron Apothecary Satchel", makes: ["crystal"], uses: ["shard"], says: "Collected shards turn your next powered melee into explosive crystals." },
  { name: "Brain Freeze", kind: "artifact", artifact: "Slayer Baron Apothecary Satchel", makes: ["slow"], uses: ["freeze"], says: "Frozen enemies give off a fog that slows those nearby." },
  { name: "Served Cold", kind: "artifact", artifact: "Slayer Baron Apothecary Satchel", makes: ["cEn"], uses: ["shard"], says: "Stasis shards refund class ability energy." },
  { name: "Frost Renewal", kind: "artifact", artifact: "Slayer Baron Apothecary Satchel", makes: ["freeze", "dr"], uses: ["frost"], role: ["survival"], says: "Taking heavy damage with Frost Armor sets off a freezing burst." },
];

// Signature combos: pieces that are far stronger together than their parts suggest. Each entry lists what
// must be in the build ("a|b" = either; "@token" = anything that makes it; "__el:Void" = a Void weapon),
// what the pairing really produces, and how to play it. This is where kill power comes from.
export interface Combo { name: string; all: string[]; makes: string[]; play: string; wants?: Partial<Record<StatKey, number>> }
export const COMBOS: Combo[] = [
  { name: "Shatter wall", wants: { grenade: 2 }, all: ["Glacier Grenade", "Shatterdive"], makes: ["multikill:3", "shatter:2"], play: "Throw Glacier into the middle of the pack, jump and Shatterdive onto the wall. The crystals and everything frozen next to them shatter at once." },
  { name: "Bigger wall", wants: { grenade: 0.5 }, all: ["Glacier Grenade", "Touch of Winter"], makes: ["crystal", "multikill"], play: "Touch of Winter adds a crystal and widens the wall, so one grenade covers more of the room." },
  { name: "Grenade on repeat", wants: { grenade: 1 }, all: ["Glacier Grenade|Duskfield Grenade|Coldsnap Grenade", "Whisper of Shards"], makes: ["gEn:2"], play: "Every crystal you break speeds up your next grenade. Break the wall, throw again." },
  { name: "Ice shrapnel", all: ["Hail the Storm", "@shatter"], makes: ["multikill:2"], play: "Each shatter throws explosive ice shrapnel into the enemies around it." },
  { name: "Shatter on frozen", wants: { grenade: 1.5 }, all: ["Shatter Grenade", "@freeze"], makes: ["multikill:2", "gEn"], play: "Freeze the pack first, then stick a Shatter Grenade on it. Frozen enemies shatter instantly and Touch of Winter refunds the grenade." },
  { name: "Crystal headshots", all: ["Headstone", "Shatterdive|Whisper of Shards|Rimestealer"], makes: ["crystal", "multikill"], play: "Precision kills with your Headstone weapon leave crystals. Break them to keep the loop going." },
  { name: "Volatile spray", wants: { weapons: 1 }, all: ["Volatile Flow", "__el:Void"], makes: ["volatile:2", "multikill:2"], play: "Grab an orb, then hold the trigger on packs with your Void weapon. Every hit marks enemies volatile and kills chain explosions." },
  { name: "Gnawing Hunger loop", wants: { weapons: 1 }, all: ["Gnawing Hunger", "Volatile Flow|Destabilizing Rounds|Gyrfalcon's Hauberk"], makes: ["multikill:2", "dmg", "bossDmg"], play: "Gnawing Hunger with volatile rounds melts packs and majors. Kill, reload for Kill Clip, keep shooting. It also does real damage to bosses between heavy ammo." },
  { name: "Breach overshield", all: ["Unto the Breach", "Protective Breach", "@volatile|weaken|suppress"], makes: ["overshield", "dr"], play: "Volatile kills leave Void Breaches. Walk over them for an overshield." },
  { name: "Frost Armor tank", wants: { health: 0.5 }, all: ["Grim Harvest|Rimestealer|Fr0st-EE5|Wind Chill", "Whisper of Rime|Whisper of Chains"], makes: ["dr:2"], play: "Keep Frost Armor stacked: at 5 stacks you take about 35% less damage, and stacks now melt one at a time." },
  // Star-Eater's damage boost goes into your super, so it is boss damage only when the super hits bosses hard.
  { name: "Orb engine", wants: { super: 1 }, all: ["Star-Eater Scales", "@orb", "Golden Gun: Marksman|Golden Gun: Deadshot|Blade Barrage|Shadowshot: Moebius Quiver|Shadowshot: Deadfall|Gathering Storm|Storm's Edge"], makes: ["bossDmg:4"], play: "Pick up orbs before your super to overcharge it, then fire it on the boss." },
  { name: "Overcharged storm", wants: { super: 1 }, all: ["Star-Eater Scales", "Silence and Squall|Spectral Blades|Arc Staff|Silkstrike"], makes: ["multikill", "sEn"], play: "Star-Eater makes your crowd-clearing super bigger and come back sooner. It does not turn it into boss damage." },
];

// Weapon types: what the frame of weapon is good for, before its perks.
export const WEAPON_TYPE: Record<string, K> = Object.fromEntries(([
  ["Sniper Rifle", ["bossDmg:1", "kPrecision"], "Long-range precision damage."],
  ["Linear Fusion Rifle", ["bossDmg:2", "kPrecision"], "Heavy precision damage on bosses."],
  ["Fusion Rifle", ["bossDmg:1"], "Close-range burst damage."],
  ["Rocket Launcher", ["bossDmg:1"], "Burst damage on bosses."],
  ["Machine Gun", ["kWeapon:2"], "Heavy ad clear."],
  ["Sword", ["bossDmg:1"], "Melee-range damage."],
  ["Grenade Launcher", ["kWeapon"], "Area damage."],
] as [string, string[], string][]).map(([n, makes, says]) => [n, { name: n, kind: "weapon", makes, uses: [], says } as K]));

export const byName = new Map(HUNTER.map(k => [k.name, k]));

// Fragment slots per subclass when Bungie doesn't tell us (aspect capacity is not in the snapshot yet).
export const MAX_FRAGMENTS: Record<Subclass, number> = {
  Revenant: 6, Nightstalker: 6, Gunslinger: 6, Arcstrider: 6, Threadrunner: 6, "Prismatic Hunter": 6,
};
