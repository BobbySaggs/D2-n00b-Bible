import type { K } from "./hunter";
import { subsOfElement, type Subclass } from "./classes";

// Grenades and fragments every class shares that the Hunter list never covered. Written by Claude from Bungie's
// item text (Destiny 2 manifest, Nov 25 2026) and checked line by line. Each one is offered to every subclass of
// its element; Bungie's subclass data decides which a character can really equip.
const el = (...els: string[]): Subclass[] => els.flatMap(subsOfElement);
const SRC = "Bungie: Monument of Triumph item text (manifest, Nov 25 2026)";

export const SHARED: K[] = [
  // ---------- Grenades ----------
  { name: "Flux Grenade", kind: "grenade", subs: el("Arc"), makes: ["kGrenade", "bossDmg"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "Sticks to an enemy and explodes: a strong single hit." },
  { name: "Lightning Grenade", kind: "grenade", subs: el("Arc", "Prismatic"), makes: ["kGrenade", "jolt"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "Sticks to a surface and shoots lightning bolts at anything near it. Two charges." },
  { name: "Skip Grenade", kind: "grenade", subs: el("Arc"), makes: ["kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "Splits into seekers that chase enemies." },
  { name: "Incendiary Grenade", kind: "grenade", subs: el("Solar"), makes: ["scorch:2", "kGrenade", "ignite"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "A fiery burst that heavily scorches everything near it, often igniting." },
  { name: "Thermite Grenade", kind: "grenade", subs: el("Solar"), makes: ["scorch", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "A line of fire that burns and scorches what it runs through." },
  { name: "Tripmine Grenade", kind: "grenade", subs: el("Solar"), makes: ["scorch", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "A laser tripmine that blows up and scorches when enemies walk through it." },
  { name: "Suppressor Grenade", kind: "grenade", subs: el("Void"), makes: ["suppress:2", "kGrenade", "champion"], uses: ["gEn"], wants: { grenade: 1 }, role: ["champion"], src: SRC, says: "Suppresses enemies so they can't use abilities. Stuns Overload Champions." },
  { name: "Void Spike", kind: "grenade", subs: el("Void"), makes: ["kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "Sticks to a surface and pours out Void damage below it." },
  { name: "Void Wall", kind: "grenade", subs: el("Void"), makes: ["kGrenade", "multikill"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "A wall of burning Void that damages everything walking through it." },
  { name: "Slicewire Grenade", kind: "grenade", subs: el("Strand"), makes: ["sever", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "Bounces and throws out spinning threads that sever enemies." },
  { name: "Threadling Grenade", kind: "grenade", subs: el("Strand", "Prismatic"), makes: ["threadling:2", "kGrenade"], uses: ["gEn"], wants: { grenade: 1 }, src: SRC, says: "Turns into Threadlings mid-flight that hunt enemies." },

  // ---------- Void fragments ----------
  { name: "Echo of Vigilance", kind: "fragment", subs: el("Void"), makes: ["overshield"], uses: [], role: ["survival"], src: SRC, says: "A kill while your shields are down gives you a Void overshield." },
  // ---------- Solar fragments ----------
  { name: "Ember of Eruption", kind: "fragment", subs: el("Solar"), makes: ["multikill"], uses: ["ignite"], role: ["adClear"], src: SRC, says: "Your ignitions are bigger, so each one hits more of the pack. +10 Melee." },
  { name: "Ember of Resolve", kind: "fragment", subs: el("Solar"), makes: ["cure"], uses: ["kGrenade"], role: ["survival"], src: SRC, says: "Solar grenade kills cure you." },
  // ---------- Arc fragments ----------
  { name: "Spark of Brilliance", kind: "fragment", subs: el("Arc"), makes: ["blind", "multikill"], uses: ["blind"], src: SRC, says: "Precision kills on blinded enemies set off a blinding explosion. +10 Super." },
  { name: "Spark of Haste", kind: "fragment", subs: el("Arc"), makes: ["dr"], uses: [], role: ["survival"], src: SRC, says: "Much more Health while sprinting, so you survive getting out of trouble." },
  { name: "Spark of Instinct", kind: "fragment", subs: el("Arc"), makes: ["jolt"], uses: [], src: SRC, says: "When you're critically wounded, getting hit releases a jolting Arc burst. Only fires when you're nearly dead." },
  // ---------- Stasis fragments ----------
  { name: "Whisper of Chill", kind: "fragment", subs: el("Stasis"), makes: ["shard"], uses: [], needs: ["__el:Stasis"], src: SRC, says: "Stasis weapon kills can drop a Stasis shard." },
  { name: "Whisper of Reversal", kind: "fragment", subs: el("Stasis"), makes: ["slow"], uses: ["frost"], src: SRC, says: "With Frost Armor, your melee hits slow what they hit." },
  // ---------- Strand fragments ----------
  { name: "Thread of Binding", kind: "fragment", subs: el("Strand"), makes: ["suspend", "multikill"], uses: ["kSuper"], src: SRC, says: "Super kills release a suspending burst. +10 Health." },
  { name: "Thread of Continuity", kind: "fragment", subs: el("Strand"), makes: ["suspend", "unravel", "sever"], uses: ["suspend|unravel|sever"], src: SRC, says: "Your suspend, unravel and sever last longer." },
  { name: "Thread of Evolution", kind: "fragment", subs: el("Strand"), makes: ["dmg", "threadling"], uses: ["threadling"], src: SRC, says: "Threadlings reach farther and hit harder. +10 Super." },
  { name: "Thread of Finality", kind: "fragment", subs: el("Strand"), makes: ["threadling"], uses: ["finisher"], src: SRC, says: "Finishers create Threadlings. +10 Class." },
  { name: "Thread of Fury", kind: "fragment", subs: el("Strand"), makes: ["mEn"], uses: ["tangle"], src: SRC, says: "Tangle damage gives melee energy. -10 Melee." },
  { name: "Thread of Mind", kind: "fragment", subs: el("Strand"), makes: ["cEn"], uses: ["suspend"], src: SRC, says: "Killing suspended enemies gives class ability energy." },
  { name: "Thread of Propagation", kind: "fragment", subs: el("Strand"), makes: ["unravel"], uses: ["kMelee"], needs: ["__el:Strand"], src: SRC, says: "Powered melee kills give your Strand weapons Unraveling Rounds. +10 Melee." },
  { name: "Thread of Rebirth", kind: "fragment", subs: el("Strand"), makes: ["threadling"], uses: [], needs: ["__el:Strand"], src: SRC, says: "Strand weapon kills can create a Threadling." },
  { name: "Thread of Warding", kind: "fragment", subs: el("Strand"), makes: ["woven"], uses: ["orbPickup"], role: ["survival"], src: SRC, says: "Picking up an orb gives Woven Mail. -10 Health." },
  { name: "Thread of Wisdom", kind: "fragment", subs: el("Strand"), makes: ["orb"], uses: ["suspend"], src: SRC, says: "Killing suspended enemies makes an Orb of Power." },
  // ---------- Prismatic facets ----------
  { name: "Facet of Bravery", kind: "fragment", subs: el("Prismatic"), makes: ["volatile", "unravel"], uses: ["kGrenade|kMelee"], needs: ["__el:Void", "__el:Strand"], src: SRC, says: "Grenade kills give your Void weapons Volatile Rounds; powered melee kills give your Strand weapons Unraveling Rounds." },
  { name: "Facet of Command", kind: "fragment", subs: el("Prismatic"), makes: ["reload", "shard", "breach"], uses: ["freeze|suppress"], src: SRC, says: "Freezing or suppressing reloads your guns; killing frozen or suppressed enemies leaves a Stasis shard or Void Breach." },
  { name: "Facet of Defiance", kind: "fragment", subs: el("Prismatic"), makes: ["jolt", "scorch", "slow", "sever", "volatile"], uses: ["finisher"], src: SRC, says: "Finishers explode with your Super's element effect. +10 Class." },
  { name: "Facet of Devotion", kind: "fragment", subs: el("Prismatic"), makes: ["transcend"], uses: ["slow|freeze|sever|suspend|unravel"], src: SRC, says: "Killing Stasis- or Strand-debuffed enemies builds Transcendence faster. +10 Melee." },
  { name: "Facet of Dominance", kind: "fragment", subs: el("Prismatic"), makes: ["weaken", "jolt"], uses: ["kGrenade"], src: SRC, says: "Void grenades weaken and Arc grenades jolt. -10 Grenade." },
  { name: "Facet of Generosity", kind: "fragment", subs: el("Prismatic"), makes: ["orb", "teamBuff"], uses: ["transcend"], src: SRC, says: "Kills while transcendent make Orbs of Power for your allies." },
  { name: "Facet of Grace", kind: "fragment", subs: el("Prismatic"), makes: ["transcend", "teamBuff"], uses: [], src: SRC, says: "Kinetic weapon kills and Super kills build Transcendence (Super kills for allies too). -10 Health." },
  { name: "Facet of Honor", kind: "fragment", subs: el("Prismatic"), makes: ["transcend"], uses: ["pickup|tangle"], src: SRC, says: "Picking up an Elemental pickup or breaking a Tangle builds Transcendence. +10 Melee." },
  { name: "Facet of Justice", kind: "fragment", subs: el("Prismatic"), makes: ["multikill"], uses: ["transcend"], src: SRC, says: "While transcendent, ability kills explode. +10 Super." },
  { name: "Facet of Mending", kind: "fragment", subs: el("Prismatic"), makes: ["cure"], uses: ["kGrenade"], role: ["survival"], src: SRC, says: "Grenade kills cure you; more while transcendent." },
  { name: "Facet of Sacrifice", kind: "fragment", subs: el("Prismatic"), makes: ["transcend"], uses: ["radiant|amplified|overshield|invis|devour|restoration"], src: SRC, says: "With an Arc, Solar or Void buff, ability kills build Darkness Transcendence. +10 Grenade." },
];
