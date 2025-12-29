import { AlchemyNFTResponse, Soul, Wizard } from './types';

const ALCHEMY_API_KEY = (process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY) as string;
if (!ALCHEMY_API_KEY) {
  throw new Error('ALCHEMY_API_KEY environment variable is required');
}

const ALCHEMY_BASE_URL = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}`;

export async function fetchNFTsForCollection(
  contractAddress: string
): Promise<Soul[] | Wizard[]> {
  const allNFTs: (Soul | Wizard)[] = [];
  let pageKey: string | undefined = undefined;
  
  // Alchemy's maximum page size is 100
  const pageSize = 100;

  while (true) {
    const url = `${ALCHEMY_BASE_URL}/getNFTsForCollection`;
    const params = new URLSearchParams({
      contractAddress,
      withMetadata: 'true',
      limit: pageSize.toString(),
    });

    if (pageKey) {
      params.append('startToken', pageKey);
    }

    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: AlchemyNFTResponse = await response.json();

      if (data.error) {
        console.error(`API Error: ${data.error}`);
        break;
      }

      if (data.nfts) {
        allNFTs.push(...data.nfts);
        const batchSize = data.nfts.length;
        console.log(`Fetched page with ${batchSize} NFTs (total: ${allNFTs.length})`);

        // Check if we got fewer than the page size (100), which means we've reached the end
        // Don't check against the limit parameter since Alchemy caps at 100 per page
        if (batchSize < pageSize) {
          console.log(`Got fewer than ${pageSize} results (${batchSize}), reached end of collection`);
          break;
        }
      } else {
        console.warn(`Warning: No 'nfts' key in response. Response keys: ${Object.keys(data)}`);
        break;
      }

      // Check for next page
      const nextToken = data.nextToken || data.pageKey;
      if (nextToken && String(nextToken).trim()) {
        pageKey = nextToken;
        console.log(`Continuing pagination with nextToken: ${nextToken}`);
      } else {
        console.log('No nextToken found, pagination complete');
        break;
      }
    } catch (error) {
      console.error(`Request error: ${error}`);
      break;
    }
  }

  return allNFTs;
}

export async function fetchNFTMetadataBatch(
  contractAddress: string,
  tokenIds: string[]
): Promise<Wizard[]> {
  const url = `${ALCHEMY_BASE_URL}/getNFTMetadataBatch`;
  const payload = {
    tokens: tokenIds.map((tokenId) => ({
      contractAddress,
      tokenId,
    })),
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Try to get error details from response
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage += ` - ${JSON.stringify(errorData)}`;
        console.error(`Batch request failed:`, {
          status: response.status,
          error: errorData,
          tokenIds: tokenIds.slice(0, 5), // Log first 5 token IDs for debugging
          batchSize: tokenIds.length,
        });
      } catch {
        // If we can't parse error, just use status
      }
      throw new Error(errorMessage);
    }

    const data: AlchemyNFTResponse = await response.json();

    if (data.error) {
      console.error(`API Error: ${data.error}`);
      return [];
    }

    return (data.nfts as Wizard[]) || [];
  } catch (error) {
    console.error(`Request error fetching batch: ${error}`);
    // If batch fails, try fetching individually as fallback
    console.log(`Attempting to fetch ${tokenIds.length} tokens individually...`);
    const results: Wizard[] = [];
    
    // Fetch tokens one by one (slower but more reliable)
    for (const tokenId of tokenIds) {
      try {
        const singleUrl = `${ALCHEMY_BASE_URL}/getNFTMetadata?contractAddress=${contractAddress}&tokenId=${tokenId}`;
        const singleResponse = await fetch(singleUrl);
        if (singleResponse.ok) {
          const singleData = await singleResponse.json();
          if (singleData && !singleData.error) {
            results.push(singleData as Wizard);
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch token ${tokenId}: ${err}`);
      }
    }
    
    return results;
  }
}

export function extractTokenId(nft: Soul | Wizard): string | null {
  let tokenIdRaw: string | number | undefined = undefined;

  if ('id' in nft) {
    if (typeof nft.id === 'object' && nft.id !== null) {
      tokenIdRaw = (nft.id as { tokenId?: string }).tokenId;
    } else {
      tokenIdRaw = nft.id as string;
    }
  }

  if (tokenIdRaw === undefined) {
    tokenIdRaw = nft.tokenId;
  }

  if (tokenIdRaw === undefined || tokenIdRaw === null) {
    return null;
  }

  // Convert hex tokenId to decimal if needed
  if (typeof tokenIdRaw === 'string') {
    if (tokenIdRaw.startsWith('0x')) {
      return String(parseInt(tokenIdRaw, 16));
    }
    return tokenIdRaw;
  } else if (typeof tokenIdRaw === 'number') {
    return String(Math.floor(tokenIdRaw));
  }

  return String(tokenIdRaw);
}

export function extractAttributes(nft: Soul | Wizard): import('./types').Attribute[] {
  let attributes: import('./types').Attribute[] = [];

  // First try the 'raw' field which often contains the full metadata
  const rawData = (nft as Soul).raw;
  if (rawData && typeof rawData === 'object') {
    const rawMetadata = rawData.metadata;
    if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
      attributes = rawMetadata.attributes || [];
    }
  }

  // If not in raw, try metadata field
  if (attributes.length === 0) {
    let metadata = nft.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      attributes = (metadata as { attributes?: import('./types').Attribute[] }).attributes || [];
    }
  }

  // If attributes is empty, try other possible locations
  if (attributes.length === 0) {
    attributes = nft.attributes || [];
  }

  // Also check rawMetadata if it exists
  if (attributes.length === 0) {
    let rawMetadata = (nft as any).rawMetadata;
    if (typeof rawMetadata === 'string') {
      try {
        rawMetadata = JSON.parse(rawMetadata);
      } catch {
        rawMetadata = {};
      }
    }
    if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
      attributes = rawMetadata.attributes || [];
    }
  }

  return attributes;
}

