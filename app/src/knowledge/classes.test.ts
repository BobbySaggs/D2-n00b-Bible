import { describe, expect, it } from "vitest";
import { byName, kitFor } from "./hunter";
import { CLASS_SUBS, classOfSub } from "./classes";

describe("classes", () => {
  it("every Warlock subclass belongs to the Warlock", () => {
    for (const s of CLASS_SUBS.Warlock) expect(classOfSub(s)).toBe("Warlock");
  });
  it("shared fragments and grenades reach every class of their element", () => {
    expect(byName.get("Whisper of Shards")!.subs).toEqual(expect.arrayContaining(["Revenant", "Shadebinder"]));
    expect(byName.get("Vortex Grenade")!.subs).toEqual(expect.arrayContaining(["Nightstalker", "Voidwalker"]));
    expect(byName.get("Thread of Warding")!.subs).toEqual(expect.arrayContaining(["Threadrunner", "Broodweaver"]));
  });
  it("class pieces stay with their class", () => {
    const w = new Set(kitFor("Warlock").map(k => k.name));
    expect(w.has("Well of Radiance")).toBe(true);
    expect(w.has("Child of the Old Gods")).toBe(true);
    expect(w.has("Shatterdive")).toBe(false); // Hunter aspect
    const h = new Set(kitFor("Hunter").map(k => k.name));
    expect(h.has("Well of Radiance")).toBe(false);
    expect(h.has("Shatterdive")).toBe(true);
  });
  it("Warlock exotics with a hard requirement say so", () => {
    expect(byName.get("Phoenix Protocol")!.needs).toEqual(["Well of Radiance"]);
    expect(byName.get("Skull of Dire Ahamkara")!.makes).toEqual(expect.arrayContaining(["sEn:3"]));
  });
});
