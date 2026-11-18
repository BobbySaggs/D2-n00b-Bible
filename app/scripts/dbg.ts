import { scoreLoops } from "../src/engine/loops";
import { byName } from "../src/knowledge/hunter";
const base = ["Solar Grenade", "Knife Trick", "Acrobat's Dodge", "Knock 'Em Down", "On Your Mark", "Ember of Torches", "Ember of Benevolence", "Star-Eater Scales", "Reconstruction", "Explosive Light"];
for (const sup of ["Golden Gun: Marksman", "Golden Gun: Deadshot", "Blade Barrage"]) {
  const r = scoreLoops([...base, sup].map(n => ({ k: byName.get(n)! })), "bossDps");
  console.log(sup, r.score.toFixed(1), "bossDmg", r.made.get("bossDmg")?.total, "unfed", r.unfed.map(u => u.name + ":" + u.token).join(","));
}
