import rulesFile from "./research/rules.json";
import buildsFile from "./research/builds.json";
import type { K, Kind, Subclass } from "./hunter";
import type { StatKey } from "../bungie/config";

// Research: rules and community builds gathered from Bungie's notes, testers and build sites, each with sources.
export type Confidence = "bungie" | "tested" | "multiple" | "single";
export interface Source { title: string; url: string; date?: string }
export interface Rule extends Omit<K, "src"> { sources: Source[]; confidence: Confidence; checked: string }
export interface CommunityBuild {
  id: string;
  name: string;
  role: "clear" | "boss" | "survive" | "allround" | "pvp";
  activity?: string;
  subclass: Subclass;
  super?: string; grenade?: string; melee?: string; classAbility?: string;
  aspects: string[];
  fragments: string[];
  exotic: string; // exotic armor
  weapons: { name: string; perks?: string[] }[];
  sets?: { name: string; count: 2 | 4 }[];
  artifactPerks?: string[];
  stats?: StatKey[]; // stats it leans on, most important first
  source: Source & { creator?: string };
  added: string;
}

export const RULES: Rule[] = (rulesFile as { rules: Rule[] }).rules;
export const BUILDS: CommunityBuild[] = (buildsFile as unknown as { builds: CommunityBuild[] }).builds;
export const RESEARCH_UPDATED = (rulesFile as { updated: string }).updated;

// A researched rule as an engine rule. "single" sources still count, but the source note says so.
export function asK(r: Rule): K {
  const { sources, confidence, checked, ...k } = r;
  return { ...k, kind: k.kind as Kind, src: `${confidence === "single" ? "One source" : confidence === "bungie" ? "Bungie" : confidence === "tested" ? "Tested" : "Several sources"}, checked ${checked}: ${sources.map(s => s.title).join("; ")}` };
}
export const RULE_SOURCES = new Map(RULES.map(r => [r.name, r]));
