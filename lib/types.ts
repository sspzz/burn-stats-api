export interface Attribute {
  trait_type?: string;
  key?: string;
  traitType?: string;
  value: string | number;
}

export interface Soul {
  id?: string | { tokenId: string };
  tokenId?: string;
  title?: string;
  name?: string;
  raw?: {
    metadata?: {
      attributes?: Attribute[];
    };
  };
  metadata?: {
    attributes?: Attribute[];
  } | string;
  attributes?: Attribute[];
  rawMetadata?: {
    attributes?: Attribute[];
  } | string;
}

export interface Wizard {
  id?: string | { tokenId: string };
  tokenId?: string;
  metadata?: {
    attributes?: Attribute[];
  } | string;
  attributes?: Attribute[];
  rawMetadata?: {
    attributes?: Attribute[];
  } | string;
}

export interface AlchemyNFTResponse {
  nfts: Soul[] | Wizard[];
  nextToken?: string;
  pageKey?: string;
  error?: string;
}

export interface TraitStat {
  type: string;
  name: string;
  old: number;
  new: number;
  diff: number;
  wizards: string[];
}

export interface SoulTraits {
  [tokenId: string]: {
    name: string;
    traits: {
      [key: string]: string;
    };
  };
}

export interface StatsData {
  traits: TraitStat[];
  burned: number;
  flames: number;
  order: string[];
  souls: SoulTraits;
}

