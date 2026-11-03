const fs = require('fs');
const path = require('path');

const networksData = JSON.parse(fs.readFileSync('networks.json', 'utf8'));

/**
 * Optional: GENERATE_NETWORK=sepolia — defaults to the sole network or "sepolia".
 * Returns null when the choice is ambiguous; build-all.sh and deploy.sh then
 * regenerate constants per network with GENERATE_NETWORK set.
 */
function resolveConstantsNetwork() {
  const requested = process.env.GENERATE_NETWORK;
  const networks = Object.keys(networksData);
  if (requested) {
    if (!networksData[requested]) {
      throw new Error(
        `GENERATE_NETWORK=${requested} not found in networks.json (have: ${networks.join(', ')})`
      );
    }
    return requested;
  }
  if (networks.length === 1) return networks[0];
  if (networks.includes('sepolia')) return 'sepolia';
  return null;
}

function generateVaultConstants(network) {
  const networkData = networksData[network];
  if (!networkData.Vault || !networkData.Vault.address) {
    throw new Error(`${network}: Vault.address is required to generate constants.ts`);
  }

  const templatePath = path.join(
    'subgraphs',
    'vault',
    'src',
    'helpers',
    'constants.template.ts'
  );
  const template = fs.readFileSync(templatePath, 'utf8');
  const output = template.replace(
    /\{\{\s*Vault\.address\s*\}\}/g,
    networkData.Vault.address
  );
  const outputPath = path.join(
    'subgraphs',
    'vault',
    'src',
    'helpers',
    'constants.ts'
  );
  fs.writeFileSync(outputPath, output);
  console.log(`Generated ${outputPath} (network=${network})`);
}

function replacePlaceholders(template, network, networkData) {
  template = template.replace(/{{#if ([^}]+)}}([\s\S]*?){{\/if}}/g, (match, factoryName, content) => {
    if (networkData[factoryName]) {
      return content;
    }
    return '';
  });

  let result = template.replace(/{{ network }}/g, network);
  
  for (const [contractName, contractData] of Object.entries(networkData)) {
    result = result.replace(new RegExp(`{{ ${contractName}\\.address }}`, 'g'), contractData.address);
    result = result.replace(new RegExp(`{{ ${contractName}\\.startBlock }}`, 'g'), contractData.startBlock.toString());
    // Missing storeEventsFrom used to become the literal "undefined" and break Ormi deploy
    if (result.includes(`{{ ${contractName}.storeEventsFrom }}`)) {
      const storeFrom = contractData.storeEventsFrom;
      if (storeFrom === undefined || storeFrom === null || storeFrom === '') {
        throw new Error(
          `${network}: ${contractName}.storeEventsFrom is required (block number string, e.g. "0")`
        );
      }
      result = result.replace(
        new RegExp(`{{ ${contractName}\\.storeEventsFrom }}`, 'g'),
        String(storeFrom)
      );
    }
  }
  
  result = result
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');

  return result + '\n';
}

['pools', 'vault'].forEach(subgraph => {
  const templatePath = path.join('subgraphs', subgraph, 'template.yaml');
  
  if (!fs.existsSync(templatePath)) {
    console.log(`No template found for ${subgraph}, skipping...`);
    return;
  }
  
  const template = fs.readFileSync(templatePath, 'utf8');
  Object.entries(networksData).forEach(([network, networkData]) => {
    const config = replacePlaceholders(template, network, networkData);
    const outputPath = path.join('subgraphs', subgraph, `subgraph.${network}.yaml`);
    fs.writeFileSync(outputPath, config);
    console.log(`Generated ${outputPath}`);
  });
});

const constantsNetwork = resolveConstantsNetwork();
if (constantsNetwork) {
  generateVaultConstants(constantsNetwork);
} else {
  console.warn(
    'Multiple networks in networks.json and GENERATE_NETWORK unset — skipping vault constants.ts'
  );
}

console.log('🎉 subgraphs successfully generated\n');