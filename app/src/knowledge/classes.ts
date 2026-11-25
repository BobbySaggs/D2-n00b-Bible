// Classes and their subclasses. Shared pieces (grenades, fragments) are written once and offered to every
// subclass of the same element; which ones a character can actually use comes from Bungie's subclass data.
export type ClassName = "Hunter" | "Warlock" | "Titan";
export type Subclass =
  | "Revenant" | "Nightstalker" | "Gunslinger" | "Arcstrider" | "Threadrunner" | "Prismatic Hunter"
  | "Shadebinder" | "Voidwalker" | "Dawnblade" | "Stormcaller" | "Broodweaver" | "Prismatic Warlock";

export const CLASS_SUBS: Record<ClassName, Subclass[]> = {
  Hunter: ["Prismatic Hunter", "Revenant", "Nightstalker", "Gunslinger", "Arcstrider", "Threadrunner"],
  Warlock: ["Prismatic Warlock", "Shadebinder", "Voidwalker", "Dawnblade", "Stormcaller", "Broodweaver"],
  Titan: [],
};
export const ALL_SUBS: Subclass[] = Object.values(CLASS_SUBS).flat();
export const ELEMENT: Record<Subclass, string> = {
  Revenant: "Stasis", Nightstalker: "Void", Gunslinger: "Solar", Arcstrider: "Arc", Threadrunner: "Strand", "Prismatic Hunter": "Prismatic",
  Shadebinder: "Stasis", Voidwalker: "Void", Dawnblade: "Solar", Stormcaller: "Arc", Broodweaver: "Strand", "Prismatic Warlock": "Prismatic",
};
// Light subclasses are free for everyone, so their whole kit counts as unlocked.
export const LIGHT_ELEMENTS = new Set(["Solar", "Arc", "Void"]);
export const subsOfElement = (el: string) => ALL_SUBS.filter(s => ELEMENT[s] === el);
export const classOfSub = (s: Subclass): ClassName => (Object.keys(CLASS_SUBS) as ClassName[]).find(c => CLASS_SUBS[c].includes(s))!;
export const isStasis = (s: string) => ELEMENT[s as Subclass] === "Stasis";
// Fragment slots per subclass when Bungie doesn't tell us: aspects open them, six at most.
export const MAX_FRAGMENTS: Record<Subclass, number> = Object.fromEntries(ALL_SUBS.map(s => [s, 6])) as Record<Subclass, number>;
