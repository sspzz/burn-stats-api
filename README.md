# Burn Stats API

A Next.js API for tracking NFT burn statistics from Forgotten Runes collections.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file with your Alchemy API key:
```
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

3. Make sure `wizards.csv` is in the root directory.

## Development

Run the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/get`

## Production

Build for production:
```bash
npm run build
npm start
```

## API Endpoints

### GET `/api/get`
Returns the burn statistics. The endpoint uses in-memory caching:
- First request or if cache is expired (>5 minutes): Fetches fresh data from Alchemy API
- Subsequent requests within 5 minutes: Returns cached data (fast response)

Response includes:
- `traits`: Array of trait statistics
- `burned`: Number of burned NFTs
- `flames`: Remaining flames
- `order`: Array of token IDs sorted by burn order
- `souls`: Object mapping token IDs to soul traits

The cache automatically refreshes when expired, so no cron job is needed.

## Deployment

### Vercel
1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. The API will automatically cache and refresh data as needed

### Other Platforms
No special configuration needed. The in-memory cache handles data freshness automatically.

