import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import {
  fetchNFTsForCollection,
  fetchNFTMetadataBatch,
  extractTokenId,
  extractAttributes,
} from './alchemy';
import { StatsData, TraitStat, SoulTraits, Attribute } from './types';

const TRAITS = ['head', 'body', 'prop', 'familiar', 'rune', 'background'];
const WIZARDS_CONTRACT = '0x521f9c7505005cfa19a8e5786a9c3c9c9f5e6f42';
const SOULS_CONTRACT = '0x251b5f14a825c537ff788604ea1b58e49b70726f';
const FLAMES = 1112;

// In-memory cache for stats
let cachedStats: StatsData | null = null;
let lastUpdateTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function isCacheValid(): boolean {
  if (!cachedStats) return false;
  const now = Date.now();
  return now - lastUpdateTime < CACHE_DURATION;
}

export async function getStats(forceRefresh: boolean = false): Promise<StatsData> {
  // Return cached data if still valid and not forcing refresh
  if (!forceRefresh && isCacheValid()) {
    return cachedStats!;
  }

  try {
    const burnedWizards: string[] = [];
    const traitDict: { [key: string]: string[] } = {};
    const originalTraitCounts: { [trait: string]: { [value: string]: number } } = {};
    const newTraitCounts: { [trait: string]: { [value: string]: number } } = {};
    const newOrder: { [tokenId: string]: number } = {};
    const soulTraits: SoulTraits = {};

    // Initialize trait counts
    TRAITS.forEach((trait) => {
      originalTraitCounts[trait] = {};
      newTraitCounts[trait] = {};
    });

    // Fetch all souls from the collection
    console.log(`Fetching souls from contract: ${SOULS_CONTRACT}`);
    const allSouls = await fetchNFTsForCollection(SOULS_CONTRACT);
    console.log(`Total fetched ${allSouls.length} souls from collection`);

    // Process souls data
    for (const soul of allSouls) {
      const tokenId = extractTokenId(soul);
      if (!tokenId) {
        console.warn(`Warning: No tokenId found in soul. Keys: ${Object.keys(soul)}`);
        continue;
      }

      soulTraits[tokenId] = {
        name: (soul as any).title || (soul as any).name || '',
        traits: {},
      };

      const attributes = extractAttributes(soul);

      for (const attr of attributes) {
        const key = attr.trait_type || attr.key || attr.traitType || '';
        const value = attr.value;

        if (!key) continue;

        // Check for "Burn order" with various case/spacing variations
        const keyLower = key.toLowerCase().trim();
        if (keyLower === 'burn order' || keyLower === 'burnorder' || key === 'Burn order') {
          try {
            newOrder[tokenId] = typeof value === 'number' ? value : parseInt(String(value), 10);
          } catch (error) {
            console.warn(`Warning: Could not convert burn order value '${value}' to int for token ${tokenId}`);
          }
        } else if (TRAITS.includes(key.toLowerCase())) {
          soulTraits[tokenId].traits[key] = String(value);
        }
      }
    }

    console.log(`Processed ${Object.keys(newOrder).length} souls with burn orders`);

    const tokenIds = Object.keys(newOrder);
    const burned = tokenIds.length;

    // Fetch only the specific burned wizard tokens we need
    console.log(`Fetching ${tokenIds.length} burned wizard tokens from contract: ${WIZARDS_CONTRACT}`);

    // Alchemy's batch endpoint typically supports up to 50 tokens per request
    const batchSize = 50;
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batchTokenIds = tokenIds.slice(i, i + batchSize);
      const wizardsBatch = await fetchNFTMetadataBatch(WIZARDS_CONTRACT, batchTokenIds);
      console.log(`Fetched batch ${Math.floor(i / batchSize) + 1} with ${wizardsBatch.length} wizards`);

      for (const wizard of wizardsBatch) {
        const tokenIdDecimal = extractTokenId(wizard);
        if (!tokenIdDecimal) continue;

        burnedWizards.push(tokenIdDecimal);

        const attributes = extractAttributes(wizard);

        for (const attr of attributes) {
          const key = attr.trait_type || attr.key || attr.traitType || '';
          const value = attr.value;

          if (!key) continue;

          if (TRAITS.includes(key.toLowerCase())) {
            const dictKey = `${key}_${String(value)}`;
            if (!traitDict[dictKey]) {
              traitDict[dictKey] = [];
            }
            traitDict[dictKey].push(tokenIdDecimal);
          }
        }
      }
    }

    console.log(`Found ${burnedWizards.length} burned wizards`);

    // Get original trait counts from CSV
    const csvPath = path.join(process.cwd(), 'wizards.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const wizards = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    for (const wizard of wizards) {
      for (const trait of TRAITS) {
        const value = wizard[trait];
        if (value) {
          originalTraitCounts[trait][value] = (originalTraitCounts[trait][value] || 0) + 1;

          if (!burnedWizards.includes(wizard.token_id)) {
            newTraitCounts[trait][value] = (newTraitCounts[trait][value] || 0) + 1;
          }
        }
      }
    }

    // Build output
    const output: TraitStat[] = [];

    for (const trait of TRAITS) {
      for (const value in originalTraitCounts[trait]) {
        const oldCount = originalTraitCounts[trait][value];
        const newCount = newTraitCounts[trait][value] || 0;
        const dictKey = `${trait}_${value}`;

        output.push({
          type: trait,
          name: value,
          old: oldCount,
          new: newCount,
          diff: oldCount - newCount,
          wizards: traitDict[dictKey] || [],
        });
      }
    }

    const resultJson = output.sort((a, b) => a.name.localeCompare(b.name));

    // Sort burn order
    const order = Object.entries(newOrder)
      .sort(([, a], [, b]) => b - a)
      .map(([tokenId]) => tokenId);

    const stats: StatsData = {
      traits: resultJson,
      burned,
      flames: FLAMES - burned,
      order,
      souls: soulTraits,
    };

    // Cache the results
    cachedStats = stats;
    lastUpdateTime = Date.now();

    console.log('success');
    return stats;
  } catch (error) {
    console.error('Error in getStats:', error);
    throw error;
  }
}

