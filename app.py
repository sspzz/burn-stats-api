from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask
from flask_cors import CORS, cross_origin
from collections import defaultdict
import requests, csv, json, os

traits = ['head', 'body', 'prop', 'familiar', 'rune', 'background']
nullAddress = "0x0000000000000000000000000000000000000000"
wizardsContractAddress = "0x521f9c7505005cfa19a8e5786a9c3c9c9f5e6f42"
soulsContractAddress = "0x251b5f14a825c537ff788604ea1b58e49b70726f"

resultJson = []
burnOrder = {}
soulTraits = {}
burned = 0
flames = 1112

alchemy_api_key = os.environ.get('ALCHEMY_API_KEY', None)
if not alchemy_api_key:
	raise ValueError("ALCHEMY_API_KEY environment variable is required")
alchemy_base_url = f"https://eth-mainnet.g.alchemy.com/nft/v3/{alchemy_api_key}"

def getStats():
	global resultJson
	global burned
	global burnOrder
	global soulTraits
	global alchemy_base_url

	try:
		pageSize = 50
		nextPageSize = 50
		burnedWizards = []
		traitDict = defaultdict(list)
		originalTraitCounts = defaultdict(lambda: defaultdict(int))
		newTraitCounts = defaultdict(lambda: defaultdict(int))
		newOrder = {}

		"""
		url = "https://api.opensea.io/api/v1/assets?owner=%s&asset_contract_addresses=%s&order_direction=desc&offset=%%s&limit=%d" % (nullAddress, wizardsContractAddress, nextPageSize)

		# Pull original traits from Forgotten Runes collection
		while nextPageSize == pageSize:
			wizards = requests.request("GET", url % str(len(burnedWizards)), headers=headers).json()['assets']

			for wizard in wizards:
				burnedWizards.append(wizard['token_id'])

				for trait in wizard['traits']:
					if trait['trait_type'] != 'Serial':
						traitDict[trait['trait_type'] + '_' + trait['value']].append(wizard['token_id'])

			nextPageSize = len(wizards)

		burned = len(burnedWizards)

		# Pull burn order from Forgotten Souls collection
		pageSize = 50
		nextPageSize = 50

		url = "https://api.opensea.io/api/v1/assets?asset_contract_addresses=%s&order_direction=desc&offset=%%s&limit=%d" % (soulsContractAddress, nextPageSize)

		while nextPageSize == pageSize:
			souls = requests.request("GET", url % str(len(newOrder)), headers=headers).json()['assets']

			for soul in souls:
				soulTraits[soul['token_id']] = {'name': soul['name'], 'traits': {}}

				for trait in soul['traits']:
					if trait['trait_type'] == 'Burn order':
						newOrder[soul['token_id']] = int(trait['value'])
					elif trait['trait_type'].lower() == trait['trait_type']:
						soulTraits[soul['token_id']]['traits'][trait['trait_type']] = trait['value']

			nextPageSize = len(souls)

		print(len(newOrder))
		burnOrder = newOrder
		"""

		# Use Alchemy API instead of Reservoir
		# Fetch all souls from the collection
		page_key = None
		all_souls = []
		
		print(f"Fetching souls from contract: {soulsContractAddress}")
		print(f"Using Alchemy base URL: {alchemy_base_url}")
		
		while True:
			url = f"{alchemy_base_url}/getNFTsForCollection"
			params = {
				'contractAddress': soulsContractAddress,
				'withMetadata': 'true',
				'limit': 100
			}
			if page_key:
				params['startToken'] = page_key
			
			try:
				response = requests.get(url, params=params, timeout=30)
				response.raise_for_status()
				data = response.json()
				
				# Check for API errors
				if 'error' in data:
					print(f"API Error: {data.get('error', 'Unknown error')}")
					break
				
				if 'nfts' in data:
					nfts_batch = data['nfts']
					all_souls.extend(nfts_batch)
					batch_size = len(nfts_batch)
					print(f"Fetched page with {batch_size} souls (total: {len(all_souls)})")
					
					# Debug: show all response keys to check for pagination info
					if len(all_souls) <= 100:  # Only print on first page
						print(f"Response keys: {list(data.keys())}")
						if 'nextToken' in data:
							print(f"nextToken value: {repr(data.get('nextToken'))}")
					
					# If we got fewer than the limit, we've reached the end
					if batch_size < 100:
						print(f"Got fewer than 100 results ({batch_size}), reached end of collection")
						break
				else:
					print(f"Warning: No 'nfts' key in response. Response keys: {list(data.keys())}")
					print(f"Response sample: {str(data)[:500]}")
					break
				
				# Check if there's a next page - Alchemy returns nextToken if more pages exist
				# Also check for variations like 'next_token', 'pageKey', etc.
				next_token = data.get('nextToken') or data.get('next_token') or data.get('pageKey') or data.get('continuation')
				if next_token and str(next_token).strip():
					page_key = next_token
					print(f"Continuing pagination with nextToken: {next_token}")
				else:
					# If we got exactly 100 results but no nextToken, there might be more
					# But we should stop if there's no nextToken
					if batch_size == 100:
						print(f"Warning: Got exactly 100 results but no nextToken. There may be more results.")
					print("No nextToken found, pagination complete")
					break
			except requests.exceptions.RequestException as e:
				print(f"Request error fetching souls: {e}")
				break
			except Exception as e:
				print(f"Unexpected error fetching souls: {e}")
				import traceback
				traceback.print_exc()
				break

		print(f"Total fetched {len(all_souls)} souls from collection")

		# Process souls data
		for idx, soul in enumerate(all_souls):
			# Alchemy returns tokenId in different formats - handle both
			# Try multiple possible locations for tokenId
			token_id_raw = None
			if 'id' in soul:
				if isinstance(soul['id'], dict):
					token_id_raw = soul['id'].get('tokenId')
				else:
					token_id_raw = soul['id']
			
			if token_id_raw is None:
				token_id_raw = soul.get('tokenId')
			
			if token_id_raw is None:
				print(f"Warning: No tokenId found in soul. Keys: {list(soul.keys())}")
				if 'id' in soul:
					print(f"  id value: {soul['id']}, type: {type(soul['id'])}")
				continue
				
			# Convert hex tokenId to decimal if needed
			if isinstance(token_id_raw, str):
				if token_id_raw.startswith('0x'):
					token_id = str(int(token_id_raw, 16))
				else:
					token_id = token_id_raw
			elif isinstance(token_id_raw, (int, float)):
				token_id = str(int(token_id_raw))
			else:
				token_id = str(token_id_raw)
			
			soulTraits[token_id] = {'name': soul.get('title', soul.get('name', '')), 'traits': {}}
			
			# Get metadata attributes - Alchemy may have attributes in different locations
			# First try the 'raw' field which often contains the full metadata
			attributes = []
			raw_data = soul.get('raw', {})
			
			# Handle case where raw might be a string that needs parsing
			if isinstance(raw_data, str):
				try:
					raw_data = json.loads(raw_data)
				except:
					raw_data = {}
			
			# Check raw.metadata.attributes (nested structure)
			if isinstance(raw_data, dict):
				raw_metadata = raw_data.get('metadata', {})
				if isinstance(raw_metadata, dict):
					attributes = raw_metadata.get('attributes', [])
			
			# If not in raw, try metadata field
			if not attributes:
				metadata = soul.get('metadata', {})
				if isinstance(metadata, str):
					try:
						metadata = json.loads(metadata)
					except:
						metadata = {}
				if isinstance(metadata, dict):
					attributes = metadata.get('attributes', [])
			
			# If attributes is empty, try other possible locations
			if not attributes:
				attributes = soul.get('attributes', [])
			
			# Also check rawMetadata if it exists
			if not attributes:
				raw_metadata = soul.get('rawMetadata', {})
				if isinstance(raw_metadata, str):
					try:
						raw_metadata = json.loads(raw_metadata)
					except:
						raw_metadata = {}
				if isinstance(raw_metadata, dict):
					attributes = raw_metadata.get('attributes', [])
			
			
			for attr in attributes:
				# Handle different attribute formats
				key = attr.get('trait_type') or attr.get('key') or attr.get('traitType', '')
				value = attr.get('value', '')
				
				if not key:
					continue
				
				# Check for "Burn order" with various case/spacing variations
				key_lower = key.lower().strip()
				if key_lower == 'burn order' or key_lower == 'burnorder' or key == 'Burn order':
					try:
						newOrder[token_id] = int(value)
					except (ValueError, TypeError):
						print(f"Warning: Could not convert burn order value '{value}' to int for token {token_id}")
				elif key.lower() in traits:
					soulTraits[token_id]['traits'][key] = value

		print(f"Processed {len(newOrder)} souls with burn orders")
		burnOrder = newOrder

		tokenIds = list(burnOrder.keys())
		burned = len(tokenIds)
		
		# Only fetch the specific burned wizard tokens we need (not all wizards)
		print(f"Fetching {len(tokenIds)} burned wizard tokens from contract: {wizardsContractAddress}")
		
		# Fetch wizards in batches using getNFTMetadataBatch
		# Alchemy's batch endpoint can handle multiple tokens at once
		batch_size = 50  # Alchemy typically allows up to 50 tokens per batch
		
		for i in range(0, len(tokenIds), batch_size):
			batch_token_ids = tokenIds[i:i+batch_size]
			
			url = f"{alchemy_base_url}/getNFTMetadataBatch"
			payload = {
				'tokens': [
					{
						'contractAddress': wizardsContractAddress,
						'tokenId': token_id
					}
					for token_id in batch_token_ids
				]
			}
			
			try:
				response = requests.post(url, json=payload, timeout=30)
				response.raise_for_status()
				data = response.json()
				
				# Check for API errors
				if 'error' in data:
					print(f"API Error fetching wizard batch: {data.get('error', 'Unknown error')}")
					continue
				
				# Process the batch of wizards
				if 'nfts' in data:
					wizards_batch = data['nfts']
					print(f"Fetched batch {i//batch_size + 1} with {len(wizards_batch)} wizards")
					
					for wizard in wizards_batch:
						# Alchemy returns tokenId in different formats - handle both
						token_id_raw = None
						if 'id' in wizard:
							if isinstance(wizard['id'], dict):
								token_id_raw = wizard['id'].get('tokenId')
							else:
								token_id_raw = wizard['id']
						
						if token_id_raw is None:
							token_id_raw = wizard.get('tokenId')
						
						if token_id_raw is None:
							continue
							
						# Convert hex tokenId to decimal if needed
						if isinstance(token_id_raw, str):
							if token_id_raw.startswith('0x'):
								token_id_decimal = str(int(token_id_raw, 16))
							else:
								token_id_decimal = token_id_raw
						elif isinstance(token_id_raw, (int, float)):
							token_id_decimal = str(int(token_id_raw))
						else:
							token_id_decimal = str(token_id_raw)
						
						burnedWizards.append(token_id_decimal)
						
						# Get metadata attributes - Alchemy may have attributes in different locations
						metadata = wizard.get('metadata', {})
						
						# Handle case where metadata might be a string that needs parsing
						if isinstance(metadata, str):
							try:
								metadata = json.loads(metadata)
							except:
								metadata = {}
						
						attributes = metadata.get('attributes', []) if isinstance(metadata, dict) else []
						
						# If attributes is empty, try other possible locations
						if not attributes:
							attributes = wizard.get('attributes', [])
						
						# Also check rawMetadata if it exists
						if not attributes:
							raw_metadata = wizard.get('rawMetadata', {})
							if isinstance(raw_metadata, str):
								try:
									raw_metadata = json.loads(raw_metadata)
								except:
									raw_metadata = {}
							if isinstance(raw_metadata, dict):
								attributes = raw_metadata.get('attributes', [])
						
						for attr in attributes:
							# Handle different attribute formats
							key = attr.get('trait_type') or attr.get('key') or attr.get('traitType', '')
							value = attr.get('value', '')
							
							if not key:
								continue
							
							if key.lower() in traits:
								traitDict[key + '_' + str(value)].append(token_id_decimal)
				else:
					print(f"Warning: No 'nfts' key in batch response. Response keys: {list(data.keys())}")
					
			except requests.exceptions.RequestException as e:
				print(f"Request error fetching wizard batch: {e}")
				continue
			except Exception as e:
				print(f"Unexpected error fetching wizard batch: {e}")
				import traceback
				traceback.print_exc()
				continue
		
		print(f"Found {len(burnedWizards)} burned wizards")

		# Get original trait counts from Forgotten Runes csv
		with open('wizards.csv') as csvfile:
			for wizard in csv.DictReader(csvfile):
				for trait in traits:
					originalTraitCounts[trait][wizard[trait]] += 1

					if wizard['token_id'] not in burnedWizards:
						newTraitCounts[trait][wizard[trait]] += 1


		output = []

		for trait in traits:
			for value in originalTraitCounts[trait]:
				output.append({
					'type': trait,
					'name': value,
					'old': originalTraitCounts[trait][value],
					'new': newTraitCounts[trait][value],
					'diff': originalTraitCounts[trait][value] - newTraitCounts[trait][value],
					'wizards': traitDict[trait + '_' + value]
				})

		print('success')

		resultJson = sorted(output, key= lambda i: i['name'])

		# hacky workaround to keep the app running since it dies after some time with no requests
		requests.get("http://127.0.0.1:5000/api/get")

	except Exception as e:
		import traceback
		print(f"Error in getStats: {e}")
		traceback.print_exc()


sched = BackgroundScheduler(daemon=True)
sched.add_job(getStats,'interval', minutes=5, next_run_time=datetime.now())
sched.start()

# Run getStats immediately on startup
getStats()

app = Flask(__name__)
cors = CORS(app)
app.config['CORS_HEADERS'] = 'Content-Type'

@app.route("/api/get")
@cross_origin()
def home():
	global burnOrder, resultJson, burned, soulTraits, flames

	return {
		'traits': resultJson, 
		'burned': burned, 
		'flames': flames - burned, 
		'order': [k for k, v in sorted(burnOrder.items(), key=lambda item: item[1], reverse=True)],
		'souls': soulTraits
	}

if __name__ == "__main__":
	app.run()
