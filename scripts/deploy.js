const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Starting A2A Network deployment...\n');

  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', hre.ethers.formatEther(balance), 'ETH\n');

  console.log('📝 Deploying AgentRegistry...');
  const AgentRegistry = await hre.ethers.getContractFactory('AgentRegistry');
  const registry = await AgentRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log('✅ AgentRegistry deployed to:', registryAddress, '\n');

  console.log('📝 Deploying MessageRouter...');
  const MessageRouter = await hre.ethers.getContractFactory('MessageRouter');
  const router = await MessageRouter.deploy(registryAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log('✅ MessageRouter deployed to:', routerAddress, '\n');

  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      AgentRegistry: registryAddress,
      MessageRouter: routerAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${hre.network.name}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

  console.log('📄 Deployment info saved to:', filepath, '\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎉 A2A Network Deployment Complete!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Network:', hre.network.name);
  console.log('AgentRegistry:', registryAddress);
  console.log('MessageRouter:', routerAddress);
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('🔧 Next Steps:');
  console.log('1. Update your .env file with the deployed addresses');
  console.log('2. Run "npm run interact" to test the contracts');
  console.log('3. Integrate the contracts into your frontend\n');

  if (hre.network.name !== 'hardhat' && hre.network.name !== 'localhost') {
    console.log('⏳ Waiting for block confirmations...');
    await registry.deploymentTransaction().wait(5);
    await router.deploymentTransaction().wait(5);
    console.log('✅ Confirmations complete\n');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
